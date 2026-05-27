"""Phase 2 delisted-game classifier.

Reviews and CCU both iterate the full Game table every day. As the catalog ages,
a growing cohort of AppIDs fails permanently — delisted, region-banned, or pulled
by the developer. Without classification these games are re-polled forever, burn
API budget, and pollute the per-run failure metrics.

This module:

  1. Tracks per-game consecutive_failures across reviews + CCU. Incremented on
     per-game failure, reset on per-game success.
  2. On crossing DELISTED_THRESHOLD, probes Steam's appdetails endpoint to
     confirm. Steam returns {"<appid>": {"success": false, "data": {}}} for
     genuinely missing AppIDs (the "data" key distinguishes this from the
     {"success": false} (no data key) shape Steam uses for rate-limit replies).
  3. On confirmation, sets Game.delisted_at and schedules a recheck in 30 days.
     Reviews and CCU then skip the game via .filter(Game.delisted_at.is_(None)).
  4. run_delisted_recheck() reactivates games that have come back online (Steam
     occasionally restores region access or republishes pulled titles).

Conservative defaults so a one-day Steam outage doesn't mass-delist the catalog:
  - DELISTED_THRESHOLD = 5 consecutive failures before we even probe
  - Probe must return the canonical success:false+data shape to mark delisted
  - Rate-limit-shaped responses (no "data" key) leave the game alone
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from sqlalchemy.orm import Session

from collectors._http import (
    STEAM_API_HEADERS,
    fetch_with_retry,
    steam_store_limiter,
)
from models import Game

logger = logging.getLogger(__name__)

# Tuning constants. Conservative on purpose — see module docstring.
DELISTED_THRESHOLD = 5
RECHECK_INTERVAL_DAYS = 30

STEAM_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


ProbeResult = Literal["delisted", "alive", "unclear"]


async def probe_appdetails(client: httpx.AsyncClient, appid: int) -> ProbeResult:
    """Probe Steam appdetails for a single AppID.

    Returns:
        "delisted" — Steam returned success:false WITH a "data" key. Canonical
                     signal for a genuinely missing/unpublished/region-blocked game.
        "alive"    — Steam returned success:true. Game is on the store.
        "unclear"  — Network error, rate limit (success:false with no "data" key),
                     malformed response. Caller should NOT mark delisted on this.
    """
    data = await fetch_with_retry(
        client,
        STEAM_APPDETAILS_URL,
        params={"appids": str(appid), "cc": "us", "l": "en", "filters": "basic"},
        limiter=steam_store_limiter,
        headers=STEAM_API_HEADERS,
    )

    if not data:
        return "unclear"

    entry = data.get(str(appid))
    if not isinstance(entry, dict):
        return "unclear"

    if entry.get("success"):
        return "alive"

    # success is false. Distinguish genuinely-missing from rate-limited:
    # genuine 404 still includes a "data" key (possibly {}); rate-limit replies
    # omit "data" entirely. Mirrors the heuristic in metadata.py:_fetch_and_classify.
    if "data" in entry:
        return "delisted"
    return "unclear"


def record_success(db: Session, game: Game) -> None:
    """Reset the per-game failure counter after a successful collector call.

    Safe to call when consecutive_failures is already 0 — no DB write happens
    in that case to avoid touching updated_at unnecessarily.
    """
    if game.consecutive_failures:
        game.consecutive_failures = 0
        db.commit()


async def record_failure(
    client: httpx.AsyncClient,
    db: Session,
    game: Game,
    *,
    threshold: int = DELISTED_THRESHOLD,
) -> bool:
    """Increment the per-game failure counter; probe Steam on threshold.

    Returns:
        True if the game was just marked delisted (so the caller can short-circuit).
        False otherwise — the failure was recorded but the game stays active.

    Probe only fires when count *crosses* the threshold (count == threshold after
    increment), not on every subsequent failure. This caps probe traffic at one
    appdetails call per delisted game ever, plus one per RECHECK_INTERVAL_DAYS.
    """
    game.consecutive_failures = (game.consecutive_failures or 0) + 1
    crossed = game.consecutive_failures == threshold
    db.commit()

    if not crossed:
        return False

    result = await probe_appdetails(client, game.appid)
    if result != "delisted":
        # Either alive (transient failure pattern) or unclear (don't trust the
        # signal). Leave the game active; future failures will retrigger the probe
        # threshold+1 calls later if the pattern persists.
        logger.info(
            f"AppID {game.appid} ({game.title!r}): {threshold} consecutive failures "
            f"but appdetails probe returned {result!r} — leaving active"
        )
        return False

    now = _utcnow()
    game.delisted_at = now
    game.delisted_recheck_at = now + timedelta(days=RECHECK_INTERVAL_DAYS)
    db.commit()
    logger.warning(
        f"AppID {game.appid} ({game.title!r}) marked delisted after {threshold} "
        f"consecutive failures + appdetails success:false confirmation. "
        f"Recheck scheduled for {game.delisted_recheck_at.isoformat()}"
    )
    return True


async def run_delisted_recheck() -> dict:
    """Re-probe delisted games whose recheck date is due.

    Steam occasionally restores region access or republishes pulled titles, so a
    delisted classification isn't permanent. On success:true we clear the flag
    and reset consecutive_failures; on still-delisted we push recheck_at by
    RECHECK_INTERVAL_DAYS. On unclear (network/rate-limit) we leave the entry
    untouched and try again next run.

    Writes a CollectionRun row (job_name="delisted_recheck") so the job is
    visible in /api/runs alongside the other collectors. Returns a summary dict.
    """
    from database import SessionLocal
    from models import CollectionRun

    db = SessionLocal()
    run = CollectionRun(job_name="delisted_recheck", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    calls_at_start = steam_store_limiter.stats["calls_today"]
    rl_at_start = steam_store_limiter.stats["rate_limited_today"]
    reactivated = 0
    still_delisted = 0
    unclear = 0

    try:
        now = _utcnow()
        due = (
            db.query(Game)
            .filter(Game.delisted_at.isnot(None))
            .filter(Game.delisted_recheck_at <= now)
            .all()
        )

        if due:
            logger.info(f"Delisted recheck: {len(due)} games due")
            async with httpx.AsyncClient() as client:
                for game in due:
                    result = await probe_appdetails(client, game.appid)

                    if result == "alive":
                        game.delisted_at = None
                        game.delisted_recheck_at = None
                        game.consecutive_failures = 0
                        reactivated += 1
                        logger.info(f"AppID {game.appid} ({game.title!r}) reactivated — Steam returned success:true")
                    elif result == "delisted":
                        game.delisted_recheck_at = now + timedelta(days=RECHECK_INTERVAL_DAYS)
                        still_delisted += 1
                    else:  # unclear
                        # Leave recheck_at as-is so the next scheduler tick retries this
                        # game. Pushing the recheck forward on a transient outage would
                        # delay reactivation by RECHECK_INTERVAL_DAYS for no good reason.
                        unclear += 1

                    db.commit()
        else:
            logger.info("Delisted recheck: 0 games due")

        run.status = "success"
        run.items_processed = reactivated + still_delisted
        run.items_failed = unclear
        run.finished_at = _utcnow()
        run.api_calls_made = max(0, steam_store_limiter.stats["calls_today"] - calls_at_start)
        run.api_calls_rate_limited = max(
            0, steam_store_limiter.stats["rate_limited_today"] - rl_at_start
        )
        db.commit()

        logger.info(
            f"Delisted recheck complete: {reactivated} reactivated, "
            f"{still_delisted} still delisted, {unclear} unclear"
        )
        return {
            "due": len(due),
            "reactivated": reactivated,
            "still_delisted": still_delisted,
            "unclear": unclear,
        }
    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)[:500]
        run.finished_at = _utcnow()
        db.commit()
        logger.exception("Delisted recheck failed")
        raise
    finally:
        db.close()
