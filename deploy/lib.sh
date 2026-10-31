# Shared helpers for the cPanel scripts (sourced, not run). No secrets are printed.
APP_NAME="${HQ_APP_NAME:-ai-sales-hq-app}"
APP_DIR="${HQ_APP_DIR:-$HOME/$APP_NAME}"
DATA_DIR="$HOME/ai-sales-hq-data"
BACKUP_DIR="$HOME/ai-sales-hq-backups"
PREV_DIR="$HOME/ai-sales-hq-previous"
ENV_FILE="$DATA_DIR/hq.env"
export ENV_FILE

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# Node.js from the cPanel "Setup Node.js App" virtual environment (highest version installed).
find_node() {
  local n
  n="$(ls -d "$HOME"/nodevenv/"$APP_NAME"/*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
  if [ -z "$n" ] && command -v node >/dev/null 2>&1; then n="$(command -v node)"; fi
  if [ -z "$n" ] || [ ! -x "$n" ]; then
    log "XATO: Node.js topilmadi. cPanel -> Setup Node.js App da '$APP_NAME' ilovasini yarating (Node 22 yoki 20.19+)."
    return 1
  fi
  "$n" -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<20||(a===20&&b<19)){console.error("XATO: Node "+process.versions.node+" eski - 22 yoki 20.19+ kerak");process.exit(1)}' || return 1
  NODE="$n"
}

# Copies a release tree; rsync when available, otherwise cp (hostmaster.uz has no rsync).
# HQ_NO_RSYNC=1 forces the cp path (CI drill). Only parts present in $src are copied.
sync_tree() {
  local src="$1" dst="$2" part
  mkdir -p "$dst"
  if [ -z "${HQ_NO_RSYNC:-}" ] && command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude '.git' --exclude 'tmp/' --exclude 'logs/' --exclude '*.log' "$src/" "$dst/"
  else
    for part in apps deploy package.json VERSION; do
      rm -rf "${dst:?}/$part"
      if [ -e "$src/$part" ]; then cp -a "$src/$part" "$dst/"; fi
    done
  fi
}
