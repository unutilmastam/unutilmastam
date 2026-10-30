#!/bin/bash
# Puts back the copy saved by the last deploy (cPanel Terminal). The database is not changed:
# migrations only add; if a deploy must be undone completely, restore its pre-deploy backup.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
. "$HERE/deploy/lib.sh"
[ -d "$PREV_DIR/apps" ] || { log "XATO: oldingi versiya saqlanmagan ($PREV_DIR)"; exit 1; }
log "Oldingi versiya: $(head -1 "$PREV_DIR/VERSION" 2>/dev/null || echo nomalum)"
sync_tree "$PREV_DIR" "$APP_DIR"
mkdir -p "$APP_DIR/tmp"
touch "$APP_DIR/tmp/restart.txt"
log "Orqaga qaytarildi va qayta ishga tushirildi"
