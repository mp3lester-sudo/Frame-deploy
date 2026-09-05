import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isAdminEmail } from "@/lib/admin/is-admin";
import { getUserDetail } from "@/lib/actions/admin";
import { Badge } from "@/components/ui/badge";
import { SuspendPanel } from "@/components/admin/suspend-panel";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/admin/users");
  if (!isAdminEmail(user.email)) notFound();

  const { id } = await params;
  const detail = await getUserDetail(id);
  if (!detail) notFound();

  const isBanned = detail.isBanned;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">
            {detail.display_name ?? detail.username}{" "}
            <span className="text-lg text-foreground-muted">@{detail.username}</span>
          </h1>
          <p className="text-sm text-foreground-muted">{detail.email ?? "No email on file"}</p>
        </div>
        <Link href="/admin/users" className="text-xs uppercase tracking-wider text-foreground-muted hover:text-accent">
          &larr; Back to search
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {detail.deleted_at && <Badge>Account deleted</Badge>}
        {isBanned && <Badge>Suspended</Badge>}
        {detail.is_premium && <Badge>{detail.premium_tier === "auteur" ? "Auteur" : "Premium"}</Badge>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-foreground-muted">Joined</p>
          <p>{new Date(detail.created_at).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-foreground-muted">Subscription</p>
          <p>{detail.subscription ? detail.subscription.status : "None"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-foreground-muted">Reports filed</p>
          <p>{detail.reportsFiledCount}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-foreground-muted">Reports received</p>
          <p>{detail.reportsReceivedCount}</p>
        </div>
      </div>

      {!detail.deleted_at && (
        <div className="mb-8">
          <SuspendPanel userId={detail.id} isBanned={isBanned} />
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm uppercase tracking-wider text-foreground-muted">Admin action history</h2>
        {detail.recentActions.length === 0 ? (
          <p className="text-sm text-foreground-muted">No prior admin actions against this account.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {detail.recentActions.map((a) => (
              <div key={a.id} className="rounded-[var(--radius-md)] border border-border bg-surface p-3 text-sm">
                <p>
                  <span className="uppercase tracking-wider text-foreground-muted">{a.action.replace("_", " ")}</span>{" "}
                  by {a.admin_username ? `@${a.admin_username}` : "an admin"} &middot;{" "}
                  {new Date(a.created_at).toLocaleString()}
                </p>
                {a.reason && <p className="mt-1 text-foreground-muted">&ldquo;{a.reason}&rdquo;</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
