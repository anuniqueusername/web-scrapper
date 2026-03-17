#!/bin/bash
# =============================================================================
# Script:       07-update.sh
# Description:  Re-deploy the latest code to the server without a full teardown.
#               - rsync latest source (same excludes as 02-deploy.sh)
#               - npm install (picks up any new/changed dependencies)
#               - npm run build (rebuild the Next.js app)
#               - pm2 restart dashboard (zero-downtime reload of the dashboard)
#               - The scraper process is NOT restarted to preserve its running
#                 state and the scraper-config.json settings.
#
# Run this on:  YOUR LOCAL MACHINE
#
# Usage:        bash deploy-scripts/07-update.sh
#
# Prerequisites:
#   - 02-deploy.sh has been run at least once (initial deploy)
#   - 03-start-pm2.sh has been run (PM2 processes are running)
#   - SSH key access to the server
#
# Estimated time: 2-4 minutes
# =============================================================================
set -e

# ---------------------------------------------------------------------------
# Configuration — EDIT THESE (or copy from 02-deploy.sh)
# ---------------------------------------------------------------------------
DROPLET_IP="YOUR_DROPLET_IP"      # e.g. 167.99.123.45
DEPLOY_USER="deploy"
REMOTE_DIR="/home/deploy/app"

SSH_KEY="$HOME/.ssh/id_rsa"

# Set to "true" to also restart the scraper after the update.
# Leave as "false" to preserve the scraper's running state.
RESTART_SCRAPER="false"

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warning() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Validate configuration
# ---------------------------------------------------------------------------
if [[ "$DROPLET_IP" == "YOUR_DROPLET_IP" ]]; then
  error "Edit DROPLET_IP in this script before running."
fi

if [[ ! -f "$SSH_KEY" ]]; then
  error "SSH key not found at $SSH_KEY. Set SSH_KEY= to the correct path."
fi

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o BatchMode=yes"
SSH_TARGET="$DEPLOY_USER@$DROPLET_IP"
DEPLOY_START=$(date +%s)

echo ""
echo "============================================================"
info "Updating Kijiji Competitor Scraper on $DROPLET_IP"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Test SSH connectivity
# ---------------------------------------------------------------------------
info "Testing SSH connection..."
ssh $SSH_OPTS "$SSH_TARGET" "echo 'SSH OK'" || \
  error "Cannot SSH to $SSH_TARGET. Check DROPLET_IP and SSH_KEY."
success "SSH connection verified."

# ---------------------------------------------------------------------------
# Step 2: rsync latest code (same excludes as 02-deploy.sh)
# ---------------------------------------------------------------------------
info "Syncing updated files to $SSH_TARGET:$REMOTE_DIR ..."
rsync -avz --progress \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='data/*.json' \
  --exclude='data/*.db' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='*.log' \
  --exclude='deploy-scripts/' \
  --exclude='.git/' \
  --exclude='.gitignore' \
  -e "ssh $SSH_OPTS" \
  ./ \
  "$SSH_TARGET:$REMOTE_DIR/"
success "Files synced."

# ---------------------------------------------------------------------------
# Step 3: Remote — install dependencies, build, reload dashboard
# ---------------------------------------------------------------------------
info "Running remote build and PM2 reload..."

ssh $SSH_OPTS "$SSH_TARGET" bash << REMOTE
  set -e

  cd "$REMOTE_DIR"

  # Suppress Puppeteer's bundled Chromium download on npm install
  export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
  export PUPPETEER_EXECUTABLE_PATH=\$(command -v chromium-browser 2>/dev/null \
    || command -v chromium 2>/dev/null \
    || echo /usr/bin/chromium)

  echo ""
  echo "--- Remote: npm install ---"
  npm install --prefer-offline --no-audit --no-fund

  echo ""
  echo "--- Remote: npm run build ---"

  # Load production env for any build-time variables
  if [[ -f "$REMOTE_DIR/.env.production" ]]; then
    set -a
    source "$REMOTE_DIR/.env.production"
    set +a
  fi

  npm run build

  echo ""
  echo "--- Remote: reloading Next.js dashboard via PM2 ---"

  if pm2 list | grep -q "dashboard"; then
    pm2 restart dashboard
    echo "PM2: dashboard restarted."
  else
    echo "PM2: 'dashboard' process not found. Starting it now..."
    pm2 start node_modules/.bin/next --name "dashboard" --max-memory-restart 512M -- start
    pm2 save
  fi

  if [[ "$RESTART_SCRAPER" == "true" ]]; then
    echo ""
    echo "--- Remote: restarting scraper (RESTART_SCRAPER=true) ---"
    if pm2 list | grep -q "scraper"; then
      pm2 restart scraper
      echo "PM2: scraper restarted."
    else
      echo "PM2: 'scraper' process not found. Starting it now..."
      pm2 start scraper.js --name "scraper" --max-memory-restart 768M --kill-timeout 15000
      pm2 save
    fi
  else
    echo ""
    echo "Scraper NOT restarted (RESTART_SCRAPER=false)."
    echo "It will pick up config changes from scraper-config.json on the next run."
  fi

  echo ""
  echo "--- Remote: current PM2 status ---"
  pm2 list
REMOTE

# ---------------------------------------------------------------------------
# Step 4: Health check from the local machine
# ---------------------------------------------------------------------------
info "Health check — waiting for Next.js to respond on port 3000..."
sleep 5   # Brief wait for PM2 to complete the restart

READY=false
for i in $(seq 1 12); do
  if ssh $SSH_OPTS "$SSH_TARGET" "curl -sf http://localhost:3000 >/dev/null 2>&1"; then
    READY=true
    break
  fi
  echo "  Attempt $i/12 — waiting 3s..."
  sleep 3
done

if $READY; then
  success "Health check passed — Next.js is responding."
else
  warning "Next.js did not respond within ~36s after restart."
  warning "Check logs on the server: pm2 logs dashboard --lines 30"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
DEPLOY_END=$(date +%s)
DURATION=$(( DEPLOY_END - DEPLOY_START ))

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Update complete in ${DURATION}s!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Dashboard restarted. Scraper state preserved."
echo ""
echo "  To check server status:"
echo "    ssh $SSH_TARGET 'pm2 list'"
echo "    ssh $SSH_TARGET 'pm2 logs dashboard --lines 20'"
echo ""
