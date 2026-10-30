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

# Copies a folder tree; rsync when available, otherwise cp.
sync_tree() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude '.git' --exclude 'tmp/' --exclude 'logs/' --exclude '*.log' "$src/" "$dst/"
  else
    rm -rf "$dst/apps" "$dst/deploy"
    cp -a "$src/apps" "$src/deploy" "$dst/"
    cp -a "$src/package.json" "$src/VERSION" "$dst/" 2>/dev/null || true
  fi
}
