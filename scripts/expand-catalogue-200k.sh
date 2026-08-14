#!/usr/bin/env bash
# Catalogue expansion run -- pulls deep into TMDB's discover endpoint
# across many release-date bands (each capped at TMDB's own 500-page /
# 10,000-result ceiling per query, see the comment in
# scripts/ingest-tmdb.ts) with full AI enrichment (taste metadata +
# embedding) on every new title, targeting roughly 200,000 net-new
# additions to the catalogue.
#
# Run from the repo root, with a real .env.local in place
# (TMDB_API_KEY, OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
# SUPABASE_SERVICE_ROLE_KEY) -- this script just loops npm run
# ingest:tmdb, so anything that script needs, this needs too.
#
# This is a genuinely long-running, real-cost operation: full AI
# enrichment means one gpt-4.1-mini call + one embedding call per NEW
# title (titles already in the catalogue are detected and skipped, see
# the "already-enriched" check ingest-tmdb.ts now does before spending
# any OpenAI call). Expect this to run for many hours -- it's safe to
# Ctrl-C and resume by commenting out bands already completed below,
# since every upsert is keyed on tmdb_id and re-running a finished band
# just re-confirms it's already enriched (cheap, no OpenAI spend) rather
# than duplicating anything.
#
# Actual net-new count depends on how deep TMDB's own catalogue goes at
# a reasonable quality bar -- vote_count.gte=5 below skips pure stub
# entries (no votes, often no poster/overview) while still reaching deep
# into each era. Recent, densely-catalogued years will likely hit the
# 10,000-result cap on their own; older eras won't -- TMDB simply
# doesn't have that many well-attested films from, say, 1930-1959, so
# those bands finish fast with far fewer than 10k. Check real progress
# any time with: npm run report:catalogue
#
# Lower --vote-count-gte (down to 1, or 0) on any band below if you want
# to pull deeper/wider and are fine with noisier, thinner-metadata
# titles surfacing in the catalogue.

set -e

BANDS=(
  "1874-01-01:1959-12-31"
  "1960-01-01:1969-12-31"
  "1970-01-01:1979-12-31"
  "1980-01-01:1989-12-31"
  "1990-01-01:1994-12-31"
  "1995-01-01:1999-12-31"
  "2000-01-01:2003-12-31"
  "2004-01-01:2007-12-31"
  "2008-01-01:2010-12-31"
  "2011-01-01:2013-12-31"
  "2014-01-01:2015-12-31"
  "2016-01-01:2017-12-31"
  "2018-01-01:2019-12-31"
  "2020-01-01:2020-12-31"
  "2021-01-01:2021-12-31"
  "2022-01-01:2022-12-31"
  "2023-01-01:2023-12-31"
  "2024-01-01:2024-12-31"
  "2025-01-01:2025-12-31"
  "2026-01-01:2026-12-31"
)

for band in "${BANDS[@]}"; do
  gte="${band%%:*}"
  lte="${band##*:}"
  echo ""
  echo "=== Band ${gte}..${lte} ==="
  npm run ingest:tmdb -- --list=discover --pages=1-500 \
    --vote-count-gte=5 --date-gte="$gte" --date-lte="$lte"
done

echo ""
echo "All bands done. Run 'npm run report:catalogue' to see the new totals."
