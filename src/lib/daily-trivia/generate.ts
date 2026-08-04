import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export interface DailyTrivia {
  dateKey: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export type DailyTriviaPublic = Omit<DailyTrivia, "correctIndex">;

export function toPublicTrivia(trivia: DailyTrivia): DailyTriviaPublic {
  return { dateKey: trivia.dateKey, question: trivia.question, options: trivia.options };
}

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama",
  "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance",
  "Science Fiction", "Thriller", "TV Movie", "War", "Western",
] as const;

const MAX_BUILD_ATTEMPTS = 6;

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type BuiltQuestion = { titleId: string; questionType: string; question: string; options: string[]; correctIndex: number };

/**
 * Builds one trivia question entirely from real catalogue data (director
 * credits, release dates, genres) -- deliberately never freeform
 * AI-generated trivia, since every fact in the question has to be
 * verifiably true. Picks a genuinely random subject on each attempt; that's
 * fine because this only ever runs once per calendar day (see
 * getOrCreateDailyTrivia below), not per page view. Retries with a new
 * random subject if the chosen one doesn't have enough real data to build
 * a fair question (e.g. no director on file, or fewer than 3 other real
 * names to draw wrong answers from) rather than ever inventing a distractor.
 */
async function buildTriviaQuestion(attempt = 0): Promise<BuiltQuestion> {
  if (attempt >= MAX_BUILD_ATTEMPTS) throw new Error("Could not build a trivia question from the catalogue");

  const supabase = await createClient();

  // A well-reviewed title makes for a fairer question than a totally
  // obscure one nobody could reasonably know -- same "actually good, not
  // just loud" quality signal the recommendation engine uses elsewhere.
  const { data: pool } = await supabase
    .from("titles")
    .select("id, name, release_date, genres")
    .not("release_date", "is", null)
    .order("weighted_rating", { ascending: false, nullsFirst: false })
    .limit(500);

  if (!pool?.length) throw new Error("No titles available to build trivia from");

  const subject = pool[Math.floor(Math.random() * pool.length)];
  const questionType = (["director", "year", "genre"] as const)[Math.floor(Math.random() * 3)];

  if (questionType === "director") {
    const { data: directorCredit } = await supabase
      .from("title_credits")
      .select("people(name)")
      .eq("title_id", subject.id)
      .eq("credit_type", "director")
      .limit(1)
      .maybeSingle();
    const correctName = (directorCredit as unknown as { people: { name: string } | null } | null)?.people?.name;
    if (!correctName) return buildTriviaQuestion(attempt + 1);

    const { data: otherDirectors } = await supabase
      .from("title_credits")
      .select("people(name)")
      .eq("credit_type", "director")
      .neq("title_id", subject.id)
      .limit(200);
    const names = [
      ...new Set(
        (otherDirectors ?? [])
          .map((r) => (r as unknown as { people: { name: string } | null }).people?.name)
          .filter((n): n is string => !!n && n !== correctName)
      ),
    ];
    if (names.length < 3) return buildTriviaQuestion(attempt + 1);

    const options = shuffle([correctName, ...shuffle(names).slice(0, 3)]);
    return {
      titleId: subject.id,
      questionType,
      question: `Who directed "${subject.name}"?`,
      options,
      correctIndex: options.indexOf(correctName),
    };
  }

  if (questionType === "year") {
    const correctYear = Number(subject.release_date!.slice(0, 4));
    const offsets = shuffle([-9, -5, -3, 2, 4, 7, 11]);
    const distractorYears = [...new Set(offsets.map((o) => correctYear + o))].filter((y) => y !== correctYear).slice(0, 3);
    if (distractorYears.length < 3) return buildTriviaQuestion(attempt + 1);

    const options = shuffle([String(correctYear), ...distractorYears.map(String)]);
    return {
      titleId: subject.id,
      questionType,
      question: `What year was "${subject.name}" released?`,
      options,
      correctIndex: options.indexOf(String(correctYear)),
    };
  }

  // genre
  const genres = subject.genres ?? [];
  if (!genres.length) return buildTriviaQuestion(attempt + 1);
  const correctGenre = genres[Math.floor(Math.random() * genres.length)];
  const otherGenres = GENRES.filter((g) => !genres.includes(g));
  if (otherGenres.length < 3) return buildTriviaQuestion(attempt + 1);

  const options = shuffle([correctGenre, ...shuffle([...otherGenres]).slice(0, 3)]);
  return {
    titleId: subject.id,
    questionType,
    question: `Which genre applies to "${subject.name}"?`,
    options,
    correctIndex: options.indexOf(correctGenre),
  };
}

/**
 * One shared trivia question per calendar day (UTC), cached in
 * daily_trivia so every visitor that day sees the same question and it's
 * only ever generated once. Returns null (rather than throwing) if
 * generation fails for any reason -- the Daily page just omits the card
 * that day instead of erroring.
 */
export async function getOrCreateDailyTrivia(): Promise<DailyTrivia | null> {
  const dateKey = todayDateKey();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("daily_trivia")
    .select("date_key, question, options, correct_index")
    .eq("date_key", dateKey)
    .maybeSingle();

  if (existing) {
    return {
      dateKey: existing.date_key,
      question: existing.question,
      options: existing.options,
      correctIndex: existing.correct_index,
    };
  }

  let built: BuiltQuestion;
  try {
    built = await buildTriviaQuestion();
  } catch {
    return null;
  }

  const service = createServiceRoleClient();
  // Race-safe: if another request generated today's trivia in the gap
  // between the select above and this insert, this insert conflicts on
  // the date_key primary key -- fall through to reading whatever won
  // instead of erroring.
  const { error } = await service.from("daily_trivia").insert({
    date_key: dateKey,
    title_id: built.titleId,
    question_type: built.questionType,
    question: built.question,
    options: built.options,
    correct_index: built.correctIndex,
  });

  if (error) {
    const { data: winner } = await supabase
      .from("daily_trivia")
      .select("date_key, question, options, correct_index")
      .eq("date_key", dateKey)
      .maybeSingle();
    if (!winner) return null;
    return {
      dateKey: winner.date_key,
      question: winner.question,
      options: winner.options,
      correctIndex: winner.correct_index,
    };
  }

  return { dateKey, question: built.question, options: built.options, correctIndex: built.correctIndex };
}
