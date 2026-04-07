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
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from sqlalchemy import text

from collectors.alerts import send_discord_alert
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
from collectors.youtube_tier2_discovery import run_tier2_discovery
from collectors.metadata import backfill_subgenres
from weekly_analysis import main as run_weekly_analysis
from newsletter import run_newsletter
from routers import games, channels, videos, runs, insights, radar, trends, health

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Adaptive scheduling state for metadata_job
_metadata_health = {"consecutive_successes": 0, "last_status": None}
_scheduler = None  # Set during lifespan startup — used for adaptive rescheduling

# Sentry — only initialise if DSN is configured and SDK is installed
if _SENTRY_AVAILABLE and settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.1,
    )
    logger.info("Sentry error tracking enabled")



async def stale_run_watchdog():
    """Mark collection_runs stuck in 'running' for >2h as 'stale'.

    Runs hourly. Catches jobs that hang without crashing (e.g., stuck
    on a rate-limited API call that never returns).
    """
    max_age_hours = 2
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    stale_names = []
    with engine.connect() as conn:
        # Collect job names before updating so we can alert per-job
        rows = conn.execute(text(
            "SELECT job_name FROM collection_runs "
            "WHERE status = 'running' AND started_at < :cutoff"
        ), {"cutoff": cutoff}).fetchall()
        stale_names = [r[0] for r in rows]

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

    # Discord alert per stale job
    for job_name in stale_names:
        await send_discord_alert(
            settings.discord_webhook_url,
            "Stale Job Detected",
            f"Job `{job_name}` marked stale after 2+ hours without completion.\n"
            "Pipeline may be hung on a rate-limited API call.",
            level="warning",
        )

    # Clean up expired dead letters and check DLQ threshold
    from models import DeadLetter
    with SessionLocal() as db:
        expired = db.query(DeadLetter).filter(DeadLetter.expires_at < datetime.utcnow()).all()
        if expired:
            for dl in expired:
                db.delete(dl)
            db.commit()
            logger.info(f"Dead letter cleanup: removed {len(expired)} expired entries")

        # Alert if live DLQ is accumulating
        dlq_count = db.query(DeadLetter).filter(
            DeadLetter.status == "dead",
            DeadLetter.expires_at > datetime.utcnow(),
        ).count()
        if dlq_count >= 10:
            await send_discord_alert(
                settings.discord_webhook_url,
                "Dead Letter Queue Accumulating",
                f"Dead letter queue: **{dlq_count}** items accumulated.\n"
                "These AppIDs have failed metadata fetch 5+ times. "
                "Check rate limits or Steam API availability.",
                level="warning",
            )



async def discovery_job():
    """Run discovery pipeline — queues new AppIDs into pending_metadata."""
    logger.info("Starting Steam discovery job")
    await run_discovery()


async def metadata_job():
    """Pull from pending_metadata queue and fetch + classify each item.

    After each run, adjusts its own schedule based on health:
    - 3+ consecutive successes → extend to 45 min (pipeline is healthy, no rush)
    - circuit_open             → shorten to 15 min (retry sooner after breaker)
    - partial                  → stay at 30 min
    """
    logger.info("Starting metadata fetch job")
    db = SessionLocal()
    try:
        await run_metadata_fetch(db)
    finally:
        db.close()

    # Determine run outcome from most recent metadata collection_run
    if _scheduler is None:
        return
    try:
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT status FROM collection_runs WHERE job_name='metadata' "
                "ORDER BY started_at DESC LIMIT 1"
            )).fetchone()
        last_status = row[0] if row else None
        _metadata_health["last_status"] = last_status

        if last_status == "success":
            _metadata_health["consecutive_successes"] += 1
        elif last_status == "circuit_open":
            _metadata_health["consecutive_successes"] = 0
        # partial or other → leave consecutive_successes unchanged

        # Adjust interval
        if last_status == "circuit_open":
            new_interval = 15
        elif _metadata_health["consecutive_successes"] >= 3:
            new_interval = 45
        else:
            new_interval = 30

        current_job = _scheduler.get_job("metadata_job")
        if current_job:
            current_trigger = current_job.trigger
            # Only reschedule if the interval has actually changed
            current_minutes = getattr(current_trigger, "interval", None)
            if current_minutes is None or current_minutes != timedelta(minutes=new_interval):
                _scheduler.reschedule_job(
                    "metadata_job", trigger="interval", minutes=new_interval
                )
                logger.info(
                    f"Adaptive scheduling: metadata_job rescheduled to every {new_interval} min "
                    f"(status={last_status}, consecutive_successes={_metadata_health['consecutive_successes']})"
                )
    except Exception as e:
        logger.error(f"Adaptive scheduling error: {e}")


