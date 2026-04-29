# Phase 2 audit (2026-04-29)

Phase 2 of the Horror Radar reorg — Mac cleanup. Records the local-only
destructive steps that aren't captured in this PR's diff (so reviewers and
future-Aloysius can understand the full state change).

## Local cleanup (no PR — performed on this Mac after this PR merges)

- Retired `~/.git` → `~/.git.OLD-2026-04-29` (delete after 2026-05-29).
  - HEAD at retirement: `754ab200aad30af7887c730d8c5067f2c17ab264`.
  - Carried 1,381 staged-deletes (every project file git knew about that had
    moved to `~/code/horror-radar`).
- Retired 20 Drive worktrees → `_retired-2026-04-29/` siblings under their
  parent `.claude/worktrees/` dirs.
  - 19 under `…/horrorindiegames/.claude/worktrees/_retired-2026-04-29/`
  - 1 (`vibrant-gauss-18f5ef`) under `…/Reaveur/.claude/worktrees/_retired-2026-04-29/`
- Deleted 21 `claude/*` local branches before retiring `~/.git` (none were on
  the GitHub remote — verified via `git ls-remote --heads origin 'claude/*'`).
- Left 5 non-`claude/*` worktree-pinned branches alone — they become dormant
  inside `~/.git.OLD-2026-04-29`:
  - `ops/phase0-backup-system`
  - `ops/phase0-backup-system-v2` (the source of `ops/BACKUP.md` and `ops/REORG_PLAN.md` rescued in this PR)
  - `push-today`
  - `deploy-ui`
  - `lessons-phase3`

## In this PR

| Path | Action |
|---|---|
| `ops/horror-connect.sh` | Moved from `~/horror-connect.sh` |
| `ops/horror-radar-timeline.html` | Moved from Drive Reaveur root |
| `ops/horror-radar-validation.md` | Moved from Drive Reaveur root |
| `ops/BACKUP.md` | Rescued from unmerged `ops/phase0-backup-system-v2` (closes Phase 0) |
| `ops/REORG_PLAN.md` | Rescued from unmerged `ops/phase0-backup-system-v2` (closes Phase 0) |
| `.gitignore` | Appended `.claude/skills/` (workspace-local Claude tooling) |
| `ops/PHASE2_AUDIT.md` | This file |

## Outcome

- `~/code/horror-radar` is the only working copy of Horror Radar on this Mac.
- The Frankenstein `~/.git` (where the home directory itself was a git working
  tree) is gone; the Google Drive `index.lock` issue stops being an everyday
  obstacle for actual work.
- Phase 0's BACKUP/REORG docs land on `main` for the first time.
- Phase 1 PR (#10) and Phase 0 PR (#8 + its `-v2` redo) can be considered
  closed once this PR merges.

## Follow-up (out of scope here)

- Close the stale `ops/phase0-backup-system-v2` GitHub PR with a redirect
  comment to this one.
- `~/code/horror-radar` has a `second-brain` remote pointing at the old
  origin/second-brain repo. Confusing but not blocking; cleanup in a separate
  one-line PR if desired.
