"""Tests for the Phase 2 delisted-game classifier.

Covers:
  - probe_appdetails return semantics for each Steam response shape
  - record_success / record_failure counter mechanics
  - threshold-crossing probe trigger
  - delisted_at set only on confirmed delisted, not on alive/unclear
  - run_delisted_recheck reactivation + push-forward + leave-alone paths

Uses asyncio.run() directly rather than pytest-asyncio so we don't add a
new test-only dependency for one module.

Run from backend/: python -m pytest tests/test_delisted.py -v
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Point the app at an in-memory SQLite BEFORE importing models, so the engine
# fixture below doesn't fight with the prod database URL.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from database import Base  # noqa: E402
from models import Game  # noqa: E402
from collectors import delisted  # noqa: E402


def run(coro):
    """Tiny shim so each test reads like `run(record_failure(...))`."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# DB fixture — fresh in-memory SQLite per test
# ---------------------------------------------------------------------------

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


def _make_game(db, appid: int = 12345, title: str = "Test Game", **overrides) -> Game:
    game = Game(appid=appid, title=title, **overrides)
    db.add(game)
    db.commit()
    db.refresh(game)
    return game


# ---------------------------------------------------------------------------
# probe_appdetails — pure response-shape mapping
# ---------------------------------------------------------------------------

def test_probe_returns_alive_on_success_true():
    with patch("collectors.delisted.fetch_with_retry", new=AsyncMock(return_value={
        "12345": {"success": True, "data": {"name": "Some Game"}}
    })):
        result = run(delisted.probe_appdetails(client=None, appid=12345))
    assert result == "alive"


def test_probe_returns_delisted_on_success_false_with_data_key():
    """Canonical 'genuinely missing' shape — success:false but data key present."""
    with patch("collectors.delisted.fetch_with_retry", new=AsyncMock(return_value={
        "12345": {"success": False, "data": {}}
    })):
        result = run(delisted.probe_appdetails(client=None, appid=12345))
    assert result == "delisted"


def test_probe_returns_unclear_on_success_false_without_data():
    """Rate-limit shape — Steam returns success:false with no data key. Don't trust."""
    with patch("collectors.delisted.fetch_with_retry", new=AsyncMock(return_value={
        "12345": {"success": False}
    })):
        result = run(delisted.probe_appdetails(client=None, appid=12345))
    assert result == "unclear"


def test_probe_returns_unclear_on_none():
    """Network failure / max-retries-exhausted from fetch_with_retry."""
    with patch("collectors.delisted.fetch_with_retry", new=AsyncMock(return_value=None)):
        result = run(delisted.probe_appdetails(client=None, appid=12345))
    assert result == "unclear"


def test_probe_returns_unclear_on_missing_appid_key():
    """Steam returned a payload but for a different AppID. Malformed for us."""
    with patch("collectors.delisted.fetch_with_retry", new=AsyncMock(return_value={
        "99999": {"success": True, "data": {}}
    })):
        result = run(delisted.probe_appdetails(client=None, appid=12345))
    assert result == "unclear"


# ---------------------------------------------------------------------------
# record_success
# ---------------------------------------------------------------------------

def test_record_success_resets_counter(db):
    game = _make_game(db, consecutive_failures=4)
    delisted.record_success(db, game)
    db.refresh(game)
    assert game.consecutive_failures == 0


def test_record_success_is_noop_when_already_zero(db):
    """Avoid bumping updated_at when there's nothing to reset."""
    game = _make_game(db, consecutive_failures=0)
    updated_before = game.updated_at
    delisted.record_success(db, game)
    db.refresh(game)
    assert game.consecutive_failures == 0
    # No commit means updated_at shouldn't have changed.
    assert game.updated_at == updated_before


# ---------------------------------------------------------------------------
# record_failure
# ---------------------------------------------------------------------------

def test_record_failure_increments_counter(db):
    game = _make_game(db, consecutive_failures=2)
    with patch("collectors.delisted.probe_appdetails", new=AsyncMock(return_value="alive")):
        delisted_now = run(delisted.record_failure(client=None, db=db, game=game))
    db.refresh(game)
    assert game.consecutive_failures == 3
    assert delisted_now is False
    assert game.delisted_at is None


def test_record_failure_does_not_probe_below_threshold(db):
    """Probe is expensive; only fire when count CROSSES the threshold."""
    game = _make_game(db, consecutive_failures=0)
    probe_mock = AsyncMock(return_value="delisted")
    with patch("collectors.delisted.probe_appdetails", new=probe_mock):
        run(delisted.record_failure(client=None, db=db, game=game, threshold=5))
    db.refresh(game)
    assert game.consecutive_failures == 1
    probe_mock.assert_not_awaited()


def test_record_failure_probes_exactly_when_crossing_threshold(db):
    game = _make_game(db, consecutive_failures=4)
    probe_mock = AsyncMock(return_value="delisted")
    with patch("collectors.delisted.probe_appdetails", new=probe_mock):
        was_delisted = run(delisted.record_failure(client=None, db=db, game=game, threshold=5))
    db.refresh(game)
    assert game.consecutive_failures == 5
    probe_mock.assert_awaited_once_with(None, game.appid)
    assert was_delisted is True
    assert game.delisted_at is not None
    assert game.delisted_recheck_at is not None
    assert game.delisted_recheck_at > game.delisted_at


