#!/usr/bin/env bash
# Post-deploy smoke test: confirms the list + detail game endpoints actually
# serialize after a backend restart. Wired from horror-radar.service via
# ExecStartPost so a broken deploy fails the unit instead of silently 500'ing
# in prod (see CLAUDE.md "2026-04-30 — OPS v6 model/schema mismatch").
#
# Routes are the FastAPI internal paths (no /api prefix); nginx strips /api/
# in front of the public host.
set -euo pipefail

HOST="${SMOKE_HOST:-http://127.0.0.1:8000}"
HEALTH_TIMEOUT_SECS="${SMOKE_HEALTH_TIMEOUT:-30}"

# 1) Wait for uvicorn to bind. ExecStartPost can fire before lifespan finishes.
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECS ))
until curl -fsS -o /dev/null --max-time 3 "$HOST/health"; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
        echo "smoke FAIL: $HOST/health never came up within ${HEALTH_TIMEOUT_SECS}s" >&2
        exit 1
    fi
    sleep 2
done

# 2) List endpoint must return 200 and at least one game.
list_body=$(curl -fsS --max-time 10 "$HOST/games?page_size=1")
appid=$(printf '%s' "$list_body" | python3 -c '
import json, sys
payload = json.load(sys.stdin)
rows = payload.get("data") or []
if not rows:
    sys.stderr.write("smoke FAIL: /games returned 0 rows\n")
    sys.exit(1)
print(rows[0]["appid"])
')

# 3) Detail endpoint for that appid must also serialize. This is the second
#    endpoint that 500'd on 2026-04-30 (different code path, same OpsScoreOut).
curl -fsS -o /dev/null --max-time 10 "$HOST/games/${appid}"

echo "smoke ok (appid=${appid})"
