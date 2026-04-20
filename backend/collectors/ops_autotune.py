"""OPS Auto-Tuning — Signal Quality Diagnostics

Analyzes component coverage, discriminative power, and correlation
to recommend weight adjustments. Runs as a diagnostic — does NOT
automatically change weights.

Approach:
1. Coverage check: what % of games have data for each component?
   → Components below 10% coverage get weight → 0 (redistribute)
2. Discrimination check: does the component spread scores or cluster?
   → Measured by coefficient of variation (std/mean). Low CV = noise.
3. Correlation check: are two components redundant?
   → High Pearson correlation (>0.85) suggests merging or dropping one.
4. Produces a diagnostic report + suggested weight vector.

Usage:
    from collectors.ops_autotune import run_ops_diagnostics
    report = run_ops_diagnostics()
    print(report["summary"])
    print(report["suggested_weights"])
"""
from __future__ import annotations

import logging
import math
from datetime import date

from database import SessionLocal
from models import OpsScore

logger = logging.getLogger(__name__)

COMPONENTS = [
    ("velocity", "velocity_component"),
    ("decay", "decay_component"),
    ("review", "review_component"),
    ("youtube", "youtube_component"),
    ("ccu", "ccu_component"),
    ("sentiment", "sentiment_component"),   # v5 new
    ("twitch", "twitch_component"),          # v5 new
]

# Minimum coverage to keep a component active (below this → weight 0)
MIN_COVERAGE_PCT = 10.0

# Minimum coefficient of variation to consider a component discriminative
MIN_CV = 0.20


def _pearson(xs: list[float], ys: list[float]) -> float:
    """Compute Pearson correlation coefficient."""
    n = len(xs)
    if n < 5:
        return 0.0
    mx = sum(xs) / n
    my = sum(ys) / n
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs) / n)
    sy = math.sqrt(sum((y - my) ** 2 for y in ys) / n)
    if sx == 0 or sy == 0:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (n * sx * sy)


def run_ops_diagnostics(target_date: date | None = None) -> dict:
    """Analyze OPS component quality and suggest weight adjustments.

    Returns a dict with:
      - coverage: {component: pct} — what % of scored games have this component
      - discrimination: {component: cv} — coefficient of variation (spread)
      - correlations: {(a, b): r} — pairwise Pearson correlations
      - suggested_weights: {component: weight} — recommended weights
      - summary: str — human-readable diagnostic
    """
    db = SessionLocal()
    try:
        if target_date is None:
            target_date = date.today()

        scores = (
            db.query(OpsScore)
            .filter(OpsScore.score_date == target_date)
            .all()
        )

        if not scores:
            return {"error": f"No OPS scores for {target_date}"}

        total = len(scores)
        lines = [f"OPS Diagnostics for {target_date} ({total} games scored)\n"]

        # ── 1. Coverage ──────────────────────────────────────────────
        coverage = {}
        component_values: dict[str, list[float]] = {name: [] for name, _ in COMPONENTS}

        for name, field in COMPONENTS:
            values = [getattr(s, field) for s in scores if getattr(s, field) is not None]
            coverage[name] = (len(values) / total) * 100 if total > 0 else 0
            component_values[name] = values

        lines.append("── COVERAGE ──")
        for name, pct in sorted(coverage.items(), key=lambda x: -x[1]):
            status = "✓" if pct >= MIN_COVERAGE_PCT else "✗ BELOW THRESHOLD"
            lines.append(f"  {name:12s}: {pct:5.1f}% ({len(component_values[name]):3d}/{total}) {status}")

        # ── 2. Discrimination (CV) ───────────────────────────────────
        discrimination = {}
        lines.append("\n── DISCRIMINATION (Coefficient of Variation) ──")
        for name, values in component_values.items():
            if len(values) < 10:
                discrimination[name] = 0.0
                lines.append(f"  {name:12s}: N/A (too few values)")
                continue
            mean = sum(values) / len(values)
            if mean == 0:
                discrimination[name] = 0.0
                lines.append(f"  {name:12s}: N/A (mean = 0)")
                continue
            std = math.sqrt(sum((v - mean) ** 2 for v in values) / len(values))
            cv = std / mean
            discrimination[name] = cv
            status = "✓ spreads scores" if cv >= MIN_CV else "⚠ low variance"
            lines.append(f"  {name:12s}: CV={cv:.3f} (mean={mean:.3f}, std={std:.3f}) {status}")

        # ── 3. Pairwise correlation ──────────────────────────────────
        correlations = {}
        lines.append("\n── PAIRWISE CORRELATIONS ──")
        names = [n for n, _ in COMPONENTS]
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                a, b = names[i], names[j]
                # Build aligned pairs where both have values
                paired = [
                    (getattr(s, COMPONENTS[i][1]), getattr(s, COMPONENTS[j][1]))
                    for s in scores
                    if getattr(s, COMPONENTS[i][1]) is not None
                    and getattr(s, COMPONENTS[j][1]) is not None
                ]
                if len(paired) < 10:
                    lines.append(f"  {a:8s} × {b:8s}: N/A (< 10 paired observations)")
                    continue
                xs, ys = zip(*paired)
                r = _pearson(list(xs), list(ys))
                correlations[(a, b)] = r
                flag = " ⚠ REDUNDANT" if abs(r) > 0.85 else ""
                lines.append(f"  {a:8s} × {b:8s}: r={r:+.3f}{flag}")

        # ── 4. Suggest weights ───────────────────────────────────────
        from config import settings
        current_weights = {
            "velocity": settings.ops_velocity_weight,
            "decay": settings.ops_decay_weight,
            "review": settings.ops_review_weight,
            "youtube": settings.ops_youtube_weight,
            "ccu": settings.ops_ccu_weight,
            "sentiment": settings.ops_sentiment_weight,
            "twitch": settings.ops_twitch_weight,
        }

        suggested = {}
        for name in names:
            w = current_weights.get(name, 0.0)
            # Zero out if below coverage threshold
            if coverage[name] < MIN_COVERAGE_PCT:
                suggested[name] = 0.0
                continue
            # Penalize low-discrimination components (halve weight)
            if discrimination[name] < MIN_CV and len(component_values[name]) >= 10:
                w *= 0.5
            suggested[name] = w

        # Normalize suggested weights to sum to 1.0
        total_w = sum(suggested.values())
        if total_w > 0:
            suggested = {k: round(v / total_w, 3) for k, v in suggested.items()}

        lines.append("\n── WEIGHT RECOMMENDATIONS ──")
        lines.append(f"  {'Component':12s} {'Current':>8s} {'Suggested':>10s} {'Reason':>30s}")
        for name in names:
            cur = current_weights[name]
            sug = suggested[name]
            if coverage[name] < MIN_COVERAGE_PCT:
                reason = f"coverage {coverage[name]:.0f}% < {MIN_COVERAGE_PCT:.0f}%"
            elif discrimination[name] < MIN_CV and len(component_values[name]) >= 10:
                reason = f"low discrimination (CV={discrimination[name]:.3f})"
            elif abs(cur - sug) > 0.02:
                reason = "rebalanced from zero-outs"
            else:
                reason = "OK"
            lines.append(f"  {name:12s} {cur:8.3f} {sug:10.3f}   {reason}")

        summary = "\n".join(lines)
        logger.info(summary)

        return {
            "date": str(target_date),
            "total_scored": total,
            "coverage": coverage,
            "discrimination": discrimination,
            "correlations": {f"{a}×{b}": r for (a, b), r in correlations.items()},
            "current_weights": current_weights,
            "suggested_weights": suggested,
            "summary": summary,
        }

    finally:
        db.close()
