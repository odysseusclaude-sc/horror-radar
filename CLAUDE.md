# Horror Radar — Context Brief

## What This Is

Horror Radar is a **horror indie game breakout detection platform**. It tracks newly released indie horror games on Steam, collects engagement data from multiple sources (Steam, YouTube, Twitch, Reddit), and computes an **OPS (Overperformance Score)** to identify games that are outperforming their peers — i.e., breaking out.

The target user is someone scouting for emerging horror indie hits within the first 90 days of release.

## Architecture

- **Backend**: Python, FastAPI, SQLAlchemy (sync sessions), SQLite (WAL mode), APScheduler
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 3
- **No ORM migrations**: Schema changes use `ALTER TABLE` in `database.py init_db()`
- **Runs on Google Drive** (Obsidian vault) — paths are long; DB is local SQLite

### Key Paths

```
backend/           — FastAPI app, collectors, SQLite DB
  main.py          — App + APScheduler lifecycle
  config.py        — Pydantic settings (env vars)
  models.py        — SQLAlchemy models (10 tables)
  schemas.py       — Pydantic response schemas
  database.py      — Engine, SessionLocal, init_db()
  monitor.py       — CLI live job progress monitor (ANSI)
  collectors/      — 14 collector modules
  routers/         — games, channels, videos, runs
frontend/          — React SPA
  src/pages/       — Database.tsx (main page)
  src/components/  — Header, FilterBar, GameTable, GameRow, Pagination
  src/types/       — TypeScript interfaces
  src/api/         — API client (fetchPaginated, fetchStatus)
```

## Database Tables

| Table | Purpose |
|---|---|
| `games` | Steam games (appid, title, developer, price, genres, tags, is_indie, is_horror, has_demo, next_fest) |
| `discarded_games` | Rejected games with reason (not_horror, not_indie, major_publisher) |
| `game_snapshots` | Daily time-series: reviews, CCU, owners, velocity, achievements, patches, twitch |
| `youtube_channels` | Seed channels (10 indie horror YouTubers) |
| `youtube_videos` | Scraped videos with fuzzy-matched `matched_appid` |
| `ops_scores` | Daily OPS calculation per game (score 0-100, components, confidence) |
| `twitch_snapshots` | Concurrent streams + viewers per game per day |
| `reddit_mentions` | Reddit posts mentioning games (from HorrorGaming, IndieGaming) |
| `developer_profiles` | Aggregated dev stats (total games, avg score, best game) |
| `collection_runs` | Job execution log (status, items processed/failed, timing) |

## OPS Formula (v2)

```
score = min(100, raw_ops * 40)
```

Four components with NULL-weight redistribution:

| Component | Weight | Calculation |
|---|---|---|
| Review | 0.30 | (review_count / median_reviews) * price_modifier |
| Velocity | 0.25 | review_velocity_7d / median_velocity |
| YouTube | 0.25 | 0.6 * log10(views)/6 + 0.4 * unique_channels/10 |
| CCU | 0.20 | peak_ccu / median_ccu (decays to 0 after 14 days) |

Baselines use **true median** (not average) from games released in a similar 30-60 day window. Cold start guard: won't score if < 20 baseline games.

Price modifiers: Free=0.6, <$5=0.85, $5-10=1.0, $10-20=1.15, $20+=1.3

## Discovery Pipeline

Three sources, processed in this order:
1. **Steam store search** (tag IDs for Horror/Psychological Horror/Survival Horror, sorted by release date, 13 pages) — catches recent releases SteamSpy hasn't indexed yet
2. **SteamSpy tag endpoints** (Horror, Psychological Horror, Survival Horror) — broad coverage, lags 30-90 days
3. **CURATED_SEEDS** — manually added AppIDs for edge cases (e.g., EA games with old AppIDs)

### Horror Classification (5-layer chain)
1. SteamSpy tags → 2. Steam store page tags (scraped from `InitAppTagModal()`) → 3. Steam genres → 4. `short_description` → 5. `about_the_game` (HTML-stripped)

Scope: **MAX_AGE_DAYS = 90** (3 months from release)

## Scheduler Jobs

| Job | Schedule | Pipeline |
|---|---|---|
| steam_pipeline | Every 6h | discovery → metadata |
| daily_snapshots | Every 24h | reviews → CCU → owners → OPS |
| youtube_pipeline | Every 24h | scan → stats refresh |
| twitch_pipeline | Every 6h | twitch snapshots |
| reddit_pipeline | Daily 02:00 | reddit scan |
| steam_extras | Daily 03:00 | update tracking → achievement stats |
| dev_profiles | Monday 05:00 | developer profile aggregation |

## Frontend

Dark horror theme: `primary: #c0392b` (deep red), `background: #080809`, `surface: #0f0f11`

### Database Page Columns
Game & Developer | Days | Price | Reviews (7D) | Score % | Δ Rev 7D | Peak CCU | YouTube Visibility | OPS

- **Days**: color-coded badge (green ≤7d, amber ≤30d, red >30d)
- **Reviews (7D)**: count + trending arrow based on 7-day delta
- **Score %**: skull icon + positive review ratio (green ≥80%, amber ≥60%, red <60%)
- **Δ Rev 7D**: rolling 7-day review delta (current_reviews - reviews_7_days_ago)
- **YouTube Visibility**: top 2 channel badges + HIGH REACH (>5M subs) / VIRAL (>500K views) tags
- **OPS**: score 0-100 with confidence label, color-coded (green ≥60, amber ≥30, red <30)

### Filter Bar
- Days Since Launch slider (1-90)
- Max Price slider (0-60, "Any" at max)
- Sort by: Newest / Velocity (7d) / OPS Score / Most Reviews / Peak CCU

### Footer Status Bar
- Showing X-Y of Z Games
- Active Scrapers: N/12
- Last Sync: X mins ago (polled every 30s from `/status` endpoint)

## Seed YouTube Channels

IGP, Fooster (@thefoosterchannel), Insym, ManlyBadassHero, CJUGames, MrKravin, GamerSault, HGH Horror Games House, Twoonto, Indie Fuel

## Environment Variables

Required: `YOUTUBE_API_KEY`
Optional: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`
All configurable intervals, OPS weights, and fuzzy matching thresholds in `.env`

## Important Gotchas

- **SQLite timezone**: Collectors write `snapshot_date` in UTC. Monitor and frontend must use UTC date, not local date (system is UTC+8).
- **`items_processed` only written at job completion**: For live progress, query the actual data tables (game_snapshots, ops_scores) directly.
- **SteamSpy tags can be dict OR list**: Handler must check `isinstance(raw_tags, dict)` vs `isinstance(raw_tags, list)`.
- **`about_the_game` contains HTML**: Must strip tags with `re.sub(r"<[^>]+>", " ", about_raw)` before keyword matching.
- **Steam store page tag scraping**: Fallback when SteamSpy is empty — parse `InitAppTagModal()` JSON from store page HTML.
- **Discovery ordering matters**: Steam search IDs (release-date ordered) go first, then SteamSpy-only IDs (AppID descending), so recent releases and EA games with old AppIDs both get processed promptly.
- **`review_velocity_7d`** on game_snapshots is launch-window velocity (first 7 days only). The frontend column "Δ Rev 7D" uses a **rolling** 7-day delta computed live in the API from comparing two snapshots.
- **Start commands**: Backend: `python3 -m uvicorn main:app --reload` from `backend/`. Frontend: `npm run dev` from `frontend/`.
