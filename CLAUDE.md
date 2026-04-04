# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Horror Radar is a **horror indie game breakout detection platform**. It tracks newly released indie horror games on Steam, collects engagement data from multiple sources (Steam, YouTube, Twitch, Reddit), and computes an **OPS (Overperformance Score)** to identify games that are outperforming their peers — i.e., breaking out.

The target user is someone scouting for emerging horror indie hits within the first 90 days of release.

## Architecture

- **Backend**: Python, FastAPI, SQLAlchemy (sync sessions), SQLite (WAL mode), APScheduler
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 3
- **No ORM migrations**: Schema changes use `ALTER TABLE` in `database.py init_db()`
- **Runs on Google Drive** (Obsidian vault) — paths are long; DB is local SQLite
- **Deployed**: Frontend on Vercel (static SPA), backend on separate server. `frontend/vercel.json` rewrites `/api/*` to the backend host.
- **Git remotes**: `horror-radar` (GitHub deploy repo), `origin` (second-brain/Obsidian vault). Push to `horror-radar` for deployment.
- **No tests**: No test suite exists for either backend or frontend.

## Development Commands

```bash
# Backend — run from backend/
pip install -r requirements.txt          # one-time setup
python3 -m uvicorn main:app --reload     # dev server on :8000

# Frontend — run from frontend/
npm install                               # one-time setup
npm run dev                               # Vite dev server on :5173
npm run build                             # production build (no tsc — TS errors don't block)
```

No lint, format, or test scripts are configured.

### Key Paths

```
backend/           — FastAPI app, collectors, SQLite DB
  main.py          — App + APScheduler lifecycle
  config.py        — Pydantic settings (env vars)
  models.py        — SQLAlchemy models (10 tables)
  schemas.py       — Pydantic response schemas
  database.py      — Engine, SessionLocal, init_db()
  monitor.py       — CLI live job progress monitor (ANSI)
  weekly_analysis.py — Weekly markdown report generator
  collectors/      — Data collection modules
    discovery.py     — Steam store search + SteamSpy tag discovery
    metadata.py      — Steam appdetails + horror/indie classification
    reviews.py       — Review count + score snapshots
    ccu.py           — Concurrent player snapshots
    youtube_scanner.py — Channel upload scanning + fuzzy game matching
    youtube_stats.py   — Video stats refresh (views, likes, comments)
    twitch.py        — Twitch stream snapshots
    reddit.py        — Reddit mention tracking
    achievements.py  — Achievement completion rates
    updates.py       — Steam update frequency tracking
    dev_profile.py   — Developer track record aggregation
    ops.py           — OPS v4 scoring engine
    ops_backfill.py  — Historical OPS recalculation
    ops_autotune.py  — Signal quality diagnostics + weight recommendations
    review_backfill.py — Reconstruct daily review history for late-discovered games
    _http.py         — Rate limiters + fetch_with_retry (handles YouTube 403)
  routers/         — API endpoints
    games.py         — Game list, detail, timeline
    radar.py         — Radar Pick (top breakout game)
    channels.py      — YouTube channel data
    videos.py        — YouTube video data
    runs.py          — Collection run status
    insights.py      — Aggregated insights
frontend/          — React SPA
  src/pages/
    Database.tsx       — Main game table page
    radar/SignalFire.tsx — Radar Pick editorial page
    game/ConceptA.tsx  — Game detail/autopsy page
  src/components/  — Header, FilterBar, GameTable, GameRow, Pagination
  src/types/       — TypeScript interfaces
  src/api/         — API client (fetchPaginated, fetchStatus, fetchOne)
```

## Database Tables

| Table | Purpose |
|---|---|
| `games` | Steam games (appid, title, developer, price, genres, tags, is_indie, is_horror, has_demo, next_fest) |
| `discarded_games` | Rejected games with reason (not_horror, not_indie, major_publisher, not_horror_reclassified) |
| `game_snapshots` | Daily time-series: reviews, CCU, velocity, achievements, patches, twitch |
| `youtube_channels` | Seed channels (10 indie horror YouTubers) |
| `youtube_videos` | Scraped videos with fuzzy-matched `matched_appid` |
| `youtube_video_snapshots` | Daily view/like/comment history per video |
| `ops_scores` | Daily OPS calculation per game (score 0-100, components, confidence, formula_version) |
| `twitch_snapshots` | Concurrent streams + viewers per game per day |
| `reddit_mentions` | Reddit posts mentioning games (from HorrorGaming, IndieGaming) |
| `developer_profiles` | Aggregated dev stats (total games, avg score, best game) |
| `collection_runs` | Job execution log (status, items processed/failed, timing) |

