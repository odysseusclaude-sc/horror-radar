"""Stage 8: YouTube Stats Refresh

Batch refresh view/like/comment counts for videos <30 days old.
Captures view_48h if within window and not yet set.
Uses videos.list with up to 50 IDs per call (3 quota units).
"""
import logging
from datetime import datetime, timedelta, timezone

import httpx

from collectors._http import fetch_with_retry
from config import settings
from database import SessionLocal
from models import CollectionRun, YoutubeVideo

logger = logging.getLogger(__name__)

YT_BASE = "https://www.googleapis.com/youtube/v3"
REFRESH_WINDOW_DAYS = 30


async def run_youtube_stats_refresh():
    """Refresh stats for all recent YouTube videos."""
    if not settings.youtube_api_key:
        logger.warning("YOUTUBE_API_KEY not set, skipping stats refresh")
        return

    db = SessionLocal()
    run = CollectionRun(job_name="youtube_stats", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0

    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=REFRESH_WINDOW_DAYS)
        videos = (
            db.query(YoutubeVideo)
            .filter(YoutubeVideo.published_at >= cutoff)
            .all()
        )

        if not videos:
            run.status = "success"
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        video_map = {v.video_id: v for v in videos}
        video_ids = list(video_map.keys())

        async with httpx.AsyncClient() as client:
            for i in range(0, len(video_ids), 50):
                batch = video_ids[i : i + 50]

                data = await fetch_with_retry(
                    client,
                    f"{YT_BASE}/videos",
                    params={
                        "part": "statistics",
                        "id": ",".join(batch),
                        "key": settings.youtube_api_key,
                    },
                )

                if not data or "items" not in data:
                    failed += len(batch)
                    continue

                now = datetime.now(timezone.utc)

                for item in data["items"]:
                    vid_id = item["id"]
                    video = video_map.get(vid_id)
                    if not video:
                        continue

                    try:
                        stats = item.get("statistics", {})
                        video.view_count = int(stats.get("viewCount", 0))
                        video.like_count = int(stats.get("likeCount", 0))
                        video.comment_count = int(stats.get("commentCount", 0))

                        # Capture view_48h if within window and not yet set
                        if (
                            video.view_48h is None
                            and video.published_at
                            and (now - video.published_at).total_seconds() <= 48 * 3600
                        ):
                            video.view_48h = video.view_count

                        processed += 1
                    except Exception as e:
                        logger.error(f"Error updating stats for video {vid_id}: {e}")
                        failed += 1

                db.commit()

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(f"YouTube stats refresh complete: {processed} updated, {failed} failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("YouTube stats refresh failed")
    finally:
        db.close()
