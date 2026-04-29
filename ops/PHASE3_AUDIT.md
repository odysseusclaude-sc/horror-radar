# Phase 3 audit (2026-04-30)

Phase 3 of the Horror Radar reorg — GitHub cleanup. Originally folded into
"VPS hardening"; split out mid-execution because the GitHub-side surface was
substantial enough on its own and unblocks Phase 4 cleanly. Phase numbers in
`ops/REORG_PLAN.md` updated accordingly: Phase 3 = GitHub cleanup, Phase 4 =
VPS hardening, Phase 5 = product decision, Phase 6 = doc reality check.

## PRs landed (3 merges + this one)

| PR | Purpose |
|---|---|
| #11 | Phase 2 Mac cleanup (the prerequisite — merged to unblock Phase 3) |
| #12 | Rescue 3 Phase 0 CLAUDE.md lessons that #11 missed (rclone token leak, wrong-account OAuth, no-`unzip`/`sudo` workarounds). `ops/REORG_PLAN.md` cited them as existing in CLAUDE.md but the rescue commits hadn't included them. |
| #14 | Rescue OPS formula regression test from orphan branch `claude/loving-fermi-b0df9a` (153 lines, pure stdlib). Caught real OPS_COMPONENT_META v6 drift on first run — fix filed as a separate task. |
| #15 (this PR) | Phase 3 audit + phase renumber |

## PRs closed (5)

| PR | Disposition | Reason |
|---|---|---|
| #5 | Closed (superseded) | 4 CLAUDE.md lessons byte-identical to current main lines 354/360/366/372; main has 7 additional later lessons. |
| #6 | Closed (superseded) | All 9 `docs/redesign/*` design artifacts byte-identical to main; backend modifications were OLDER versions of work since advanced on main. |
| #9 | Closed (superseded) | `ops/BACKUP.md` and `ops/REORG_PLAN.md` byte-identical to main via PR #11; the 3 CLAUDE.md lessons appended on this branch rescued separately via PR #12. |
| #4 | Closed (declined) | Vercel Speed Insights — premature for current scale. Re-trigger from marketplace later if needed. |
| #1 | Closed (declined, with regression note) | Vercel Web Analytics — branch was pre-Phase-1 and would have regressed 17 files (FilterBar, Header, ConceptA/B/C, SignalFire, tailwind.config.js, vercel.json). Re-trigger fresh later if web analytics becomes needed. |

## PRs left open (1)

| PR | Reason |
|---|---|
| #7 (`claude/upbeat-roentgen-b16118`) | NOT a zombie. Adds `backend/agents/` (4 LLM agents: semantic_matcher, ops_weight_advisor, pipeline_diagnostician, editorial_writer) wired into APScheduler — none of this is on main, and the VPS already has an `ANTHROPIC_API_KEY` provisioned for it. The PR's diff is unreviewable (~218k lines) because its base is pre-Phase-1 origin/main with the full Obsidian vault tree; true scope is ~15 project files. Disposition: keep open pending clean revive on a fresh branch off current main; spawned a follow-up task to cherry-pick the 5 new agent files plus surgical integration deltas without overwriting main's newer slowapi / OPS v6 / pipeline P1-P4 work. PR #7 will be closed with a redirect once the clean replacement exists. |

## Branches deleted from `origin` (10)

Each was reversible at the time of deletion via `git push origin <SHA>:refs/heads/<name>` within the ~90-day reflog window. Tip SHAs preserved here for reference.

