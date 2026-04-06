#!/usr/bin/env bash
# backup-db.sh — Local SQLite backup for Horror Radar
#
# Creates a timestamped copy of horrorindie.db in a local backup directory,
# then prunes backups older than RETENTION_DAYS.
#
# Usage:
#   ./scripts/backup-db.sh
#   bash scripts/backup-db.sh
#
# Cron (03:00 UTC daily from project root, see scripts/README.md):
#   0 3 * * * cd /path/to/horror-radar && bash scripts/backup-db.sh >> /var/log/horror-radar-backup.log 2>&1

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_PATH="${PROJECT_ROOT}/backend/horrorindie.db"
BACKUP_DIR="${PROJECT_ROOT}/backups/db"
RETENTION_DAYS=30
TIMESTAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
BACKUP_FILE="${BACKUP_DIR}/horrorindie_${TIMESTAMP}.db"

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------
if [[ ! -f "$DB_PATH" ]]; then
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ERROR: DB not found at $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# ---------------------------------------------------------------------------
# Backup using SQLite's online backup API via sqlite3 shell.
# ".backup" is safe to run against a live WAL-mode database.
# ---------------------------------------------------------------------------
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Backing up $DB_PATH → $BACKUP_FILE"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Verify the backup is a valid SQLite file
sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok" || {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ERROR: integrity_check failed on $BACKUP_FILE"
  rm -f "$BACKUP_FILE"
  exit 2
}

SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Backup complete: $BACKUP_FILE ($SIZE)"

# ---------------------------------------------------------------------------
# Prune old backups
# ---------------------------------------------------------------------------
PRUNED=$(find "$BACKUP_DIR" -name "horrorindie_*.db" -mtime +"$RETENTION_DAYS" -print -delete | wc -l)
if [[ "$PRUNED" -gt 0 ]]; then
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Pruned $PRUNED backup(s) older than ${RETENTION_DAYS} days"
fi
