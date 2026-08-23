"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/lib/actions/profile";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ProfileForm({
  initialDisplayName,
  initialBio,
}: {
  initialDisplayName: string;
  initialBio: string;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await updateProfile({ displayName, bio });
      setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-foreground-muted">
          Display name
        </label>
        <Input
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            setSaved(false);
          }}
          maxLength={60}
          placeholder="Your name"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-foreground-muted">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
            setSaved(false);
          }}
          maxLength={500}
          rows={4}
          placeholder="A few words about your taste in film…"
          className="w-full resize-none rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-base sm:text-sm text-foreground placeholder:text-foreground-muted focus:border-accent/50 focus:outline-none"
        />
        <p className="mt-1 text-right text-[11px] text-foreground-muted">{bio.length}/500</p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" isLoading={isPending}>
          Save changes
        </Button>
        {saved && !isPending && <span className="text-xs text-accent">Saved</span>}
      </div>
    </form>
  );
}
