from __future__ import annotations

"""Stage 7: YouTube Video Scanner

Uses playlistItems.list (1 unit/page) to discover recent uploads.
Fuzzy matches video titles and descriptions against known games
using rapidfuzz token_set_ratio.

Quota-efficient: ~27 units/day for 3 channels vs 6,000 with search.list.
"""
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx
from rapidfuzz import fuzz, process

from collectors._http import fetch_with_retry, youtube_limiter, youtube_quota_exhausted
from config import SEED_CHANNELS, settings
from database import SessionLocal
from models import CollectionRun, Game, YoutubeChannel, YoutubeVideo

logger = logging.getLogger(__name__)

YT_BASE = "https://www.googleapis.com/youtube/v3"
SCAN_WINDOW_DAYS = 60  # 2 months — initial backfill done, conserve quota


def _parse_iso8601_duration(duration: str) -> int:
    """Parse ISO 8601 duration 'PT1H2M3S' to seconds."""
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not match:
        return 0
    h, m, s = (int(g) if g else 0 for g in match.groups())
    return h * 3600 + m * 60 + s


def _uploads_playlist_id(channel_id: str) -> str:
    """Derive uploads playlist ID from channel ID (UC... → UU...)."""
    if channel_id.startswith("UC"):
        return "UU" + channel_id[2:]
    return channel_id


async def _resolve_channels(client: httpx.AsyncClient) -> list[dict]:
    """Resolve channel handles to channel_id and stats."""
    channels = []

    for ch in SEED_CHANNELS:
        data = await fetch_with_retry(
            client,
            f"{YT_BASE}/channels",
            params={
                "part": "snippet,statistics",
                "forHandle": ch.handle,
                "key": settings.youtube_api_key,
            },
            limiter=youtube_limiter,
        )

        if not data or not data.get("items"):
            logger.warning(f"Could not resolve channel {ch.handle}")
            continue

        item = data["items"][0]
        stats = item.get("statistics", {})
        channels.append({
            "channel_id": item["id"],
            "handle": ch.handle,
            "name": item["snippet"]["title"],
            "subscriber_count": int(stats.get("subscriberCount", 0)),
            "total_views": int(stats.get("viewCount", 0)),
            "video_count": int(stats.get("videoCount", 0)),
            "match_mode": ch.match_mode,
        })

    return channels


async def _fetch_recent_uploads(
    client: httpx.AsyncClient, channel_id: str
) -> list[dict]:
    """Fetch recent video IDs via uploads playlist."""
    playlist_id = _uploads_playlist_id(channel_id)
    cutoff = datetime.now(timezone.utc) - timedelta(days=SCAN_WINDOW_DAYS)
    videos = []
    next_page = None

    while True:
        params = {
            "part": "snippet",
            "playlistId": playlist_id,
            "maxResults": "50",
            "key": settings.youtube_api_key,
        }
        if next_page:
            params["pageToken"] = next_page

        data = await fetch_with_retry(client, f"{YT_BASE}/playlistItems", params=params, limiter=youtube_limiter)

        if not data or "items" not in data:
            break

        for item in data["items"]:
            snippet = item["snippet"]
            published = snippet.get("publishedAt", "")
            try:
                pub_dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                continue

            if pub_dt < cutoff:
                return videos  # Older than window, stop

            videos.append({
                "video_id": snippet["resourceId"]["videoId"],
                "title": snippet.get("title", ""),
                "description": snippet.get("description", ""),
                "published_at": pub_dt,
                "channel_id": snippet.get("channelId") or channel_id,
            })

        next_page = data.get("nextPageToken")
        if not next_page:
            break

    return videos


