import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { CreateClubForm } from "@/components/clubs/create-club-form";
import { Avatar } from "@/components/ui/avatar";

export default async function ClubsPage() {
  const supabase = await createClient();
  const viewer = await getVerifiedUser();

  const [{ data: clubs }, { data: memberships }] = await Promise.all([
    supabase.from("clubs").select("id, name, description, created_at").order("created_at", { ascending: false }),
    viewer ? supabase.from("club_members").select("club_id").eq("user_id", viewer.id) : Promise.resolve({ data: [] }),
  ]);

  const myClubIds = new Set((memberships ?? []).map((m) => m.club_id));

  const clubIds = (clubs ?? []).map((c) => c.id);
  const { data: memberRows } = clubIds.length
    ? await supabase.from("club_members").select("club_id").in("club_id", clubIds)
    : { data: [] };
  const memberCounts = new Map<string, number>();
  for (const row of memberRows ?? []) {
    memberCounts.set(row.club_id, (memberCounts.get(row.club_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl">Clubs</h1>
        {viewer && <CreateClubForm />}
      </div>

      {!clubs?.length ? (
        <p className="text-sm text-foreground-muted">No clubs yet — start one.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {clubs.map((club) => (
            // An avatar badge (same initials-fallback used for people) gives
            // each club a visual anchor — previously this was three lines of
            // plain stacked text with nothing to distinguish one club's card
            // from another at a glance.
            <Link
              key={club.id}
              href={`/clubs/${club.id}`}
              className="flex items-center gap-4 rounded-[var(--radius-md)] border border-border bg-surface p-4 transition-colors hover:border-accent/50"
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
              </div>
              <span className="shrink-0 text-xs text-foreground-muted">
                {memberCounts.get(club.id) ?? 0} member{(memberCounts.get(club.id) ?? 0) === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
