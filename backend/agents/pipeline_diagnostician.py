"""Agent 3: Pipeline Failure Diagnostician

Called by stale_run_watchdog() when a job is marked stale.
Diagnoses WHY the job stalled (quota exhaustion, network, rate limit, bug)
and writes a pipeline_incidents record with recommended action.

For auto-recoverable incidents (quota resets, transient network), the agent
can schedule a retry. For non-recoverable ones, it surfaces via Sentry.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import anthropic

from config import settings
from database import SessionLocal

logger = logging.getLogger(__name__)

_AGENT_TIMEOUT = 30
_LOG_TAIL_LINES = 200

# Categories the agent can assign
ROOT_CAUSE_CATEGORIES = [
    "api_quota",       # YouTube/Reddit daily quota exhausted
    "rate_limit",      # Steam/SteamSpy rate limiting
    "network",         # Connection timeout, DNS failure
    "db_lock",         # SQLite busy timeout
    "auth_failure",    # Twitch/Reddit OAuth token expired
    "bug",             # Code exception, unexpected data shape
    "unknown",
]


def _read_log_tail(lines: int = _LOG_TAIL_LINES) -> str:
    """Read the last N lines from the application log if available."""
    for log_path in [
        Path("horror_radar.log"),
        Path("logs/app.log"),
        Path("/var/log/horror_radar.log"),
    ]:
        if log_path.exists():
            try:
                with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                    all_lines = f.readlines()
                return "".join(all_lines[-lines:])
            except Exception:
                pass
    return "(log file not found)"


def diagnose_pipeline_failure(job_name: str, error_message: str | None, started_at: datetime) -> None:
    """Diagnose a stale pipeline job and write to pipeline_incidents.

    Called by stale_run_watchdog() for each job that just went stale.
    Non-blocking: all failures are caught and logged.
    """
    if not settings.anthropic_api_key:
        logger.warning("pipeline_diagnostician: ANTHROPIC_API_KEY not set, skipping diagnosis")
        return

    # --- Phase 1: gather context ---
    db = SessionLocal()
    try:
        from sqlalchemy import text
        # Last 5 runs of this job
        history = db.execute(text(
            "SELECT job_name, status, error_message, started_at, finished_at "
            "FROM collection_runs WHERE job_name = :name "
            "ORDER BY started_at DESC LIMIT 5"
        ), {"name": job_name}).fetchall()

        # Any other jobs that went stale/failed recently (could indicate system-wide issue)
        recent_failures = db.execute(text(
            "SELECT job_name, status, error_message, started_at "
            "FROM collection_runs WHERE status IN ('stale','failed') "
            "AND started_at > datetime('now', '-24 hours') "
            "ORDER BY started_at DESC LIMIT 10"
        )).fetchall()
    finally:
        db.close()

    log_tail = _read_log_tail()

    history_data = [
        {
            "job": r.job_name, "status": r.status,
            "error": r.error_message, "started": str(r.started_at),
            "finished": str(r.finished_at),
        }
        for r in history
    ]
    failures_data = [
        {"job": r.job_name, "status": r.status, "error": r.error_message, "started": str(r.started_at)}
        for r in recent_failures
    ]

    # --- Phase 2: call Claude ---
    prompt = f"""You are diagnosing why a data pipeline job went stale (ran for >2 hours without completing).

STALE JOB: {job_name}
Started at: {started_at}
Last error message: {error_message or '(none)'}

JOB HISTORY (last 5 runs):
{json.dumps(history_data, indent=2)}

OTHER RECENT FAILURES (last 24h):
{json.dumps(failures_data, indent=2)}

APPLICATION LOG (last {_LOG_TAIL_LINES} lines):
{log_tail[-3000:]}

Root cause categories: {ROOT_CAUSE_CATEGORIES}

Diagnose and respond with a JSON object:
{{
  "root_cause_category": "<one of the categories above>",
  "diagnosis": "<1-2 sentences: what happened and what caused it>",
  "recommended_action": "<what to do to fix it>",
  "auto_recoverable": true | false
}}

auto_recoverable = true only if the issue resolves itself without intervention
(e.g., YouTube quota resets at midnight UTC, a transient network hiccup).

Only return the JSON object, no other text."""

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            timeout=_AGENT_TIMEOUT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        diagnosis = json.loads(raw)
    except Exception as e:
        logger.warning(f"pipeline_diagnostician: API call failed: {e}")
        diagnosis = {
            "root_cause_category": "unknown",
            "diagnosis": f"Agent unavailable: {e}",
            "recommended_action": "Check logs manually",
            "auto_recoverable": False,
        }

    # --- Phase 3: write to pipeline_incidents ---
    db = SessionLocal()
    try:
        from sqlalchemy import text as sql_text
        db.execute(sql_text(
            "INSERT INTO pipeline_incidents "
            "(job_name, detected_at, root_cause_category, diagnosis_text, "
            "recommended_action, auto_recoverable) "
            "VALUES (:job, :det, :cat, :diag, :action, :recoverable)"
        ), {
            "job": job_name,
            "det": datetime.now(timezone.utc),
            "cat": diagnosis.get("root_cause_category", "unknown"),
            "diag": diagnosis.get("diagnosis", ""),
            "action": diagnosis.get("recommended_action", ""),
            "recoverable": 1 if diagnosis.get("auto_recoverable") else 0,
        })
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"pipeline_diagnostician: DB write failed: {e}")
    finally:
        db.close()

    logger.info(
        f"pipeline_diagnostician: {job_name} → {diagnosis.get('root_cause_category')} — "
        f"{diagnosis.get('diagnosis')} | auto_recoverable={diagnosis.get('auto_recoverable')}"
    )

    # Surface non-recoverable incidents via Sentry
    if not diagnosis.get("auto_recoverable"):
        try:
            import sentry_sdk
            if settings.sentry_dsn:
                sentry_sdk.capture_message(
                    f"Pipeline incident: {job_name} — {diagnosis.get('root_cause_category')}: "
                    f"{diagnosis.get('diagnosis')}",
                    level="error",
                )
        except ImportError:
            pass