## OPS Formula (v4)

```
score = min(100, raw_ops * 24)
```

Five components with NULL-weight redistribution and graduated coverage penalty:

| Component | Weight | Cap | Calculation |
|---|---|---|---|
| Velocity | 0.35 | 5.0 | current_velocity / expected_velocity_at_age |
| Decay Retention | 0.20 | 2.0 | week2_4_velocity / week1_velocity |
| Review Volume | 0.15 | 5.0 | (review_count / median_reviews) * price_modifier |
| YouTube | 0.15 | ~1.8 | 0.6 * (views_subs_ratio / 0.074) + 0.4 * (channels / 10) |
| CCU | 0.15 | 5.0 | (peak_ccu / median_ccu) * age_decay (decays to 0 after 14 days) |

**Coverage penalty** (prevents inflated scores from sparse data):
- 1 component active: raw × 0.50
- 2 components: raw × 0.70
- 3 components: raw × 0.85
- 4 components: raw × 0.95
- 5 components: raw × 1.00

NULL components redistribute their weight to active components. Cold start guard: won't score if < 20 baseline games.

**Price modifiers** (review component only): Free=0.6, <$5=0.85, $5-10=1.0, $10-20=1.15, $20+=1.3

**Baselines** use true median from games in a 120-day peer window. Age-adjusted velocity uses empirical medians: week 1 = 1.14 reviews/day, week 2-4 = 0.14, month 2-3 = 0.03.

**OPS Auto-Tune** (`ops_autotune.py`): Weekly diagnostics that check component coverage (>10% required), discrimination (coefficient of variation), pairwise correlation (>0.85 = redundant), and recommends weight adjustments. Logs report every Monday — does NOT auto-change weights.

### Deprecated/Removed
- **Owners collector**: Disabled — SteamSpy data too coarse (5% coverage), too late (30-90 day lag). Use `reviews × 30` heuristic instead.
- **Creator response component**: Removed in v4 — only 3% coverage, requires specific YouTube + snapshot alignment that rarely occurs.

## Discovery Pipeline

Three sources, processed in this order:
1. **Steam store search** (tag IDs for Horror/Psychological Horror/Survival Horror, sorted by release date, 13 pages) — catches recent releases SteamSpy hasn't indexed yet
2. **SteamSpy tag endpoints** (Horror, Psychological Horror, Survival Horror) — broad coverage, lags 30-90 days
3. **CURATED_SEEDS** — manually added AppIDs for edge cases (e.g., EA games with old AppIDs)

### Horror Classification (5-layer chain)

```
Layer 0: Vote count filtering — when tags have real votes, ignore tags with 0 votes
Layer 1: Strong horror tags (Horror, Survival Horror, Psychological Horror, etc.)
         → Pass UNLESS:
           - Anti-horror tags outnumber strong tags by 3+ (Cartoon, Cute, Comedy, etc.)
           - Unvoted tags + NON_HORROR_GENRE_TAGS dominate (Romance, Dating Sim, etc.)
             AND description doesn't confirm horror
           - Voted NON_HORROR_GENRE_TAGS present AND no desc/genre confirmation
           - Combined anti-horror + non-horror vote weight > horror vote weight
           - Horror tags rank in bottom third by votes (weak signal)
Layer 2: Ambiguous tags (Zombies, Dark, Lovecraftian, Gothic, Cosmic Horror, etc.)
         → Pass only if description confirms horror OR Steam genre confirms horror
Layer 3: Steam genre categories (Horror, Psychological Horror, Survival Horror)
Layer 4: Description keyword scan (short_description + about_the_game HTML-stripped)
```

**AMBIGUOUS_HORROR_TAGS**: Zombies, Dark, Violent, Gore, Demons, Supernatural, Ghosts, Lovecraftian, Cosmic Horror, Gothic, Creepy. These require description or genre confirmation to classify as horror.

**NON_HORROR_GENRE_TAGS**: Romance, Dating Sim, Visual Novel, Sexual Content, Farming Sim, City Builder, Tower Defense, Puzzle, Sports, Racing, Card Game, Board Game, Education, Music, Rhythm. With voted tags, any presence rejects unless description or genre confirms horror. With unvoted tags, must outnumber strong horror tags.

Scope: **MAX_AGE_DAYS = 90** (3 months from release)

## Scheduler Jobs

All times UTC. System is UTC+8 (SGT).

