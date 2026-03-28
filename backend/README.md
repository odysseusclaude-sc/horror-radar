# Horror Radar — Backend

Data collection service for the Horror Indie Game Sales Intelligence platform. Collects game metadata, reviews, player counts, and YouTube coverage for horror indie games.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your YOUTUBE_API_KEY
```

## Run Locally

```bash
uvicorn main:app --reload
```

Server starts at `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `YOUTUBE_API_KEY` | Yes | — | YouTube Data API v3 key |
| `DATABASE_URL` | No | `sqlite:///./horrorindie.db` | Database connection string |
| `STEAM_DISCOVERY_INTERVAL_HOURS` | No | `6` | How often to discover new games |
| `STEAM_REVIEWS_INTERVAL_HOURS` | No | `24` | How often to snapshot reviews |
| `STEAM_CCU_INTERVAL_HOURS` | No | `6` | How often to snapshot CCU |
| `STEAM_OWNERS_INTERVAL_HOURS` | No | `24` | How often to fetch owner estimates |
| `YOUTUBE_SCAN_INTERVAL_HOURS` | No | `24` | How often to scan YouTube channels |
| `YOUTUBE_STATS_INTERVAL_HOURS` | No | `24` | How often to refresh video stats |
| `OPS_INTERVAL_HOURS` | No | `24` | How often to recalculate OPS |
| `FUZZY_MATCH_THRESHOLD` | No | `85` | Minimum score for video→game matching |
| `LOG_LEVEL` | No | `INFO` | Logging level |

## Adding YouTube Channels

Edit `config.py` and add to `SEED_CHANNELS`:

```python
SEED_CHANNELS = [
    ChannelConfig(handle="@IGP", name="IGP"),
    ChannelConfig(handle="@Fooster", name="Fooster"),
    # Add new channels here:
    ChannelConfig(handle="@NewChannel", name="Display Name"),
    # For channels where game title appears in description, not video title:
    ChannelConfig(handle="@DescChannel", name="Desc Channel", match_mode="description"),
]
```

## API Endpoints

```bash
# Health check
curl http://localhost:8000/health

# List games (paginated, filterable)
curl "http://localhost:8000/games?page=1&page_size=10&days=30&max_price=20&sort_by=newest"

# Single game with snapshots + OPS history
curl http://localhost:8000/games/12345

# YouTube channels
curl http://localhost:8000/channels

# Videos (filter by channel, matched games only)
curl "http://localhost:8000/videos?matched_only=true&days=30"
curl http://localhost:8000/videos/dQw4w9WgXcQ

# Collection run logs
curl "http://localhost:8000/runs?job_name=discovery"
```

## Data Pipeline Stages

| Stage | Job | Cadence | Description |
|---|---|---|---|
| 1 | Discovery | Every 6h | Find new horror games via Steam search + SteamSpy |
| 2 | Metadata | After discovery | Fetch details, filter indie/horror, discard non-qualifying |
| 3 | Reviews | Daily | Snapshot review counts + scores |
| 4 | CCU | Every 6h | Current player count via Steam API |
| 5 | Owners | Daily | SteamSpy owner estimates |
| 7 | YouTube Scan | Daily | Discover videos, fuzzy match to games |
| 8 | YouTube Stats | Daily | Refresh view/like/comment counts |
| 10 | OPS | Daily | Calculate Overperformance Scores |

## YouTube API Quota

Daily usage with 3 channels and ~60 recent videos: **~27 units/day** (0.27% of 10,000 daily quota).

| Operation | Units/Call | Calls | Total |
|---|---|---|---|
| channels.list | 5 | 3 | 15 |
| playlistItems.list | 1 | 3-6 | 6 |
| videos.list (batch 50) | 3 | 2 | 6 |

## Architecture

- **Framework**: FastAPI with sync SQLAlchemy (auto-threadpooled by FastAPI)
- **Database**: SQLite for dev, swappable to PostgreSQL via `DATABASE_URL`
- **Scheduler**: APScheduler AsyncIOScheduler, runs on FastAPI's event loop
- **HTTP**: httpx async client with per-host rate limiting and exponential backoff
- **Matching**: rapidfuzz token_set_ratio for video→game fuzzy matching
