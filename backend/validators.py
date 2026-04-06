"""Data validation layer for collector outputs.

Logs anomalies to data_anomalies table but does not block collection.
Called from reviews.py, ccu.py, youtube_stats.py.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _log_anomaly(
    db: Session,
    appid: int,
    field_name: str,
    expected_range: str,
    actual_value: float,
) -> None:
    """Insert a data_anomalies record. Silent on failure — never blocks collection."""
    try:
        db.execute(
            text(
                "INSERT INTO data_anomalies "
                "(appid, field_name, expected_range, actual_value, detected_at) "
                "VALUES (:appid, :field_name, :expected_range, :actual_value, :detected_at)"
            ),
            {
                "appid": appid,
                "field_name": field_name,
                "expected_range": expected_range,
                "actual_value": float(actual_value),
                "detected_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        db.commit()
    except Exception as e:
        logger.warning("Failed to log anomaly appid=%d field=%s: %s", appid, field_name, e)
        try:
            db.rollback()
        except Exception:
            pass


def validate_review_count(
    db: Session, appid: int, new_count: int, prev_count: int | None
) -> int:
    """Review count must never decrease. Returns prev value if anomalous."""
    if prev_count is not None and new_count < prev_count:
        _log_anomaly(db, appid, "review_count", f">={prev_count}", new_count)
        logger.warning(
            "Review count decreased appid=%d: %d → %d — keeping previous",
            appid, prev_count, new_count,
        )
        return prev_count
    return new_count


def validate_review_score(db: Session, appid: int, score_pct: float) -> float:
    """Review score must be 0–100. Returns clamped value if anomalous."""
    if not (0.0 <= score_pct <= 100.0):
        _log_anomaly(db, appid, "review_score_pct", "0-100", score_pct)
        logger.warning("review_score_pct out of range appid=%d: %s", appid, score_pct)
        return max(0.0, min(100.0, score_pct))
    return score_pct


def validate_ccu(db: Session, appid: int, ccu: int) -> int:
    """CCU must be non-negative. Returns 0 if anomalous."""
    if ccu < 0:
        _log_anomaly(db, appid, "current_ccu", ">=0", ccu)
        logger.warning("Negative CCU appid=%d: %d", appid, ccu)
        return 0
    return ccu


def validate_youtube_views(
    db: Session, video_id: str, new_views: int, prev_views: int | None
) -> int:
    """YouTube view count must never decrease. Returns prev value if anomalous."""
    if prev_views is not None and new_views < prev_views:
        _log_anomaly(db, 0, f"youtube_views:{video_id}", f">={prev_views}", new_views)
        logger.warning(
            "YouTube views decreased video=%s: %d → %d — keeping previous",
            video_id, prev_views, new_views,
        )
        return prev_views
    return new_views
