"""Tests for Phase 2.5 per-game failure instrumentation.

Covers:
  - record_failure_event writes a row; swallows DB errors; truncates detail
  - make_fetch_callback produces a callable bound to appid + collector
  - fetch_with_retry on_failure: NOT called on success; called ONCE per
    terminal failure (timeout/connect, 429-exhausted, 5xx-exhausted,
    4xx-permanent, youtube_quota), with correct error_class + status_code
  - prune_old_failures deletes >retain_days rows, keeps fresh ones

Run from backend/: python -m pytest tests/test_instrumentation.py -v
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from database import Base  # noqa: E402
from models import PerGameFailure  # noqa: E402
from collectors import instrumentation  # noqa: E402
from collectors._http import fetch_with_retry  # noqa: E402


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


# ---------------------------------------------------------------------------
# record_failure_event
# ---------------------------------------------------------------------------

def test_record_failure_event_writes_row(db):
    instrumentation.record_failure_event(
        db,
        appid=12345,
        collector="reviews",
        error_class="http_429",
        status_code=429,
        attempts=3,
        detail="rate limited",
    )
    rows = db.query(PerGameFailure).all()
    assert len(rows) == 1
    r = rows[0]
    assert r.appid == 12345
    assert r.collector == "reviews"
    assert r.error_class == "http_429"
    assert r.status_code == 429
    assert r.attempts == 3
    assert r.detail == "rate limited"
    assert r.occurred_at is not None


def test_record_failure_event_truncates_detail(db):
    long_detail = "x" * 5000
    instrumentation.record_failure_event(
        db, appid=1, collector="ccu", error_class="timeout", detail=long_detail
    )
    r = db.query(PerGameFailure).one()
    assert r.detail is not None
    assert len(r.detail) == 500


def test_record_failure_event_swallows_db_errors(db):
    """Instrumentation must never crash the collector. A broken db.add path
    should log + rollback + return cleanly."""
    broken_db = MagicMock()
    broken_db.add.side_effect = RuntimeError("simulated DB explosion")
    # Must not raise.
    instrumentation.record_failure_event(
        broken_db, appid=1, collector="reviews", error_class="timeout"
    )
    broken_db.rollback.assert_called()


# ---------------------------------------------------------------------------
# make_fetch_callback
# ---------------------------------------------------------------------------

def test_make_fetch_callback_records_with_bound_context(db):
    cb = instrumentation.make_fetch_callback(db, appid=99, collector="ccu")
    cb({
        "error_class": "http_5xx",
        "status_code": 503,
        "attempts": 3,
        "detail": "Service unavailable",
    })
    r = db.query(PerGameFailure).one()
    assert r.appid == 99
    assert r.collector == "ccu"
    assert r.error_class == "http_5xx"
    assert r.status_code == 503
    assert r.attempts == 3
    assert r.detail == "Service unavailable"


def test_make_fetch_callback_handles_missing_fields(db):
    """fetch_with_retry's payload should always be complete, but defend anyway."""
    cb = instrumentation.make_fetch_callback(db, appid=99, collector="ccu")
    cb({})  # empty dict
    r = db.query(PerGameFailure).one()
    assert r.error_class == "unknown"
    assert r.status_code is None
    assert r.attempts == 1


# ---------------------------------------------------------------------------
# fetch_with_retry — on_failure callback hook
# ---------------------------------------------------------------------------

def _mock_client(responses):
    """Build a MagicMock httpx.AsyncClient that returns the given iterable of
    responses on successive .get() calls. Each response is either:
      - a (status_code, json_dict, headers_dict) tuple
      - an Exception class (raised on that call)
    """
    client = MagicMock()
    iter_responses = iter(responses)

    async def _get(url, params=None, headers=None, timeout=None):
        item = next(iter_responses)
        if isinstance(item, type) and issubclass(item, BaseException):
            raise item("simulated")
        status, payload, hdrs = item
        resp = MagicMock()
        resp.status_code = status
        resp.json.return_value = payload
        resp.headers = hdrs or {}
        return resp

    client.get = _get
    return client


def test_fetch_on_failure_not_called_on_success():
    client = _mock_client([(200, {"ok": True}, {})])
    captured = []
    result = run(fetch_with_retry(
        client, "http://example.com",
        on_failure=lambda ctx: captured.append(ctx),
    ))
    assert result == {"ok": True}
    assert captured == []


def test_fetch_on_failure_called_once_on_4xx_permanent():
    client = _mock_client([(404, {}, {})])
    captured = []
    result = run(fetch_with_retry(
        client, "http://example.com",
        on_failure=lambda ctx: captured.append(ctx),
    ))
    assert result is None
    assert len(captured) == 1
    assert captured[0]["error_class"] == "http_4xx_not_429"
    assert captured[0]["status_code"] == 404
    assert captured[0]["attempts"] == 1


