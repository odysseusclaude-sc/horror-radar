"""Agent 4: Radar Pick Editorial Writer

Replaces the template-driven buildVerdict() function in SignalFire.tsx with
real editorial prose. Called after daily OPS scoring completes.

Only generates a new verdict if:
  - The top OPS game has changed, OR
  - 7 days have passed since the last generation for the current pick.

Falls back to the frontend buildVerdict() template if verdict is NULL.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone

import anthropic

from config import settings
from database import SessionLocal

logger = logging.getLogger(__name__)

_AGENT_TIMEOUT = 30
_REGEN_INTERVAL_DAYS = 7


def run_editorial_writer() -> dict:
    """Generate an editorial verdict for the current radar pick.

    Returns {"status": "generated" | "skipped" | "unchanged", "appid": int | None}.
    """
    if not settings.anthropic_api_key:
        logger.warning("editorial_writer: ANTHROPIC_API_KEY not set, skipping")
        return {"status": "skipped", "appid": None}

    # --- Phase 1: read current top pick + existing verdict ---
    db = SessionLocal()
    try:
        from sqlalchemy import text
        today = date.today()
        min_release = today - timedelta(days=90)
        max_release = today - timedelta(days=7)

        top_row = db.execute(text(
            """
            SELECT g.appid, g.title, g.developer, g.price_usd, g.release_date,
                   g.short_description, g.subgenre, g.has_demo,
                   o.score, o.score_date,
                   o.velocity_component, o.decay_component, o.review_component,
                   o.youtube_component, o.ccu_component, o.sentiment_component,
                   o.twitch_component, o.raw_ops, o.confidence, o.forecast_7d
            FROM games g
            JOIN ops_scores o ON g.appid = o.appid
            JOIN (
                SELECT appid, MAX(score_date) as max_date
                FROM ops_scores GROUP BY appid
            ) latest ON o.appid = latest.appid AND o.score_date = latest.max_date
            WHERE g.is_horror = 1
              AND g.release_date >= :min_release
              AND g.release_date <= :max_release
              AND o.score IS NOT NULL
            ORDER BY o.score DESC
            LIMIT 1
            """
        ), {"min_release": min_release, "max_release": max_release}).fetchone()

        if not top_row:
            logger.info("editorial_writer: no eligible pick found")
            return {"status": "skipped", "appid": None}

        appid = top_row.appid

        # Check if we need to regenerate
        existing_verdict = db.execute(text(
            "SELECT id, score_date, generated_at FROM radar_verdicts "
            "WHERE appid = :appid ORDER BY generated_at DESC LIMIT 1"
        ), {"appid": appid}).fetchone()

        if existing_verdict:
            days_since = (datetime.now(timezone.utc) - existing_verdict.generated_at.replace(tzinfo=timezone.utc)
                         if existing_verdict.generated_at.tzinfo is None
                         else datetime.now(timezone.utc) - existing_verdict.generated_at).days
            if days_since < _REGEN_INTERVAL_DAYS:
                logger.info(f"editorial_writer: verdict for appid {appid} is {days_since}d old, skipping regen")
                return {"status": "unchanged", "appid": appid}

        # Fetch additional context: snapshot + YouTube coverage
        latest_snap = db.execute(text(
            "SELECT review_count, review_score_pct, peak_ccu, current_ccu "
            "FROM game_snapshots WHERE appid = :appid ORDER BY snapshot_date DESC LIMIT 1"
        ), {"appid": appid}).fetchone()

        snap_7d = db.execute(text(
            "SELECT review_count FROM game_snapshots WHERE appid = :appid "
            "AND snapshot_date <= date('now', '-7 days') ORDER BY snapshot_date DESC LIMIT 1"
        ), {"appid": appid}).fetchone()

        yt_coverage = db.execute(text(
            "SELECT c.name, c.subscriber_count, MAX(v.view_count) as top_views, COUNT(v.id) as vid_count "
            "FROM youtube_videos v JOIN youtube_channels c ON v.channel_id = c.channel_id "
            "WHERE v.matched_appid = :appid GROUP BY c.channel_id "
            "ORDER BY c.subscriber_count DESC LIMIT 3"
        ), {"appid": appid}).fetchall()

        ops_history = db.execute(text(
            "SELECT score_date, score FROM ops_scores WHERE appid = :appid "
            "AND score IS NOT NULL ORDER BY score_date DESC LIMIT 14"
        ), {"appid": appid}).fetchall()

    finally:
        db.close()

    # --- Phase 2: build context for the agent ---
    release_date = top_row.release_date
    days_out = (today - release_date).days if release_date else None
    reviews_now = latest_snap.review_count if latest_snap else None
    reviews_7d_ago = snap_7d.review_count if snap_7d else None
    review_delta = (reviews_now - reviews_7d_ago) if (reviews_now and reviews_7d_ago) else None

    yt_summary = [
        {"channel": r.name, "subs": r.subscriber_count, "top_views": r.top_views, "videos": r.vid_count}
        for r in yt_coverage
    ] if yt_coverage else []

    ops_trend = [{"date": str(r.score_date), "score": round(r.score, 1)} for r in ops_history]

    signals = {
        "title": top_row.title,
        "developer": top_row.developer,
        "days_since_launch": days_out,
        "price_usd": top_row.price_usd,
        "subgenre": top_row.subgenre,
        "has_demo": bool(top_row.has_demo),
        "ops_score": round(top_row.score, 1) if top_row.score else None,
        "ops_confidence": top_row.confidence,
        "ops_forecast_7d": round(top_row.forecast_7d, 1) if top_row.forecast_7d else None,
        "review_count": reviews_now,
        "review_delta_7d": review_delta,
        "review_score_pct": latest_snap.review_score_pct if latest_snap else None,
        "peak_ccu": latest_snap.peak_ccu if latest_snap else None,
        "components": {
            "velocity": round(top_row.velocity_component, 3) if top_row.velocity_component else None,
            "decay_retention": round(top_row.decay_component, 3) if top_row.decay_component else None,
            "review_volume": round(top_row.review_component, 3) if top_row.review_component else None,
            "youtube": round(top_row.youtube_component, 3) if top_row.youtube_component else None,
            "ccu": round(top_row.ccu_component, 3) if top_row.ccu_component else None,
            "sentiment": round(top_row.sentiment_component, 3) if top_row.sentiment_component else None,
            "twitch": round(top_row.twitch_component, 3) if top_row.twitch_component else None,
        },
        "youtube_coverage": yt_summary,
        "ops_history_14d": ops_trend,
        "short_description": (top_row.short_description or "")[:300],
    }

    prompt = f"""You are writing a short editorial verdict for a horror indie game breakout detection platform.

