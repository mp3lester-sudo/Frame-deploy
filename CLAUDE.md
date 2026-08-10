# Backlot — project notes for Claude

Backlot is a Letterboxd-style movie/TV app with an AI "Taste Graph" recommendation
engine. This file exists so any Claude session working in this repo — yours or a
teammate's — picks up the same conventions without needing them re-explained.

## Stack & infrastructure

- Next.js (App Router, Turbopack), React, TypeScript, Tailwind CSS v4
- Supabase: Postgres, Auth, Storage, RLS, pgvector — project ref `lxuknxifbxwfshssylad`
- Deployed on Vercel at https://taste-green-tau.vercel.app, auto-deploys on push to
  `main` via the GitHub integration (no separate deploy step or Vercel CLI needed —
  pushing is deploying)
- GitHub: `mp3lester-sudo/Frame-deploy` (repo name predates a rebrand from "Frame" to
  "Backlot" — not worth renaming mid-project)
- External APIs: TMDB (catalogue + person data + watch providers), OMDB (Rotten
  Tomatoes scores), OpenAI (embeddings + Ask Backlot concierge + ending explainer),
  Open-Meteo (home page weather, no key required)

## Environment variables

Required in `.env.local` (also must be set in Vercel's project environment
variables for production — these two need to match):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
TMDB_API_KEY=
OMDB_API_KEY=
```

**Never commit these, never put them in this file.** Credential rotation is
deferred to a single full rotation pass at the end of the build, not done
incrementally after each time a token is pasted into chat. When that pass
happens, rotate every credential in each provider's dashboard, then update
both Vercel's env vars and every local `.env.local` in use.

## Conventions this project follows

- **Server-side data fetching should never do a redundant `supabase.auth.getUser()`
  call.** Middleware verifies the user once and forwards it via the
  `x-verified-user` request header (see `src/middleware.ts` and
  `src/lib/auth/verified-user.ts`) — every page and Server Action should read that
  via `getVerifiedUser()`, not call `auth.getUser()` itself. This was a real,
  fixed perf bug (redundant round trips to Supabase's Auth server were stacking up
  on every mutating button); don't reintroduce direct `auth.getUser()` calls in new
  pages/actions.
- **Lazy fetch-on-view caching for external APIs.** RT scores, person bios, and
  watch providers are fetched from TMDB/OMDB on first page view only, then cached
  into the DB with a `*_checked_at` timestamp column, so later views are free DB
  reads. Writes to catalogue/title tables go through `createServiceRoleClient()`
  since those tables are service-role-write-only per RLS.
- **New Supabase migrations must be pasted as a fenced SQL block directly in the
  chat response** (not just delivered as a file), since migrations need to be run
  manually against the live project. Wait for explicit confirmation the migration
  ran before building anything that depends on the new schema.
- **Test accounts** use the pattern `mp3lester+<label>@gmail.com`, created either
  via the real signup UI (fine when no service-role key is available) or via
  `supabase.auth.admin.createUser` with the service-role key (for scripted
  verification — see the `scripts/verify-*.ts` files for examples). Clean up test
  accounts and any dependent rows after verification when possible.
- **Build/test/deploy cycle** before considering any change done:
  `npx tsc --noEmit` → `npx vitest run` → `npm run build` → commit → push to `main`
  → wait for the Vercel deploy → live-verify in a real browser. Don't skip the
  live-verify step for anything user-facing — passing tests don't guarantee the
  deployed page actually renders correctly.

## Product principles (apply to every new feature)

Two standing lenses to weigh before building anything new, per Michael's
explicit direction:

1. **Revenue expansion.** Ask whether a feature opens a path to monetization
   or strengthens an existing one (e.g. premium tiers, anything that could
   plausibly become a paid upsell) — not that every feature must be
   monetized directly, but the option value should be part of the judgment
   call, not an afterthought.
2. **User-centric design.** Weigh how a feature actually serves existing
   users' experience, retention, and satisfaction — not capability added for
   its own sake. If a feature doesn't clearly make the product better *for
   the person using it*, that's a signal to reconsider or simplify it.

When proposing "what's next" options or making build/skip calls on a
feature, run it through both lenses explicitly rather than defaulting to
"what's technically interesting to build."

## Sandbox setup (if starting fresh)

```
git clone https://github.com/mp3lester-sudo/Frame-deploy.git
cd Frame-deploy
# create .env.local with the 6 vars above
npm install
```

Pushing requires a GitHub Personal Access Token (classic, `repo` scope) — generate
one at github.com/settings/tokens if git push fails with a credentials error.
