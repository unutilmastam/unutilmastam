#!/bin/bash
# cPanel "Git Version Control" -> "Deploy HEAD Commit" runs this from the cloned release branch
# (see .cpanel.yml). Order: settings check -> backup -> keep previous copy -> migrate -> copy ->
# restart -> health check. Any failure stops the deploy before the running app is touched.
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
. "$SRC/deploy/lib.sh"

log "AI Sales HQ deploy: $(cat "$SRC/VERSION" 2>/dev/null | head -1)"
find_node
log "Node: $("$NODE" -v) ($NODE)"

mkdir -p "$DATA_DIR" "$BACKUP_DIR"
chmod 700 "$DATA_DIR" "$BACKUP_DIR"
if [ ! -f "$ENV_FILE" ]; then
  "$NODE" "$SRC/deploy/new-env.js" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log "Sozlamalar fayli yaratildi: $ENV_FILE"
  log "File Manager orqali oching, DB_NAME, DB_USER, DB_PASSWORD ni yozing, saqlang va yana 'Deploy HEAD Commit' bosing."
  exit 1
fi
chmod 600 "$ENV_FILE"

log "1/6 Sozlamalarni tekshirish"
"$NODE" "$SRC/apps/api/dist/ops.js" check-config

log "2/6 Bazaning zaxira nusxasi"
/bin/bash "$SRC/deploy/backup.sh" pre-deploy

log "3/6 Joriy versiyani saqlash (orqaga qaytish uchun)"
if [ -d "$APP_DIR/apps" ]; then sync_tree "$APP_DIR" "$PREV_DIR"; fi

log "4/6 Migratsiyalar"
"$NODE" "$SRC/apps/api/dist/ops.js" migrate

log "5/6 Fayllarni ilova papkasiga ko'chirish va qayta ishga tushirish"
sync_tree "$SRC" "$APP_DIR"
mkdir -p "$APP_DIR/tmp"
touch "$APP_DIR/tmp/restart.txt"

log "6/6 Tekshiruv"
ORIGIN="$(grep -E '^APP_ORIGIN=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' || true)"
if [ "${HQ_SKIP_HEALTHCHECK:-}" = 1 ]; then
  log "Tekshiruv o'tkazib yuborildi (HQ_SKIP_HEALTHCHECK)"
elif [ -n "$ORIGIN" ] && command -v curl >/dev/null 2>&1; then
  ok=0
  for _ in 1 2 3 4 5 6; do
    sleep 5
    if curl -fsS --max-time 20 "$ORIGIN/api/v1/ready" >/dev/null 2>&1; then ok=1; break; fi
  done
  if [ "$ok" = 1 ]; then log "TAYYOR: $ORIGIN ishlayapti"; else log "OGOHLANTIRISH: $ORIGIN/api/v1/ready javob bermadi. Setup Node.js App -> RESTART ni bosing va qayta tekshiring."; fi
else
  log "Tekshiruv o'tkazib yuborildi (APP_ORIGIN yoki curl yo'q)"
fi
