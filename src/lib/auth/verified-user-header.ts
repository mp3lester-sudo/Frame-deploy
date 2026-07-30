/**
 * Name of the request header middleware (src/middleware.ts) uses to forward
 * the user it already verified via supabase.auth.getUser() to every Server
 * Component/Action downstream — see src/lib/auth/verified-user.ts for the
 * reader side. Kept in its own tiny module (rather than importing directly
 * from middleware.ts) so nothing downstream depends on Next's special
 * handling of the middleware file itself.
 */
export const VERIFIED_USER_HEADER = "x-verified-user";
