# Horror Radar — Reorg Plan (Resumable Across Sessions)

This file is the entry point for any new Claude session continuing the
project reorganisation. Read this first. Then read `ops/BACKUP.md` for
the operational pieces already in place.

## Original prompt (so future-you knows the intent)

> "Let's organise the horrorindiegames project. Show me where every related
> file resides and plan a way to organise them. Also, propose a new way of
> working if needed."
>
> Followups: "Is this truly the best way? What about the files on the VPS
> server?" → "SSH in and do a read-only VPS audit. Then reframe the
> proposal." → "Is there a need for the VPS server in this entire workflow
> if I want to productionize the indie horror app?" → "Let's go with A
> [keep VPS, harden it]."

The user wants a single coherent home for the project, with the VPS staying
as the production host but properly hardened. They prefer concise updates,
direct opinions, and reversible steps.

## Where things actually live (current state, snapshot 2026-04-29)

Four diverged sources of truth for code:

| Source | HEAD | What's unique to it |
|---|---|---|
| `horror-radar/main` (GitHub, deploy repo) | `3ad3e31` | OPS v6, pipeline P1-P4, Norman frontend redesigns, classifier harness, newsletter |
| `origin/main` (GitHub, second-brain repo) | `a366635` | 7 fixes: OPS v5 multiplier ×40→×24, Compare derivation fix, Settings unknown-env crashloop fix, /browse back-link, etc. |
| Mac `~/.git` (home-dir worktree, footgun) | `754ab20` | Frankenstein of code + Obsidian vault tree; 23 ahead / 28 behind horror-radar; **1,328 staged deletes** (don't touch) |
| VPS deployed (`/home/odysseus/.openclaw/workspace/obsidian-vault/`) | `ce9e722` | 5 commits behind horror-radar/main; was 1 line dirty in `backend/schemas.py`, now captured to branch `vps/schemas-formula-version-str-2026-04-29` on horror-radar |

Stray files outside any project root:
- `~/horror-connect.sh` (deploy helper, lives loose in home dir)
- `~/Library/.../Obsidian/Reaveur/horror-radar-timeline.html`
- `~/Library/.../Obsidian/Reaveur/horror-radar-validation.md`

VPS layout:
- App dir: `/home/odysseus/.openclaw/workspace/obsidian-vault/` (named confusingly — it's a clone of `horror-radar.git`)
- DB: `backend/horrorindie.db` (16 MB, WAL, 953 games, 46 605 snapshots, 41 069 OPS scores) — **note: NOT `horror_radar.db` as CLAUDE.md claims**
- Service: `horror-radar.service` is **user-level systemd** (linger enabled), not system-level. Runs uvicorn on `127.0.0.1:8765`.
- nginx: `:80` only, default `server_name _`, proxies `/api/` → `:8765`. No HTTPS, no domain.
- Abandoned scaffold: `/home/odysseus/.openclaw/workspace/horrorgameradar/` (556 KB, "Initial scaffold" only) — safe to delete.
- Untracked vault folders inside the deployed repo: `10 - Projects/`, `3 - Tags/`, `.bak`, `.bak2` files — clean up in Phase 3.

`.env` keys present on VPS (none of which are in any git): `YOUTUBE_API_KEY`,
`ANTHROPIC_API_KEY` (undocumented in CLAUDE.md), `DATABASE_URL`, all
`*_INTERVAL_HOURS`, `FUZZY_MATCH_THRESHOLD`, `LOG_LEVEL`. Twitch and Reddit
creds are absent — those collectors must run disabled.

17 stale worktrees on Drive + 23 stale `claude/*` local branches — clean up in Phase 2.

## The chosen direction (Option A: harden the VPS, don't migrate)

Decision recorded after reviewing alternatives (Fly.io PaaS, serverless +
Postgres, Mac-as-collector). User picked: keep the VPS, but treat it like
production — HTTPS, automated backups, deploy-via-CI, no more direct edits
on prod, alerting.

## Phases

### Phase 0 — Stop the bleeding ✅ DONE 2026-04-29

What's now in place:
- VPS-only `schemas.py` fix captured to GitHub branch
  `vps/schemas-formula-version-str-2026-04-29`.
- Initial DB snapshot lives in three places (VPS local, Mac local, Drive cloud); integrity verified.
- Encrypted `.env` lives in Drive at `Backups/horror-radar/env/env-2026-04-29.gpg`.
  Passphrase is in the user's password manager under entry name
  `horror-radar-env-backup`.
- Nightly automated backup: user-level systemd timer
  `~/.config/systemd/user/horror-radar-backup.timer` fires at **03:30 UTC**.
  Script at `~/bin/horror-radar-backup.sh`. Drive remote `gdrive` configured
  via rclone OAuth.
- Drive folder structure: `My Drive/Backups/horror-radar/{db,env}/` (kept
  outside the Obsidian vault on purpose).
- Three Lessons Learned entries appended to CLAUDE.md (rclone token leak,
  wrong-account OAuth, no-sudo VPS workarounds).
- All committed on branch `ops/phase0-backup-system-v2`, merging via
  https://github.com/odysseusclaude-sc/horror-radar/pull/9 (3 files, +415, MERGEABLE).
  The original `ops/phase0-backup-system` branch was cut from `origin/main`
  by mistake, which made its PR (#8) show 1,296 files / +154 769 — closed
  in favour of #9. See "Lessons learned from Phase 0" below.

Restore drill: **DONE 2026-04-29**. Latest Drive backup
(`horrorindie-2026-04-28.db.gz`) decompressed cleanly, integrity check
returned `('ok',)`, row counts matched this file's snapshot exactly
(953 / 46 605 / 41 069), gpg env decrypt produced 12 keys, and an ORM-level
smoke test against `models.Game × models.OpsScore` returned real data.
Full log in `ops/BACKUP.md` "Restore drill log". HTTP smoke test deferred
until a Py 3.10+ interpreter is installed on the Mac — `backend/main.py`
uses `str | None` annotations that the system Python 3.9 can't parse.

### Phase 1 — Reconcile code (next)

Goal: `horror-radar.git` becomes the single source of truth for code, with
all the bugfixes that currently exist only on second-brain merged in.

Steps:
1. Clone `horror-radar.git` fresh into `~/code/horror-radar` (local disk, NOT Drive).
2. List the commits unique to `origin/main` that need to land on `horror-radar/main`. As of 2026-04-29 these are:
   - `a366635` Merge pull request #16 from odysseusclaude-sc/claude/amazing-hamilton-d5aaaf
   - `7c06888` fix(backend): allow unknown env vars in Settings to prevent crash-loop
   - `dad8198` Merge pull request #15 from odysseusclaude-sc/claude/loving-fermi-b0df9a
   - `0f8f51c` merge: resolve conflicts with main — integrate Compare feature + preserve Phase 1-3 changes
   - `2121a85` fix: OPS v5 multiplier in Autopsy (×40 → ×24) + /browse back-link
   - `ed65722` feat: Phase 1-3 redesign — UX overhaul, OPS v5 explainer, watchlist, developer pages
   - `7362d06` docs: add 4 lessons learned from Phase 3 session
   - `fc97ac3` fix: Compare page — derive stats from GameDetailOut arrays
   - `7e85899` feat: Phase 3 frontend polish — ConceptA redesign, watchlist, compare, EmptyState
   - `6a97a3c` docs: add 2026-04-05 lessons learned (infra incident + nginx + systemd + token)
   (the merge commits are noise — only cherry-pick the actual feature/fix commits, ~7 of them)
3. Cherry-pick onto a branch off `horror-radar/main`. Expect conflicts on `backend/schemas.py` (the OPS v5 fix vs the v6 work already on horror-radar/main) and on the frontend Database/RadarPick/GameDetail rewrites. Resolve by hand.
4. Open PR, review, merge to `horror-radar/main`.
5. Drop `origin` (second-brain) as a remote on Mac and on the VPS. Replace VPS git remote URL (currently HTTPS-with-dead-PAT) with SSH using a deploy key (also covers Phase 3 task 14).
6. Per the plan, Phase 1 does NOT auto-deploy the merged code to the VPS — that's a separate gated decision (see Phase 4) because it's also a 25-commit jump including OPS v6 and pipeline P1-P4.

### Phase 2 — Mac cleanup

1. After Phase 1, the new `~/code/horror-radar` is the working clone. Verify build (`pip install -r requirements.txt`, `npm install`, `npm run dev`).
2. Move stray files into the new repo's `ops/`: `~/horror-connect.sh`, `~/Library/.../Reaveur/horror-radar-timeline.html`, `~/Library/.../Reaveur/horror-radar-validation.md`.
3. **Kill the home-dir worktree**: `mv ~/.git ~/.git.OLD-2026-04-29`. Verify nothing breaks. Keep backup 30 days, delete after.
4. Wipe the 17 stale worktrees on Drive (`git worktree list` to enumerate, `git worktree remove` each). Wipe the 23 stale `claude/*` local branches.
5. Add `.claude/skills/` to `.gitignore` going forward (don't bother rewriting history).

### Phase 3 — GitHub cleanup ✅ DONE 2026-04-30

Originally planned as part of "VPS hardening" alongside what's now Phase 4.
Split out as its own phase mid-execution because GitHub-side cleanup turned
out to be substantial enough to warrant separation (and to unblock Phase 4
prerequisites cleanly). See `ops/PHASE3_AUDIT.md` for the full record.

What landed:
- PR #11 (Phase 2 Mac cleanup) merged.
- 3 zombie PRs closed with redirect comments + branches deleted: #5 (lessons-phase3,
  superseded), #6 (optimistic-hermann, superseded), #9 (phase0-backup-system-v2,
  superseded by #11).
- 2 Vercel auto-PRs closed: #4 (Speed Insights, declined), #1 (Web Analytics,
  would have regressed Phase 1 work).
- 2 rescue PRs opened and merged before closing originals: #12 rescued 3 Phase 0
  CLAUDE.md lessons that #11 missed; #14 rescued the OPS formula regression
  test from `claude/loving-fermi-b0df9a` (caught a real OPS_COMPONENT_META v6
  drift bug on first run — fix tracked as Phase 4-or-earlier follow-up).
- 5 fully-superseded branches deleted from `origin`: ops/phase0-backup-system,
  phase1/origin-reconciliation, claude/lessons-phase3, claude/optimistic-hermann,
  claude/loving-fermi-b0df9a (plus PR-deletion-on-close handled phase0-backup-system-v2,
  ops/phase2-mac-cleanup, the two vercel/* branches).
- PR #7 (`claude/upbeat-roentgen-b16118`, agentic layer) kept open pending
  clean revive — its 4 LLM agents are unique unmerged work; spawned task to
  cherry-pick the ~15 real project files onto a fresh branch off current main.
- `vps/schemas-formula-version-str-2026-04-29` kept; its one-line
  `formula_version: int → str` fix is genuine production code not yet on main.
  Deferred to Phase 4 (VPS hardening) for resolution.
- Repo settings: `delete_branch_on_merge=true`, `has_wiki=false`, topics set
  (`horror-games`, `steam`, `indie-games`, `data-analysis`, `python`, `react`,
  `fastapi`), branch protection on `main` (linear history, no force-push, no
  deletion, admin override allowed for solo-dev workflow).
- Local clone: `second-brain` git remote removed.
- Phase 4 GitHub-side prerequisites verified accessible: deploy keys endpoint,
  Actions permissions, Actions secrets — all return 200.

### Phase 4 — VPS hardening

Each task is independent; pick any order.

1. **Domain + HTTPS.** Buy/point a domain (originally planned: `api.horror-radar.com`, see Lessons Learned 2026-04-05). Cloudflare DNS → VPS. Let's Encrypt via certbot. Update nginx with `server_name`, `listen 443 ssl`, redirect 80→443. Update Vercel rewrite to point at the HTTPS domain.
2. **SSH deploy key.** Generate keypair on VPS, register on GitHub deploy keys (Phase 3 confirmed the endpoint is accessible), replace embedded-PAT remote URL on the VPS with `git@github.com:...` (closes Lessons Learned 2026-04-05 entry).
3. **Move deployed dir** from `~/.openclaw/workspace/obsidian-vault/` to `~/horror-radar/` (still no sudo needed since the systemd unit is user-level — just edit `WorkingDirectory` in `~/.config/systemd/user/horror-radar.service`). The "obsidian-vault" path is misleading and lives under a Claude tool's workspace, which is fragile.
4. **GitHub Actions deploy.** Push to `main` → Actions runs `git pull && systemctl --user restart horror-radar.service` over SSH. Replaces manual `horror-connect.sh` and ends the era of editing files on prod.
5. **Discord webhook for alerts.** Hook into the existing watchdog: stale runs, failed jobs, API quota exhaustion. Logging is already in place; just send to a webhook.
6. **VPS cleanup**: delete `~/.openclaw/workspace/horrorgameradar/`, the untracked `10 - Projects/` and `3 - Tags/` from the repo dir, `.bak` files. Decide the fate of branch `vps/schemas-formula-version-str-2026-04-29` (one-line `formula_version: int → str` fix from VPS, not yet on main) — either merge it to align main with VPS, or supersede it as part of the OPS v6 schema rework that Phase 5 may deploy.

### Phase 5 — Product decision (gate, do not skip)

The VPS at the end of Phase 4 is still 25 commits behind `horror-radar/main`,
pinned at `ce9e722` + the merged second-brain fixes. That gap includes
OPS v6, pipeline P1-P4, Norman frontend redesigns, classifier harness,
multiplayer backfill. Highest-risk deploy in the project's history because
it touches schema + scheduler + scoring + frontend simultaneously.

Treat this as its own decision, not a cleanup. Plan: stay pinned for now,
ship Phases 1-4 first, then evaluate the 25-commit jump as a separate
project with its own backup-and-rollback drill.

### Phase 6 — Doc reality check

Update CLAUDE.md to match reality (current claims that are wrong):
- DB filename is `horrorindie.db`, not `horror_radar.db`.
- (No update needed: systemd is user-level — that gotcha is correct.)
- `.env` includes `ANTHROPIC_API_KEY` (currently undocumented).
- New deploy workflow (Actions + SSH key, not manual `horror-connect.sh`).
- New repo layout (`~/code/horror-radar`, not Drive worktrees).

## How to start a fresh session

1. Read this file.
2. Read `ops/BACKUP.md`.
3. If you don't yet know what's been committed, run:
   ```bash
   git log --oneline horror-radar/main..HEAD       # ahead of canonical
   git log --oneline HEAD..horror-radar/main       # behind canonical
   git status --short
   ```
4. Look at the existing plan file from the prior session if still present:
   `~/.claude/plans/lexical-forging-grove.md` (Phase 0 plan; superseded by this file).
5. Decide which phase to advance. The restore drill is DONE; the next
   phase to plan is Phase 1 (origin → horror-radar reconciliation).

## Lessons learned from Phase 0

- **Branch reorg work off `horror-radar/main`, not `origin/main`.** The
  first Phase 0 PR (#8, branch `ops/phase0-backup-system`) was cut from
  `origin/main` because that's what local `main` was tracking on the Mac.
  Against `horror-radar/main` (the actual deploy branch), the PR diff
  exploded to 1,296 files / +154,769 because it dragged in the full
  origin↔horror-radar divergence (Phase 1's job). Only ~390 lines were
  actually Phase 0. Closed #8, re-cut as
  `ops/phase0-backup-system-v2` off `horror-radar/main`, opened #9 with
  the expected ~3-file diff. Whenever the target merge branch is
  `horror-radar/main`, branch from it explicitly: `git checkout -b X
  horror-radar/main`.

## Known gotchas (don't relearn the hard way)

- **Google Drive + git worktrees** cause spurious `index.lock` errors. Always `rm -f .git/index.lock` before git ops in Drive worktrees. Real fix is Phase 2 (move repo to local disk).
- **VPS sudo is interactive only.** Use user-space alternatives — `~/bin/`, `~/.config/systemd/user/`, `python3 -m zipfile -e` instead of `unzip`.
- **Never paste `rclone config show`** — leaks the OAuth refresh token.
  Use `rclone about gdrive: | grep -E "^(Used|Free)"` for diagnostics.
- **Tailscale SSH** issues a per-session auth URL on first connect of a
  session; user must approve in browser. Once approved, subsequent commands
  are fine for a while.
- **VPS git remote** uses an embedded PAT in the URL (currently dead). Don't
  paste `git remote -v` from the VPS without redacting. Phase 3 task 2 fixes this.
- **The home-dir-as-worktree on the Mac** has 1,328 staged deletes. Never
  run `git restore` from `~` or you wipe your Obsidian vault. Phase 2
  retires it.
