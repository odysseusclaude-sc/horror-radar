"""Phase 2.5 — failure breakdown query API.

GET /api/failures — aggregated view of recent per-game failures.

Designed for one specific job: telling a human "what is actually breaking?"
without making them write SQL. Returns three breakdowns side-by-side:

    by_error_class:  histogram across the failure taxonomy
    by_status_code:  HTTP-level distribution (None grouped separately)
    top_appids:      worst-offender games — repeat failures clustered here
                     hint at per-AppID Steam quirks (region-locked, malformed)

Query params:
    collector  — filter to "reviews" or "ccu" (omit for combined)
    hours      — lookback window (default 24, max 720 = 30 days = full retention)

This endpoint exists to make the data captured by collectors/instrumentation.py
useful without forcing the user onto sqlite. The instrumentation table itself
is the source of truth — this is just a convenience aggregator.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import PerGameFailure

router = APIRouter(tags=["failures"])


@router.get("/api/failures")
def failure_breakdown(
    collector: str | None = Query(
        None, description='Filter to "reviews" or "ccu". Omit for combined.'
    ),
    hours: int = Query(
        24, ge=1, le=720, description="Lookback window in hours (max 720 = 30 days)."
    ),
    top_n: int = Query(
        20, ge=1, le=100, description="How many top-failing AppIDs to return."
    ),
    db: Session = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    base = db.query(PerGameFailure).filter(PerGameFailure.occurred_at >= cutoff)
    if collector:
        base = base.filter(PerGameFailure.collector == collector)

    total = base.count()

    by_error_class = dict(
        base.with_entities(
            PerGameFailure.error_class,
            func.count(PerGameFailure.id),
        )
        .group_by(PerGameFailure.error_class)
        .order_by(func.count(PerGameFailure.id).desc())
        .all()
    )

    by_status_code = {
        # SQLite returns None as a key; serialize as the string "null" so JSON
        # consumers can tell connection-layer (no status) apart from HTTP failures.
        ("null" if k is None else str(k)): v
        for k, v in base.with_entities(
            PerGameFailure.status_code,
            func.count(PerGameFailure.id),
        )
        .group_by(PerGameFailure.status_code)
        .order_by(func.count(PerGameFailure.id).desc())
        .all()
    }

    top_appids = [
        {"appid": appid, "failures": n}
        for appid, n in base.with_entities(
            PerGameFailure.appid,
            func.count(PerGameFailure.id),
        )
        .group_by(PerGameFailure.appid)
        .order_by(func.count(PerGameFailure.id).desc())
        .limit(top_n)
        .all()
    ]

    return {
        "window_hours": hours,
        "collector": collector,
        "cutoff_utc": cutoff.isoformat(),
        "total_failures": total,
        "by_error_class": by_error_class,
        "by_status_code": by_status_code,
        "top_appids": top_appids,
    }
