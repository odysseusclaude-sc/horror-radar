from __future__ import annotations

"""Tier 2 YouTube Channel Auto-Discovery

Weekly job that scans seed channels' descriptions/about pages for linked
channels, then validates them as horror-game-focused with >10K subscribers.
Newly discovered channels are added to youtube_channels with tier=2.

Quota budget: ~100–200 units per scan (well within daily 10K limit).
  - 10 seed channels × 1 unit (channels.list snippet) = 10 units
  - Up to ~30 unique candidates × 1 unit (channels.list stats) = 30 units
  - Up to ~10 passing subs filter × 2 units (playlistItems check) = 20 units
  - Total ≈ 60–200 units, capped at 500 by MAX_QUOTA_UNITS guard.
"""
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx

from collectors._http import fetch_with_retry, youtube_limiter
from config import settings
from database import SessionLocal
from models import CollectionRun, YoutubeChannel

logger = logging.getLogger(__name__)

YT_BASE = "https://www.googleapis.com/youtube/v3"

# Minimum subscribers a discovered channel must have
MIN_SUBSCRIBER_COUNT = 10_000

# How recent a horror-game video must be (days) for the channel to qualify
CONTENT_RECENCY_DAYS = 90

# Hard cap on quota units spent per scan run (safety guard)
MAX_QUOTA_UNITS = 500

# Keywords that signal horror-game content in a video title
_HORROR_TITLE_KEYWORDS = [
    "horror", "scary", "terrif", "haunt", "creep", "jumpscare", "jump scare",
    "spooky", "dread", "nightmare", "paranormal", "scare", "fright",
    "slender", "outlast", "fnaf", "five nights",
]

# Regex patterns that match channel references inside video descriptions / about pages
_CHANNEL_HANDLE_RE = re.compile(
    r"(?:youtube\.com/(?:@|c/|channel/|user/)|(?<!\w)@)([\w.-]+)",
    re.IGNORECASE,
)
_CHANNEL_ID_RE = re.compile(r"youtube\.com/channel/(UC[\w-]{22})", re.IGNORECASE)


def _extract_channel_refs(text: str) -> tuple[list[str], list[str]]:
    """Return (handles, channel_ids) found in `text`."""
    channel_ids = _CHANNEL_ID_RE.findall(text)
    raw_handles = _CHANNEL_HANDLE_RE.findall(text)
    # Filter out obvious non-channels (watch?v=, playlists, shorts)
    handles = [
        h for h in raw_handles
        if h.lower() not in {"watch", "shorts", "playlist", "feed", "results"}
        and len(h) >= 2
    ]
    return handles, channel_ids


def _is_horror_title(title: str) -> bool:
    lower = title.lower()
    return any(kw in lower for kw in _HORROR_TITLE_KEYWORDS)


async def _get_channel_info(
    client: httpx.AsyncClient,
    *,
    channel_id: str | None = None,
    handle: str | None = None,
) -> dict | None:
    """Fetch channel snippet+statistics. Returns None on failure. Costs 1 quota unit."""
    params: dict = {
        "part": "snippet,statistics",
        "key": settings.youtube_api_key,
    }
    if channel_id:
        params["id"] = channel_id
    elif handle:
        params["forHandle"] = handle if handle.startswith("@") else f"@{handle}"
    else:
        return None

    data = await fetch_with_retry(client, f"{YT_BASE}/channels", params=params, limiter=youtube_limiter)
    if not data or not data.get("items"):
        return None

    item = data["items"][0]
    stats = item.get("statistics", {})
    snippet = item.get("snippet", {})
    return {
        "channel_id": item["id"],
        "handle": snippet.get("customUrl", "").lstrip("@") or handle or "",
        "name": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "subscriber_count": int(stats.get("subscriberCount", 0)),
        "total_views": int(stats.get("viewCount", 0)),
        "video_count": int(stats.get("videoCount", 0)),
    }


async def _has_recent_horror_content(
    client: httpx.AsyncClient,
    channel_id: str,
    recency_days: int = CONTENT_RECENCY_DAYS,
) -> bool:
    """Check if the channel posted horror-game videos in the last `recency_days`.

    Fetches one page (50 items) from the uploads playlist — costs 1 quota unit.
    """
    playlist_id = "UU" + channel_id[2:] if channel_id.startswith("UC") else channel_id
    cutoff = datetime.now(timezone.utc) - timedelta(days=recency_days)

    data = await fetch_with_retry(
        client,
        f"{YT_BASE}/playlistItems",
        params={
            "part": "snippet",
            "playlistId": playlist_id,
            "maxResults": "50",
            "key": settings.youtube_api_key,
        },
        limiter=youtube_limiter,
    )
    if not data or "items" not in data:
        return False

    for item in data["items"]:
        snippet = item.get("snippet", {})
        published = snippet.get("publishedAt", "")
        try:
            pub_dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            continue

        if pub_dt < cutoff:
            # Videos are newest-first; once we're past the cutoff we can stop.
            break

        title = snippet.get("title", "")
        if _is_horror_title(title):
            return True

    return False


