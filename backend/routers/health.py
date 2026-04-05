"""Health and readiness check endpoints.

GET /health  — liveness probe: is the process alive and DB reachable?
GET /ready   — readiness probe: is the scheduler running and data fresh?

Used by UptimeRobot, Docker healthcheck, and CI smoke tests.
Excluded from Sentry transaction tracing to avoid noise.
"""
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from database import engine

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
        return JSONResponse(
            status_code=200,
            content={
                "status": "ok",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "version": "0.1.0",
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
