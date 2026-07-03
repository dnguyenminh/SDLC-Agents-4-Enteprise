#!/bin/bash
# File watcher for code intelligence indexing (CLI mode)
# Watches workspace for file create/edit/delete and triggers incremental indexer
# Started by agentSpawn hook, killed on exit

WATCH_DIR="${1:-.}"
INDEXER=".analysis/code-intelligence/scripts/src/incremental-indexer.ts"
PIDFILE="/tmp/kiro-file-watcher-$$.pid"
EXTENSIONS="kt|java|ts|tsx|js|jsx|py|go|rs|cs|gradle|yml|yaml|properties|xml|sql|json|toml"

cleanup() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null
    rm -f "$PIDFILE"
  fi
}
trap cleanup EXIT

# Check dependencies
MISSING=""
command -v inotifywait &>/dev/null || MISSING="${MISSING} inotify-tools"
command -v jq &>/dev/null || MISSING="${MISSING} jq"
if [ -n "$MISSING" ]; then
  echo "⚠️ File watcher disabled. Missing packages:${MISSING}. Install: sudo apt install${MISSING}" >&2
  exit 1
fi

# Kill previous watcher if running
EXISTING_PID="/tmp/kiro-file-watcher.pid"
if [ -f "$EXISTING_PID" ]; then
  kill "$(cat "$EXISTING_PID")" 2>/dev/null
  rm -f "$EXISTING_PID"
fi

# Start watcher in background
inotifywait -m -r \
  --include ".*\\.($EXTENSIONS)$" \
  --exclude "(node_modules|build|dist|\.git|target)" \
  -e create -e modify -e delete \
  "$WATCH_DIR" 2>/dev/null | while read -r DIR EVENT FILE; do
    FILEPATH="${DIR}${FILE}"
    case "$EVENT" in
      CREATE|MODIFY)
        npx ts-node "$INDEXER" --files "$FILEPATH" 2>/dev/null &
        ;;
      DELETE)
        npx ts-node "$INDEXER" --files "$FILEPATH" 2>/dev/null &
        ;;
    esac
done &

echo $! > "$EXISTING_PID"
echo "File watcher started (PID: $!)"