The platform identifies horror indie games that are overperforming their peers in the first 90 days of release.
Each week, one game earns the "Radar Pick" — the current top breakout.

DATA FOR THIS WEEK'S PICK:
{json.dumps(signals, indent=2)}

Write a 2-3 sentence editorial verdict in the style of a sharp, informed games journalist.
The verdict should:
- Lead with the most interesting or surprising signal (not just "X reviews, Y% positive")
- Make a claim about trajectory or breakout status based on the combined data pattern
- Vary structure — don't always start with a stat. Sometimes start with an observation.
- Be specific. Reference actual numbers if they're striking.
- Tone: confident, crisp, a little atmospheric. Like Eurogamer or PC Gamer's shorter takes.

Examples of good verdicts:
"Twelve days in and still accelerating — week-two velocity holding at 85% of launch pace is rare territory. The lack of creator coverage tells you this audience found it themselves."
"IGP coverage usually bumps a game 20-30 points. That it's still climbing a week after the video dropped suggests the organic word-of-mouth is real."

Return only the verdict text, no quotes, no labels."""

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            timeout=_AGENT_TIMEOUT,
            messages=[{"role": "user", "content": prompt}],
        )
        verdict_text = response.content[0].text.strip()
    except Exception as e:
        logger.warning(f"editorial_writer: API call failed: {e}")
        return {"status": "skipped", "appid": appid}

    # --- Phase 3: write verdict to DB ---
    db = SessionLocal()
    try:
        from sqlalchemy import text as sql_text
        db.execute(sql_text(
            "INSERT INTO radar_verdicts (appid, score_date, verdict_text, generated_at) "
            "VALUES (:appid, :score_date, :verdict, :gen_at)"
        ), {
            "appid": appid,
            "score_date": top_row.score_date,
            "verdict": verdict_text,
            "gen_at": datetime.now(timezone.utc),
        })
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"editorial_writer: DB write failed: {e}")
        return {"status": "skipped", "appid": appid}
    finally:
        db.close()

    logger.info(f"editorial_writer: generated verdict for appid {appid} ({top_row.title})")
    return {"status": "generated", "appid": appid}
