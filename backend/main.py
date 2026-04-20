import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    _SENTRY_AVAILABLE = True
except ImportError:
    _SENTRY_AVAILABLE = False

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from config import settings
from database import init_db, engine, SessionLocal
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
from collectors.metadata import backfill_subgenres
from weekly_analysis import main as run_weekly_analysis
from routers import games, channels, videos, runs, insights, radar, trends, health, developers

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Sentry — only initialise if DSN is configured and SDK is installed
if _SENTRY_AVAILABLE and settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.1,
    )
    logger.info("Sentry error tracking enabled")

# Maximum time (seconds) to wait for daily_snapshots to complete before
# firing OPS anyway with a warning. Prevents OPS from being starved
# indefinitely if snapshots run unusually long.
_SNAPSHOT_TIMEOUT_SECONDS = 90 * 60  # 90 minutes


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
            msg = f"Watchdog marked {result.rowcount} stale jobs"
            logger.warning(msg)
            if _SENTRY_AVAILABLE and settings.sentry_dsn:
                sentry_sdk.capture_message(msg, level="warning")


def _get_latest_run_status(job_name: str) -> str | None:
    """Return the status of the most recent collection_run for a given job.

    Returns None if no run exists.
    """
    with SessionLocal() as db:
        row = db.execute(
            text(
                "SELECT status FROM collection_runs "
                "WHERE job_name = :name "
                "ORDER BY started_at DESC LIMIT 1"
            ),
            {"name": job_name},
        ).fetchone()
    return row[0] if row else None


async def _wait_for_snapshot_completion(run_id_anchor: datetime, poll_interval: int = 30) -> bool:
    """Poll collection_runs until both 'reviews' and 'ccu' jobs started
    after *run_id_anchor* have a terminal status (success/partial/failed/stale).

    Returns True if both completed cleanly (success or partial), False otherwise.
    Times out after _SNAPSHOT_TIMEOUT_SECONDS and returns False with a warning.
    """
    deadline = asyncio.get_event_loop().time() + _SNAPSHOT_TIMEOUT_SECONDS
    jobs_to_check = ("reviews", "ccu")

    while asyncio.get_event_loop().time() < deadline:
        await asyncio.sleep(poll_interval)
        statuses = {}
        with SessionLocal() as db:
            for job_name in jobs_to_check:
                row = db.execute(
                    text(
                        "SELECT status FROM collection_runs "
                        "WHERE job_name = :name AND started_at >= :anchor "
                        "ORDER BY started_at DESC LIMIT 1"
                    ),
                    {"name": job_name, "anchor": run_id_anchor},
                ).fetchone()
                statuses[job_name] = row[0] if row else None

        terminal = {"success", "partial", "failed", "stale"}
        all_done = all(s in terminal for s in statuses.values() if s is not None)
        all_found = all(s is not None for s in statuses.values())

        if all_found and all_done:
            clean = all(s in {"success", "partial"} for s in statuses.values())
            if not clean:
                logger.warning(
                    f"Snapshot jobs completed with non-clean statuses: {statuses} — "
                    "proceeding with OPS anyway to avoid permanent skip"
                )
            return clean

    # Timeout reached
    logger.warning(
        f"daily_snapshots timed out after {_SNAPSHOT_TIMEOUT_SECONDS // 60}m — "
        "firing OPS on potentially stale snapshot data"
    )
    return False


async def steam_pipeline_job():
    """Run discovery → metadata fetch pipeline."""
    logger.info("Starting Steam discovery + metadata pipeline")
    new_appids = await run_discovery()
    if new_appids:
        await run_metadata_fetch(new_appids, trust_horror=True)


