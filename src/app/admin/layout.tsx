import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isAdminEmail } from "@/lib/admin/is-admin";

export const dynamic = "force-dynamic";

/**
 * Shared gate + nav for every /admin/* route. Each page under here still
 * re-checks isAdminEmail() itself in its own data-fetching path (and every
 * server action re-checks via requireAdmin()) -- this layout is a second,
 * outer gate, not a replacement for those, same "never trust a single
 * check" discipline used everywhere else in this codebase. notFound()
 * rather than a 403 so a non-admin can't even tell /admin exists.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/admin/reports");
  if (!isAdminEmail(user.email)) notFound();

  return (
    <div>
      <nav className="border-b border-border bg-surface/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl gap-6 px-4 py-3 text-xs uppercase tracking-wider text-foreground-muted">
          <Link href="/admin/reports" className="hover:text-accent">
            Reports
          </Link>
          <Link href="/admin/users" className="hover:text-accent">
            Users
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
