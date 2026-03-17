#!/bin/bash
# =============================================================================
# Description:  Emergency rollback — points the 'current' symlink at the
#               previous release and reloads PM2. Run from your local machine.
#
# Usage:        bash scripts/rollback.sh [--host <ip>] [--steps <n>]
#
#   --host  <ip>   Droplet IP (or set DEPLOY_HOST env var)
#   --user  <user> SSH user (default: scraper)
#   --key   <path> SSH private key (default: ~/.ssh/id_rsa)
#   --steps <n>    How many releases to roll back (default: 1)
#   --list         List available releases and exit
#
# Estimated time: < 30 seconds
# =============================================================================
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-scraper}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"
APP_DIR="/var/www/web-scraper"
STEPS=1
LIST_ONLY=false

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)  DEPLOY_HOST="$2"; shift 2 ;;
    --user)  DEPLOY_USER="$2"; shift 2 ;;
    --key)   SSH_KEY="$2";     shift 2 ;;
    --steps) STEPS="$2";       shift 2 ;;
    --list)  LIST_ONLY=true;   shift ;;
    *) error "Unknown flag: $1" ;;
  esac
done

[[ -z "$DEPLOY_HOST" ]] && error "Set DEPLOY_HOST or use --host <ip>"
[[ ! -f "$SSH_KEY" ]]   && error "SSH key not found: $SSH_KEY"

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o BatchMode=yes"

if $LIST_ONLY; then
  ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "ls -1t $APP_DIR/releases"
  exit 0
fi

info "Rolling back $STEPS step(s) on $DEPLOY_HOST..."

ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" bash << REMOTE
  set -euo pipefail
  APP_DIR="$APP_DIR"
  STEPS="$STEPS"

  RELEASES=(\$(ls -1t "\$APP_DIR/releases"))
  CURRENT_TARGET=\$(readlink -f "\$APP_DIR/current" | xargs basename)
  CURRENT_INDEX=0

  for i in "\${!RELEASES[@]}"; do
    if [[ "\${RELEASES[\$i]}" == "\$CURRENT_TARGET" ]]; then
      CURRENT_INDEX=\$i
      break
    fi
  done

  TARGET_INDEX=\$(( CURRENT_INDEX + STEPS ))
  if [[ \$TARGET_INDEX -ge \${#RELEASES[@]} ]]; then
    echo "Cannot roll back \$STEPS step(s) — only \${#RELEASES[@]} releases available."
    exit 1
  fi

  TARGET_RELEASE="\${RELEASES[\$TARGET_INDEX]}"
  echo "Current release:  \$CURRENT_TARGET"
  echo "Rolling back to:  \$TARGET_RELEASE"

  ln -sfn "\$APP_DIR/releases/\$TARGET_RELEASE" "\$APP_DIR/current"
  cd "\$APP_DIR/current"
  pm2 reload ecosystem.config.js --update-env
  pm2 save

  echo "Rollback complete. Now running: \$TARGET_RELEASE"
REMOTE

success "Rollback complete."
