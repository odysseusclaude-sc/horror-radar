# Horror Radar — Backup & Restore

This is the answer to "the VPS is on fire, what do I do" at 3am.

## What gets backed up

| Asset | Where it lives in production | What it is |
|---|---|---|
| `horrorindie.db` | `/home/odysseus/.openclaw/workspace/obsidian-vault/backend/horrorindie.db` on the VPS | SQLite (WAL mode). The only copy of all collected signals — discovered games, daily snapshots, OPS scores, YouTube/Twitch/Reddit history. ~16 MB and growing. **Irreplaceable.** |
| `backend/.env` | Same dir, `.env` | API keys (`YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY`), `DATABASE_URL`, all `*_INTERVAL_HOURS`. Rebuildable but tedious — the rate-limit interval values are tuned and not in `.env.example`. |

## Where backups land

**Cloud (off-server):**
`Backups/horror-radar/` in `aloysiusong.w.h@gmail.com`'s Google Drive
(at the Drive root, **not** inside the Obsidian vault).
- `db/horrorindie-YYYY-MM-DD.db.gz` — gzipped daily DB snapshots
- `env/env-YYYY-MM-DD.gpg` — gpg-encrypted env file (manual, not on a schedule)

**On the VPS:**
`/home/odysseus/backups/horror-radar/horrorindie-YYYY-MM-DD.db.gz`
Pruned to the last 7 days locally (Drive holds the long tail).

**On the Mac:**
`~/backups/horror-radar/horrorindie-YYYY-MM-DD.db` — only the initial pull
from 2026-04-29. Not on a schedule. The Drive copy is the canonical off-server copy.

## How the nightly automation works

A user-level systemd timer on the VPS fires the backup script daily at
**03:30 UTC** (11:30 SGT — between `steam_extras` 03:00 and `daily_snapshots`
04:00, picked from CLAUDE.md's scheduler table to avoid running while a
collector is writing).

Files:
- `~/bin/horror-radar-backup.sh` — the script
- `~/.config/systemd/user/horror-radar-backup.service` — oneshot unit
- `~/.config/systemd/user/horror-radar-backup.timer` — `OnCalendar=*-*-* 03:30:00 UTC`, `Persistent=true`
- `~/.config/rclone/rclone.conf` — gdrive remote auth (do not commit, do not paste — see Security below)

The script:
1. Snapshots `horrorindie.db` via Python `sqlite3.Connection.backup()` (WAL-safe, no writer block).
2. `gzip -f` the snapshot (~16 MB → ~4 MB).
3. `rclone copy` to `gdrive:Backups/horror-radar/db/`.
4. `find ... -mtime +7 -delete` prunes local copies older than 7 days.
5. `rclone delete --min-age 90d` prunes Drive copies older than 90 days.

Linger is enabled for `odysseus` (`loginctl show-user odysseus → Linger=yes`),
so the timer fires across reboots without an interactive shell.

### Verify the timer is alive

```bash
ssh odysseus@100.98.161.127 \
  'XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user list-timers --no-pager' \
  | grep horror-radar-backup
```

Expected: a future `NEXT` timestamp (e.g. `Wed 2026-04-30 03:30:00 UTC`).

### Trigger a backup manually

```bash
ssh odysseus@100.98.161.127 '
  XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user start horror-radar-backup.service && \
  XDG_RUNTIME_DIR=/run/user/$(id -u) journalctl --user -u horror-radar-backup.service -n 20 --no-pager
'
```

Expected last line: `horror-radar-backup.sh[…]: [YYYY-MM-DDTHH:MM:SSZ] backup ok: horrorindie-YYYY-MM-DD.db.gz`.

## Restore procedures

### Restore the DB (most common: VPS recovered, DB lost or corrupted)

```bash
# 1. Pull the most recent backup from Drive
ssh odysseus@100.98.161.127 \
  '~/bin/rclone lsf gdrive:Backups/horror-radar/db --include "horrorindie-*.db.gz" \
    | sort | tail -1'                          # find latest
LATEST=horrorindie-YYYY-MM-DD.db.gz             # <— substitute the line above
ssh odysseus@100.98.161.127 \
  "~/bin/rclone copy gdrive:Backups/horror-radar/db/$LATEST /tmp/"

# 2. Stop the backend so nothing writes during the swap
ssh odysseus@100.98.161.127 \
  'XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user stop horror-radar.service'

# 3. Move the broken DB aside, decompress the backup into place
ssh odysseus@100.98.161.127 "
  cd /home/odysseus/.openclaw/workspace/obsidian-vault/backend && \
  mv horrorindie.db horrorindie.db.broken-\$(date -u +%Y%m%d-%H%M) 2>/dev/null || true && \
  rm -f horrorindie.db-shm horrorindie.db-wal && \
  gunzip -c /tmp/$LATEST > horrorindie.db && \
  python3 -c \"import sqlite3; print(sqlite3.connect('horrorindie.db').execute('PRAGMA integrity_check').fetchone())\"
"
# Expect: ('ok',)

# 4. Restart the backend
ssh odysseus@100.98.161.127 \
  'XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user start horror-radar.service'

# 5. Smoke test
curl -s http://100.98.161.127/api/games?limit=1 | head -c 500
```

