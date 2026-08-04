"use client";

import { useState, useTransition } from "react";
import Image from "@/components/ui/fade-image";
import { submitDailyTriviaAnswer } from "@/lib/actions/daily-trivia";

const LETTERS = ["A", "B", "C", "D"];

type Props = {
  question: string;
  options: string[];
  posterUrl: string | null;
} & (
  | { alreadyAnswered: true; correctIndex: number; selectedIndex: number }
  | { alreadyAnswered: false }
);

/** Fill-in-the-bubble style: four lettered circles. Tapping one just
 *  changes which is highlighted -- nothing is sent to the server until
 *  Submit, so a misclick can be changed before it's locked in. The
 *  question's own subject poster sits faded in the background, same
 *  "framed by the actual movie" spirit as Hidden Gem/Spotlight. */
export function DailyTriviaCard(props: Props) {
  const [revealed, setRevealed] = useState(props.alreadyAnswered);
  const [selected, setSelected] = useState<number | null>(props.alreadyAnswered ? props.selectedIndex : null);
  const [correctIndex, setCorrectIndex] = useState<number | null>(props.alreadyAnswered ? props.correctIndex : null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function choose(index: number) {
    if (revealed || isPending) return;
    setError(null);
    setSelected(index);
  }

  function submit() {
    if (revealed || isPending || selected === null) return;
    startTransition(async () => {
      const result = await submitDailyTriviaAnswer(selected);
      if ("error" in result) {
        setError("Couldn't submit your answer — try again.");
        return;
      }
      setCorrectIndex(result.correctIndex);
      setRevealed(true);
    });
  }

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      {props.posterUrl && (
        <>
          <Image
            src={props.posterUrl}
            alt=""
            fill
            aria-hidden="true"
            className="object-cover opacity-20"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-surface/70 via-surface/90 to-surface" />
        </>
      )}

      <div className="relative">
        <p className="text-[10px] font-medium uppercase tracking-wider text-accent">Daily trivia</p>
        <p className="mt-2 text-base font-medium leading-snug text-foreground">{props.question}</p>

        <div className="mt-4 flex flex-col gap-2">
          {props.options.map((option, i) => {
            const isSelected = selected === i;
            const isCorrectOption = revealed && correctIndex === i;
            const isWrongSelected = revealed && isSelected && correctIndex !== i;

            return (
              <button
                key={option}
                type="button"
                disabled={revealed || isPending}
                onClick={() => choose(i)}
                className={`flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left text-sm backdrop-blur-sm transition-colors ${
                  isCorrectOption
                    ? "border-success/60 bg-success/10 text-foreground"
                    : isWrongSelected
                      ? "border-danger/60 bg-danger/10 text-foreground"
                      : isSelected
                        ? "border-accent/60 bg-accent/10 text-foreground"
                        : "border-border bg-surface/60 text-foreground-muted hover:border-border-strong"
                } ${revealed ? "cursor-default" : "cursor-pointer"}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    isCorrectOption
                      ? "border-success bg-success text-background"
                      : isWrongSelected
                        ? "border-danger bg-danger text-background"
                        : isSelected
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border-strong text-foreground-muted"
                  }`}
                >
                  {LETTERS[i]}
                </span>
                {option}
              </button>
            );
          })}
        </div>

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        {!revealed ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={selected === null || isPending}
              className="rounded-[var(--radius-full)] bg-gold-foil px-4 py-1.5 text-xs font-medium text-accent-foreground shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100"
            >
              {isPending ? "Submitting…" : "Submit"}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-foreground-muted">
            {selected !== null && correctIndex === selected ? "Nice — you got it." : "Come back tomorrow for another one."}
          </p>
        )}
      </div>
    </div>
  );
}
