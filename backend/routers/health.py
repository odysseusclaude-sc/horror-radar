"""Health and readiness check endpoints.

GET /health           — liveness probe: is the process alive and DB reachable?
GET /ready            — readiness probe: is the scheduler running and data fresh?
GET /health/pipeline  — pipeline observability: per-collector freshness + queue stats

Used by UptimeRobot, Docker healthcheck, and CI smoke tests.
Excluded from Sentry transaction tracing to avoid noise.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from database import engine, get_db
from models import CollectionRun, DeadLetter, PendingMetadata

router = APIRouter(tags=["health"])

# Set by main.py after scheduler is started
_scheduler_ref = None


def set_scheduler(scheduler) -> None:
    """Called from main.py lifespan to give health endpoints access to the scheduler."""
    global _scheduler_ref
    _scheduler_ref = scheduler


@router.get("/health", include_in_schema=False)
async def health() -> JSONResponse:
    """Liveness probe — returns 200 if the process is alive and DB is reachable."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        recent_anomalies = 0
        try:
            with engine.connect() as conn:
                row = conn.execute(text(
                    "SELECT COUNT(*) FROM data_anomalies "
                    "WHERE resolved = 0 "
                    "AND detected_at >= datetime('now', '-24 hours')"
                )).fetchone()
                recent_anomalies = row[0] if row else 0
        except Exception:
            pass  # table may not exist on first boot

        return JSONResponse(
            status_code=200,
            content={
                "status": "ok",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "version": "0.1.0",
                "data_anomalies_24h": recent_anomalies,
            },
        )
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "detail": str(e)},
        )


@router.get("/ready", include_in_schema=False)
async def ready() -> JSONResponse:
    """Readiness probe — returns 200 only if scheduler is running and DB is healthy."""
    try:
        # Check DB
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        # Check scheduler
        scheduler_running = _scheduler_ref is not None and _scheduler_ref.running

        # Count stale jobs in last 24h
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT COUNT(*) FROM collection_runs "
                "WHERE status = 'stale' "
                "AND started_at >= datetime('now', '-24 hours')"
            )).fetchone()
            stale_jobs = row[0] if row else 0

        # Count scheduled jobs
        jobs_scheduled = len(_scheduler_ref.get_jobs()) if _scheduler_ref else 0

        if not scheduler_running:
            return JSONResponse(
                status_code=503,
                content={
                    "status": "not_ready",
                    "detail": "Scheduler is not running",
                    "scheduler": "stopped",
                    "stale_jobs": stale_jobs,
                },
            )

        return JSONResponse(
            status_code=200,
            content={
                "status": "ready",
                "scheduler": "running",
                "jobs_scheduled": jobs_scheduled,
                "stale_jobs_24h": stale_jobs,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "detail": str(e)},
        )


@router.get("/health/pipeline")
def pipeline_health(db: Session = Depends(get_db)):
    """Pipeline observability: per-collector freshness and queue stats."""
    now = datetime.utcnow()

    # Per-collector freshness (hours since last successful run).
    # Display key → actual job_name written by the collector.
    COLLECTOR_JOBS = {
        "metadata": "metadata",
        "reviews": "reviews",
        "ccu": "ccu",
        "youtube_scanner": "youtube_scan",
        "twitch": "twitch_snapshots",
        "reddit": "reddit_scan",
        "ops": "ops",
    }
    collector_health = {}
    for display_name, job_name in COLLECTOR_JOBS.items():
        run = db.query(CollectionRun).filter_by(job_name=job_name).filter(
            CollectionRun.status.in_(["success", "partial"])
        ).order_by(CollectionRun.finished_at.desc()).first()

        if run and run.finished_at:
            hours_ago = (now - run.finished_at.replace(tzinfo=None)).total_seconds() / 3600
            collector_health[display_name] = {
                "last_success": run.finished_at.isoformat(),
                "hours_ago": round(hours_ago, 1),
                "status": "healthy" if hours_ago < 8 else "stale" if hours_ago < 24 else "dead",
                "items_processed": run.items_processed,
                "items_failed": run.items_failed,
                "api_calls_made": getattr(run, "api_calls_made", 0) or 0,
            }
        else:
            collector_health[display_name] = {"status": "never_run", "hours_ago": None}

    # Work queue stats
    queue_stats = {
        "total_pending": db.query(func.count(PendingMetadata.appid)).filter(
            PendingMetadata.last_status != "success"
        ).scalar() or 0,
        "eligible_now": db.query(func.count(PendingMetadata.appid)).filter(
            PendingMetadata.last_status != "success",
            PendingMetadata.next_eligible_at <= now,
        ).scalar() or 0,
        "dead_letters": db.query(func.count(DeadLetter.id)).filter(
            DeadLetter.status == "dead"
        ).scalar() or 0,
    }

    return {
        "timestamp": now.isoformat(),
        "collectors": collector_health,
        "queue": queue_stats,
        "overall": "healthy" if all(
            v.get("status") == "healthy" for v in collector_health.values()
            if v.get("status") != "never_run"
        ) else "degraded",
    }
