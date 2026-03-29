import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from collectors.discovery import run_discovery
from collectors.metadata import run_metadata_fetch
from collectors.reviews import run_review_snapshots
from collectors.ccu import run_ccu_snapshots
from collectors.owners import run_owner_estimates
from collectors.youtube_scanner import run_youtube_scan
from collectors.youtube_stats import run_youtube_stats_refresh
from collectors.ops import run_ops_calculation
from collectors.twitch import run_twitch_snapshots
from collectors.reddit import run_reddit_scan
from collectors.dev_profile import run_dev_profiles
from collectors import run_steam_extras
from routers import games, channels, videos, runs, insights

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def steam_pipeline_job():
    """Run discovery → metadata fetch pipeline."""
    logger.info("Starting Steam discovery + metadata pipeline")
    new_appids = await run_discovery()
    if new_appids:
        await run_metadata_fetch(new_appids, trust_horror=True)


async def daily_snapshots_job():
    """Run review + CCU + owner snapshots, then OPS."""
    logger.info("Starting daily snapshots pipeline")
    await run_review_snapshots()
    await run_ccu_snapshots()
    await run_owner_estimates()
    await run_ops_calculation()


async def youtube_pipeline_job():
    """Run YouTube scan + stats refresh."""
    logger.info("Starting YouTube pipeline")
    await run_youtube_scan()
    await run_youtube_stats_refresh()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    logger.info("Database initialized")

    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        steam_pipeline_job,
        "interval",
        hours=settings.steam_discovery_interval_hours,
        id="steam_pipeline",
        replace_existing=True,
    )

    scheduler.add_job(
        daily_snapshots_job,
        "interval",
        hours=settings.steam_reviews_interval_hours,
        id="daily_snapshots",
        replace_existing=True,
    )

    scheduler.add_job(
        youtube_pipeline_job,
        "interval",
        hours=settings.youtube_scan_interval_hours,
        id="youtube_pipeline",
        replace_existing=True,
    )

    # Twitch: every 6h at :00 (live engagement, matches CCU cadence)
    scheduler.add_job(
        run_twitch_snapshots,
        "interval",
        hours=settings.twitch_interval_hours,
        id="twitch_pipeline",
        replace_existing=True,
    )

    # Reddit: daily at 02:00 (staggered to avoid SQLite lock with other daily jobs)
    scheduler.add_job(
        run_reddit_scan,
        "cron",
        hour=2,
        minute=0,
        id="reddit_pipeline",
        replace_existing=True,
    )

    # Steam extras (update tracking → achievement stats sequentially): daily at 03:00
    scheduler.add_job(
        run_steam_extras,
        "cron",
        hour=3,
        minute=0,
        id="steam_extras_job",
        replace_existing=True,
    )

    # Developer profiles: weekly on Monday at 05:00
    scheduler.add_job(
        run_dev_profiles,
        "cron",
        day_of_week="mon",
        hour=5,
        minute=0,
        id="dev_profiles_job",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started")

    yield

    # Shutdown
    scheduler.shutdown()
    logger.info("Scheduler shut down")


app = FastAPI(
    title="Horror Radar API",
    description="Horror Indie Game Sales Intelligence Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games.router)
app.include_router(channels.router)
app.include_router(videos.router)
app.include_router(runs.router)
app.include_router(insights.router)
