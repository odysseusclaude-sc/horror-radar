# Horror Radar — Scripts

Utility scripts for backup, maintenance, and data operations.

## Backup Scripts

### Overview

Two-stage backup pipeline:
1. **`backup-db.sh`** — Local SQLite backup with integrity check, 30-day retention
2. **`backup-b2.sh`** — Off-site sync to Backblaze B2 via rclone (stub; requires setup)

### Quick Start

```bash
# Run a local backup right now
bash scripts/backup-db.sh

# Run both stages
bash scripts/backup-db.sh && bash scripts/backup-b2.sh
```

Backups land in `backups/db/horrorindie_<timestamp>Z.db`. The `backups/` directory
is git-ignored (add it if not already).

### Cron Setup (Daily 03:00 UTC)

Edit the crontab on the VPS:

```bash
crontab -e
```

Add these lines (adjust the project path):

```cron
# Horror Radar — daily database backup at 03:00 UTC
0 3 * * * cd /home/reaveur/horror-radar && bash scripts/backup-db.sh >> /var/log/horror-radar-backup.log 2>&1

# Horror Radar — off-site B2 sync at 03:15 UTC (after local backup)
15 3 * * * cd /home/reaveur/horror-radar && bash scripts/backup-b2.sh >> /var/log/horror-radar-backup.log 2>&1
```

Verify the cron is registered:
```bash
crontab -l
```

### B2 Setup (first time only)

See the comments at the top of `backup-b2.sh` for the full rclone setup walkthrough:
1. Install rclone
2. Create a B2 bucket in the Backblaze console
3. `rclone config` → create remote named `b2-horror`
4. Test with `rclone ls b2-horror:horror-radar-backups/`

### Verify a Restore

```bash
# Check integrity of any backup file
sqlite3 backups/db/horrorindie_<timestamp>Z.db "PRAGMA integrity_check;"
# Should output: ok

# Count games to confirm data is present
sqlite3 backups/db/horrorindie_<timestamp>Z.db "SELECT count(*) FROM games;"
```

---

## OPS Scripts (backend/scripts/)

Investigation and backtesting scripts — kept in `backend/scripts/` with the Python stack.

| Script | Purpose |
|---|---|
| `ops_baseline.py` | Generate OPS scoring baseline CSV |
| `ops_compare.py` | Compare two OPS versions side-by-side |
