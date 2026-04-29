"""Agent 2: OPS Weight Advisor

Reads the weekly ops_autotune diagnostic report and reasons about whether
the suggested weight changes are warranted. Writes a pending proposal to
ops_weight_history for human approval.

Runs Monday at 06:30 UTC, after ops_diagnostics_job at 06:00.
Apply approved changes via: POST /admin/ops-weights/apply/{id}

Guard rails (enforced whether human-approved or auto-applied):
  - No single weight changes by more than 0.05 in one step
  - Total absolute delta across all weights capped at 0.15
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import anthropic

from config import settings
from database import SessionLocal

logger = logging.getLogger(__name__)

_AGENT_TIMEOUT = 30
_MAX_SINGLE_DELTA = 0.05
_MAX_TOTAL_DELTA = 0.15


def _clamp_weights(current: dict, suggested: dict) -> dict:
    """Apply guard rails: cap per-weight delta and total delta."""
    clamped = {}
    for k, sug in suggested.items():
        cur = current.get(k, 0.0)
        delta = sug - cur
        delta = max(-_MAX_SINGLE_DELTA, min(_MAX_SINGLE_DELTA, delta))
        clamped[k] = round(cur + delta, 4)

    # Check total delta
    total_delta = sum(abs(clamped.get(k, 0) - current.get(k, 0)) for k in current)
    if total_delta > _MAX_TOTAL_DELTA:
        scale = _MAX_TOTAL_DELTA / total_delta
        clamped = {k: round(current.get(k, 0) + (clamped.get(k, current.get(k, 0)) - current.get(k, 0)) * scale, 4) for k in current}

    # Re-normalize to sum to 1.0
    total = sum(clamped.values())
    if total > 0:
        clamped = {k: round(v / total, 4) for k, v in clamped.items()}

    return clamped


def run_ops_weight_advisor() -> dict:
    """Read latest diagnostic, reason about weights, write pending proposal.

    Returns {"status": "proposed" | "no_change" | "skipped", "id": int | None}.
    """
    if not settings.anthropic_api_key:
        logger.warning("ops_weight_advisor: ANTHROPIC_API_KEY not set, skipping")
        return {"status": "skipped", "id": None}

    # --- Phase 1: read diagnostic + recent history ---
    from collectors.ops_autotune import run_ops_diagnostics
    try:
        report = run_ops_diagnostics()
    except Exception as e:
        logger.warning(f"ops_weight_advisor: could not run diagnostics: {e}")
        return {"status": "skipped", "id": None}

    if "error" in report:
        logger.info(f"ops_weight_advisor: diagnostic returned error: {report['error']}")
        return {"status": "skipped", "id": None}

    db = SessionLocal()
    try:
        from sqlalchemy import text
        recent_history = db.execute(text(
            "SELECT generated_at, current_weights, suggested_weights, applied_weights, reasoning, status "
            "FROM ops_weight_history ORDER BY generated_at DESC LIMIT 4"
        )).fetchall()
    finally:
        db.close()

    history_context = []
    for row in recent_history:
        history_context.append({
            "date": str(row.generated_at),
            "current": row.current_weights,
            "suggested": row.suggested_weights,
            "applied": row.applied_weights,
            "status": row.status,
            "reasoning": row.reasoning,
        })

    # --- Phase 2: call Claude ---
    current_weights = report["current_weights"]
    suggested_weights = report["suggested_weights"]
    coverage = report["coverage"]
    discrimination = report["discrimination"]
    summary = report["summary"]

    prompt = f"""You are advising on OPS scoring weight adjustments for a horror indie game breakout detector.

The OPS system scores games 0-100 based on 7 weighted components. Good weights produce scores that
correctly identify breakout games — games that outperform their peers in the first 90 days.

CURRENT DIAGNOSTIC REPORT:
{summary}

RECENT WEIGHT HISTORY (last 4 proposals):
{json.dumps(history_context, indent=2)}

CURRENT WEIGHTS: {json.dumps(current_weights)}
SUGGESTED WEIGHTS (from algorithm): {json.dumps(suggested_weights)}

Your task: Decide whether to adopt the suggested weights, adopt them partially, or hold.

Consider:
1. Is the diagnostic sample representative? (Were there unusual releases this week?)
2. Are any components repeatedly flagged across multiple weeks (more reliable signal)?
3. Are the suggested changes gradual improvements or drastic swings?
4. Does holding make sense if the data is noisy or the sample is small?

Respond with a JSON object:
{{
  "decision": "adopt" | "partial" | "hold",
  "proposed_weights": {{<component>: <weight>, ...}},  // your proposed weights (same keys as current)
  "reasoning": "<2-3 sentences explaining why>"
}}

Only return the JSON object, no other text."""

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            timeout=_AGENT_TIMEOUT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        advice = json.loads(raw)
    except Exception as e:
        logger.warning(f"ops_weight_advisor: API call failed: {e}")
        return {"status": "skipped", "id": None}

    decision = advice.get("decision", "hold")
    if decision == "hold":
        logger.info("ops_weight_advisor: decided to hold weights (no change)")
        return {"status": "no_change", "id": None}

    proposed = advice.get("proposed_weights", suggested_weights)
    clamped = _clamp_weights(current_weights, proposed)
    reasoning = advice.get("reasoning", "")

    # --- Phase 3: write proposal to DB ---
    db = SessionLocal()
    try:
        from sqlalchemy import text as sql_text
        result = db.execute(sql_text(
            "INSERT INTO ops_weight_history "
            "(generated_at, diagnostic_date, current_weights, suggested_weights, reasoning, status) "
            "VALUES (:gen_at, :diag_date, :cur, :sug, :reasoning, 'pending')"
        ), {
            "gen_at": datetime.now(timezone.utc),
            "diag_date": report["date"],
            "cur": json.dumps(current_weights),
            "sug": json.dumps(clamped),
            "reasoning": reasoning,
        })
        db.commit()
        new_id = result.lastrowid
    except Exception as e:
        db.rollback()
        logger.warning(f"ops_weight_advisor: DB write failed: {e}")
        return {"status": "skipped", "id": None}
    finally:
        db.close()

    logger.info(f"ops_weight_advisor: proposal #{new_id} written (status=pending). Reasoning: {reasoning}")
    return {"status": "proposed", "id": new_id}
