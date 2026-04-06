"""ops_baseline.py — Dump current ops_scores baseline to CSV.

Queries all current ops_scores records (latest per game) and exports to
ops_v5_baseline.csv for use as a comparison baseline before v6 production rollout.

Note: The local horrorindie.db contains formula_version=4 scores (not v5).
The column name "v5_baseline" is used for consistency with the task plan,
even though the actual formula versions present are v4. Production server
may differ. This script captures whatever is currently in ops_scores.

Usage (from backend/):
    python3 scripts/ops_baseline.py
"""

import csv
import os
import sys

# Allow running from backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
from datetime import date

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "horrorindie.db")
# If run from backend/ directory:
_local_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "horrorindie.db")
if os.path.exists(_local_db):
    DB_PATH = os.path.normpath(_local_db)

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ops_v5_baseline.csv")


def dump_baseline():
    if not os.path.exists(DB_PATH):
        print(f"ERROR: DB not found at {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Latest ops_score per game (max score_date per appid)
    cur.execute("""
        SELECT
            o.appid,
            g.title,
            o.score            AS v5_score,
            o.confidence       AS v5_confidence,
            o.formula_version,
            o.score_date       AS snapshot_date,
            o.raw_ops
        FROM ops_scores o
        JOIN games g ON g.appid = o.appid
        WHERE o.score_date = (
            SELECT MAX(o2.score_date)
            FROM ops_scores o2
            WHERE o2.appid = o.appid
        )
        ORDER BY o.score DESC
    """)
    rows = cur.fetchall()
    conn.close()

    fieldnames = ["appid", "title", "v5_score", "v5_confidence", "formula_version", "snapshot_date", "raw_ops"]

    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(dict(row))

    print(f"Baseline dump complete.")
    print(f"  Games exported : {len(rows)}")
    print(f"  Output         : {OUTPUT_PATH}")

    # Summary of formula versions present
    versions = {}
    for row in rows:
        v = row["formula_version"]
        versions[v] = versions.get(v, 0) + 1
    print(f"  Formula versions in baseline: {versions}")

    scores = [row["v5_score"] for row in rows if row["v5_score"] is not None]
    if scores:
        scores.sort()
        n = len(scores)
        print(f"  Score range    : {min(scores):.1f} – {max(scores):.1f}")
        median = scores[n // 2] if n % 2 == 1 else (scores[n // 2 - 1] + scores[n // 2]) / 2
        print(f"  Median score   : {median:.1f}")
        above_60 = sum(1 for s in scores if s >= 60)
        print(f"  Scores >= 60   : {above_60} ({100*above_60/n:.1f}%)")


if __name__ == "__main__":
    dump_baseline()
