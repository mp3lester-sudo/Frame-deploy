import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { CreateClubForm } from "@/components/clubs/create-club-form";
import { Avatar } from "@/components/ui/avatar";

export default async function ClubsPage() {
  const supabase = await createClient();
  const viewer = await getVerifiedUser();

  const [{ data: clubs }, { data: memberships }] = await Promise.all([
    supabase.from("clubs").select("id, name, description, created_at").order("created_at", { ascending: false }).limit(100),
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-section-heading text-2xl">Clubs</h1>
        {viewer && <CreateClubForm />}
      </div>

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
                className="bento-card flex items-center gap-4 p-4"
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