async def daily_snapshots_job():
    """Run review + CCU snapshots, then chain OPS scoring.

    OPS fires only after both snapshot jobs reach a terminal state, or after
    a 90-minute timeout (whichever comes first). OPS failures are isolated —
    they do not affect the snapshot run status.
    """
    logger.info("Starting daily snapshots pipeline")
    start_anchor = datetime.now(timezone.utc)

    await run_review_snapshots()
    await run_ccu_snapshots()
    # Owners disabled — SteamSpy data too coarse/late for breakout detection.
    # Using reviews × 30 heuristic where needed instead.

    # Chain OPS: wait for snapshot jobs to reach terminal status before firing.
    logger.info("Snapshots dispatched — waiting for completion before chaining OPS")
    await _wait_for_snapshot_completion(start_anchor)

    logger.info("Firing chained OPS calculation")
    try:
        await run_ops_calculation()
    except Exception as e:
        # OPS failure is isolated — do not propagate to snapshot job status.
        logger.error(f"Chained OPS calculation failed (isolated): {e}", exc_info=True)
        if _SENTRY_AVAILABLE and settings.sentry_dsn:
            sentry_sdk.capture_exception(e)

    # Invalidate API cache after OPS scores are updated
    from cache import cache as _cache
    evicted = _cache.invalidate_all()
    logger.info(f"Cache invalidated after daily snapshots ({evicted} entries cleared)")


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

    # One-time backfill: classify subgenre for games discovered before OPS v5
    backfill_subgenres()

    scheduler = AsyncIOScheduler()

    # Steam pipeline (discovery + metadata): every 6h at fixed anchors
    # 00:00 / 06:00 / 12:00 / 18:00 UTC = 08:00 / 14:00 / 20:00 / 02:00 SGT
    scheduler.add_job(
        steam_pipeline_job,
        "cron",
        hour="0,6,12,18",
        minute=0,
        id="steam_pipeline",
        replace_existing=True,
        max_instances=1,
    )

    # Daily snapshots → OPS chain: 04:00 UTC = 12:00 SGT
    # After US overnight tapers, before next day's activity builds.
    # misfire_grace_time=300: if server restarts within 5min of scheduled time,
    # still run the job rather than silently skipping it.
    scheduler.add_job(
        daily_snapshots_job,
        "cron",
        hour=4,
        minute=0,
        id="daily_snapshots",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
    )

    # YouTube pipeline: daily 05:00 UTC = 13:00 SGT
    # Staggered 1h after daily_snapshots to avoid SQLite write contention.
    scheduler.add_job(
        youtube_pipeline_job,
        "cron",
        hour=5,
        minute=0,
        id="youtube_pipeline",
        replace_existing=True,
        max_instances=1,
    )

    # Twitch: every 6h at fixed anchors — 01:00 run hits US prime time peak
    # 01:00 / 07:00 / 13:00 / 19:00 UTC = 09:00 / 15:00 / 21:00 / 03:00 SGT
    scheduler.add_job(
        run_twitch_snapshots,
        "cron",
        hour="1,7,13,19",
        minute=0,
        id="twitch_pipeline",
        replace_existing=True,
        max_instances=1,
    )

    # Reddit: daily at 02:00 UTC = 10:00 SGT
    # Captures full US previous day's mentions.
    scheduler.add_job(
        run_reddit_scan,
        "cron",
        hour=2,
        minute=0,
        id="reddit_pipeline",
        replace_existing=True,
        max_instances=1,
    )

    # Steam extras (update tracking → achievement stats): daily at 03:00 UTC = 11:00 SGT
    # Staggered from reddit to avoid SQLite lock contention.
    scheduler.add_job(
        run_steam_extras,
        "cron",
        hour=3,
        minute=0,
        id="steam_extras_job",
        replace_existing=True,
        max_instances=1,
    )

    # Developer profiles: weekly on Monday at 05:30 UTC = 13:30 SGT
    scheduler.add_job(
        run_dev_profiles,
        "cron",
        day_of_week="mon",
        hour=5,
        minute=30,
        id="dev_profiles_job",
        replace_existing=True,
        max_instances=1,
    )

    # Watchdog: mark stale jobs every hour
    scheduler.add_job(
        stale_run_watchdog,
        "interval",
        hours=1,
        id="stale_run_watchdog",
        replace_existing=True,
        max_instances=1,
    )

    # OPS diagnostics: Monday at 06:00 UTC = 14:00 SGT (after dev profiles)
    scheduler.add_job(
        run_ops_diagnostics,
        "cron",
        day_of_week="mon",
        hour=6,
        minute=0,
        id="ops_diagnostics_job",
        replace_existing=True,
        max_instances=1,
    )

    # Weekly analysis report: Monday at 04:00 UTC = 12:00 SGT
    # Moved from Sunday to Monday so it captures the full weekend (peak Steam activity).
    scheduler.add_job(
        run_weekly_analysis,
        "cron",
        day_of_week="mon",
        hour=4,
        minute=0,
        id="weekly_analysis_job",
        replace_existing=True,
        max_instances=1,
    )

    scheduler.start()
    health.set_scheduler(scheduler)
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

_cors_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5178",
    "http://localhost:3000",
    "https://indie-horror-radar.vercel.app",
    "https://horror-radar.vercel.app",
]
if settings.cors_origins:
    _cors_origins.extend([o.strip() for o in settings.cors_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(games.router)
app.include_router(channels.router)
app.include_router(videos.router)
app.include_router(runs.router)
app.include_router(insights.router)
app.include_router(radar.router)
app.include_router(trends.router)
app.include_router(developers.router)

