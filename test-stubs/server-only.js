// Next.js has built-in special-case resolution for the "server-only"
// package (it works even without the package actually being installed,
// which is why it wasn't in node_modules already) -- Vitest has no such
// special case, so this stub exists purely so `import "server-only"` at
// the top of server-side modules (openai.ts, stripe.ts, resend.ts, etc.)
// doesn't break unit tests that transitively import them for their pure
// logic (see vitest.config.ts's resolve.alias).
export {};
