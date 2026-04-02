"""Weekly Data Analysis Report

Runs every Sunday. Produces a structured analysis of key metrics
to inform OPS formula tuning decisions.

Usage: python3 weekly_analysis.py
Output: writes to reports/weekly_YYYY-MM-DD.md
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, and_

from database import SessionLocal
from models import Game, GameSnapshot, OpsScore, YoutubeVideo, YoutubeChannel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

REPORTS_DIR = Path(__file__).parent / "reports"


def median(vals: list[float]) -> float:
    if not vals:
        return 0.0
    s = sorted(vals)
    n = len(s)
    return s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2


def percentile(vals: list[float], p: int) -> float:
    if not vals:
        return 0.0
    s = sorted(vals)
    k = min(int(len(s) * p / 100), len(s) - 1)
    return s[k]


def fmtnum(n: float) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return f"{n:,.0f}"


def generate_report() -> str:
    db = SessionLocal()
    today = date.today()
    week_ago = today - timedelta(days=7)
    lines: list[str] = []

    def section(title: str):
        lines.append(f"\n## {title}\n")

    def table(headers: list[str], rows: list[list[str]]):
        lines.append("| " + " | ".join(headers) + " |")
        lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
        for row in rows:
            lines.append("| " + " | ".join(str(c) for c in row) + " |")
        lines.append("")

    lines.append(f"# Weekly Analysis Report - {today.isoformat()}")
    lines.append(f"\nGenerated automatically. Data as of {today}.\n")

    # --- 1. DB Overview ---
    section("Database Overview")
    total_games = db.query(Game).count()
    with_release = db.query(Game).filter(Game.release_date.isnot(None)).count()
    with_demo = db.query(Game).filter(Game.has_demo == True).count()
    total_snapshots = db.query(GameSnapshot).count()
    total_ops = db.query(OpsScore).count()
    games_with_ops = db.query(func.count(func.distinct(OpsScore.appid))).scalar()

    # New games this week
    week_ago_dt = datetime(week_ago.year, week_ago.month, week_ago.day, tzinfo=timezone.utc)
    new_this_week = db.query(Game).filter(Game.created_at >= week_ago_dt).count()

    table(
        ["Metric", "Value"],
        [
            ["Total games", str(total_games)],
            ["New this week", str(new_this_week)],
            ["With release date", str(with_release)],
            ["With demo", f"{with_demo} ({with_demo / max(total_games, 1) * 100:.0f}%)"],
            ["Total snapshots", fmtnum(total_snapshots)],
            ["Games with OPS scores", str(games_with_ops)],
            ["Total OPS data points", fmtnum(total_ops)],
        ],
    )

    # --- 2. Review Velocity Baselines ---
    section("Review Velocity Baselines (reviews/day)")
    games = db.query(Game).filter(Game.release_date.isnot(None)).all()

    velocity_buckets: dict[str, list[float]] = {
        "Week 1 (d0-7)": [],
        "Week 2-4 (d14-28)": [],
        "Month 2-3 (d30-90)": [],
    }

    for g in games:
        if not g.release_date:
            continue
        s0 = db.query(GameSnapshot).filter_by(appid=g.appid, snapshot_date=g.release_date).first()
        s7 = db.query(GameSnapshot).filter_by(appid=g.appid, snapshot_date=g.release_date + timedelta(days=7)).first()
        s14 = db.query(GameSnapshot).filter_by(appid=g.appid, snapshot_date=g.release_date + timedelta(days=14)).first()
        s28 = db.query(GameSnapshot).filter_by(appid=g.appid, snapshot_date=g.release_date + timedelta(days=28)).first()
        s30 = db.query(GameSnapshot).filter_by(appid=g.appid, snapshot_date=g.release_date + timedelta(days=30)).first()
        s90 = db.query(GameSnapshot).filter_by(appid=g.appid, snapshot_date=g.release_date + timedelta(days=90)).first()

        if s7 and s0 and s7.review_count and s0.review_count is not None:
            v = (s7.review_count - s0.review_count) / 7
            if v > 0:
                velocity_buckets["Week 1 (d0-7)"].append(v)
        if s14 and s28 and s14.review_count and s28.review_count:
            v = (s28.review_count - s14.review_count) / 14
            if v >= 0:
                velocity_buckets["Week 2-4 (d14-28)"].append(v)
        if s30 and s90 and s30.review_count and s90.review_count:
            v = (s90.review_count - s30.review_count) / 60
            if v >= 0:
                velocity_buckets["Month 2-3 (d30-90)"].append(v)

    rows = []
    for label, vals in velocity_buckets.items():
        if vals:
            rows.append([
                label, str(len(vals)),
                f"{median(vals):.2f}", f"{percentile(vals, 75):.2f}",
                f"{percentile(vals, 90):.2f}", f"{sum(vals) / len(vals):.2f}",
            ])
    table(["Period", "n", "Median", "p75", "p90", "Mean"], rows)

    # --- 3. Velocity Decay Analysis ---
    section("Velocity Decay (Week 1 vs Week 2-4)")
    lines.append("Games with >50 reviews, sorted by decay rate (least decay = strongest signal).\n")

    latest_sq = db.query(
        GameSnapshot.appid, func.max(GameSnapshot.snapshot_date).label("max_date"),
    ).filter(GameSnapshot.review_count.isnot(None)).group_by(GameSnapshot.appid).subquery()

    top_games = (
        db.query(Game.appid, Game.title, Game.release_date, GameSnapshot.review_count)
        .join(latest_sq, Game.appid == latest_sq.c.appid)
        .join(GameSnapshot, and_(
            GameSnapshot.appid == latest_sq.c.appid,
            GameSnapshot.snapshot_date == latest_sq.c.max_date,
        ))
        .filter(GameSnapshot.review_count > 50)
        .order_by(GameSnapshot.review_count.desc())
        .limit(30)
        .all()
    )

    decay_rows = []
    for appid, title, rd, rc in top_games:
        if not rd:
            continue
        s0 = db.query(GameSnapshot).filter_by(appid=appid, snapshot_date=rd).first()
        s7 = db.query(GameSnapshot).filter_by(appid=appid, snapshot_date=rd + timedelta(days=7)).first()
        s14 = db.query(GameSnapshot).filter_by(appid=appid, snapshot_date=rd + timedelta(days=14)).first()
        s28 = db.query(GameSnapshot).filter_by(appid=appid, snapshot_date=rd + timedelta(days=28)).first()

        v1 = (s7.review_count - (s0.review_count or 0)) / 7 if s7 and s0 and s7.review_count else None
        v2 = (s28.review_count - s14.review_count) / 14 if s14 and s28 and s14.review_count and s28.review_count else None
        decay = round((v2 - v1) / v1 * 100) if v1 and v2 and v1 > 0 else None

        decay_rows.append([
            title[:30],
            str(rc),
            f"{v1:.1f}" if v1 else "--",
            f"{v2:.1f}" if v2 else "--",
            f"{decay}%" if decay is not None else "--",
        ])

    # Sort by decay (least negative first)
    decay_rows.sort(key=lambda r: int(r[4].replace("%", "")) if r[4] != "--" else -999, reverse=True)
    table(["Game", "Reviews", "Wk1 v/d", "Wk2-4 v/d", "Decay"], decay_rows)

    # --- 4. Demo Impact ---
    section("Demo vs No-Demo Performance")

    demo_sq = db.query(Game.appid).filter(Game.has_demo == True).subquery()
    nondemo_sq = db.query(Game.appid).filter(Game.has_demo == False).subquery()

    demo_reviews = db.query(GameSnapshot.review_count).join(
        latest_sq, and_(GameSnapshot.appid == latest_sq.c.appid, GameSnapshot.snapshot_date == latest_sq.c.max_date)
    ).filter(GameSnapshot.appid.in_(db.query(demo_sq.c.appid)), GameSnapshot.review_count > 0).all()
    demo_vals = sorted([r[0] for r in demo_reviews])

    nondemo_reviews = db.query(GameSnapshot.review_count).join(
        latest_sq, and_(GameSnapshot.appid == latest_sq.c.appid, GameSnapshot.snapshot_date == latest_sq.c.max_date)
    ).filter(GameSnapshot.appid.in_(db.query(nondemo_sq.c.appid)), GameSnapshot.review_count > 0).all()
    nondemo_vals = sorted([r[0] for r in nondemo_reviews])

    table(
        ["Group", "n", "Median Rev", "p75", "p90", "Mean"],
        [
            ["Has demo", str(len(demo_vals)), str(median(demo_vals)),
             str(percentile(demo_vals, 75)), str(percentile(demo_vals, 90)),
             f"{sum(demo_vals) / max(len(demo_vals), 1):.0f}"],
            ["No demo", str(len(nondemo_vals)), str(median(nondemo_vals)),
             str(percentile(nondemo_vals, 75)), str(percentile(nondemo_vals, 90)),
             f"{sum(nondemo_vals) / max(len(nondemo_vals), 1):.0f}"],
        ],
    )

    # --- 5. YouTube Coverage Impact ---
    section("YouTube Coverage")

    covered_appids_q = db.query(func.distinct(YoutubeVideo.matched_appid)).filter(
        YoutubeVideo.matched_appid.isnot(None)
    )
    covered_count = covered_appids_q.count()

    covered_reviews = db.query(GameSnapshot.review_count).join(
        latest_sq, and_(GameSnapshot.appid == latest_sq.c.appid, GameSnapshot.snapshot_date == latest_sq.c.max_date)
    ).filter(GameSnapshot.appid.in_(covered_appids_q), GameSnapshot.review_count > 0).all()
    covered_vals = sorted([r[0] for r in covered_reviews])

    uncovered_reviews = db.query(GameSnapshot.review_count).join(
        latest_sq, and_(GameSnapshot.appid == latest_sq.c.appid, GameSnapshot.snapshot_date == latest_sq.c.max_date)
    ).filter(~GameSnapshot.appid.in_(covered_appids_q), GameSnapshot.review_count > 0).all()
    uncovered_vals = sorted([r[0] for r in uncovered_reviews])

    table(
        ["Group", "n", "Median Rev", "p75", "p90"],
        [
            ["YT covered", str(len(covered_vals)), str(median(covered_vals)),
             str(percentile(covered_vals, 75)), str(percentile(covered_vals, 90))],
            ["Not covered", str(len(uncovered_vals)), str(median(uncovered_vals)),
             str(percentile(uncovered_vals, 75)), str(percentile(uncovered_vals, 90))],
        ],
    )

    # Views/subs ratio
    videos = db.query(
        YoutubeVideo.view_count, YoutubeChannel.subscriber_count,
    ).join(YoutubeChannel, YoutubeVideo.channel_id == YoutubeChannel.channel_id).filter(
        YoutubeVideo.matched_appid.isnot(None),
        YoutubeVideo.view_count.isnot(None),
        YoutubeChannel.subscriber_count.isnot(None),
        YoutubeChannel.subscriber_count > 0,
    ).all()

    ratios = sorted([v[0] / v[1] for v in videos])
    if ratios:
        lines.append(f"**Views/Subs ratio** (n={len(ratios)}): "
                     f"median={median(ratios):.3f}, p75={percentile(ratios, 75):.3f}, "
                     f"p90={percentile(ratios, 90):.3f}\n")

    # --- 6. OPS Distribution ---
    section("OPS Score Distribution")

    ops_sq = db.query(
        OpsScore.appid, func.max(OpsScore.score_date).label("md"),
    ).group_by(OpsScore.appid).subquery()

    ops_latest = db.query(OpsScore.score, OpsScore.raw_ops).join(
        ops_sq, and_(OpsScore.appid == ops_sq.c.appid, OpsScore.score_date == ops_sq.c.md)
    ).all()

    capped = sorted([s[0] for s in ops_latest if s[0] is not None])
    raw = sorted([s[1] for s in ops_latest if s[1] is not None])

    if capped:
        at_100 = sum(1 for s in capped if s >= 100)
        table(
            ["Metric", "Median", "p25", "p75", "p90", "At cap (100)"],
            [
                ["Capped", f"{median(capped):.1f}", f"{percentile(capped, 25):.1f}",
                 f"{percentile(capped, 75):.1f}", f"{percentile(capped, 90):.1f}",
                 f"{at_100}/{len(capped)} ({at_100 / len(capped) * 100:.0f}%)"],
                ["Raw", f"{median(raw):.2f}", f"{percentile(raw, 25):.2f}",
                 f"{percentile(raw, 75):.2f}", f"{percentile(raw, 90):.2f}", "--"],
            ],
        )

    # --- 7. Review Score Buckets ---
    section("Review Score vs Performance")

    scored_rows = db.query(
        GameSnapshot.review_count, GameSnapshot.review_score_pct
    ).join(
        latest_sq, and_(GameSnapshot.appid == latest_sq.c.appid, GameSnapshot.snapshot_date == latest_sq.c.max_date)
    ).filter(GameSnapshot.review_count > 10, GameSnapshot.review_score_pct.isnot(None)).all()

    buckets: dict[str, list[int]] = {"95+": [], "80-94": [], "70-79": [], "40-69": [], "<40": []}
    for rc, score in scored_rows:
        if score >= 95:
            buckets["95+"].append(rc)
        elif score >= 80:
            buckets["80-94"].append(rc)
        elif score >= 70:
            buckets["70-79"].append(rc)
        elif score >= 40:
            buckets["40-69"].append(rc)
        else:
            buckets["<40"].append(rc)

    score_rows = []
    for label, vals in buckets.items():
        if vals:
            vals.sort()
            score_rows.append([label, str(len(vals)), str(median(vals)), f"{sum(vals) / len(vals):.0f}"])
    table(["Score Range", "n", "Median Rev", "Mean Rev"], score_rows)

    # --- 8. This Week's Movers ---
    section("This Week's Movers")
    lines.append("Games with largest absolute review growth in the past 7 days.\n")

    # Find games with snapshots from both week_ago and today
    movers = []
    for g in games:
        s_now = db.query(GameSnapshot).filter(
            GameSnapshot.appid == g.appid,
            GameSnapshot.snapshot_date <= today,
            GameSnapshot.review_count.isnot(None),
        ).order_by(GameSnapshot.snapshot_date.desc()).first()

        s_prev = db.query(GameSnapshot).filter(
            GameSnapshot.appid == g.appid,
            GameSnapshot.snapshot_date <= week_ago,
            GameSnapshot.review_count.isnot(None),
        ).order_by(GameSnapshot.snapshot_date.desc()).first()

        if s_now and s_prev and s_now.review_count and s_prev.review_count:
            delta = s_now.review_count - s_prev.review_count
            if delta > 0:
                movers.append((g.title, s_now.review_count, delta, delta / 7))

    movers.sort(key=lambda x: x[2], reverse=True)
    mover_rows = []
    for title, rc, delta, vel in movers[:15]:
        mover_rows.append([title[:30], str(rc), f"+{delta}", f"{vel:.1f}/d"])
    table(["Game", "Total Rev", "7d Delta", "Velocity"], mover_rows)

    # --- 9. Discussion Points ---
    section("Discussion Points for OPS Tuning")
    lines.append("- What is the velocity decay rate telling us about breakout vs flash-in-the-pan?")
    lines.append("- Should OPS weight age-adjusted velocity more heavily?")
    lines.append("- Are there games with low OPS but strong signals elsewhere?")
    lines.append("- Did any creator coverage this week change a game's trajectory?")
    lines.append("- Any new data sources we should consider adding?")
    lines.append("")

    db.close()
    return "\n".join(lines)


def main():
    REPORTS_DIR.mkdir(exist_ok=True)
    today = date.today()
    report = generate_report()
    out_path = REPORTS_DIR / f"weekly_{today.isoformat()}.md"
    out_path.write_text(report)
    logger.info(f"Report written to {out_path}")
    logger.info(f"Report length: {len(report)} chars, {report.count(chr(10))} lines")


if __name__ == "__main__":
    main()