| Job | Schedule (UTC) | Pipeline |
|---|---|---|
| steam_pipeline | Every 6h (00/06/12/18:00) | discovery → metadata |
| daily_snapshots | Daily 04:00 | reviews → CCU → OPS chain |
| youtube_pipeline | Daily 05:00 | scan → stats refresh |
| twitch_pipeline | Every 6h (01/07/13/19:00) | twitch snapshots |
| reddit_pipeline | Daily 02:00 | reddit scan |
| steam_extras | Daily 03:00 | update tracking → achievement stats |
| dev_profiles | Monday 05:30 | developer profile aggregation |
| ops_diagnostics | Monday 06:00 | signal quality report (coverage, discrimination, correlations) |
| stale_run_watchdog | Every 1h | mark jobs stuck >2h as "stale" |
| weekly_analysis | Monday 04:00 | markdown summary report (moved to Mon to capture full weekend) |

### Pipeline Reliability Guardrails

Three layers protect against silent pipeline failures:

1. **Startup cleanup** (`database.py _cleanup_stale_runs()`): On server start, marks all orphaned "running" jobs as "crashed". If the server is starting, no jobs can actually be running — these are leftovers from a process that died mid-run.
2. **Hourly watchdog** (`main.py stale_run_watchdog()`): Marks any job stuck in "running" for >2 hours as "stale". Catches jobs that hang without crashing (e.g., stuck on a rate-limited API call that never returns).
3. **Per-collector try/except**: Each collector wraps its main loop in try/except, writing `status="failed"` with error message on exception.

**Pipeline health is critical.** Always check `collection_runs` for stale "running" jobs or gaps longer than 1 cycle. Silent failures (stuck jobs, API rate limits treated as permanent errors) cause compounding data loss. Investigate immediately if a pipeline goes stale.

### Review Backfill for Late-Discovered Games

`collectors/review_backfill.py` — For games discovered well after release (e.g., The Stalking Stairs: released Feb 6, discovered Apr 1). Fetches all individual reviews from Steam's review API (`/appreviews/{appid}`), bins them by `timestamp_created` date, and reconstructs daily cumulative review counts to backfill `game_snapshots` for days that don't already have data.

Usage: `from collectors.review_backfill import backfill_review_history; backfill_review_history(appid)`

Key implementation details:
- Deduplicates reviews by `recommendationid` (Steam API can return duplicates across pages)
- Tracks `seen_cursors` to detect pagination cycling (Steam returns the same cursor when exhausted)
- Safety limit: 30 pages × 100 reviews = 3,000 max (sufficient for indie horror scope)
- Only creates snapshots for days not already covered by real collector data

## Frontend

### Typography (3-font system)

| Tailwind Class | Font | Usage |
|---|---|---|
| `font-display` | Public Sans | Body text, UI labels, headings |
| `font-mono` | JetBrains Mono | Data values, numbers, stats, code |
| `font-serif` | Playfair Display | Editorial titles (Radar Pick only) |

Type scale: Major fourths (1.333 ratio, base 16px). Loaded via Google Fonts in `index.html`.

### Theme

Wada Sanzo "Occult Amber" palette: `primary: #802626` (dried-blood red), `background-dark: #111314`, `surface-dark: #1a1a1c`

Status colors: `status-pos: #5ec269` (green), `status-warn: #e8a832` (amber), `status-neg: #e25535` (vermilion), `status-special: #b07db2` (violet)

### Pages

**Database** (`/`) — Main game table with sortable columns, filters, pagination.

Columns: Game & Developer | Days | Price | Reviews (7D) | Score % | Δ Rev 7D | Peak CCU | YouTube Visibility | OPS

- **Days**: color-coded badge (green ≤7d, amber ≤30d, red >30d)
- **Reviews (7D)**: count + trending arrow based on 7-day delta
- **Score %**: skull icon + positive review ratio (green ≥80%, amber ≥60%, red <60%)
- **Δ Rev 7D**: rolling 7-day review delta (current_reviews - reviews_7_days_ago)
- **YouTube Visibility**: top 2 channel badges + HIGH REACH (>5M subs) / VIRAL (>500K views) tags
- **OPS**: score 0-100 with confidence label, color-coded (green ≥60, amber ≥30, red <30)

Filter Bar: Days Since Launch slider (1-90), Max Price slider (0-60), Sort by (Newest / Velocity / OPS / Reviews / CCU)

**Sorting**: All sort modes use release date (newest first) as secondary tiebreaker. When sorting by OPS, games with the same score are ordered by release date descending.

