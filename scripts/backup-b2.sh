#!/usr/bin/env bash
# backup-b2.sh — Off-site backup to Backblaze B2 via rclone
#
# Uploads the most recent local SQLite backup to a B2 bucket.
# Run AFTER backup-db.sh so there is always a fresh local backup to upload.
#
# SETUP REQUIRED before first use:
#   1. Install rclone:
#        curl https://rclone.org/install.sh | sudo bash
#
#   2. Create a B2 bucket in the Backblaze console (e.g. "horror-radar-backups").
#
#   3. Configure rclone with your B2 credentials:
#        rclone config
#        → New remote → Name: b2-horror → Type: b2
#        → Account: <your B2 key ID>
#        → Key: <your B2 application key>
#        → Endpoint: leave blank (uses default)
#
#   4. Test the connection:
#        rclone ls b2-horror:horror-radar-backups/
#
#   5. Update B2_REMOTE and B2_BUCKET below to match your setup.
#
# Usage:
#   ./scripts/backup-b2.sh
#
# Cron (03:15 UTC daily — 15 min after backup-db.sh, see scripts/README.md):
#   15 3 * * * cd /path/to/horror-radar && bash scripts/backup-b2.sh >> /var/log/horror-radar-backup.log 2>&1

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — update these before first use
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKUP_DIR="${PROJECT_ROOT}/backups/db"
B2_REMOTE="b2-horror"             # rclone remote name from `rclone config`
B2_BUCKET="horror-radar-backups"  # B2 bucket name
B2_PATH="${B2_REMOTE}:${B2_BUCKET}/db"
RETENTION_DAYS=90                  # keep 90 days in B2 (B2 lifecycle rules handle older)

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------
if ! command -v rclone &>/dev/null; then
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ERROR: rclone not installed. See setup instructions in this script."
  exit 1
fi

# Find the most recent local backup
LATEST="$(find "$BACKUP_DIR" -name "horrorindie_*.db" -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | head -1 | cut -d' ' -f2-)"

if [[ -z "$LATEST" ]]; then
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ERROR: No local backup found in $BACKUP_DIR"
  exit 1
fi

# ---------------------------------------------------------------------------
# Upload to B2
# ---------------------------------------------------------------------------
FILENAME="$(basename "$LATEST")"
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Uploading $FILENAME → ${B2_PATH}/"
rclone copy "$LATEST" "${B2_PATH}/" --progress

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Upload complete: ${B2_PATH}/$FILENAME"

# ---------------------------------------------------------------------------
# Sync the full local backups dir to B2 (catches any missed uploads)
# --min-age 1h avoids re-uploading an in-progress backup-db.sh run
# ---------------------------------------------------------------------------
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Syncing backups dir to B2..."
rclone sync "$BACKUP_DIR" "${B2_PATH}/" --min-age 1h --progress

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] B2 backup sync complete"
