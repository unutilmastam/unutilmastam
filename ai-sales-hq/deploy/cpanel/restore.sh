#!/bin/bash
# Restores a backup into the configured database (cPanel Terminal). Destructive: asks first.
# Usage: restore.sh ~/ai-sales-hq-backups/hq-YYYYmmdd-HHMMSS-label.sql.gz [--yes]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
. "$HERE/deploy/lib.sh"
FILE="${1:-}"
[ -n "$FILE" ] || { log "XATO: zaxira fayli ko'rsatilmagan"; exit 1; }
[ -f "$FILE" ] || { log "XATO: $FILE topilmadi"; exit 1; }
find_node
DB="$("$NODE" "$HERE/apps/api/dist/ops.js" db-name)"
if [ "${2:-}" != "--yes" ]; then
  read -r -p "'$DB' bazasi $FILE bilan almashtiriladi. Davom etish uchun HA deb yozing: " answer
  [ "$answer" = "HA" ] || { log "Bekor qilindi"; exit 1; }
fi
CNF="$(mktemp)"
chmod 600 "$CNF"
trap 'rm -f "$CNF"' EXIT
"$NODE" "$HERE/apps/api/dist/ops.js" mysql-cnf > "$CNF"
gunzip -c "$FILE" | mysql --defaults-extra-file="$CNF" "$DB"
log "Tiklandi: $DB <- $FILE"