def test_record_failure_does_not_mark_delisted_when_probe_alive(db):
    """Threshold crossed but Steam says alive — leave the game active."""
    game = _make_game(db, consecutive_failures=4)
    with patch("collectors.delisted.probe_appdetails", new=AsyncMock(return_value="alive")):
        was_delisted = run(delisted.record_failure(client=None, db=db, game=game, threshold=5))
    db.refresh(game)
    assert was_delisted is False
    assert game.delisted_at is None


def test_record_failure_does_not_mark_delisted_when_probe_unclear(db):
    """Threshold crossed but probe returned unclear — be conservative, don't mark."""
    game = _make_game(db, consecutive_failures=4)
    with patch("collectors.delisted.probe_appdetails", new=AsyncMock(return_value="unclear")):
        was_delisted = run(delisted.record_failure(client=None, db=db, game=game, threshold=5))
    db.refresh(game)
    assert was_delisted is False
    assert game.delisted_at is None


def test_record_failure_probe_fires_only_once_at_threshold(db):
    """Subsequent failures past the threshold should NOT re-probe.

    Avoids hammering Steam appdetails for a game that's already been flagged
    via the probe but the calling collector decided to keep iterating.
    """
    game = _make_game(db, consecutive_failures=5)  # already past threshold
    probe_mock = AsyncMock(return_value="delisted")
    with patch("collectors.delisted.probe_appdetails", new=probe_mock):
        run(delisted.record_failure(client=None, db=db, game=game, threshold=5))
    db.refresh(game)
    assert game.consecutive_failures == 6
    probe_mock.assert_not_awaited()


# ---------------------------------------------------------------------------
# run_delisted_recheck — recheck job behavior
# ---------------------------------------------------------------------------

def test_recheck_reactivates_on_alive(db, monkeypatch):
    now = datetime.now(timezone.utc)
    game = _make_game(
        db,
        delisted_at=now - timedelta(days=40),
        delisted_recheck_at=now - timedelta(days=1),
        consecutive_failures=7,
    )

    _patch_session_factory(monkeypatch, db)
    with patch("collectors.delisted.probe_appdetails", new=AsyncMock(return_value="alive")):
        result = run(delisted.run_delisted_recheck())

    db.expire_all()
    game = db.query(Game).filter_by(appid=game.appid).one()
    assert game.delisted_at is None
    assert game.delisted_recheck_at is None
    assert game.consecutive_failures == 0
    assert result["reactivated"] == 1
    assert result["still_delisted"] == 0


def test_recheck_pushes_recheck_at_when_still_delisted(db, monkeypatch):
    now = datetime.now(timezone.utc)
    original_recheck = now - timedelta(days=1)
    game = _make_game(
        db,
        delisted_at=now - timedelta(days=40),
        delisted_recheck_at=original_recheck,
        consecutive_failures=7,
    )

    _patch_session_factory(monkeypatch, db)
    with patch("collectors.delisted.probe_appdetails", new=AsyncMock(return_value="delisted")):
        result = run(delisted.run_delisted_recheck())

    db.expire_all()
    game = db.query(Game).filter_by(appid=game.appid).one()
    assert game.delisted_at is not None  # still flagged
    # SQLite drops tzinfo on roundtrip — compare naive-to-naive.
    assert game.delisted_recheck_at.replace(tzinfo=None) > original_recheck.replace(tzinfo=None)
    assert result["still_delisted"] == 1
    assert result["reactivated"] == 0


def test_recheck_leaves_unclear_entries_unchanged(db, monkeypatch):
    """Transient probe failure must not push recheck_at — would delay next attempt 30d."""
    now = datetime.now(timezone.utc)
    original_recheck = now - timedelta(days=1)
    game = _make_game(
        db,
        delisted_at=now - timedelta(days=40),
        delisted_recheck_at=original_recheck,
        consecutive_failures=7,
    )

    _patch_session_factory(monkeypatch, db)
    with patch("collectors.delisted.probe_appdetails", new=AsyncMock(return_value="unclear")):
        result = run(delisted.run_delisted_recheck())

    db.expire_all()
    game = db.query(Game).filter_by(appid=game.appid).one()
    assert game.delisted_at is not None
    # Critical: do NOT push recheck_at, so the next scheduler tick retries.
    # SQLite drops tzinfo on roundtrip — compare naive-to-naive.
    assert game.delisted_recheck_at.replace(tzinfo=None) == original_recheck.replace(tzinfo=None)
    assert result["unclear"] == 1


def test_recheck_skips_games_with_future_recheck_at(db, monkeypatch):
    now = datetime.now(timezone.utc)
    _make_game(
        db,
        delisted_at=now - timedelta(days=5),
        delisted_recheck_at=now + timedelta(days=25),  # not due yet
        consecutive_failures=7,
    )

    _patch_session_factory(monkeypatch, db)
    probe_mock = AsyncMock(return_value="alive")
    with patch("collectors.delisted.probe_appdetails", new=probe_mock):
        result = run(delisted.run_delisted_recheck())

    probe_mock.assert_not_awaited()
    assert result["due"] == 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _patch_session_factory(monkeypatch, session):
    """Make run_delisted_recheck's `SessionLocal()` call return our test session.

    The function does `from database import SessionLocal` at call time, so we
    patch the database module's binding.
    """
    import database
    monkeypatch.setattr(database, "SessionLocal", lambda: _NonClosingSession(session))


class _NonClosingSession:
    """Forwards everything to the wrapped session but swallows .close()
    so the test fixture can still inspect state after the call."""
    def __init__(self, inner):
        self._inner = inner

    def __getattr__(self, name):
        return getattr(self._inner, name)

    def close(self):
        pass