def test_fetch_on_failure_called_once_after_429_retries_exhausted():
    # All 3 attempts return 429.
    client = _mock_client([(429, {}, {"Retry-After": "0"})] * 3)
    captured = []
    result = run(fetch_with_retry(
        client, "http://example.com", max_retries=3,
        on_failure=lambda ctx: captured.append(ctx),
    ))
    assert result is None
    assert len(captured) == 1
    assert captured[0]["error_class"] == "http_429"
    assert captured[0]["status_code"] == 429
    assert captured[0]["attempts"] == 3


def test_fetch_on_failure_called_once_after_5xx_retries_exhausted():
    client = _mock_client([(503, {}, {})] * 3)
    captured = []
    result = run(fetch_with_retry(
        client, "http://example.com", max_retries=3,
        on_failure=lambda ctx: captured.append(ctx),
    ))
    assert result is None
    assert len(captured) == 1
    assert captured[0]["error_class"] == "http_5xx"
    assert captured[0]["status_code"] == 503
    assert captured[0]["attempts"] == 3


def test_fetch_on_failure_called_once_on_timeout_exhausted():
    client = _mock_client([httpx.TimeoutException] * 3)
    captured = []
    result = run(fetch_with_retry(
        client, "http://example.com", max_retries=3,
        on_failure=lambda ctx: captured.append(ctx),
    ))
    assert result is None
    assert len(captured) == 1
    assert captured[0]["error_class"] == "timeout"
    assert captured[0]["status_code"] is None
    assert captured[0]["attempts"] == 3


def test_fetch_on_failure_called_once_on_connect_error_exhausted():
    client = _mock_client([httpx.ConnectError] * 3)
    captured = []
    result = run(fetch_with_retry(
        client, "http://example.com", max_retries=3,
        on_failure=lambda ctx: captured.append(ctx),
    ))
    assert result is None
    assert len(captured) == 1
    assert captured[0]["error_class"] == "connect_error"


def test_fetch_no_on_failure_param_does_not_break_existing_callers():
    """Sanity: omitting on_failure entirely (the default) keeps the function
    behaving exactly as before."""
    client = _mock_client([(500, {}, {})] * 3)
    result = run(fetch_with_retry(client, "http://example.com", max_retries=3))
    assert result is None  # behavior unchanged


def test_fetch_on_failure_called_after_eventual_success_no_call():
    """Transient failure then success should NOT trigger on_failure."""
    client = _mock_client([
        (500, {}, {}),               # attempt 1: 5xx, retry
        (200, {"ok": True}, {}),     # attempt 2: success
    ])
    captured = []
    result = run(fetch_with_retry(
        client, "http://example.com", max_retries=3,
        on_failure=lambda ctx: captured.append(ctx),
    ))
    assert result == {"ok": True}
    assert captured == []


def test_fetch_on_failure_called_once_on_youtube_quota_exhausted():
    """YouTube quotaExceeded returns None immediately and must fire on_failure."""
    client = _mock_client([
        (403, {"error": {"errors": [{"reason": "quotaExceeded"}]}}, {}),
    ])
    captured = []
    result = run(fetch_with_retry(
        client, "https://www.googleapis.com/youtube/v3/search",
        on_failure=lambda ctx: captured.append(ctx),
    ))
    assert result is None
    assert len(captured) == 1
    assert captured[0]["error_class"] == "youtube_quota"
    assert captured[0]["status_code"] == 403
    assert captured[0]["detail"] == "quotaExceeded"
    # Reset the global state the function mutates so it doesn't leak between tests.
    import collectors._http as _http
    _http._youtube_quota_exhausted = False


# ---------------------------------------------------------------------------
# prune_old_failures
# ---------------------------------------------------------------------------

def test_prune_deletes_old_rows_keeps_fresh(db):
    now = datetime.now(timezone.utc)
    db.add(PerGameFailure(
        appid=1, collector="ccu", error_class="timeout",
        occurred_at=now - timedelta(days=60),
    ))
    db.add(PerGameFailure(
        appid=2, collector="ccu", error_class="timeout",
        occurred_at=now - timedelta(days=10),
    ))
    db.commit()

    deleted = instrumentation.prune_old_failures(db, retain_days=30)
    assert deleted == 1

    remaining = db.query(PerGameFailure).all()
    assert len(remaining) == 1
    assert remaining[0].appid == 2


def test_prune_returns_zero_when_table_empty(db):
    assert instrumentation.prune_old_failures(db, retain_days=30) == 0
