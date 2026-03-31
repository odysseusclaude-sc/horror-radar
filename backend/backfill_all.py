"""Batch backfill: review history + OPS for all games.

Usage: python3 backfill_all.py
"""
import asyncio
import logging
import sys
import time

from database import SessionLocal
from models import Game, GameSnapshot
from sqlalchemy import func
from collectors.review_history import backfill_review_history
from collectors.ops_backfill import backfill_ops_history

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def get_games_needing_backfill() -> list[tuple[int, str]]:
    """Return (appid, title) for games that haven't been review-backfilled yet."""
    db = SessionLocal()
    try:
        # Games with <= 5 snapshots haven't been backfilled
        backfilled = (
            db.query(GameSnapshot.appid)
            .group_by(GameSnapshot.appid)
            .having(func.count() > 5)
            .subquery()
        )
        games = (
            db.query(Game.appid, Game.title)
            .filter(
                Game.release_date.isnot(None),
                ~Game.appid.in_(db.query(backfilled.c.appid)),
            )
            .order_by(Game.appid)
            .all()
        )
        return [(g.appid, g.title) for g in games]
    finally:
        db.close()


async def run_review_backfill(games: list[tuple[int, str]]) -> int:
    """Backfill review history for all games. Returns count of successful."""
    total = len(games)
    success = 0
    failed = 0
    start = time.time()

    for i, (appid, title) in enumerate(games, 1):
        elapsed = time.time() - start
        rate = i / max(elapsed, 1) * 60  # games/min
        eta = (total - i) / max(rate / 60, 0.01)

        logger.info(
            f"[{i}/{total}] Review backfill: {title} (appid={appid}) "
            f"| {rate:.0f}/min | ETA {eta:.0f}s"
        )

        try:
            result = await backfill_review_history(appid)
            if "error" in result:
                logger.warning(f"  -> Skipped: {result['error']}")
                failed += 1
            else:
                logger.info(
                    f"  -> {result.get('total_reviews_fetched', 0)} reviews, "
                    f"{result.get('snapshots_created', 0)} new snapshots"
                )
                success += 1
        except Exception as e:
            logger.error(f"  -> Error: {e}")
            failed += 1

    logger.info(
        f"Review backfill complete: {success} OK, {failed} failed "
        f"in {time.time() - start:.0f}s"
    )
    return success


def run_ops_backfill(games: list[tuple[int, str]]) -> int:
    """Backfill OPS history for all games. Returns count of successful."""
    total = len(games)
    success = 0
    failed = 0
    start = time.time()

    for i, (appid, title) in enumerate(games, 1):
        if i % 20 == 0 or i == 1:
            elapsed = time.time() - start
            rate = i / max(elapsed, 1) * 60
            logger.info(f"[{i}/{total}] OPS backfill progress | {rate:.0f}/min")

        try:
            result = backfill_ops_history(appid)
            if "error" in result:
                failed += 1
            else:
                success += 1
        except Exception as e:
            logger.error(f"OPS backfill error for {appid}: {e}")
            failed += 1

    logger.info(
        f"OPS backfill complete: {success} OK, {failed} failed "
        f"in {time.time() - start:.0f}s"
    )
    return success


async def main():
    games = get_games_needing_backfill()
    logger.info(f"Found {len(games)} games needing backfill")

    if not games:
        logger.info("Nothing to backfill!")
        return

    # Step 1: Review history (async, rate-limited Steam API calls)
    logger.info("=" * 60)
    logger.info("STEP 1: Review History Backfill")
    logger.info("=" * 60)
    await run_review_backfill(games)

    # Step 2: OPS backfill (sync, pure DB computation)
    # Run for ALL games (including already-backfilled ones) since baselines changed
    db = SessionLocal()
    all_games = [(g.appid, g.title) for g in db.query(Game.appid, Game.title).filter(Game.release_date.isnot(None)).all()]
    db.close()

    logger.info("=" * 60)
    logger.info("STEP 2: OPS History Backfill")
    logger.info("=" * 60)
    run_ops_backfill(all_games)

    logger.info("=" * 60)
    logger.info("ALL DONE")
    logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
