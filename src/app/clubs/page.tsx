import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { CreateClubForm } from "@/components/clubs/create-club-form";
import { Avatar } from "@/components/ui/avatar";
import { computeGenreAffinity, type GenreAffinityEntry } from "@/lib/recommendations/genre-affinity";
import { topPositiveGenres, rankSuggestedClubs } from "@/lib/clubs/suggest";

// Bounds how many non-member clubs get a genre-affinity check per page
// load -- their creators' rating histories are real query cost (see
// suggest.ts's doc comment on why this uses ratings rather than the
// private taste_attributes table), so this is capped well below the
// page's own 100-club limit rather than checking every candidate.
const SUGGESTION_CANDIDATE_LIMIT = 30;
const SUGGESTED_CLUBS_LIMIT = 3;
// Same cold-start floor used elsewhere (matchmaking's MIN_RATINGS_EACH)
// -- below this, a viewer's genre affinity is too thin to trust for a
// "you'd like this club" suggestion.
const MIN_VIEWER_RATINGS = 5;

export default async function ClubsPage() {
  const supabase = await createClient();
  const viewer = await getVerifiedUser();

  const [{ data: clubs }, { data: memberships }] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, description, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    viewer ? supabase.from("club_members").select("club_id").eq("user_id", viewer.id) : Promise.resolve({ data: [] }),
  ]);

  const myClubIds = new Set((memberships ?? []).map((m) => m.club_id));

  const clubIds = (clubs ?? []).map((c) => c.id);
  // One query gets both the member count and the avatar-stack faces --
  // previously this only selected club_id and just counted rows, but the
  // glass roster treatment needs a few member profiles per club to render
  // the stack, so the join replaces the count-only query rather than
  // adding a second one.
  // Only the first 4 members per club are ever rendered (the avatar
  // stack below), but Supabase's .in() join has no per-group limit, so a
  // handful of very large clubs could otherwise pull in thousands of rows
  // here on every page load. 500 total is generous headroom for 100 clubs
  // averaging 5 members each while capping the worst case (one club with
  // a huge roster) from growing unbounded.
  const { data: memberRows } = clubIds.length
    ? await supabase
        .from("club_members")
        .select("club_id, user_id, profiles(username, display_name, avatar_url)")
        .in("club_id", clubIds)
        .limit(500)
    : { data: [] };

  type MemberInfo = { username: string; display_name: string | null; avatar_url: string | null };
  const membersByClub = new Map<string, MemberInfo[]>();
  for (const row of memberRows ?? []) {
    const profile = row.profiles as unknown as MemberInfo | null;
    if (!profile) continue;
    const list = membersByClub.get(row.club_id) ?? [];
    list.push(profile);
    membersByClub.set(row.club_id, list);
  }

  // Suggested clubs (personalization audit item #6) -- see
  // src/lib/clubs/suggest.ts for the full reasoning. Only attempted for
  // signed-in viewers with enough rating history to have a real genre
  // signal.
  let suggestedClubs: { id: string; sharedGenres: string[] }[] = [];
  if (viewer) {
    const { data: viewerRatings } = await supabase.from("ratings").select("title_id, score").eq("user_id", viewer.id);
    if ((viewerRatings?.length ?? 0) >= MIN_VIEWER_RATINGS) {
      const viewerTitleIds = (viewerRatings ?? []).map((r) => r.title_id);
      const { data: viewerTitles } = await supabase.from("titles").select("id, genres").in("id", viewerTitleIds);
      const viewerGenresByTitle = new Map((viewerTitles ?? []).map((t) => [t.id, t.genres ?? []]));
      const viewerAffinity = computeGenreAffinity(
        (viewerRatings ?? []).map((r) => ({ score: r.score, genres: viewerGenresByTitle.get(r.title_id) ?? [] }))
      );
      const viewerTopGenres = topPositiveGenres(viewerAffinity);

      if (viewerTopGenres.length > 0) {
        const candidateClubs = (clubs ?? []).filter((c) => !myClubIds.has(c.id)).slice(0, SUGGESTION_CANDIDATE_LIMIT);
        const candidateCreatorIds = [...new Set(candidateClubs.map((c) => c.created_by))];

        if (candidateCreatorIds.length) {
          const { data: creatorRatings } = await supabase
            .from("ratings")
            .select("user_id, title_id, score")
            .in("user_id", candidateCreatorIds);
          const creatorTitleIds = [...new Set((creatorRatings ?? []).map((r) => r.title_id))];
          const { data: creatorTitles } = creatorTitleIds.length
            ? await supabase.from("titles").select("id, genres").in("id", creatorTitleIds)
            : { data: [] };
          const creatorGenresByTitle = new Map((creatorTitles ?? []).map((t) => [t.id, t.genres ?? []]));

          const ratingsByCreator = new Map<string, { score: number; genres: string[] }[]>();
          for (const r of creatorRatings ?? []) {
            const list = ratingsByCreator.get(r.user_id) ?? [];
            list.push({ score: r.score, genres: creatorGenresByTitle.get(r.title_id) ?? [] });
            ratingsByCreator.set(r.user_id, list);
          }

          const affinityByCreator = new Map<string, Map<string, GenreAffinityEntry>>();
          for (const [creatorId, ratings] of ratingsByCreator) {
            affinityByCreator.set(creatorId, computeGenreAffinity(ratings));
          }

          suggestedClubs = rankSuggestedClubs(
            viewerTopGenres,
            candidateClubs.map((c) => ({ id: c.id, affinity: affinityByCreator.get(c.created_by) ?? new Map() })),
            SUGGESTED_CLUBS_LIMIT
          );
        }
      }
    }
  }
  const clubById = new Map((clubs ?? []).map((c) => [c.id, c]));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-gold-foil font-section-heading text-3xl">Clubs</h1>
        {viewer && <CreateClubForm />}
      </div>

      {suggestedClubs.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">Clubs you might like</p>
          <div className="flex flex-col gap-2">
            {suggestedClubs.map((s) => {
              const club = clubById.get(s.id);
              if (!club) return null;
              return (
                <Link key={club.id} href={`/clubs/${club.id}`} className="bento-card flex items-center gap-3 p-3">
                  <Avatar name={club.name} size={40} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{club.name}</p>
                    <p className="truncate text-[11px] text-foreground-muted">
                      Shares your taste in {s.sharedGenres.join(", ")}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {!clubs?.length ? (
        <p className="font-section-body text-sm text-foreground-muted">No clubs yet — start one.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {clubs.map((club) => {
            const members = membersByClub.get(club.id) ?? [];
            return (
              // Glass roster: same bento-card surface as the rest of the
              // app, with the member avatar stack replacing the old plain
              // "N members" text -- gives each club a face instead of just
              // a number, without needing club imagery the schema doesn't
              // have.
              <Link
                key={club.id}
                href={`/clubs/${club.id}`}
                className="bento-card flex items-center gap-4 p-3"
              >
                <Avatar name={club.name} size={44} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{club.name}</p>
                    {myClubIds.has(club.id) && (
                      <span className="shrink-0 rounded-[var(--radius-full)] border border-accent/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                        Member
                      </span>
                    )}
                  </div>
                  {club.description && (
                    <p className="mt-0.5 truncate text-sm text-foreground-muted">{club.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {members.length > 0 && (
                      <div className="flex -space-x-2">
                        {members.slice(0, 4).map((m) => (
                          <Avatar
                            key={m.username}
                            name={m.display_name ?? m.username}
                            src={m.avatar_url}
                            size={22}
                            className="border-2 border-surface"
                          />
                        ))}
                      </div>
                    )}
                    <span className="text-[11px] text-foreground-muted">
                      {members.length} member{members.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
