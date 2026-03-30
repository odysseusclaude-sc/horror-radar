"""Review History Backfill

Fetches all reviews for a game from Steam's appreviews endpoint,
builds a day-by-day cumulative review count, and backfills
game_snapshots with historical data points.

Steam's appreviews API is free, no auth needed.
Rate: ~200 reviews/page, paginated with cursor.
Cost: ~4 calls per 400-review game (~6 seconds).
"""
import logging
from collections import Counter
from datetime import date, datetime, timedelta, timezone

import httpx

from collectors._http import steam_limiter
from database import SessionLocal
from models import Game, GameSnapshot

logger = logging.getLogger(__name__)

STEAM_REVIEWS_URL = "https://store.steampowered.com/appreviews/{appid}"


async def _fetch_all_reviews(client: httpx.AsyncClient, appid: int) -> list[dict]:
    """Fetch all reviews with timestamps via cursor pagination."""
    all_reviews = []
    cursor = "*"
    page = 0

    while True:
        await steam_limiter.acquire()
        try:
            r = await client.get(
                STEAM_REVIEWS_URL.format(appid=appid),
                params={
                    "json": "1",
                    "filter": "recent",
                    "language": "all",
                    "num_per_page": "100",
                    "purchase_type": "all",
                    "cursor": cursor,
                },
                timeout=15,
            )
            data = r.json()
        except Exception as e:
            logger.error(f"Failed to fetch reviews page {page} for {appid}: {e}")
            break

        reviews = data.get("reviews", [])
        if not reviews:
            break

        all_reviews.extend(reviews)
        page += 1

        new_cursor = data.get("cursor")
        if not new_cursor or new_cursor == cursor:
            break
        cursor = new_cursor

        # Safety: don't fetch more than 50 pages (5000 reviews)
        if page >= 50:
            break

    logger.info(f"AppID {appid}: fetched {len(all_reviews)} reviews across {page} pages")
    return all_reviews


def _build_daily_histogram(reviews: list[dict], release_date: date) -> dict[date, dict]:
    """Build day-by-day review counts from raw review data.

    Returns dict of date -> {positive, negative, total, cum_positive, cum_negative, cum_total, score_pct}
    """
    daily_pos = Counter()
    daily_neg = Counter()

    for rev in reviews:
        ts = rev.get("timestamp_created", 0)
        if not ts:
            continue
        d = datetime.utcfromtimestamp(ts).date()
        if rev.get("voted_up"):
            daily_pos[d] += 1
        else:
            daily_neg[d] += 1

    # Build cumulative from release_date to today
    today = date.today()
    result = {}
    cum_pos = 0
    cum_neg = 0
    current = release_date

    while current <= today:
        cum_pos += daily_pos.get(current, 0)
        cum_neg += daily_neg.get(current, 0)
        cum_total = cum_pos + cum_neg

        result[current] = {
            "total_positive": cum_pos,
            "total_negative": cum_neg,
            "review_count": cum_total,
            "review_score_pct": round((cum_pos / cum_total) * 100, 2) if cum_total > 0 else None,
        }
        current += timedelta(days=1)

    return result


async def backfill_review_history(appid: int) -> dict:
    """Backfill historical review snapshots for a single game.

    Returns summary stats dict.
    """
    db = SessionLocal()
    try:
        game = db.query(Game).filter_by(appid=appid).first()
        if not game:
            return {"error": "Game not found"}

        if not game.release_date:
            return {"error": "No release date"}

        async with httpx.AsyncClient() as client:
            reviews = await _fetch_all_reviews(client, appid)

        if not reviews:
            return {"error": "No reviews fetched"}

        histogram = _build_daily_histogram(reviews, game.release_date)

        created = 0
        updated = 0

        for d, stats in histogram.items():
            existing = (
                db.query(GameSnapshot)
                .filter_by(appid=appid, snapshot_date=d)
                .first()
            )
            if existing:
                # Only fill in review data — don't overwrite CCU/owners if already present
                existing.review_count = stats["review_count"]
                existing.review_score_pct = stats["review_score_pct"]
                existing.total_positive = stats["total_positive"]
                existing.total_negative = stats["total_negative"]
                updated += 1
            else:
                db.add(GameSnapshot(
                    appid=appid,
                    snapshot_date=d,
                    review_count=stats["review_count"],
                    review_score_pct=stats["review_score_pct"],
                    total_positive=stats["total_positive"],
                    total_negative=stats["total_negative"],
                ))
                created += 1

        db.commit()
        logger.info(f"AppID {appid}: backfilled {created} new + {updated} updated snapshots")

        return {
            "appid": appid,
            "title": game.title,
            "total_reviews_fetched": len(reviews),
            "days_covered": len(histogram),
            "snapshots_created": created,
            "snapshots_updated": updated,
        }

    except Exception as e:
        db.rollback()
        logger.exception(f"Review backfill failed for {appid}")
        return {"error": str(e)}
    finally:
        db.close()
