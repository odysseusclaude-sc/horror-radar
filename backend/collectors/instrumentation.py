"""Phase 2.5 per-game failure instrumentation.

Reviews and CCU collectors report run-level totals (items_failed=706) but no
breakdown of WHY each per-game call failed. This module captures one row per
failure with structured context so we can ask SQL questions like:

    SELECT error_class, COUNT(*) FROM per_game_failures
     WHERE collector='ccu' AND occurred_at > now('-24 hours')
     GROUP BY error_class ORDER BY 2 DESC;

The expectation is that 24h of data will tell us whether the real cause of
the 91% CCU failure rate is rate-limit cliffs, retry exhaustion on 5xx,
timeouts on slow endpoints, malformed payloads from Steam, or something else
entirely. That's the data the actual fix design will sit on top of.

Error class taxonomy (kept stable so dashboards and queries can rely on it):

    HTTP layer (status_code populated)
      http_429              — rate limited, all retries exhausted
      http_5xx              — server error, all retries exhausted
      http_4xx_not_429      — permanent client error (returned None on first try)
      http_403_youtube_rate — YouTube rate limit (non-quota 403)
      youtube_quota         — YouTube daily quota exhausted

    Network layer (status_code = None)
      timeout               — httpx.TimeoutException, all retries exhausted
      connect_error         — httpx.ConnectError, all retries exhausted

    Collector layer (status_code = None or 200)
      malformed_payload     — got 200 but expected key missing from response
      unknown_exception     — anything else caught by collector's try/except
"""
from __future__ import annotations

import logging
from typing import Callable

from sqlalchemy.orm import Session

from models import PerGameFailure

logger = logging.getLogger(__name__)


def record_failure_event(
    db: Session,
    *,
    appid: int,
    collector: str,
    error_class: str,
    status_code: int | None = None,
    attempts: int = 1,
    detail: str | None = None,
) -> None:
    """Insert one per_game_failures row. Designed to never raise.

    Per-game failures are common (hundreds per run) so we cannot afford an
    instrumentation bug to crash the collector. Any exception is logged and
    swallowed — the worst case is missing telemetry for one game.
    """
    try:
        truncated = detail[:500] if detail else None
        db.add(PerGameFailure(
            appid=appid,
            collector=collector,
            error_class=error_class,
            status_code=status_code,
            attempts=attempts,
            detail=truncated,
        ))
        db.commit()
    except Exception as e:
        # Don't let observability break collection. Log + roll back.
        logger.error(
            f"record_failure_event failed for AppID {appid} / {collector} / "
            f"{error_class}: {e}"
        )
        try:
            db.rollback()
        except Exception:
            pass


def make_fetch_callback(
    db: Session, *, appid: int, collector: str
) -> Callable[[dict], None]:
    """Build an on_failure callback to pass into fetch_with_retry.

    Returns a function that fetch_with_retry will call with a failure-context
    dict (see _http.py docstring). The callback simply forwards into
    record_failure_event with the AppID + collector context bound.
    """
    def _cb(ctx: dict) -> None:
        record_failure_event(
            db,
            appid=appid,
            collector=collector,
            error_class=ctx.get("error_class", "unknown"),
            status_code=ctx.get("status_code"),
            attempts=ctx.get("attempts", 1),
            detail=ctx.get("detail"),
        )
    return _cb


def prune_old_failures(db: Session, *, retain_days: int = 30) -> int:
    """Delete per_game_failures rows older than retain_days. Returns row count.

    Called from a daily scheduler job. Expected steady state is ~2000 rows/day,
    so retain_days=30 caps the table at ~60K rows. Cheap.
    """
    from datetime import datetime, timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(days=retain_days)
    try:
        deleted = (
            db.query(PerGameFailure)
            .filter(PerGameFailure.occurred_at < cutoff)
            .delete(synchronize_session=False)
        )
        db.commit()
        if deleted:
            logger.info(f"Pruned {deleted} per_game_failures rows older than {retain_days}d")
        return deleted
    except Exception as e:
        logger.error(f"prune_old_failures failed: {e}")
        db.rollback()
        return 0
