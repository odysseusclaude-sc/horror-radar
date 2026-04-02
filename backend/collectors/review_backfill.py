"""Review History Backfill

Fetches all individual reviews for a game from Steam's review API,
bins them by date, and reconstructs daily cumulative review counts
to backfill game_snapshots for games discovered late.

Usage:
    from collectors.review_backfill import backfill_review_history
    result = backfill_review_history(4167960)  # appid
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import httpx

from database import SessionLocal
from models import Game, GameSnapshot

logger = logging.getLogger(__name__)

REVIEWS_URL = "https://store.steampowered.com/appreviews/{appid}"
MAX_PAGES = 30  # Safety limit: 30 pages × 100 = 3000 reviews max


def _fetch_all_reviews(appid: int) -> list[dict]:
    """Fetch all reviews for a game with pagination."""
    reviews = {}  # keyed by recommendationid to dedup
    cursor = "*"
    seen_cursors = set()

    with httpx.Client(timeout=15) as client:
        for page in range(MAX_PAGES):
            time.sleep(1.5)  # Respect Steam rate limit

            resp = client.get(REVIEWS_URL.format(appid=appid), params={
                "json": 1,
                "filter": "all",
                "language": "all",
                "num_per_page": 100,
                "purchase_type": "all",
                "cursor": cursor,
            })

            if resp.status_code != 200:
                logger.warning(f"Steam returned {resp.status_code} for appid {appid} page {page}")
                break

            data = resp.json()
            batch = data.get("reviews", [])
            if not batch:
                break

            new_count = 0
            for r in batch:
                rid = r.get("recommendationid", "")
                if rid not in reviews:
                    reviews[rid] = r
                    new_count += 1

            # Stop if cursor is cycling (no new reviews in this page)
            if new_count == 0:
                break

            cursor = data.get("cursor", "")
            if not cursor or cursor in seen_cursors:
                break
            seen_cursors.add(cursor)

            logger.debug(f"AppID {appid}: page {page + 1}, {len(reviews)} unique reviews")

    return list(reviews.values())


def backfill_review_history(appid: int) -> dict:
    """Reconstruct daily review snapshots from individual review timestamps.

    For each day from release to today, creates/updates a game_snapshot
    with the cumulative review count and score at that date.
    Only backfills days that don't already have snapshot data.
    """
    db = SessionLocal()
    try:
        game = db.query(Game).filter_by(appid=appid).first()
        if not game:
            return {"error": "Game not found"}
        if not game.release_date:
            return {"error": "No release date"}

        logger.info(f"Backfilling review history for {game.title} (AppID {appid})")

        # Fetch all reviews
        reviews = _fetch_all_reviews(appid)
        if not reviews:
            return {"error": "No reviews found", "appid": appid}

        logger.info(f"Fetched {len(reviews)} reviews for {game.title}")

        # Bin reviews by date
        daily_positive = defaultdict(int)
        daily_negative = defaultdict(int)

        for r in reviews:
            ts = r.get("timestamp_created")
            if not ts:
                continue
            review_date = datetime.utcfromtimestamp(ts).date()
            if r.get("voted_up"):
                daily_positive[review_date] += 1
            else:
                daily_negative[review_date] += 1

        # Get existing snapshot dates to avoid overwriting real data
        existing_dates = {
            row[0] for row in
            db.query(GameSnapshot.snapshot_date)
            .filter_by(appid=appid)
            .filter(GameSnapshot.review_count.isnot(None))
            .all()
        }

        # Build cumulative counts day by day
        start = game.release_date
        end = date.today()
        current = start
        cumulative_pos = 0
        cumulative_neg = 0
        created = 0
        skipped = 0

        while current <= end:
            cumulative_pos += daily_positive.get(current, 0)
            cumulative_neg += daily_negative.get(current, 0)
            total = cumulative_pos + cumulative_neg

            if current in existing_dates:
                skipped += 1
                current += timedelta(days=1)
                continue

            # Only create snapshots for days where at least 1 review exists
            if total > 0:
                score_pct = (cumulative_pos / total * 100) if total > 0 else None

                snapshot = GameSnapshot(
                    appid=appid,
                    snapshot_date=current,
                    review_count=total,
                    review_score_pct=round(score_pct, 2) if score_pct else None,
                    total_positive=cumulative_pos,
                    total_negative=cumulative_neg,
                )
                db.add(snapshot)
                created += 1

            current += timedelta(days=1)

        db.commit()
        logger.info(
            f"Backfilled {created} snapshots for {game.title} "
            f"({skipped} days already had data, {len(reviews)} total reviews)"
        )

        return {
            "appid": appid,
            "title": game.title,
            "total_reviews": len(reviews),
            "snapshots_created": created,
            "snapshots_skipped": skipped,
        }

    except Exception as e:
        db.rollback()
        logger.exception(f"Review backfill failed for {appid}")
        return {"error": str(e)}
    finally:
        db.close()