| Branch | Tip SHA | Deletion mechanism |
|---|---|---|
| `ops/phase2-mac-cleanup` | (head of #11) | `gh pr merge --delete-branch` |
| `ops/rescue-phase0-lessons` | (head of #12) | `gh pr merge --delete-branch` |
| `ops/rescue-ops-formula-test` | (head of #14) | `gh pr merge --delete-branch` |
| `ops/phase0-backup-system-v2` | `3c35932e` | `gh pr close --delete-branch` (#9) |
| `claude/lessons-phase3` | `4b91148a` | `gh pr close --delete-branch` (#5) |
| `claude/optimistic-hermann` | `8e061199` | `gh pr close --delete-branch` (#6) |
| `claude/loving-fermi-b0df9a` | `ed657228` | `git push origin --delete` (orphan, no PR) |
| `ops/phase0-backup-system` | `a5a012dd` | `git push origin --delete` (PR #8 was already closed) |
| `phase1/origin-reconciliation` | `b3d8e1bc` | `git push origin --delete` (PR #10 already merged) |
| `vercel/install-and-configure-vercel-s-ejzv70` | (head of #4) | `gh pr close --delete-branch` |
| `vercel/install-vercel-web-analytics-yj7z20` | (head of #1) | `gh pr close --delete-branch` |

## Branches kept

| Branch | Reason |
|---|---|
| `main` | obvious |
| `claude/upbeat-roentgen-b16118` | head of PR #7, awaiting clean revive |
| `vps/schemas-formula-version-str-2026-04-29` | One-line `formula_version: int → str` fix from VPS that resolves a Pydantic validation error on `/games/{appid}` for VPS data shape; NOT yet on main (main still has `int | None`). Deferred to Phase 4 to merge or supersede as part of OPS v6 schema work. |

## Repo settings applied

| Setting | Before | After | Reversal |
|---|---|---|---|
| `delete_branch_on_merge` | false | **true** | `gh api -X PATCH repos/odysseusclaude-sc/horror-radar -f delete_branch_on_merge=false` |
| `has_wiki` | true | **false** | `gh api -X PATCH repos/odysseusclaude-sc/horror-radar -f has_wiki=true` |
| topics | (none) | `horror-games, steam, indie-games, data-analysis, python, react, fastapi` | `gh api -X PUT repos/.../topics -f names='[]'` |
| Branch protection on `main` | none (404) | linear history, no force-push, no deletion, admin override allowed, no required reviewers (solo-dev profile) | `gh api -X DELETE repos/.../branches/main/protection` |

**UI verification still needed** (the API token returned `null` for these flags — Phase 3 couldn't verify them programmatically): Settings → General → Pull Requests on https://github.com/odysseusclaude-sc/horror-radar/settings should show **only squash merging enabled** (per CLAUDE.md "Lessons Learned 2026-04-04 — Git push failures after squash merge"; merge commits + rebase merges should be off).

## Local Mac cleanup

- Removed `second-brain` git remote from `~/code/horror-radar`. The
  `second-brain` GitHub repo itself was **not** touched — it's still the
  user's Obsidian vault sync; only the local remote-pointer was removed so
  this clone doesn't accidentally push code there again.

## Phase 4 prerequisites verified

GitHub-side endpoints needed for Phase 4 (VPS hardening) all return 200:

- `GET /repos/odysseusclaude-sc/horror-radar/keys` — empty array (Deploy keys page accessible, ready to populate)
- `GET /repos/odysseusclaude-sc/horror-radar/actions/permissions` — `{enabled: true, allowed_actions: "all"}`
- `GET /repos/odysseusclaude-sc/horror-radar/actions/secrets` — empty (endpoint accessible)

## Follow-ups (out of scope for Phase 3)

1. **Clean revive of PR #7's agentic layer** — spawned task. Cherry-pick `backend/agents/{semantic_matcher,ops_weight_advisor,pipeline_diagnostician,editorial_writer}.py` plus integration deltas (anthropic dep in requirements.txt, agent settings in config.py, scheduler wiring in main.py, 3 new DB tables, `verdict` field plumbing) onto a fresh branch off current main, without overwriting newer work. After the clean PR exists, close PR #7 with a redirect.
2. **Fix OPS_COMPONENT_META v6 drift** — spawned task. The newly-landed regression test (PR #14) currently fails as a true positive: `ops.py` (v6) emits `{review_momentum, sentiment, youtube, live_engagement, community_buzz, demo_conversion, discount_demand}` but `routers/radar.py` `OPS_COMPONENT_META` still has v5 keys `{velocity, decay, reviews, youtube, ccu, sentiment, twitch}`. The Radar Pick UI's "OPS Anatomy" section is showing wrong component cards for every game. Phase 4 territory — fix metadata, update CLAUDE.md `## OPS Formula` section to v6, ensure both regression tests pass.
3. **Phase 4 (VPS hardening)** — see `ops/REORG_PLAN.md` Phase 4. Domain + HTTPS, SSH deploy key, move deployed dir, Actions deploy, Discord webhook, VPS cleanup including the `vps/schemas-formula-version-str-…` decision.