async def daily_snapshots_job():
    """Run review + CCU snapshots sequentially, then chain OPS scoring.

    Snapshots are awaited directly (no polling needed). OPS failures are isolated —
    they do not affect the snapshot run status.
    """
    logger.info("Starting daily snapshots pipeline")

    await run_review_snapshots()
    await run_ccu_snapshots()
    # Owners disabled — SteamSpy data too coarse/late for breakout detection.
    # Using reviews × 30 heuristic where needed instead.

    logger.info("Snapshots complete — firing chained OPS calculation")
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

    # Discovery job: every 6h at fixed anchors — queues new AppIDs into pending_metadata
    # 00:00 / 06:00 / 12:00 / 18:00 UTC = 08:00 / 14:00 / 20:00 / 02:00 SGT
    scheduler.add_job(
        discovery_job,
        "cron",
        hour="0,6,12,18",
        minute=0,
        id="discovery_job",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
        jitter=300,
    )

    # Metadata job: every 30 minutes — pulls from pending_metadata queue
    scheduler.add_job(
        metadata_job,
        "cron",
        minute="*/30",
        id="metadata_job",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
        jitter=300,
    )

    # Daily snapshots → OPS chain: 04:00 UTC = 12:00 SGT
    # After US overnight tapers, before next day's activity builds.
    # misfire_grace_time=3600: if server restarts within 1h of scheduled time,
    # still run the job rather than silently skipping it.
    scheduler.add_job(
        daily_snapshots_job,
        "cron",
        hour=4,
        minute=0,
        id="daily_snapshots",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
        jitter=300,
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
        misfire_grace_time=3600,
        jitter=300,
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
        misfire_grace_time=3600,
        jitter=300,
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
        misfire_grace_time=3600,
        jitter=300,
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
        misfire_grace_time=3600,
        jitter=300,
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
        misfire_grace_time=3600,
        jitter=300,
    )

    # Watchdog: mark stale jobs every hour
    scheduler.add_job(
        stale_run_watchdog,
        "interval",
        hours=1,
        id="stale_run_watchdog",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
        jitter=300,
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
        misfire_grace_time=3600,
        jitter=300,
    )

    # Tier 2 YouTube channel discovery: Monday at 06:30 UTC = 14:30 SGT
    # Scans seed channel descriptions for linked channels, validates subscriber
    # count (>10K) and recent horror game content before adding as Tier 2.
    scheduler.add_job(
        run_tier2_discovery,
        "cron",
        day_of_week="mon",
        hour=6,
        minute=30,
        id="youtube_tier2_discovery",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
        jitter=300,
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
        misfire_grace_time=3600,
        jitter=300,
    )

    # Weekly newsletter: Monday at 07:00 UTC = 15:00 SGT
    # Fires after analysis (04:00), dev profiles (05:30), and diagnostics (06:00)
    # so all data is fresh. Creates a Buttondown draft for manual review.
    scheduler.add_job(
        run_newsletter,
        "cron",
        day_of_week="mon",
        hour=7,
        minute=0,
        id="weekly_newsletter_job",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
        jitter=300,
    )

    scheduler.start()
    health.set_scheduler(scheduler)
    global _scheduler
    _scheduler = scheduler
    logger.info("Scheduler started")

    yield

    # Shutdown
    scheduler.shutdown()
    logger.info("Scheduler shut down")


limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

app = FastAPI(
    title="Horror Radar API",
    description="Horror Indie Game Sales Intelligence Platform",
    version="0.1.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

_cors_origins = [
    "http://localhost:5173",
    "https://horror-radar.com",
    "https://www.horror-radar.com",
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