**Radar Pick** (`/radar-pick`) — Editorial breakout spotlight page (SignalFire).
- Fetches from `GET /radar-pick` — top OPS game released 7-90 days ago
- Full-bleed hero with header image, Playfair Display title, dynamic editorial verdict
- Metric tiles (conditionally rendered based on data availability)
- Signal evidence blocks (auto-numbered, only shown when data exists)
- OPS Anatomy section with component cards, formulas, worked examples
- Trajectory chart (Recharts with tooltips) showing OPS history
- Previous picks (runners-up with climbing/steady/peaked status)
- `buildVerdict()` generates editorial prose dynamically from data signals

**Trends** (`/trends`) — Aggregated insights page with subgenre breakdown, momentum charts, creator radar.

**Game Detail** (`/game/:appid`) — Autopsy page with timeline charts, stat cards, YouTube coverage.

### Footer Status Bar
- Showing X-Y of Z Games
- Active Scrapers: N/12
- Last Sync: X mins ago (polled every 30s from `/status` endpoint)

## Seed YouTube Channels

IGP, Fooster (@thefoosterchannel), Insym, ManlyBadassHero, CJUGames, MrKravin, GamerSault, HGH Horror Games House, Twoonto, Indie Fuel

## Rate Limiters

| Limiter | Interval | Used By |
|---|---|---|
| `steam_limiter` | 1.5s | appdetails, reviews, CCU, achievements, updates |
| `steamspy_limiter` | 15.0s | tag endpoints, appdetails |
| `youtube_limiter` | 0.25s | channels, playlistItems, videos |
| `twitch_limiter` | 0.08s | streams, games |
| `reddit_limiter` | 0.8s | search |

**YouTube 403 handling**: YouTube returns 403 (not 429) for rate limits. `fetch_with_retry` parses the response body — `quotaExceeded` aborts permanently, `rateLimitExceeded` retries with exponential backoff.

## Environment Variables

Required: `YOUTUBE_API_KEY`
Optional: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`
All configurable intervals, OPS weights, and fuzzy matching thresholds in `.env`

## Important Gotchas

- **Pipeline staleness**: Check `collection_runs` for stale "running" jobs. A job stuck in "running" for longer than its interval means data loss. Three guardrails now exist (startup cleanup, hourly watchdog, per-collector try/except) but always verify pipeline health before other work.
- **SQLite timezone**: Collectors write `snapshot_date` in UTC. Monitor and frontend must use UTC date, not local date (system is UTC+8).
- **`items_processed` only written at job completion**: For live progress, query the actual data tables (game_snapshots, ops_scores) directly.
- **SteamSpy tags can be dict OR list**: Handler must check `isinstance(raw_tags, dict)` vs `isinstance(raw_tags, list)`.
- **Unvoted tags (all 0 votes)**: Common for new games. The horror classifier handles this but the tags are less trustworthy — description keywords serve as the safety net.
- **`about_the_game` contains HTML**: Must strip tags with `re.sub(r"<[^>]+>", " ", about_raw)` before keyword matching.
- **Steam store page tag scraping**: Fallback when SteamSpy is empty — parse `InitAppTagModal()` JSON from store page HTML.
- **Discovery ordering matters**: Steam search IDs (release-date ordered) go first, then SteamSpy-only IDs (AppID descending), so recent releases and EA games with old AppIDs both get processed promptly.
- **`review_velocity_7d`** on game_snapshots is launch-window velocity (first 7 days only). The frontend column "Δ Rev 7D" uses a **rolling** 7-day delta computed live in the API from comparing two snapshots.
- **YouTube scan window**: Set to 60 days (was 180). Initial backfill is done; longer windows waste API quota on pagination for already-known videos.
- **OPS scores only for horror games**: `run_ops_calculation()` filters `Game.is_horror == True`. Non-horror games (reclassified or otherwise) do not receive scores.
- **Steam search API null items**: Steam's search endpoint can return `null` entries in the `items` array. Discovery code must skip null items to avoid `'NoneType' has no attribute 'get'` crashes.
- **YouTube published_at timezone**: SQLite stores `published_at` as naive datetime. When comparing to `datetime.now(timezone.utc)`, must add tzinfo: `pub_at.replace(tzinfo=timezone.utc)`.
- **Late-discovered games**: Games found well after release have no historical snapshot data. Use `review_backfill.py` to reconstruct from individual Steam reviews. Consider auto-triggering backfill in metadata pipeline for games discovered >7 days after release (not yet implemented).
- **Estimated owners**: SteamSpy owners collector disabled. Frontend uses `reviews × 30` heuristic everywhere. The `estimated_owners` field is removed from frontend types.
