import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { VERIFIED_USER_HEADER } from "@/lib/auth/verified-user-header";

// Note: "/lists" is deliberately NOT here — /lists/[id] must stay reachable
// while logged out for public lists (RLS + the page's own notFound() handle
// visibility), and this matcher is prefix-based so adding "/lists" would
// wrongly gate every list detail page too. The bare "/lists" index (a
// signed-in user's own lists) redirects itself in src/app/lists/page.tsx.
const PROTECTED_PREFIXES = ["/settings", "/onboarding", "/movie-night", "/watchlist"];

// getUser() is a real network round trip to Supabase's Auth server — it
// never just decodes the local JWT. Before VERIFIED_USER_HEADER existed,
// the root layout AND every Server Action's own requireUser() each called
// supabase.auth.getUser() independently, on top of this one. So a single
// button click that mutates data (rate, watchlist, like, comment, join a
// club, ...) paid that round trip 2-3 times over: once here, once inside
// the action, and once more when the action's revalidatePath forced the
// layout to re-render. Plain navigations (like Discover's genre pills,
// which are just <Link>s, not Server Actions) only ever paid it twice
// (here + the layout), and got masked further by Next's automatic Link
// prefetching — which is why Discover felt fast while every mutating
// button felt slow for no obvious reason. See src/lib/auth/verified-user.ts
// for the downstream reader.
export async function middleware(request: NextRequest) {
  // Cookies from a refreshed session are queued here instead of being
  // applied to a response object immediately, because the final response
  // has to be built AFTER we know the user (below) so it can also carry
  // the verified-user header — building the response any earlier and
  // reconstructing it later would silently drop whichever one wasn't set
  // on the final object.
  const cookiesToApply: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToApply.push(...cookiesToSet);
        },
      },
    }
  );

  // Refreshes the session token if expired — required for SSR auth to work.
  // This is the ONLY getUser() call for the whole request; everything
  // downstream trusts VERIFIED_USER_HEADER instead of re-deriving it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  request.headers.set(
    VERIFIED_USER_HEADER,
    user ? JSON.stringify({ id: user.id, email: user.email, user_metadata: user.user_metadata }) : ""
  );

  // Next.js Server Actions POST back to the current page URL (e.g. a
  // settings-page form action posts to /settings), carrying a `Next-Action`
  // request header. If this middleware 307-redirects that POST to /login —
  // which it did whenever getUser() came back empty for a momentarily-stale
  // session, e.g. mid-import — the browser follows the redirect as a POST,
  // landing on a page route that was never meant to receive one. Next's
  // client-side action runtime expects a specific action-result payload
  // back, not a redirect/HTML response, and fails with an opaque, generic
  // error ("Server Components render" / "unexpected response from the
  // server") that gives no hint auth was the actual problem.
  //
  // Server Actions already check auth themselves (see requireUser() in
  // src/lib/actions/*.ts, which throws a clean "Not authenticated" Error
  // surfaced via each component's own try/catch) — so it's safe, and much
  // more robust, to let action requests through here rather than redirect
  // them. A genuinely logged-out user still gets a clear, catchable error
  // from the action itself instead of a framework-level crash.
  const isServerAction = request.headers.has("next-action");
  const isProtected = PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));
  if (isProtected && !user && !isServerAction) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const response = NextResponse.next({ request });
  cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