You will lose any data collected between the backup time (03:30 UTC) and the
restore time. For most days that's a few collector runs.

### Restore the .env

The encrypted `.env` is symmetric-key. Passphrase is in the user's password
manager under entry name **`horror-radar-env-backup`**. Without it the file is
useless — there is no recovery key.

```bash
# 1. Pull the encrypted .env from Drive (use the Mac, not the VPS, since it's gpg-encrypted)
LATEST=$(ls "/Users/reaveur/Library/CloudStorage/GoogleDrive-aloysiusong.w.h@gmail.com/My Drive/Backups/horror-radar/env/" \
  | sort | tail -1)
echo "latest: $LATEST"

# 2. Decrypt to a local file (gpg will prompt for the passphrase)
gpg --pinentry-mode loopback --decrypt --output /tmp/horror-env \
  "/Users/reaveur/Library/CloudStorage/GoogleDrive-aloysiusong.w.h@gmail.com/My Drive/Backups/horror-radar/env/$LATEST"

# 3. Push to the VPS
scp /tmp/horror-env odysseus@100.98.161.127:/home/odysseus/.openclaw/workspace/obsidian-vault/backend/.env
ssh odysseus@100.98.161.127 'chmod 600 /home/odysseus/.openclaw/workspace/obsidian-vault/backend/.env'

# 4. Wipe the local plaintext copy
rm -P /tmp/horror-env

# 5. Restart the backend so it re-reads .env
ssh odysseus@100.98.161.127 \
  'XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user restart horror-radar.service'
```

### Refresh the encrypted .env (run after rotating any API key)

The .env backup is **manual** — there is no scheduled job for it. If you
rotate `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY`, etc., refresh the encrypted
backup the same day:

```bash
ssh odysseus@100.98.161.127 'cat /home/odysseus/.openclaw/workspace/obsidian-vault/backend/.env' \
  | gpg --pinentry-mode loopback --symmetric --cipher-algo AES256 --output \
    "/Users/reaveur/Library/CloudStorage/GoogleDrive-aloysiusong.w.h@gmail.com/My Drive/Backups/horror-radar/env/env-$(date -u +%Y-%m-%d).gpg"
```

Use the same passphrase as before.

## Retention

Current policy is intentionally conservative — easy to tighten later, hard
to recover from over-eager pruning:

- **VPS local**: last 7 days only (auto-pruned by the script).
- **Drive cloud**: keep everything for 90 days, then delete (also auto-pruned).
- At ~5 MB/day compressed, 90 days × 1 file/day = ~450 MB. Negligible against
  the 5 TB Drive quota.

If you want weekly/monthly long-tail retention later, edit
`~/bin/horror-radar-backup.sh` step 5 to keep Sunday-only between 7d–28d and
1st-of-month between 28d–90d. Not implemented in v1 — observe a week of
backups first to make sure nothing else needs fixing.

## Security

- **Never paste `rclone config show gdrive` output** — it includes the live
  OAuth `access_token` and `refresh_token`. The refresh token is long-lived
  and grants ongoing read/write access to your Drive. If you do leak it
  (or suspect you did), revoke at https://myaccount.google.com/permissions
  immediately, then `rclone config reconnect gdrive:` to re-auth.
- The encrypted `.env` is only as secure as the passphrase. Store it in a
  password manager, not in this file or in git.
- The `gdrive` rclone remote on the VPS uses `scope = drive` (full Drive
  access). Tighter scopes (`drive.file`) only let rclone see files it
  created itself, which broke the initial setup — full access is correct here.

## What's NOT backed up

These are intentionally excluded — recover them from git, package mirrors,
or by re-running infra setup:

- The application code (lives in `horror-radar` on GitHub).
- Python venv at `backend/.venv/` (recreate via `pip install -r requirements.txt`).
- nginx config at `/etc/nginx/sites-enabled/horror-radar` (small, static, copy-pasteable from this repo's `ops/` once we add it).
- systemd unit `~/.config/systemd/user/horror-radar.service` (small, static).
- rclone binary (re-download from rclone.org).

If the VPS itself is destroyed, recovery is roughly:
provision new VPS → install python/rclone → clone horror-radar from git →
restore `.env` from Drive → restore `horrorindie.db` from Drive → restart
service. Allow ~30 minutes.