async def _fetch_video_stats(
    client: httpx.AsyncClient, video_ids: list[str]
) -> dict[str, dict]:
    """Batch fetch video stats+contentDetails, up to 50 per call."""
    stats = {}

    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        data = await fetch_with_retry(
            client,
            f"{YT_BASE}/videos",
            params={
                "part": "statistics,contentDetails",
                "id": ",".join(batch),
                "key": settings.youtube_api_key,
            },
            limiter=youtube_limiter,
        )

        if not data or "items" not in data:
            continue

        for item in data["items"]:
            vid_stats = item.get("statistics", {})
            content = item.get("contentDetails", {})
            stats[item["id"]] = {
                "view_count": int(vid_stats.get("viewCount", 0)),
                "like_count": int(vid_stats.get("likeCount", 0)),
                "comment_count": int(vid_stats.get("commentCount", 0)),
                "duration_seconds": _parse_iso8601_duration(content.get("duration", "")),
            }

    return stats


def _match_to_games(
    text: str, game_names: list[str], threshold: int
) -> tuple[str | None, float]:
    """Match video text against game names with three-pass approach.

    Pass 1: Exact word-boundary match for ALL non-generic titles (catches
            exact substrings like "SHE WAS 98" inside long video titles).
    Pass 2: Fuzzy match for titles >= min length and not generic (catches
            minor spelling variations and reworded titles).
    Pass 3: Exact word-boundary match for short/generic titles only
            (e.g., "FEAR", "Content Warning" — restricted to avoid
            false positives on common words).
    """
    if not game_names:
        return None, 0.0

    min_len = settings.fuzzy_min_title_length
    generic = {t.strip().lower() for t in settings.fuzzy_generic_terms.split(",")}

    # Pass 1: exact word-boundary match for long, non-generic titles
    # This catches cases where token_set_ratio fails due to text length dilution
    for name in game_names:
        if len(name) >= min_len and name.lower() not in generic:
            pattern = r"(?<![a-zA-Z0-9])" + re.escape(name) + r"(?![a-zA-Z0-9])"
            if re.search(pattern, text, re.IGNORECASE):
                return name, 100.0

    # Pass 2: fuzzy match for long/unique titles
    eligible = [n for n in game_names if len(n) >= min_len and n.lower() not in generic]
    if eligible:
        results = process.extract(
            text, eligible, scorer=fuzz.token_set_ratio,
            score_cutoff=threshold, limit=1,
        )
        if results:
            name, score, _ = results[0]
            return name, score

    # Pass 3: exact word-boundary match for short/generic titles
    short_names = [n for n in game_names if len(n) < min_len or n.lower() in generic]
    for name in short_names:
        pattern = r"(?<![a-zA-Z])" + re.escape(name) + r"(?![a-zA-Z])"
        if re.search(pattern, text, re.IGNORECASE):
            return name, 100.0

    return None, 0.0


