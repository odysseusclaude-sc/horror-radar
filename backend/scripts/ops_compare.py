"""ops_compare.py — DRY RUN v6 vs current baseline comparison.

Runs the full OPS v6 calculation without writing to the database.
Compares each game's current score (v4/v5 baseline) to the v6 score.
Outputs ops_v5_v6_comparison.csv and prints a summary.

Flags any game with |delta| >= 15.

Usage (from backend/):
    python3 scripts/ops_compare.py
"""

import csv
import json
import os
import statistics
import sys

# Allow running from backend/ directory
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

from datetime import date, datetime, timedelta
from typing import Optional

# Set DB path before importing SQLAlchemy models
os.environ.setdefault("DATABASE_URL", "sqlite:///horrorindie.db")

from database import SessionLocal, init_db
from models import Game, GameSnapshot, OpsScore
from collectors.ops import (
    _compute_raw_ops_for_game,
    _compute_calibration_constant,
    _time_aware_coverage_penalty,
    _get_genre_baselines,
    MIN_BASELINE_GAMES,
)
from config import settings
from sqlalchemy import func

DELTA_THRESHOLD = 15.0
OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ops_v5_v6_comparison.csv")


def _get_current_scores(db) -> dict:
    """Return {appid: (score, confidence, formula_version)} for latest score per game."""
    import sqlite3
    from database import engine
    conn = engine.raw_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT o.appid, o.score, o.confidence, o.formula_version
        FROM ops_scores o
        INNER JOIN (
            SELECT appid, MAX(score_date) AS max_date
            FROM ops_scores
            GROUP BY appid
        ) latest ON o.appid = latest.appid AND o.score_date = latest.max_date
    """)
    rows = cur.fetchall()
    conn.close()
    return {r[0]: (r[1], r[2], r[3]) for r in rows}


def run_comparison():
    # Ensure schema is migrated (idempotent)
    init_db()

    db = SessionLocal()

    try:
        # ── Load current (baseline) scores ────────────────────────────
        current_scores = _get_current_scores(db)
        print(f"Baseline scores loaded: {len(current_scores)} games")

        # ── Cold start guard ──────────────────────────────────────────
        total_with_snapshots = (
            db.query(func.count(func.distinct(GameSnapshot.appid)))
            .filter(GameSnapshot.review_count.isnot(None))
            .scalar()
        )
        if total_with_snapshots < MIN_BASELINE_GAMES:
            print(f"ERROR: Cold start guard — only {total_with_snapshots} games with snapshots "
                  f"(need {MIN_BASELINE_GAMES}). Aborting.")
            return

        # ── Load horror games ─────────────────────────────────────────
        games = db.query(Game).filter(Game.is_horror == True).all()
        print(f"Horror games in DB: {len(games)}")

        today = date.today()
        pass1_results = []

        # ── Pass 1: compute raw v6 OPS for all games (DRY RUN) ───────
        print("Running v6 OPS calculation (DRY RUN — no DB writes)...")
        for game in games:
            try:
                snapshot = (
                    db.query(GameSnapshot)
                    .filter_by(appid=game.appid)
                    .order_by(GameSnapshot.snapshot_date.desc())
                    .first()
                )
                if not snapshot:
                    continue

                days_since_launch = (
                    (today - game.release_date).days if game.release_date else 30
                )
                baselines = _get_genre_baselines(db, days_since_launch)

                # Fallback medians
                if baselines["sample_size"] < MIN_BASELINE_GAMES:
                    baselines["median_reviews"] = max(baselines["median_reviews"], 30.0)
                    if not baselines["median_ccu"]:
                        baselines["median_ccu"] = 5.0
                    if baselines["median_velocity"] is None:
                        baselines["median_velocity"] = 3.0

                result = _compute_raw_ops_for_game(db, game, snapshot, baselines)
                if result is None:
                    continue

                result["game"] = game
                pass1_results.append(result)

            except Exception as e:
                print(f"  WARNING: Error computing v6 for AppID {game.appid} ({game.title}): {e}")

        print(f"Pass 1 complete: {len(pass1_results)} games computed")

        # ── Calibration constant from this run ────────────────────────
        raw_ops_values = [r["raw_ops"] for r in pass1_results if r["raw_ops"] > 0]
        calibration_constant = _compute_calibration_constant(raw_ops_values)
        print(f"v6 calibration constant: {calibration_constant:.3f}")

        # ── Pass 2: finalize v6 scores + compare ─────────────────────
        comparison_rows = []

        for result in pass1_results:
            game = result["game"]
            days_since_launch = result["days_since_launch"]
            raw_ops = result["raw_ops"]
            active_count = result["active_count"]
            has_demo = result["has_demo"]

            coverage_penalty = _time_aware_coverage_penalty(
                days_since_launch, active_count, has_demo
            )
            next_fest_multiplier = 1.10 if (
                getattr(game, "next_fest", False) and days_since_launch <= 30
            ) else 1.00

            v6_score = round(min(
                100.0,
                raw_ops * calibration_constant * coverage_penalty * next_fest_multiplier
            ), 1)

            # Baseline score
            baseline = current_scores.get(game.appid)
            v5_score = baseline[0] if baseline else None
            baseline_version = baseline[2] if baseline else None

            delta = round(v6_score - v5_score, 1) if v5_score is not None else None
            flagged = (abs(delta) >= DELTA_THRESHOLD) if delta is not None else False

            v6_components = {
                "review_momentum": result["review_momentum_component"],
                "sentiment":       result["sentiment_component"],
                "youtube":         result["youtube_component"],
                "live_engagement": result["live_engagement_component"],
                "community_buzz":  result["community_buzz_component"],
                "demo_conversion": result["demo_conversion_component"],
                "discount_demand": result["discount_demand_component"],
                "calibration_constant": round(calibration_constant, 3),
                "coverage_penalty":    round(coverage_penalty, 3),
                "active_count":        active_count,
                "days_since_launch":   days_since_launch,
            }

            comparison_rows.append({
                "appid":            game.appid,
                "title":            game.title,
                "v5_score":         v5_score,
                "v6_score":         v6_score,
                "delta":            delta,
                "baseline_formula": baseline_version,
                "v6_components":    json.dumps(v6_components),
                "flagged":          "YES" if flagged else "",
            })

        # ── Write CSV ─────────────────────────────────────────────────
        fieldnames = ["appid", "title", "v5_score", "v6_score", "delta",
                      "baseline_formula", "v6_components", "flagged"]
        with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(comparison_rows)

        print(f"\nComparison CSV written to: {OUTPUT_PATH}")

        # ── Summary ───────────────────────────────────────────────────
        scored_rows = [r for r in comparison_rows if r["delta"] is not None]
        deltas = [r["delta"] for r in scored_rows]
        flagged_rows = [r for r in scored_rows if r["flagged"] == "YES"]

        print("\n" + "="*60)
        print("OPS v5 → v6 COMPARISON SUMMARY")
        print("="*60)
        print(f"Total games scored (v6)     : {len(comparison_rows)}")
        print(f"Games with baseline to diff : {len(scored_rows)}")
        print(f"Games with no baseline      : {len(comparison_rows) - len(scored_rows)}")
        print(f"Mean delta (v6 - baseline)  : {statistics.mean(deltas):+.1f}")
        print(f"Median delta                : {statistics.median(deltas):+.1f}")
        print(f"Std dev of deltas           : {statistics.stdev(deltas) if len(deltas)>1 else 0:.1f}")
        print(f"Min delta                   : {min(deltas):+.1f}")
        print(f"Max delta                   : {max(deltas):+.1f}")
        print(f"Flagged (|delta| >= {DELTA_THRESHOLD:.0f})    : {len(flagged_rows)}")
        print(f"v6 calibration constant     : {calibration_constant:.3f}")

        # Risers
        risers = sorted(scored_rows, key=lambda r: r["delta"], reverse=True)[:5]
        print("\nTop 5 Risers (v6 score highest gain):")
        for r in risers:
            print(f"  [{r['appid']}] {r['title'][:40]:<40} {r['v5_score']:5.1f} → {r['v6_score']:5.1f}  Δ{r['delta']:+.1f}")

        # Fallers
        fallers = sorted(scored_rows, key=lambda r: r["delta"])[:5]
        print("\nTop 5 Fallers (v6 score highest drop):")
        for r in fallers:
            print(f"  [{r['appid']}] {r['title'][:40]:<40} {r['v5_score']:5.1f} → {r['v6_score']:5.1f}  Δ{r['delta']:+.1f}")

        # Flagged
        if flagged_rows:
            print(f"\nFlagged games (|delta| >= {DELTA_THRESHOLD:.0f}):")
            for r in sorted(flagged_rows, key=lambda r: abs(r["delta"]), reverse=True):
                comps = json.loads(r["v6_components"])
                active = comps.get("active_count", "?")
                days = comps.get("days_since_launch", "?")
                print(f"  [{r['appid']}] {r['title'][:40]:<40} Δ{r['delta']:+.1f}  "
                      f"(age={days}d, active_comps={active})")
        else:
            print(f"\nNo games flagged with |delta| >= {DELTA_THRESHOLD:.0f}.")

        print("="*60)
        return flagged_rows

    finally:
        db.close()


if __name__ == "__main__":
    run_comparison()
