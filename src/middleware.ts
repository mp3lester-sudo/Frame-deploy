import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/settings", "/onboarding", "/movie-night"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the session token if expired — required for SSR auth to work.
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
