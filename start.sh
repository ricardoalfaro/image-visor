#!/usr/bin/env bash
# Quick start: Apple TV service (if needed) + desktop server, then opens the browser.
#   ./start.sh          start everything and open http://localhost:5173
#   ./start.sh stop     stop the desktop server (the Apple TV service keeps running)
#   ./start.sh tv-off   remove the Apple TV service from login items
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-5173}"
URL="http://localhost:${PORT}"
LOG="${TMPDIR:-/tmp}/image-viewer-pro-server.log"
SOCKET="$HOME/.image-viewer-pro-tv/control.sock"

listening() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; }

case "${1:-start}" in
  stop)
    pkill -f "node server.js" 2>/dev/null && echo "Servidor detenido." || echo "El servidor no estaba corriendo."
    exit 0 ;;
  tv-off)
    node tv-server.js uninstall-service; exit 0 ;;
  start) ;;
  *) echo "Uso: ./start.sh [start|stop|tv-off]"; exit 1 ;;
esac

command -v node >/dev/null || { echo "Necesitas Node.js (https://nodejs.org)."; exit 1; }

# Apple TV service: installed once, then it starts by itself at login.
if [ ! -S "$SOCKET" ]; then
  echo "Iniciando el servicio de Apple TV…"
  node tv-server.js install-service >/dev/null
fi

if listening; then
  echo "El servidor ya está corriendo en $URL"
  open "$URL"
  exit 0
fi

echo "Servidor de escritorio en $URL  (Ctrl+C para detener)"
( for _ in $(seq 1 50); do listening && { open "$URL"; break; }; sleep 0.2; done ) &
exec node server.js 2>&1 | tee "$LOG"
