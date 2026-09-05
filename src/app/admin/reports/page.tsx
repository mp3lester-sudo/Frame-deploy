import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isAdminEmail } from "@/lib/admin/is-admin";
import { REPORT_REASON_LABELS, type ReportReason, type ReportableContentType } from "@/lib/moderation/validate";
import { ReportRow } from "@/components/admin/report-row";
import { formatDistanceToNow } from "@/lib/date";
import { resolveReportedUserId } from "@/lib/admin/resolve-reported-user";

export const dynamic = "force-dynamic";

type ReportRecord = {
  id: string;
  reporter_id: string;
  content_type: ReportableContentType;
  content_id: string;
  reason: ReportReason;
  note: string | null;
  status: "open" | "reviewed" | "dismissed";
  created_at: string;
};

type ProfileLite = { id: string; username: string; display_name: string | null };

/**
 * Reports are polymorphic (content_type + content_id, see migration 0035),
 * so there's no single embedded-FK select that gets a preview for every
 * row -- this groups ids by type and does one batch query per type instead
 * of N+1 individual lookups.
 */
async function fetchPreviews(
  supabase: ReturnType<typeof createServiceRoleClient>,
  reports: ReportRecord[]
): Promise<Map<string, string>> {
  const previews = new Map<string, string>();
  const idsByType: Record<ReportableContentType, string[]> = {
    review: [],
    review_comment: [],
    message: [],
    club_post: [],
    profile: [],
  };
  for (const r of reports) idsByType[r.content_type].push(r.content_id);

  const [reviews, comments, messages, posts, profiles] = await Promise.all([
    idsByType.review.length
      ? supabase.from("reviews").select("id, body, title_id").in("id", idsByType.review)
      : Promise.resolve({ data: [] }),
    idsByType.review_comment.length
      ? supabase.from("review_comments").select("id, body").in("id", idsByType.review_comment)
      : Promise.resolve({ data: [] }),
    idsByType.message.length
      ? supabase.from("messages").select("id, body").in("id", idsByType.message)
      : Promise.resolve({ data: [] }),
    idsByType.club_post.length
      ? supabase.from("club_posts").select("id, body").in("id", idsByType.club_post)
      : Promise.resolve({ data: [] }),
    idsByType.profile.length
      ? supabase.from("profiles").select("id, username, bio").in("id", idsByType.profile)
      : Promise.resolve({ data: [] }),
  ]);

  // No embedded FK select for the title name (see notifications/page.tsx
  // for why -- this app's generated Database type carries no Relationships
  // metadata for embeds), so fetch title_id here and batch-join to titles
  // separately, same pattern as everywhere else in the app.
  const reviewRows = (reviews.data ?? []) as unknown as { id: string; body: string; title_id: string }[];
  const titleIds = [...new Set(reviewRows.map((r) => r.title_id))];
  const { data: titleRows } = titleIds.length
    ? await supabase.from("titles").select("id, name").in("id", titleIds)
    : { data: [] as { id: string; name: string }[] };
  const titleNames = new Map((titleRows ?? []).map((t) => [t.id, t.name]));

  for (const row of reviewRows) {
    previews.set(row.id, `Review of ${titleNames.get(row.title_id) ?? "a title"}: "${row.body.slice(0, 200)}"`);
  }
  for (const row of (comments.data ?? []) as unknown as { id: string; body: string }[]) {
    previews.set(row.id, `Comment: "${row.body.slice(0, 200)}"`);
  }
  for (const row of (messages.data ?? []) as unknown as { id: string; body: string }[]) {
    previews.set(row.id, `Message: "${row.body.slice(0, 200)}"`);
  }
  for (const row of (posts.data ?? []) as unknown as { id: string; body: string }[]) {
    previews.set(row.id, `Club post: "${row.body.slice(0, 200)}"`);
  }
  for (const row of (profiles.data ?? []) as unknown as { id: string; username: string; bio: string | null }[]) {
    previews.set(row.id, `Profile @${row.username}${row.bio ? ` — "${row.bio.slice(0, 160)}"` : ""}`);
  }
  return previews;
}

export default async function AdminReportsPage() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/admin/reports");
  // notFound() rather than a 403 page -- an admin surface shouldn't even
  // reveal its own existence to a non-admin, same reasoning as returning
  // 404 instead of 403 on APIs that guard against enumeration.
  if (!isAdminEmail(user.email)) notFound();

  const supabase = createServiceRoleClient();

  const [{ data: openRows }, { data: resolvedRows }] = await Promise.all([
    supabase
      .from("reports")
      .select("id, reporter_id, content_type, content_id, reason, note, status, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("reports")
      .select("id, reporter_id, content_type, content_id, reason, note, status, created_at")
      .neq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const open = (openRows ?? []) as ReportRecord[];
  const resolved = (resolvedRows ?? []) as ReportRecord[];
  const all = [...open, ...resolved];

  const reporterIds = [...new Set(all.map((r) => r.reporter_id))];
  const [{ data: reporterRows }, previews, targetUserIds] = await Promise.all([
    reporterIds.length
      ? supabase.from("profiles").select("id, username, display_name").in("id", reporterIds)
      : Promise.resolve({ data: [] }),
    fetchPreviews(supabase, all),
    // One resolveReportedUserId() call per report -- each hits a
    // different table depending on content_type, so there's no single
    // batched query the way fetchPreviews above manages for previews.
    // Report volume is low enough (open + 20 most recent resolved) that
    // this is fine; revisit if the open queue ever gets large.
    Promise.all(all.map((r) => resolveReportedUserId(supabase, r.content_type, r.content_id))),
  ]);
  const reporters = new Map((reporterRows ?? []).map((p: ProfileLite) => [p.id, p]));
  const targetUserIdByReport = new Map(all.map((r, i) => [r.id, targetUserIds[i]]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl">Moderation reports</h1>
        <Link href="/" className="text-xs uppercase tracking-wider text-foreground-muted hover:text-accent">
          Back to Slate &rarr;
        </Link>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-sm uppercase tracking-wider text-foreground-muted">
          Open ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nothing open — all caught up.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {open.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                reporter={reporters.get(r.reporter_id) ?? null}
                preview={previews.get(r.content_id) ?? null}
                reasonLabel={REPORT_REASON_LABELS[r.reason]}
                timeAgo={formatDistanceToNow(r.created_at)}
                targetUserId={targetUserIdByReport.get(r.id) ?? null}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm uppercase tracking-wider text-foreground-muted">
          Recently resolved
        </h2>
        {resolved.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nothing resolved yet.</p>
        ) : (
          <div className="flex flex-col gap-3 opacity-70">
            {resolved.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                reporter={reporters.get(r.reporter_id) ?? null}
                preview={previews.get(r.content_id) ?? null}
                reasonLabel={REPORT_REASON_LABELS[r.reason]}
                timeAgo={formatDistanceToNow(r.created_at)}
                targetUserId={targetUserIdByReport.get(r.id) ?? null}
                readOnly
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
