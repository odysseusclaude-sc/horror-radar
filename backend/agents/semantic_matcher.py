"""Agent 1: Semantic YouTube Matcher

Finds games for YouTube videos that token_set_ratio couldn't match.
Fuzzy string matching fails on titles like "THE MOST TERRIFYING HORROR GAME"
when the game has a unique name buried in the description or channel context.

This agent reads unmatched videos in batches, calls claude-haiku to reason
about which game each video is covering, and writes matched_appid + match_reason.
Videos where the agent is unsure get match_needs_review=1 for human review.

Runs after run_youtube_stats_refresh() in youtube_pipeline_job().
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import anthropic

from config import settings
from database import SessionLocal

logger = logging.getLogger(__name__)

_BATCH_SIZE = 20
_HIGH_CONFIDENCE_THRESHOLD = 90
_AGENT_TIMEOUT = 30


def run_semantic_matcher(max_videos: int = 100) -> dict:
    """Match unmatched YouTube videos to games using LLM semantic reasoning.

    Returns a summary dict: {matched: int, flagged_review: int, skipped: int}.
    """
    if not settings.anthropic_api_key:
        logger.warning("semantic_matcher: ANTHROPIC_API_KEY not set, skipping")
        return {"matched": 0, "flagged_review": 0, "skipped": 0}

    # --- Phase 1: read inputs, close session ---
    db = SessionLocal()
    try:
        from sqlalchemy import text
        videos = db.execute(text(
            "SELECT v.id, v.video_id, v.title, v.description, c.name as channel_name "
            "FROM youtube_videos v "
            "JOIN youtube_channels c ON v.channel_id = c.channel_id "
            "WHERE v.matched_appid IS NULL "
            "ORDER BY v.published_at DESC "
            f"LIMIT {max_videos}"
        )).fetchall()

        if not videos:
            logger.info("semantic_matcher: no unmatched videos to process")
            return {"matched": 0, "flagged_review": 0, "skipped": 0}

        games = db.execute(text(
            "SELECT appid, title, short_description FROM games "
            "WHERE is_horror = 1 ORDER BY release_date DESC LIMIT 300"
        )).fetchall()
    finally:
        db.close()

    if not games:
        logger.info("semantic_matcher: no horror games in DB")
        return {"matched": 0, "flagged_review": 0, "skipped": 0}

    game_catalog = [
        {"appid": g.appid, "title": g.title, "desc": (g.short_description or "")[:200]}
        for g in games
    ]
    game_catalog_json = json.dumps(game_catalog, ensure_ascii=False)

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    matched = flagged = skipped = 0

    for i in range(0, len(videos), _BATCH_SIZE):
        batch = videos[i:i + _BATCH_SIZE]
        video_list = [
            {
                "id": v.id,
                "title": v.title,
                "description": (v.description or "")[:500],
                "channel": v.channel_name,
            }
            for v in batch
        ]

        prompt = f"""You are matching YouTube gaming videos to Steam horror indie games.

GAME CATALOG (appid, title, short description):
{game_catalog_json}

UNMATCHED VIDEOS:
{json.dumps(video_list, ensure_ascii=False)}

For each video, determine if it covers one of the games in the catalog.
A video covers a game if:
- The game title appears in the video title or description (including abbreviated forms)
- The video description or context clearly refers to the game
- The channel is a horror gaming channel and the video is clearly about this game

Return a JSON array. Each element must be one of:
{{"id": <video_db_id>, "appid": <matched_appid>, "confidence": <0-100>, "reason": "<one sentence>"}}
or
{{"id": <video_db_id>, "appid": null, "confidence": 0, "reason": "no match found"}}

Only return the JSON array, no other text."""

        try:
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2048,
                timeout=_AGENT_TIMEOUT,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = response.content[0].text.strip()
            # Strip markdown code fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            results = json.loads(raw)
        except Exception as e:
            logger.warning(f"semantic_matcher: API call failed for batch {i//  _BATCH_SIZE + 1}: {e}")
            skipped += len(batch)
            continue

        # --- Phase 3: write outputs ---
        db = SessionLocal()
        try:
            from sqlalchemy import text as sql_text
            for result in results:
                vid_id = result.get("id")
                appid = result.get("appid")
                confidence = result.get("confidence", 0)
                reason = result.get("reason", "")

                if not vid_id:
                    continue

                if appid is not None and confidence >= _HIGH_CONFIDENCE_THRESHOLD:
                    db.execute(sql_text(
                        "UPDATE youtube_videos SET matched_appid = :appid, "
                        "match_reason = :reason, match_needs_review = 0 "
                        "WHERE id = :vid_id"
                    ), {"appid": appid, "reason": reason, "vid_id": vid_id})
                    matched += 1
                elif appid is not None and confidence >= 60:
                    db.execute(sql_text(
                        "UPDATE youtube_videos SET matched_appid = :appid, "
                        "match_reason = :reason, match_needs_review = 1 "
                        "WHERE id = :vid_id"
                    ), {"appid": appid, "reason": reason, "vid_id": vid_id})
                    flagged += 1
                else:
                    skipped += 1
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning(f"semantic_matcher: DB write failed for batch: {e}")
        finally:
            db.close()

    logger.info(f"semantic_matcher: matched={matched}, flagged_review={flagged}, skipped={skipped}")
    return {"matched": matched, "flagged_review": flagged, "skipped": skipped}