async def run_youtube_scan():
    """Full YouTube scan: resolve channels, fetch uploads, match to games."""
    if not settings.youtube_api_key:
        logger.warning("YOUTUBE_API_KEY not set, skipping YouTube scan")
        return

    db = SessionLocal()
    run = CollectionRun(job_name="youtube_scan", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0

    try:
        # Load game names for fuzzy matching
        games = db.query(Game).all()
        game_name_to_appid = {g.title: g.appid for g in games}
        game_names = list(game_name_to_appid.keys())

        async with httpx.AsyncClient() as client:
            # Step 1: Resolve channels
            channels = await _resolve_channels(client)

            if youtube_quota_exhausted():
                logger.error("YouTube daily quota exceeded — aborting entire YouTube pipeline")
                run.status = "partial"
                run.items_processed = processed
                run.items_failed = failed
                run.finished_at = datetime.now(timezone.utc)
                db.commit()
                return

            for ch_data in channels:
                if youtube_quota_exhausted():
                    logger.error("YouTube daily quota exceeded — aborting remaining channels")
                    break
                # Upsert channel
                existing_ch = db.query(YoutubeChannel).filter_by(
                    channel_id=ch_data["channel_id"]
                ).first()
                if existing_ch:
                    for k, v in ch_data.items():
                        setattr(existing_ch, k, v)
                else:
                    db.add(YoutubeChannel(**ch_data))
                db.commit()

                # Step 2: Fetch recent uploads
                uploads = await _fetch_recent_uploads(client, ch_data["channel_id"])

                if youtube_quota_exhausted():
                    logger.error("YouTube daily quota exceeded — aborting after uploads fetch")
                    break

                # Filter out videos already in DB
                known_ids = {
                    row[0]
                    for row in db.query(YoutubeVideo.video_id)
                    .filter(YoutubeVideo.video_id.in_([u["video_id"] for u in uploads]))
                    .all()
                }
                new_uploads = [u for u in uploads if u["video_id"] not in known_ids]

                if not new_uploads:
                    continue

                # Step 3: Batch fetch stats
                new_ids = [u["video_id"] for u in new_uploads]
                stats = await _fetch_video_stats(client, new_ids)

                if youtube_quota_exhausted():
                    logger.error("YouTube daily quota exceeded — aborting after stats fetch")
                    break

                # Step 4: Fuzzy match and persist
                for upload in new_uploads:
                    try:
                        vid_stats = stats.get(upload["video_id"], {})

                        # Match against game titles (always include description)
                        match_text = upload["title"]
                        if upload.get("description"):
                            match_text = f"{upload['title']} {upload['description']}"

                        matched_name, score = _match_to_games(
                            match_text, game_names, settings.fuzzy_match_threshold
                        )
                        matched_appid = game_name_to_appid.get(matched_name) if matched_name else None

                        # Check if within 48h for view_48h capture
                        now = datetime.now(timezone.utc)
                        view_48h = None
                        if upload["published_at"] and (now - upload["published_at"]).total_seconds() <= 72 * 3600:
                            view_48h = vid_stats.get("view_count")

                        db.add(YoutubeVideo(
                            video_id=upload["video_id"],
                            channel_id=upload["channel_id"],
                            title=upload["title"],
                            description=upload["description"][:2000] if upload["description"] else None,
                            published_at=upload["published_at"],
                            view_count=vid_stats.get("view_count"),
                            like_count=vid_stats.get("like_count"),
                            comment_count=vid_stats.get("comment_count"),
                            duration_seconds=vid_stats.get("duration_seconds"),
                            view_48h=view_48h,
                            matched_appid=matched_appid,
                            match_score=score if matched_appid else None,
                        ))
                        db.commit()
                        processed += 1

                    except Exception as e:
                        logger.error(f"Error processing video {upload['video_id']}: {e}")
                        db.rollback()
                        failed += 1

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(f"YouTube scan complete: {processed} videos added, {failed} failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("YouTube scan failed")
    finally:
        db.close()


def rematch_unmatched_videos():
    """Re-match videos that have no matched_appid using title + description.

    Useful after changing matching logic (e.g., adding description matching)
    to retroactively find matches for existing videos.
    """
    db = SessionLocal()
    try:
        games = db.query(Game).all()
        game_name_to_appid = {g.title: g.appid for g in games}
        game_names = list(game_name_to_appid.keys())

        if not game_names:
            logger.info("No games in DB, skipping rematch")
            return

        unmatched = db.query(YoutubeVideo).filter(
            YoutubeVideo.matched_appid.is_(None)
        ).all()

        logger.info(f"Re-matching {len(unmatched)} unmatched videos")
        matched_count = 0

        for vid in unmatched:
            match_text = vid.title or ""
            if vid.description:
                match_text = f"{vid.title} {vid.description}"

            matched_name, score = _match_to_games(
                match_text, game_names, settings.fuzzy_match_threshold
            )
            if matched_name:
                vid.matched_appid = game_name_to_appid[matched_name]
                vid.match_score = score
                matched_count += 1

        db.commit()
        logger.info(f"Re-matched {matched_count}/{len(unmatched)} videos")

    except Exception:
        db.rollback()
        logger.exception("Video rematch failed")
    finally:
        db.close()
