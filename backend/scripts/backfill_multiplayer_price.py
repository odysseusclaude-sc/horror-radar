"""Backfill is_multiplayer and original_price_usd for existing games.

Fetches Steam appdetails for each game in the DB and populates:
  - games.is_multiplayer  — True if any multiplayer category present
  - games.original_price_usd — pre-discount price from price_overview.initial

Steam category IDs that indicate multiplayer:
  1  = Multi-player
  9  = Co-op
  36 = Online Multi-Player
  38 = Online Co-Op

Usage:
    # Dry-run: print changes without writing to DB
    python3 backfill_multiplayer_price.py --dry-run

    # Apply changes
    python3 backfill_multiplayer_price.py

Rate limit: uses steam_limiter (1.5s between requests) to respect Steam API.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

import httpx

# Ensure backend/ is on the path when run as a script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from collectors._http import fetch_with_retry, steam_limiter
from database import SessionLocal
from models import Game

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

STEAM_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails"

# Steam category IDs that indicate a multiplayer game
MULTIPLAYER_CATEGORY_IDS = {1, 9, 36, 38}


async def _fetch_appdetails(client: httpx.AsyncClient, appid: int) -> dict | None:
    """Fetch Steam appdetails for a single appid. Returns the data dict or None."""
    data = await fetch_with_retry(
        client,
        STEAM_APPDETAILS_URL,
        params={"appids": str(appid), "cc": "us", "l": "en"},
        limiter=steam_limiter,
    )
    if not data:
        return None
    app_data = data.get(str(appid), {})
    if not app_data.get("success"):
        return None
    return app_data.get("data")


def _parse_is_multiplayer(app_data: dict) -> bool:
    """Return True if any Steam category indicates multiplayer."""
    categories = app_data.get("categories", [])
    for cat in categories:
        if cat.get("id") in MULTIPLAYER_CATEGORY_IDS:
            return True
    return False


def _parse_original_price(app_data: dict) -> float | None:
    """Return original (pre-discount) price in USD, or None if free/unavailable."""
    price_overview = app_data.get("price_overview")
    if not price_overview:
        # Free game or no price data
        return None
    initial = price_overview.get("initial")  # cents (e.g. 1299 = $12.99)
    if initial is None:
        return None
    return round(initial / 100.0, 2)


async def run_backfill(dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        games = db.query(Game).order_by(Game.appid).all()
        total = len(games)
        logger.info(f"Found {total} games to process")

        updates: list[dict] = []
        skipped = 0
        errors = 0

        async with httpx.AsyncClient(timeout=30.0) as client:
            for i, game in enumerate(games, 1):
                logger.info(f"[{i}/{total}] appid={game.appid} title={game.title[:40]!r}")

                app_data = await _fetch_appdetails(client, game.appid)
                if not app_data:
                    logger.warning(f"  → No appdetails for appid={game.appid} — skipping")
                    skipped += 1
                    continue

                new_is_multiplayer = _parse_is_multiplayer(app_data)
                new_original_price = _parse_original_price(app_data)

                changed_fields: list[str] = []
                if game.is_multiplayer != new_is_multiplayer:
                    changed_fields.append(
                        f"is_multiplayer: {game.is_multiplayer} → {new_is_multiplayer}"
                    )
                if new_original_price is not None and game.original_price_usd != new_original_price:
                    changed_fields.append(
                        f"original_price_usd: {game.original_price_usd} → {new_original_price}"
                    )

                if changed_fields:
                    logger.info(f"  → Changes: {', '.join(changed_fields)}")
                    updates.append({
                        "appid": game.appid,
                        "title": game.title,
                        "is_multiplayer": new_is_multiplayer,
                        "original_price_usd": new_original_price,
                        "changed": changed_fields,
                    })
                    if not dry_run:
                        game.is_multiplayer = new_is_multiplayer
                        if new_original_price is not None:
                            game.original_price_usd = new_original_price
                else:
                    logger.info("  → No changes needed")

        if not dry_run and updates:
            db.commit()
            logger.info(f"Committed {len(updates)} game updates")

    except Exception as e:
        logger.error(f"Backfill failed: {e}", exc_info=True)
        db.rollback()
        errors += 1
    finally:
        db.close()

    # ── Summary Report ───────────────────────────────────────────────────────
    logger.info("")
    logger.info("═══════════════════════════════════════")
    logger.info("BACKFILL SUMMARY")
    logger.info("═══════════════════════════════════════")
    logger.info(f"Total games:    {total}")
    logger.info(f"With changes:   {len(updates)}")
    logger.info(f"Skipped:        {skipped}")
    logger.info(f"Errors:         {errors}")
    logger.info(f"Mode:           {'DRY-RUN (no writes)' if dry_run else 'LIVE (changes committed)'}")
    logger.info("")

    if updates:
        multiplayer_added = sum(1 for u in updates if u["is_multiplayer"] and
                                any("is_multiplayer" in c for c in u["changed"]))
        price_updated = sum(1 for u in updates if u["original_price_usd"] is not None and
                            any("original_price_usd" in c for c in u["changed"]))
        logger.info(f"Multiplayer flag newly set True: {multiplayer_added}")
        logger.info(f"Original price populated/changed: {price_updated}")
        logger.info("")
        logger.info("Games changed:")
        for u in updates:
            logger.info(f"  [{u['appid']}] {u['title'][:40]}")
            for c in u["changed"]:
                logger.info(f"    {c}")


def main():
    parser = argparse.ArgumentParser(
        description="Backfill is_multiplayer and original_price_usd from Steam appdetails"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and compute changes but do NOT write to the database",
    )
    args = parser.parse_args()

    if args.dry_run:
        logger.info("Running in DRY-RUN mode — no database writes")

    asyncio.run(run_backfill(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
