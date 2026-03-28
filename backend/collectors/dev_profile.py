from __future__ import annotations

"""Developer Profile Builder (DB-only scope)

For each unique developer in the games table:
1. Query all their games already in our DB
2. Compute: total_games, total_reviews, avg_review_score, best_game
3. Upsert into developer_profiles table

Scope limitation: only tracks games already in our Horror Radar DB.
Games a developer made outside horror/indie are intentionally excluded —
we care specifically about their horror indie track record.
"""

import logging
from datetime import datetime, timezone

from database import SessionLocal
from models import CollectionRun, DeveloperProfile, Game, GameSnapshot

logger = logging.getLogger(__name__)


async def run_dev_profiles() -> None:
    """Compute developer profiles from DB data."""
    db = SessionLocal()
    run = CollectionRun(job_name="dev_profiles", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0

    try:
        # Get all distinct developers
        developers = [
            row[0]
            for row in db.query(Game.developer).filter(Game.developer.isnot(None)).distinct().all()
        ]
        logger.info(f"Dev profiles: computing for {len(developers)} developers")

        for developer in developers:
            try:
                dev_games = db.query(Game).filter_by(developer=developer).all()
                if not dev_games:
                    continue

                total_games = len(dev_games)
                total_reviews = 0
                weighted_score_sum = 0.0
                best_game_appid: int | None = None
                best_game_reviews = 0

                for game in dev_games:
                    latest_snap = (
                        db.query(GameSnapshot)
                        .filter_by(appid=game.appid)
                        .order_by(GameSnapshot.snapshot_date.desc())
                        .first()
                    )
                    if not latest_snap:
                        continue

                    review_count = latest_snap.review_count or 0
                    review_score = latest_snap.review_score_pct or 0.0

                    total_reviews += review_count
                    weighted_score_sum += review_score * review_count

                    if review_count > best_game_reviews:
                        best_game_reviews = review_count
                        best_game_appid = game.appid

                avg_review_score = (
                    weighted_score_sum / total_reviews if total_reviews > 0 else None
                )

                # Upsert
                profile = (
                    db.query(DeveloperProfile)
                    .filter_by(developer_name=developer)
                    .first()
                )
                if profile:
                    profile.total_games = total_games
                    profile.total_reviews = total_reviews
                    profile.avg_review_score = avg_review_score
                    profile.best_game_appid = best_game_appid
                    profile.best_game_reviews = best_game_reviews if best_game_reviews > 0 else None
                    profile.computed_at = datetime.now(timezone.utc)
                else:
                    db.add(DeveloperProfile(
                        developer_name=developer,
                        total_games=total_games,
                        total_reviews=total_reviews,
                        avg_review_score=avg_review_score,
                        best_game_appid=best_game_appid,
                        best_game_reviews=best_game_reviews if best_game_reviews > 0 else None,
                        scope="db_only",
                        computed_at=datetime.now(timezone.utc),
                    ))

                db.commit()
                processed += 1

            except Exception as e:
                logger.error(f"Dev profile error for '{developer}': {e}")
                db.rollback()
                failed += 1

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"Dev profiles: {processed} computed, {failed} failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Dev profile computation failed")
    finally:
        db.close()
