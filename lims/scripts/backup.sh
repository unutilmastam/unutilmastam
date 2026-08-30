#!/usr/bin/env bash
# ============================================================================
#  LabCore — kunlik zaxira nusxa (backup).
#
#  Nima saqlanadi:
#    1. PostgreSQL bazasi   — pg_dump (custom format, siqilgan)
#    2. Bemor fayllari      — tar.gz (PDF, rasm, rentgen)
#    3. SHA-256 nazorat summasi — 100 yildan keyin ham yaxlitlikni tekshirish uchun
#
#  Ishlatish:
#     ./scripts/backup.sh                 # .env dagi sozlamalar bilan
#     BACKUP_DIR=/mnt/nas/labcore ./scripts/backup.sh
#
#  Kunlik avtomatik ishga tushirish uchun (cron, har kuni 01:30 da):
#     30 1 * * * /opt/labcore/scripts/backup.sh >> /var/log/labcore-backup.log 2>&1
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# .env dan sozlamalarni o'qiymiz. Qiymatlar tirnoqsiz bo'lsa ham (masalan
# LAB_NAME=Markaziy laboratoriya) xato bermasligi uchun qatorma-qator eksport.
if [ -f .env ]; then
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in *[!A-Za-z0-9_]*) continue ;; esac
    export "$key=$value"
  done < .env
fi

DATABASE_URL="${DATABASE_URL:-postgres://labcore@localhost:5432/labcore}"
DATA_DIR="${DATA_DIR:-$PWD/data}"
BACKUP_DIR="${BACKUP_DIR:-$PWD/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
TARGET="$BACKUP_DIR/$STAMP"

mkdir -p "$TARGET"
echo "[$(date '+%F %T')] Zaxiralash boshlandi → $TARGET"

# 1) Ma'lumotlar bazasi
pg_dump --format=custom --compress=9 --file="$TARGET/labcore.dump" "$DATABASE_URL"
echo "  ✓ baza: $(du -h "$TARGET/labcore.dump" | cut -f1)"

# 2) Bemor fayllari
if [ -d "$DATA_DIR/Patients" ]; then
  tar -czf "$TARGET/patients-files.tar.gz" -C "$DATA_DIR" Patients
  echo "  ✓ fayllar: $(du -h "$TARGET/patients-files.tar.gz" | cut -f1)"
else
  echo "  • fayllar papkasi topilmadi ($DATA_DIR/Patients) — o'tkazib yuborildi"
fi

# 3) Nazorat summalari
( cd "$TARGET" && sha256sum ./* > CHECKSUMS.sha256 2>/dev/null || true )
echo "  ✓ nazorat summalari yozildi"

# 4) Eski nusxalarni tozalash
find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' -mtime "+$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true

# 5) Shifrlash (bulutga chiqadigan nusxa uchun majburiy tavsiya etiladi).
#    Tibbiy ma'lumot laboratoriyadan tashqariga faqat shifrlangan holda chiqsin.
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  for f in "$TARGET/labcore.dump" "$TARGET/patients-files.tar.gz"; do
    [ -f "$f" ] || continue
    openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
      -in "$f" -out "$f.enc" -pass env:BACKUP_PASSPHRASE
    rm -f "$f"
  done
  ( cd "$TARGET" && sha256sum ./* > CHECKSUMS.sha256 2>/dev/null || true )
  echo "  ✓ shifrlandi (AES-256)"
fi

# 6) Tashqi serverga nusxa (lokal tarmoqdagi ikkinchi kompyuter yoki NAS)
#    RSYNC_TARGET="user@backup-server:/backups/labcore"
if [ -n "${RSYNC_TARGET:-}" ]; then
  rsync -az --delete "$BACKUP_DIR/" "$RSYNC_TARGET/" && echo "  ✓ tashqi serverga yuborildi: $RSYNC_TARGET"
fi

# 7) Bulutga nusxa (rclone: S3, Google Drive, Yandex Disk va h.k.)
#    rclone config  → "labcloud" nomli remote yarating
#    RCLONE_REMOTE="labcloud:labcore-backup"
if [ -n "${RCLONE_REMOTE:-}" ]; then
  if ! command -v rclone >/dev/null; then
    echo "  ! rclone o'rnatilmagan — bulutga yuborilmadi (curl https://rclone.org/install.sh | sudo bash)"
  elif [ -z "${BACKUP_PASSPHRASE:-}" ] && [ "${ALLOW_UNENCRYPTED_CLOUD:-0}" != "1" ]; then
    echo "  ! BACKUP_PASSPHRASE berilmagan — shifrlanmagan tibbiy ma'lumot bulutga yuborilmadi."
    echo "    Ataylab shunday xohlasangiz: ALLOW_UNENCRYPTED_CLOUD=1"
  else
    rclone copy "$TARGET" "$RCLONE_REMOTE/$STAMP" --transfers 4 \
      && echo "  ✓ bulutga yuborildi: $RCLONE_REMOTE/$STAMP"
    # Bulutdagi eski nusxalarni ham tozalaymiz
    rclone delete "$RCLONE_REMOTE" --min-age "${KEEP_DAYS}d" --rmdirs 2>/dev/null || true
  fi
fi

echo "[$(date '+%F %T')] Zaxiralash tugadi. Jami: $(du -sh "$TARGET" | cut -f1)"
echo
echo "Tiklash (restore):"
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  echo "  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in $TARGET/labcore.dump.enc \\"
  echo "    -out labcore.dump -pass env:BACKUP_PASSPHRASE"
  echo "  pg_restore --clean --if-exists --dbname=\"\$DATABASE_URL\" labcore.dump"
else
  echo "  pg_restore --clean --if-exists --dbname=\"\$DATABASE_URL\" $TARGET/labcore.dump"
  echo "  tar -xzf $TARGET/patients-files.tar.gz -C \"$DATA_DIR\""
fi
