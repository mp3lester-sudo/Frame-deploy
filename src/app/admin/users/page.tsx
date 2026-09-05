import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isAdminEmail } from "@/lib/admin/is-admin";
import { searchUsers } from "@/lib/actions/admin";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Plain GET-form search (?q=) rather than a client-side search box --
 * there's no need for live-as-you-type here, and a server-rendered form
 * keeps this page working even if JS fails to hydrate, consistent with
 * this being an internal ops tool rather than a polished consumer surface.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/admin/users");
  if (!isAdminEmail(user.email)) notFound();

  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await searchUsers(query) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl">User lookup</h1>
        <Link href="/" className="text-xs uppercase tracking-wider text-foreground-muted hover:text-accent">
          Back to Slate &rarr;
        </Link>
      </div>

      <form className="mb-8 flex gap-2">
        <Input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Username, display name, or email"
          className="max-w-sm"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {query && results.length === 0 && (
        <p className="text-sm text-foreground-muted">No accounts matched &ldquo;{query}&rdquo;.</p>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((r) => (
            <Link
              key={r.id}
              href={`/admin/users/${r.id}`}
              className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-surface p-3 hover:border-accent/50"
            >
              <div>
                <p className="text-sm font-medium">
                  {r.display_name ?? r.username}{" "}
                  <span className="text-foreground-muted">@{r.username}</span>
                </p>
                <p className="text-xs text-foreground-muted">
                  Joined {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                {r.deleted_at && <Badge>Deleted</Badge>}
                {r.is_premium && <Badge>{r.premium_tier === "auteur" ? "Auteur" : "Premium"}</Badge>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
