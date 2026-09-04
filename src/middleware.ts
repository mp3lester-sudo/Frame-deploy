import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { VERIFIED_USER_HEADER } from "@/lib/auth/verified-user-header";

// Note: "/lists" is deliberately NOT here — /lists/[id] must stay reachable
// while logged out for public lists (RLS + the page's own notFound() handle
// visibility), and this matcher is prefix-based so adding "/lists" would
// wrongly gate every list detail page too. The bare "/lists" index (a
// signed-in user's own lists) redirects itself in src/app/lists/page.tsx.
const PROTECTED_PREFIXES = ["/settings", "/onboarding", "/movie-night", "/watchlist"];

// True if the request carries a Supabase session cookie at all, regardless
// of whether it turns out to still be valid. @supabase/ssr writes these as
// `sb-<project-ref>-auth-token` (sometimes chunked into `.0`/`.1` suffixes
// for large tokens) — matching on the stable `sb-...auth-token` shape
// rather than the project-ref-specific full name so this doesn't need to
// track the env's own Supabase URL. Used below to tell "this visitor never
// had a session" (fine to treat as logged out immediately, the overwhelming
// majority of requests) apart from "this visitor HAS a session but we
// failed to verify it just now" (not fine to treat the same way — see the
// getUser() handling below).
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
}

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
  // This is the primary getUser() call for the whole request; everything
  // downstream trusts VERIFIED_USER_HEADER instead of re-deriving it --
  // EXCEPT in the "verification failed, but a session cookie is present"
  // case below, which deliberately leaves the header unset so
  // getVerifiedUser() gets one more independent real attempt instead of
  // trusting a failure that might just be a transient hiccup.
  //
  // Bug this guards against (reported live: personalization intermittently
  // vanishing on an otherwise-normal app load, generic/cold-start content
  // shown instead): getUser() is a real network round trip to Supabase's
  // Auth server, and the old code trusted a null/errored result exactly
  // the same as "genuinely no session" -- so a bare network blip, a brief
  // 5xx from Supabase Auth, or an edge-runtime cold start racing this call
  // silently logged a real, fully-authenticated user out for that one
  // request. Every downstream Server Component (including the entire home
  // page) reads VERIFIED_USER_HEADER as gospel, so that single failed
  // round trip was enough to render the full logged-out experience --
  // generic/anonymous content -- for a user with a perfectly valid
  // session and plenty of taste data. This never showed up as a hard
  // error because "no user" is also the correct, common result for a
  // genuinely logged-out visitor, so there was nothing to catch.
  //
  // Fix: only ever treat this as "definitely logged out" (header = "",
  // the fast path, unchanged for the common case) when either (a) there
  // was no session cookie on the request at all -- nothing to have failed
  // to verify -- or (b) getUser() cleanly returned no error at all (a
  // genuinely invalid/expired session, correctly resolved). A session
  // cookie IS present but getUser() errored or threw is retried once,
  // immediately, cheap insurance against a one-off blip (same shape as
  // engine.ts's own self-heal retries). If it's still inconclusive after
  // that, the header is left unset entirely rather than forced to "" --
  // which routes to getVerifiedUser()'s own existing defensive fallback
  // (a further independent getUser() call) instead of asserting anonymous
  // off two failed network calls in a row.
  const sessionCookiePresent = hasSupabaseSessionCookie(request);
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  let verificationInconclusive = false;
  try {
    const first = await supabase.auth.getUser();
    user = first.data.user;
    if (!user && first.error && sessionCookiePresent) {
      const retry = await supabase.auth.getUser();
      user = retry.data.user;
      if (!user) verificationInconclusive = true;
    }
  } catch {
    verificationInconclusive = sessionCookiePresent;
  }

  if (!verificationInconclusive) {
    request.headers.set(
      VERIFIED_USER_HEADER,
      user
        ? JSON.stringify({
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata,
            email_confirmed_at: user.email_confirmed_at ?? null,
          })
        : ""
    );
  }

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
  // /movie-night/join/[token] is the one Movie Night route deliberately
  // NOT gated -- it's the public invite-link preview (see that page's own
  // comment), meant to work with no account at all. Same carve-out
  // pattern as /lists above: prefix matching would otherwise catch it
  // along with the genuinely protected /movie-night list/session pages.
  const isPublicMovieNightInvite = request.nextUrl.pathname.startsWith("/movie-night/join/");
  const isProtected =
    !isPublicMovieNightInvite && PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));
  // Same reasoning as the header above applies here: don't bounce a
  // protected-route request to /login off an inconclusive verification --
  // that's the redirect-flavored version of the same bug (a real logged-in
  // user transiently kicked off Settings/Watchlist/Movie Night instead of
  // just losing personalization on Home). The page itself still calls
  // getVerifiedUser() and redirects on a genuine null, so letting an
  // inconclusive request through here isn't a security gap -- it's one
  // more real chance to resolve the session correctly before giving up.
  if (isProtected && !user && !verificationInconclusive && !isServerAction) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const response = NextResponse.next({ request });
  cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ico|woff2?)$).*)"],
};
