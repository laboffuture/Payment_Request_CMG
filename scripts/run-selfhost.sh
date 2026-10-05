#!/usr/bin/env bash
# Supervisor script for self-hosted wrangler workerd instance.
# Ensures that if workerd crashes, runs out of memory, or port 4101 hangs,
# the service exits cleanly so systemd immediately restarts it.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PORT=4101
WRANGLER_BIN="./node_modules/.bin/wrangler"

cleanup() {
  echo "[supervisor] Received shutdown signal, stopping wrangler..."
  if [[ -n "${WRANGLER_PID:-}" ]] && kill -0 "$WRANGLER_PID" 2>/dev/null; then
    kill -TERM "$WRANGLER_PID" 2>/dev/null || true
    # Also terminate any child workerd processes
    pkill -TERM -P "$WRANGLER_PID" 2>/dev/null || true
    wait "$WRANGLER_PID" 2>/dev/null || true
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "[supervisor] Starting wrangler dev on port $PORT..."
"$WRANGLER_BIN" dev -c wrangler.selfhost.jsonc --port "$PORT" --ip 127.0.0.1 --local --persist-to .wrangler/state &
WRANGLER_PID=$!

# Initial grace period for workerd compilation and binding
sleep 8

FAILURES=0
while true; do
  # 1. Check if wrangler process is still alive
  if ! kill -0 "$WRANGLER_PID" 2>/dev/null; then
    echo "[supervisor] Wrangler process $WRANGLER_PID terminated unexpectedly."
    wait "$WRANGLER_PID" 2>/dev/null
    EXIT_CODE=$?
    exit "${EXIT_CODE:-1}"
  fi

  # 2. Check if port 4101 is actively answering HTTP requests
  if curl -s -m 4 -o /dev/null -I "http://127.0.0.1:${PORT}/"; then
    FAILURES=0
  else
    FAILURES=$((FAILURES + 1))
    echo "[supervisor] Port $PORT health check failed ($FAILURES/3)..."
    if [[ "$FAILURES" -ge 3 ]]; then
      echo "[supervisor] Port $PORT is unresponsive (workerd crashed or hung). Forcing exit for systemd auto-restart..."
      kill -9 "$WRANGLER_PID" 2>/dev/null || true
      pkill -9 -P "$WRANGLER_PID" 2>/dev/null || true
      # Kill any lingering workerd process for this project
      pkill -9 -f "workerd.*socket-addr=entry=127.0.0.1:${PORT}" 2>/dev/null || true
      exit 1
    fi
  fi

  sleep 5
done
