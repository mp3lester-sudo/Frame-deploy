import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreateClubForm } from "@/components/clubs/create-club-form";

export default async function ClubsPage() {
  const supabase = await createClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

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
            <Link
              key={club.id}
              href={`/clubs/${club.id}`}
              className="rounded-[var(--radius-md)] border border-border bg-surface p-4 hover:border-accent/50"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{club.name}</p>
                {myClubIds.has(club.id) && (
                  <span className="text-xs uppercase tracking-wide text-accent">Member</span>
                )}
              </div>
              {club.description && <p className="mt-1 text-sm text-foreground-muted">{club.description}</p>}
              <p className="mt-2 text-xs text-foreground-muted">
                {memberCounts.get(club.id) ?? 0} member{(memberCounts.get(club.id) ?? 0) === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
