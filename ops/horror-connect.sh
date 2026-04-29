#!/bin/bash
# horror-connect.sh — open SSH tunnels + optionally sync VPS backend
#
# Usage:
#   ./horror-connect.sh          — tunnels only
#   ./horror-connect.sh --sync   — git pull + restart backend, then tunnels

VPS="odysseus@100.98.161.127"

if [[ "$1" == "--sync" ]]; then
  echo "🔄 Syncing VPS from GitHub..."
  ssh $VPS 'cd /home/odysseus/.openclaw/workspace/obsidian-vault && git pull && XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user restart horror-radar && echo "✅ Backend restarted"'
  sleep 2
fi

echo "🌊 Opening tunnels to Horror Radar backend..."

# Kill any existing tunnels on these ports
lsof -ti :8765 | xargs kill -9 2>/dev/null
lsof -ti :8000 | xargs kill -9 2>/dev/null
sleep 1

# Open tunnels
ssh -fN -L 8765:127.0.0.1:8765 $VPS
ssh -fN -L 8000:127.0.0.1:8765 $VPS

echo "✅ Tunnels open. Backend at localhost:8000 + localhost:8765"
echo "   Run 'npm run dev' in frontend/ to start the UI."
