#!/bin/zsh

cd "$(dirname "$0")" || exit 1

PORT="${PORT:-8000}"
URL="http://localhost:${PORT}"

server_is_running() {
  python3 - "$PORT" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.settimeout(0.2)
    sys.exit(0 if sock.connect_ex(("localhost", port)) == 0 else 1)
PY
}

echo "Starting Project Desk..."

if server_is_running; then
  echo "Project Desk is already running at ${URL}"
  open "${URL}"
  echo
  echo "Opened ${URL}"
  echo "You can close this launcher window."
  read -r "?Press Return to close."
  exit 0
fi

python3 server.py &
SERVER_PID=$!

sleep 1
open "${URL}"

echo
echo "Project Desk is running at ${URL}"
echo "Leave this Terminal window open while you use the app."
echo "When you are done, close this window or press Control-C to stop the server."
echo

wait "${SERVER_PID}"
