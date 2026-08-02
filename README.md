# Backlot

Letterboxd's core (catalogue, ratings, reviews, lists, social) with an AI-driven
"Taste Graph" as the differentiator — see `/docs` (in the parent folder,
`Taste_Phase1_Architecture.md`) for the full architecture rationale.

## What's built

All 11 phases from the build plan have a working implementation:

1. **Architecture** — modular monolith, Next.js App Router + Supabase. See the architecture doc.
2. **Database** — `supabase/migrations/0001_init.sql` (full schema: catalogue, ratings,
   reviews, lists, social graph, movie nights, taste vectors/embeddings, billing).
3. **Auth** — Supabase email/password via Server Actions (`src/lib/actions/auth.ts`),
   session-refresh middleware, RLS policies (`0002_rls.sql`).
4. **Design system** — dark-first token system (`globals.css`), core components in
   `src/components/ui` (Button, Card, Input, Avatar, Badge, Skeleton, RatingStars).
5. **Navigation/app structure** — nav bar + routes: home, discover, search, movie detail,
   profile, feed, Ask Backlot (AI), premium, login/signup.
6. **Recommendation engine** — hybrid vector + collaborative filtering
   (`src/lib/recommendations/engine.ts`), backed by Postgres/pgvector functions
   (`0003_recommendation_functions.sql`) and an OpenAI embedding pipeline
   (`src/lib/recommendations/embeddings.ts`).
7. **AI** — conversational concierge (`src/lib/ai/concierge.ts`, `/ai` page) that does
   semantic search over the catalogue before letting the LLM explain (never invent)
   picks, plus an ending/plot explainer (`src/lib/ai/ending-explainer.ts`).
8. **Social** — ratings, reviews, lists, follows, and an activity feed
   (`src/lib/actions/social.ts`, `/feed`, `/movie/[id]`, `/profile/[username]`).
9. **Payments** — Stripe Checkout + webhook wired to a `subscriptions` table
   (`src/app/api/stripe/*`, `/premium`).
10. **Testing** — Vitest unit tests for the pure logic (`src/**/__tests__`); `npm test`.
11. **Deployment** — GitHub Actions CI (typecheck, lint, test, build) + this README.

Typecheck, lint, unit tests, and `next build` all pass as of this commit.

## What's intentionally stubbed / next

- **Catalogue ingestion worker** (TMDB → `titles` → embeddings) isn't implemented —
  `embedMissingTitles()` in `src/lib/recommendations/embeddings.ts` assumes titles
  already exist. Without it the app has no movies to show; this is the next thing to build.
- **Movie Night, Wrapped, gamification, creator tools, enterprise analytics** — described
  in the vision doc, not yet built. The schema/architecture leave room for them.
- **E2E tests** (Playwright) — not installed; Vitest covers unit-level logic only.
- **Native mobile** — web/PWA only, per the Phase 1 decision log.

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in Supabase, OpenAI, and Stripe keys.
3. Create a Supabase project, then run the migrations in order against it:
   ```bash
   npx supabase db push   # or run the SQL files in supabase/migrations in order via the SQL editor
   ```
4. Regenerate typed DB types once linked (replaces the hand-maintained placeholder):
   ```bash
   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
   ```
5. `npm run dev` and open http://localhost:3000.

## Scripts

- `npm run dev` / `npm run build` / `npm start`
- `npm test` — Vitest unit tests
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck

## Deploying

- **Vercel**: import the repo, set the env vars from `.env.example` as project env vars,
  deploy. Next.js is auto-detected; `vercel.json` now only exists to declare the daily
  re-engagement-email cron job (see below).
- **Stripe webhook**: point it at `https://<domain>/api/stripe/webhook`, subscribe to
  `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- **CI**: `.github/workflows/ci.yml` runs typecheck/lint/test/build on every PR and push to `main`.
- **PostHog** (optional): set `NEXT_PUBLIC_POSTHOG_KEY` (and `NEXT_PUBLIC_POSTHOG_HOST` if
  self-hosting) to activate analytics capture in `src/lib/analytics/`. No-ops without it.
- **Resend** (optional): set `RESEND_API_KEY` to activate the welcome email in
  `src/lib/email/resend.ts`. Also set `RESEND_FROM_EMAIL` once a sending domain is verified
  in Resend — until then it falls back to a shared address that only delivers to the Resend
  account owner's own inbox.
- **Sentry** (optional): set `NEXT_PUBLIC_SENTRY_DSN` (client) and `SENTRY_DSN` (server,
  falls back to the public one if unset) to activate error capture in `src/lib/monitoring/`.
  Server errors are caught automatically via `src/instrumentation.ts`'s `onRequestError` hook;
  client-side render errors are reported from `error.tsx`/`global-error.tsx`. No-ops without
  a DSN.
- **Admin dashboard** (`/admin/reports`): gated by `src/lib/admin/is-admin.ts`, which checks
  the signed-in user's email against `ADMIN_EMAILS` (comma-separated) with `mp3lester@gmail.com`
  as a built-in fallback so it works without any setup.
- **Re-engagement email cron** (`/api/cron/reengagement`, `src/lib/reengagement/campaign.ts`):
  runs daily via the Vercel Cron declared in `vercel.json`. Set `CRON_SECRET` as a project env
  var (any random string, at least 16 characters) — Vercel automatically sends it back as
  `Authorization: Bearer $CRON_SECRET` on cron-triggered requests, and the route 401s without
  it configured rather than running unauthenticated. Requires `RESEND_API_KEY` to actually send
  (no-ops otherwise, same as the welcome email). Vercel's Hobby plan caps cron jobs at one
  run/day, which this already respects.
- **Referral loop**: every account gets a shareable link (`/signup?ref=<code>`, shown in
  Settings → Invite friends). A successful signup through that link grants the referrer
  `REFERRAL_BONUS_DAYS` (`src/lib/referrals/constants.ts`, currently 14) of bonus Premium via
  `record_referral()` (migration 0036) — tracked separately from Stripe's `is_premium` in
  `profiles.bonus_premium_until`, combined at read time by `src/lib/premium/is-premium.ts`.

## Operational notes (run by hand, not automated)

A few maintenance operations are deliberately **not** wired into CI or app startup, because
they either cost real API money per run or touch production data directly. They're scripts
the project owner runs manually, when they decide to:

- **`npm run enrich:titles`** — backfills AI taste metadata + embeddings for any title
  missing them (see `scripts/enrich-titles.ts`). Each title costs a small OpenAI charge
  (chat completion + embedding call), so running this against the full pending backlog is
  a real cost decision, not something that should fire automatically as the catalogue grows
  via `ingest:tmdb`. Check `pending_enrichment_titles` count first, then run with
  `--limit=N` for a bounded batch, or omit `--limit` to drain the whole backlog in one go.
- **New Supabase migrations** (e.g. `supabase/migrations/00NN_*.sql`) — this repo's sandbox
  has no standing DB credentials, so migrations are written as files here but must be
  run by hand in the Supabase SQL Editor (Project → SQL Editor → paste → Run) before the
  feature that depends on them will work against production data.
- **Credential rotation** — the Supabase DB password and TMDB/OpenAI/Vercel tokens should be
  rotated periodically from each service's own dashboard; this can't be done from the app
  side.