async def run_tier2_discovery() -> int:
    """Discover Tier 2 YouTube channels from seed channel descriptions.

    Returns the number of new channels added.
    """
    if not settings.youtube_api_key:
        logger.warning("YOUTUBE_API_KEY not set, skipping Tier 2 discovery")
        return 0

    db = SessionLocal()
    run = CollectionRun(job_name="youtube_tier2_discovery", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    added = 0
    quota_used = 0

    try:
        # Load currently-known channel IDs to skip them
        known_ids: set[str] = {
            row[0] for row in db.query(YoutubeChannel.channel_id).all()
        }

        async with httpx.AsyncClient() as client:
            # Step 1: Fetch all seed channel descriptions
            seed_channels = (
                db.query(YoutubeChannel)
                .filter(YoutubeChannel.tier == 1)
                .all()
            )

            # candidate_refs: set of (type, value, discovered_from_channel_id)
            candidate_refs: list[tuple[str, str, str]] = []

            for seed in seed_channels:
                if quota_used >= MAX_QUOTA_UNITS:
                    logger.warning("Tier2 discovery: quota cap reached at seed scan stage")
                    break

                info = await _get_channel_info(client, channel_id=seed.channel_id)
                quota_used += 1
                if not info:
                    continue

                desc = info.get("description", "")
                handles, ch_ids = _extract_channel_refs(desc)

                for h in handles:
                    candidate_refs.append(("handle", h, seed.channel_id))
                for cid in ch_ids:
                    if cid not in known_ids:
                        candidate_refs.append(("id", cid, seed.channel_id))

            # Deduplicate by value
            seen_values: set[str] = set()
            unique_candidates: list[tuple[str, str, str]] = []
            for ref_type, ref_value, discovered_from in candidate_refs:
                if ref_value not in seen_values and ref_value not in known_ids:
                    seen_values.add(ref_value)
                    unique_candidates.append((ref_type, ref_value, discovered_from))

            logger.info(
                f"Tier2 discovery: {len(unique_candidates)} unique candidates from "
                f"{len(seed_channels)} seed channels"
            )

            # Step 2: Resolve & filter candidates
            for ref_type, ref_value, discovered_from in unique_candidates:
                if quota_used >= MAX_QUOTA_UNITS:
                    logger.warning("Tier2 discovery: quota cap reached at candidate resolution stage")
                    break

                if ref_type == "handle":
                    info = await _get_channel_info(client, handle=ref_value)
                else:
                    info = await _get_channel_info(client, channel_id=ref_value)
                quota_used += 1

                if not info:
                    continue

                cid = info["channel_id"]
                if cid in known_ids:
                    continue

                subs = info["subscriber_count"]
                if subs < MIN_SUBSCRIBER_COUNT:
                    logger.debug(
                        f"Tier2 candidate {info['name']} skipped: {subs} subs < {MIN_SUBSCRIBER_COUNT}"
                    )
                    continue

                # Step 3: Check for recent horror game content
                if quota_used >= MAX_QUOTA_UNITS:
                    logger.warning("Tier2 discovery: quota cap reached before content check")
                    break

                has_horror = await _has_recent_horror_content(client, cid)
                quota_used += 1

                if not has_horror:
                    logger.debug(
                        f"Tier2 candidate {info['name']} skipped: no recent horror game content"
                    )
                    continue

                # Add to DB as Tier 2
                new_channel = YoutubeChannel(
                    channel_id=cid,
                    handle=info["handle"],
                    name=info["name"],
                    subscriber_count=subs,
                    total_views=info["total_views"],
                    video_count=info["video_count"],
                    match_mode="title",
                    tier=2,
                    discovered_from=discovered_from,
                )
                db.add(new_channel)
                db.commit()
                known_ids.add(cid)
                added += 1
                logger.info(
                    f"Tier2 discovery: added {info['name']} "
                    f"({subs:,} subs, discovered from {discovered_from})"
                )

        run.status = "success"
        run.items_processed = added
        run.items_failed = 0
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(
            f"Tier2 discovery complete: {added} new channels added, "
            f"{quota_used} quota units used"
        )

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Tier2 discovery failed")

    finally:
        db.close()

    return added
