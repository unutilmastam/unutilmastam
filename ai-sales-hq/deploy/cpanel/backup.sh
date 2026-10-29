#!/bin/bash
# Daily cron (and before every deploy): compressed mysqldump into ~/ai-sales-hq-backups,
# outside public_html, kept 14 days. Usage: backup.sh [label]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
. "$HERE/deploy/lib.sh"
LABEL="${1:-daily}"
KEEP_DAYS="${HQ_BACKUP_KEEP_DAYS:-14}"
find_node
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
OUT="$BACKUP_DIR/hq-$(date -u +%Y%m%d-%H%M%S)-$LABEL.sql.gz"
CNF="$(mktemp)"
chmod 600 "$CNF"
trap 'rm -f "$CNF" "$OUT.part"' EXIT
"$NODE" "$HERE/apps/api/dist/ops.js" mysql-cnf > "$CNF"
DB="$("$NODE" "$HERE/apps/api/dist/ops.js" db-name)"
mysqldump --defaults-extra-file="$CNF" --single-transaction --quick --no-tablespaces --routines --triggers \
  --default-character-set=utf8mb4 "$DB" | gzip -9 > "$OUT.part"
mv "$OUT.part" "$OUT"
chmod 600 "$OUT"
find "$BACKUP_DIR" -maxdepth 1 -name 'hq-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
log "Zaxira nusxa: $OUT ($(du -h "$OUT" | cut -f1))"
