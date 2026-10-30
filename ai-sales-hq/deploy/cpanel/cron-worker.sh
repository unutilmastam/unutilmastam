#!/bin/bash
# cPanel Cron Jobs, every minute:  /bin/bash $HOME/ai-sales-hq-app/deploy/cron-worker.sh
# One bounded worker run (<= 50 s, DB lock against overlap); log kept small for shared hosting.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
. "$HERE/deploy/lib.sh"
LOG_DIR="$DATA_DIR/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/worker.log"
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5000000 ]; then
  mv -f "$LOG.2" "$LOG.3" 2>/dev/null; mv -f "$LOG.1" "$LOG.2" 2>/dev/null; mv -f "$LOG" "$LOG.1"
fi
find_node >> "$LOG" 2>&1 || exit 1
"$NODE" "$HERE/apps/api/dist/worker.js" --once --max-seconds 50 >> "$LOG" 2>&1
