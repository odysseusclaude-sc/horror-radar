"""Regression guard: OPS formula docs must stay in sync with ops.py.

If this test fails, DO NOT silently edit the test — either:
  (a) the code (backend/collectors/ops.py) genuinely changed and CLAUDE.md /
      backend/routers/radar.py OPS_COMPONENT_META must be updated to match, or
  (b) someone edited the docs without updating the code (equally wrong).

Run with:   python -m pytest backend/tests/test_ops_formula.py -v
or:         cd backend && python -m pytest tests/test_ops_formula.py -v
"""
from __future__ import annotations

import ast
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
OPS_PY = REPO_ROOT / "backend" / "collectors" / "ops.py"
RADAR_PY = REPO_ROOT / "backend" / "routers" / "radar.py"
CLAUDE_MD = REPO_ROOT / "CLAUDE.md"


# ── Helpers ────────────────────────────────────────────────────────

def _extract_component_keys_from_ops() -> set[str]:
    """Parse ops.py and return the set of component keys assembled in
    `_compute_raw_ops_for_game()`'s `components = {...}` dict.
    """
    source = OPS_PY.read_text()
    tree = ast.parse(source)

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "_compute_raw_ops_for_game":
            for stmt in ast.walk(node):
                if (
                    isinstance(stmt, ast.Assign)
                    and len(stmt.targets) == 1
                    and isinstance(stmt.targets[0], ast.Name)
                    and stmt.targets[0].id == "components"
                    and isinstance(stmt.value, ast.Dict)
                ):
                    keys: set[str] = set()
                    for k in stmt.value.keys:
                        if isinstance(k, ast.Constant) and isinstance(k.value, str):
                            keys.add(k.value)
                    return keys
    raise AssertionError(
        "Could not locate `components = {...}` dict in "
        "_compute_raw_ops_for_game() — ops.py structure changed."
    )


def _extract_multiplier_from_ops() -> float:
    """Find the default value of `ops_score_multiplier` in config.py."""
    config_py = REPO_ROOT / "backend" / "config.py"
    src = config_py.read_text()
    m = re.search(r"ops_score_multiplier\s*:\s*float\s*=\s*([0-9.]+)", src)
    if not m:
        raise AssertionError(
            "Could not find `ops_score_multiplier` default in backend/config.py"
        )
    return float(m.group(1))


def _extract_meta_keys_from_radar() -> set[str]:
    """Parse radar.py and return the set of `key` fields in OPS_COMPONENT_META.

    OPS_COMPONENT_META uses "reviews" as the meta key for the component that
    ops.py emits under the key "review" (singular). Normalize here so the two
    sets can be compared directly.
    """
    source = RADAR_PY.read_text()
    tree = ast.parse(source)

    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == "OPS_COMPONENT_META"
            and isinstance(node.value, ast.List)
        ):
            keys: set[str] = set()
            for elt in node.value.elts:
                if not isinstance(elt, ast.Dict):
                    continue
                for k, v in zip(elt.keys, elt.values):
                    if (
                        isinstance(k, ast.Constant)
                        and k.value == "key"
                        and isinstance(v, ast.Constant)
                        and isinstance(v.value, str)
                    ):
                        # Normalize the UI-side "reviews" alias back to "review"
                        # so it matches the key produced by ops.py.
                        normalized = "review" if v.value == "reviews" else v.value
                        keys.add(normalized)
            return keys
    raise AssertionError(
        "Could not locate OPS_COMPONENT_META list assignment in radar.py"
    )


def _extract_multiplier_from_claude_md() -> float:
    """Parse CLAUDE.md for a line like `score = min(100, raw_ops * 24)` or
    `score = min(100, raw_ops * 24 * next_fest_multiplier)` and return the
    numeric multiplier.
    """
    text = CLAUDE_MD.read_text()
    m = re.search(
        r"score\s*=\s*min\(\s*100\s*,\s*raw_ops\s*\*\s*([0-9.]+)",
        text,
    )
    if not m:
        raise AssertionError(
            "Could not find `score = min(100, raw_ops * N ...)` line in CLAUDE.md"
        )
    return float(m.group(1))


# ── Tests ──────────────────────────────────────────────────────────

def test_component_keys_match_between_ops_and_radar_meta():
    """Every component ops.py emits must have meta for the Radar Pick API."""
    ops_keys = _extract_component_keys_from_ops()
    meta_keys = _extract_meta_keys_from_radar()

    missing_in_meta = ops_keys - meta_keys
    extra_in_meta = meta_keys - ops_keys

    assert not missing_in_meta and not extra_in_meta, (
        "OPS component drift between ops.py and radar.py OPS_COMPONENT_META:\n"
        f"  In ops.py but missing from meta: {sorted(missing_in_meta)}\n"
        f"  In meta but not produced by ops.py: {sorted(extra_in_meta)}\n"
        f"  ops.py keys:  {sorted(ops_keys)}\n"
        f"  radar keys:   {sorted(meta_keys)}"
    )


def test_score_multiplier_matches_between_code_and_claude_md():
    """The `ops_score_multiplier` constant in code must equal the value
    documented in CLAUDE.md's `score = min(100, raw_ops * X ...)` line.
    """
    code_multiplier = _extract_multiplier_from_ops()
    doc_multiplier = _extract_multiplier_from_claude_md()

    assert code_multiplier == doc_multiplier, (
        "OPS multiplier drift:\n"
        f"  backend/config.py ops_score_multiplier = {code_multiplier}\n"
        f"  CLAUDE.md `score = min(100, raw_ops * X ...)` = {doc_multiplier}\n"
        "Update CLAUDE.md or config.py so both match."
    )
