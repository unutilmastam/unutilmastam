#!/bin/bash
# cPanel "Git Version Control" -> "Deploy HEAD Commit" runs this from the cloned release branch
# (see .cpanel.yml). Order: settings check -> backup -> keep previous copy -> migrate -> copy ->
# restart -> health check. Any failure stops the deploy before the running app is touched.
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
. "$SRC/deploy/lib.sh"

mkdir -p "$DATA_DIR" "$BACKUP_DIR"
chmod 700 "$DATA_DIR" "$BACKUP_DIR"
# cPanel keeps no readable output of deploy tasks and its spinner never stops on failure, so the
# owner reads the result here (File Manager, no hidden files). The scripts print no secrets.
# The script re-runs itself through a plain pipe to tee. No process substitution: the cPanel deploy
# task has no /dev/fd, so that failed before the first line (hosting log, 2026-10-31).
RESULT_FILE="$DATA_DIR/deploy-natija.txt"
if [ -z "${HQ_DEPLOY_TEED:-}" ]; then
  set +e
  HQ_DEPLOY_TEED=1 /bin/bash "${BASH_SOURCE[0]}" "$@" 2>&1 | tee "$RESULT_FILE"
  rc="${PIPESTATUS[0]}"
  sync "$RESULT_FILE" 2>/dev/null || true
  exit "$rc"
fi
STEP="Node.js ni topish"
on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ "${FIRST_RUN:-}" != 1 ]; then
    log "XATO: deploy \"$STEP\" qadamida to'xtadi (kod $rc). Ishlab turgan ilovaga tegilmadi."
    log "Shu faylning hammasini skrinshot qilib yuboring."
  fi
}
trap on_exit EXIT

log "AI Sales HQ deploy: $(cat "$SRC/VERSION" 2>/dev/null | head -1)"
find_node
log "Node: $("$NODE" -v) ($NODE)"

if [ ! -f "$ENV_FILE" ]; then
  "$NODE" "$SRC/deploy/new-env.js" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log "Sozlamalar fayli yaratildi: $ENV_FILE"
  log "File Manager orqali oching, DB_NAME, DB_USER, DB_PASSWORD ni yozing, saqlang va yana 'Deploy HEAD Commit' bosing."
  FIRST_RUN=1
  exit 1
fi
chmod 600 "$ENV_FILE"

STEP="Sozlamalarni tekshirish"
log "1/6 Sozlamalarni tekshirish"
"$NODE" "$SRC/apps/api/dist/ops.js" check-config

STEP="Bazaning zaxira nusxasi"
log "2/6 Bazaning zaxira nusxasi"
/bin/bash "$SRC/deploy/backup.sh" pre-deploy

STEP="Joriy versiyani saqlash"
log "3/6 Joriy versiyani saqlash (orqaga qaytish uchun)"
# Only a real earlier release (it has VERSION); cPanel's own placeholder app is not worth keeping.
if [ -f "$APP_DIR/VERSION" ]; then sync_tree "$APP_DIR" "$PREV_DIR"; else log "Oldingi versiya yo'q (birinchi o'rnatish)"; fi

STEP="Migratsiyalar"
log "4/6 Migratsiyalar"
"$NODE" "$SRC/apps/api/dist/ops.js" migrate

STEP="Fayllarni ko'chirish"
log "5/6 Fayllarni ilova papkasiga ko'chirish va qayta ishga tushirish"
sync_tree "$SRC" "$APP_DIR"
mkdir -p "$APP_DIR/tmp"
touch "$APP_DIR/tmp/restart.txt"

STEP="Tekshiruv"
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
