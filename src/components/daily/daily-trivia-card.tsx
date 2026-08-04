"use client";

import { useState, useTransition } from "react";
import { submitDailyTriviaAnswer } from "@/lib/actions/daily-trivia";

const LETTERS = ["A", "B", "C", "D"];

type Props = {
  question: string;
  options: string[];
} & (
  | { alreadyAnswered: true; correctIndex: number; selectedIndex: number }
  | { alreadyAnswered: false }
);

/** Fill-in-the-bubble style: four lettered circles, one tap locks in a
 *  guess and reveals right/wrong immediately -- no separate submit step. */
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
    startTransition(async () => {
      const result = await submitDailyTriviaAnswer(index);
      if ("error" in result) {
        setError("Couldn't submit your answer — try again.");
        setSelected(null);
        return;
      }
      setCorrectIndex(result.correctIndex);
      setRevealed(true);
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
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
              className={`flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left text-sm transition-colors ${
                isCorrectOption
                  ? "border-success/60 bg-success/10 text-foreground"
                  : isWrongSelected
                    ? "border-danger/60 bg-danger/10 text-foreground"
                    : isSelected
                      ? "border-accent/60 bg-accent/10 text-foreground"
                      : "border-border text-foreground-muted hover:border-border-strong"
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
      {revealed && !error && (
        <p className="mt-3 text-xs text-foreground-muted">
          {selected !== null && correctIndex === selected ? "Nice — you got it." : "Come back tomorrow for another one."}
        </p>
      )}
    </div>
  );
}
