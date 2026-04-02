import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from config import settings
from database import init_db, engine
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
from collectors.ops_autotune import run_ops_diagnostics
from weekly_analysis import main as run_weekly_analysis
from routers import games, channels, videos, runs, insights, radar, trends

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def stale_run_watchdog():
    """Mark collection_runs stuck in 'running' for >2h as 'stale'.

    Runs hourly. Catches jobs that hang without crashing (e.g., stuck
    on a rate-limited API call that never returns).
    """
    max_age_hours = 2
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    with engine.connect() as conn:
        result = conn.execute(text(
            "UPDATE collection_runs SET status = 'stale', "
            "error_message = :msg, finished_at = CURRENT_TIMESTAMP "
            "WHERE status = 'running' AND started_at < :cutoff"
        ), {"msg": f"Watchdog: running for >{max_age_hours}h", "cutoff": cutoff})
        conn.commit()
        if result.rowcount > 0:
            logger.warning(f"Watchdog marked {result.rowcount} stale jobs")


async def steam_pipeline_job():
    """Run discovery → metadata fetch pipeline."""
    logger.info("Starting Steam discovery + metadata pipeline")
    new_appids = await run_discovery()
    if new_appids:
        await run_metadata_fetch(new_appids, trust_horror=True)


async def daily_snapshots_job():
    """Run review + CCU snapshots, then OPS."""
    logger.info("Starting daily snapshots pipeline")
    await run_review_snapshots()
    await run_ccu_snapshots()
    # Owners disabled — SteamSpy data too coarse/late for breakout detection.
    # Using reviews × 30 heuristic where needed instead.
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

    # Watchdog: mark stale jobs every hour
    scheduler.add_job(
        stale_run_watchdog,
        "interval",
        hours=1,
        id="stale_run_watchdog",
        replace_existing=True,
    )

    # OPS diagnostics: Monday at 06:00 (after dev profiles at 05:00)
    scheduler.add_job(
        run_ops_diagnostics,
        "cron",
        day_of_week="mon",
        hour=6,
        minute=0,
        id="ops_diagnostics_job",
        replace_existing=True,
    )

    # Weekly analysis report: Sunday at 06:00
    scheduler.add_job(
        run_weekly_analysis,
        "cron",
        day_of_week="sun",
        hour=6,
        minute=0,
        id="weekly_analysis_job",
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
app.include_router(radar.router)
app.include_router(trends.router)
