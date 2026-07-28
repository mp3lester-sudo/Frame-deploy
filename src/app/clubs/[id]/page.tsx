import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/avatar";
import { JoinLeaveClubButton } from "@/components/clubs/join-leave-club-button";
import { ClubFeed, type ClubPost } from "@/components/clubs/club-feed";

export default async function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  const { data: club } = await supabase.from("clubs").select("*").eq("id", id).maybeSingle();
  if (!club) notFound();

  const { data: memberRows } = await supabase
    .from("club_members")
    .select("user_id, role, profiles(username, display_name, avatar_url)")
    .eq("club_id", id)
    .order("joined_at", { ascending: true });

  const members = (memberRows ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    profile: (m as unknown as { profiles: { username: string; display_name: string | null; avatar_url: string | null } | null }).profiles,
  }));

  const myMembership = viewer ? members.find((m) => m.userId === viewer.id) : undefined;
  const isMember = !!myMembership;
  const isOwner = myMembership?.role === "owner";

  // Posts are RLS-gated to members only — a non-member will just get an
  // empty array back rather than an error, which is exactly the "join to
  // see the discussion" state we want to render.
  const { data: postRows } = await supabase
    .from("club_posts")
    .select("id, user_id, body, created_at, profiles(username, avatar_url)")
    .eq("club_id", id)
    .order("created_at", { ascending: false });

  const posts: ClubPost[] = (postRows ?? []).map((p) => {
    const profile = (p as unknown as { profiles: { username: string; avatar_url: string | null } | null }).profiles;
    return {
      id: p.id,
      userId: p.user_id,
      username: profile?.username ?? "Someone",
      avatarUrl: profile?.avatar_url ?? null,
      body: p.body,
      createdAt: p.created_at,
    };
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl">{club.name}</h1>
          {club.description && <p className="mt-1 text-sm text-foreground-muted">{club.description}</p>}
        </div>
        {viewer && <JoinLeaveClubButton clubId={club.id} initiallyMember={isMember} isOwner={isOwner} />}
      </div>

      <div className="mb-6">
        <p className="mb-2 text-xs uppercase tracking-wide text-foreground-muted">
          {members.length} member{members.length === 1 ? "" : "s"}
        </p>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <Link
              key={m.userId}
              href={`/profile/${m.profile?.username ?? ""}`}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-xs hover:border-accent/50"
            >
              <Avatar name={m.profile?.display_name ?? m.profile?.username ?? "?"} src={m.profile?.avatar_url} size={16} />
              {m.profile?.username ?? "?"}
              {m.role === "owner" && <span className="text-foreground-muted">· Owner</span>}
            </Link>
          ))}
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Discussion</h2>
      {isMember ? (
        <ClubFeed clubId={club.id} initialPosts={posts} canPost={isMember} />
      ) : (
        <p className="text-sm text-foreground-muted">Join the club to see and join the discussion.</p>
      )}
    </div>
  );
}
