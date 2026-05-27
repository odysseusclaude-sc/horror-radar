"""Dry-run the Phase 2 delisted-game classifier against the live game catalog.

Required reading per CLAUDE.md before committing the classifier:

    "Before committing any change to scoring, tagging, or classification logic,
     run the full dataset through the new logic and diff against the current
     baseline. Report any changed outputs and why."

What this script does:
  1. Pulls the catalog from the deployed API (/api/games, paginated).
  2. For each AppID, probes Steam appdetails with the EXACT same heuristic the
     classifier uses (delisted = success:false WITH a "data" key; alive =
     success:true; unclear = anything else, including the rate-limit shape).
  3. Reports: bucket counts, sample titles per bucket, and an estimate of how
     the classifier would behave once deployed.

It does NOT exercise the consecutive_failures threshold — that's a runtime path
that depends on real failure history we don't have offline. What this measures
is the END STATE: which AppIDs Steam currently considers genuinely missing.
Those are the AppIDs that, after their consecutive_failures cross the
threshold, the live classifier would actually mark as delisted.

Expected runtime: ~1,250 games * 2s pacing = ~42 min. Run once before commit.

Usage:
    python scripts/dry_run_delisted_classifier.py
    python scripts/dry_run_delisted_classifier.py --limit 50  # quick smoke test
    python scripts/dry_run_delisted_classifier.py --base-url http://localhost:8000
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import httpx

# Make backend importable so we reuse the exact probe + limiter the prod path uses.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from collectors.delisted import probe_appdetails  # noqa: E402
from collectors._http import steam_store_limiter  # noqa: E402


DEFAULT_BASE_URL = "http://187.127.103.42"


async def fetch_all_games(base_url: str, page_size: int = 100) -> list[dict]:
    """Page through /api/games and collect every AppID + title."""
    games: list[dict] = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        page = 1
        while True:
            r = await client.get(
                f"{base_url}/api/games",
                params={"page": page, "page_size": page_size},
            )
            r.raise_for_status()
            payload = r.json()
            batch = payload.get("data", [])
            if not batch:
                break
            games.extend(batch)
            total = payload.get("total", 0)
            print(f"  fetched page {page}: {len(batch)} games (running total: {len(games)} / {total})", flush=True)
            if len(games) >= total:
                break
            page += 1
    return games


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL,
                        help=f"API base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--limit", type=int, default=0,
                        help="Probe only the first N games (smoke test). 0 = probe all.")
    parser.add_argument("--out", default="dry_run_delisted_report.json",
                        help="Path to write the full report JSON")
    args = parser.parse_args()

    print(f"Fetching catalog from {args.base_url} ...", flush=True)
    games = await fetch_all_games(args.base_url)
    print(f"Fetched {len(games)} games.\n", flush=True)

    if args.limit:
        games = games[: args.limit]
        print(f"Limiting probe to first {len(games)} games (smoke test).\n", flush=True)

    inner = steam_store_limiter._limiter  # type: ignore[attr-defined]
    pacing_s = inner._min_interval + inner._jitter / 2  # type: ignore[attr-defined]
    eta_min = (len(games) * pacing_s) / 60
    print(f"Probing {len(games)} games via Steam appdetails. ETA ~{eta_min:.1f} min.\n", flush=True)

    buckets: dict[str, list[dict]] = defaultdict(list)
    started = time.time()

    async with httpx.AsyncClient(timeout=30.0) as client:
        for i, game in enumerate(games, 1):
            appid = game["appid"]
            title = game.get("title", f"AppID:{appid}")
            result = await probe_appdetails(client, appid)
            buckets[result].append({"appid": appid, "title": title})

            if i % 25 == 0 or i == len(games):
                elapsed = time.time() - started
                rate = i / elapsed if elapsed else 0
                remaining = (len(games) - i) / rate if rate else 0
                print(
                    f"  [{i:4d}/{len(games)}] alive={len(buckets['alive']):4d} "
                    f"delisted={len(buckets['delisted']):4d} unclear={len(buckets['unclear']):4d} "
                    f"({rate:.2f} req/s, ~{remaining/60:.1f} min remaining)",
                    flush=True,
                )

    elapsed = time.time() - started

    print("\n" + "=" * 70)
    print("DRY-RUN RESULT")
    print("=" * 70)
    print(f"Total games probed:        {len(games)}")
    print(f"  alive    (success:true): {len(buckets['alive']):4d}  ({100*len(buckets['alive'])/len(games):.1f}%)")
    print(f"  delisted (success:false + data key): {len(buckets['delisted']):4d}  ({100*len(buckets['delisted'])/len(games):.1f}%)")
    print(f"  unclear  (rate-limit / network):     {len(buckets['unclear']):4d}  ({100*len(buckets['unclear'])/len(games):.1f}%)")
    print(f"Elapsed: {elapsed/60:.1f} min")
    print()

    if buckets["delisted"]:
        print("CLASSIFIER IMPACT: these games would be marked delisted by the live classifier")
        print(f"  once their consecutive_failures crosses the threshold ({len(buckets['delisted'])} total).")
        print()
        print("  Sample (first 20):")
        for entry in buckets["delisted"][:20]:
            print(f"    {entry['appid']:>10}  {entry['title']}")
        if len(buckets["delisted"]) > 20:
            print(f"    ... and {len(buckets['delisted']) - 20} more — see {args.out}")
    else:
        print("CLASSIFIER IMPACT: 0 games would be marked delisted. Threshold + probe combo is safe.")

    if buckets["unclear"]:
        print()
        print(f"  Note: {len(buckets['unclear'])} games returned unclear (rate-limit / network).")
        print("  The live classifier leaves these alone — they'll re-trigger on next failure cycle.")

    report = {
        "base_url": args.base_url,
        "probed": len(games),
        "elapsed_sec": elapsed,
        "buckets": {k: v for k, v in buckets.items()},
        "limiter_stats": steam_store_limiter.stats,
    }
    Path(args.out).write_text(json.dumps(report, indent=2))
    print(f"\nFull report written to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
