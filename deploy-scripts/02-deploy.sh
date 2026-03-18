#!/bin/bash
# =============================================================================
# Script:       02-deploy.sh
# Description:  First-time deployment of the Kijiji Competitor Scraper.
#               Uses rsync to copy project files to the server, then SSHes in
#               to install dependencies and build the Next.js app.
#
# Run this on:  YOUR LOCAL MACHINE
#
# Usage:        bash deploy-scripts/02-deploy.sh
#
# Prerequisites:
#   - 01-server-setup.sh has been run on the server
#   - Your SSH public key is on the server for the deploy user:
#       ssh-copy-id deploy@<DROPLET_IP>
#   - .env.production has been copied to the server:
#       scp .env.production deploy@<DROPLET_IP>:/home/deploy/app/.env.production
#   - Fill in the three variables below before running
#
# Estimated time: 3-6 minutes (first build takes longer)
# =============================================================================
set -e

# ---------------------------------------------------------------------------
# Configuration — EDIT THESE before running
# ---------------------------------------------------------------------------
DROPLET_IP="YOUR_DROPLET_IP"      # e.g. 167.99.123.45
DEPLOY_USER="deploy"
REMOTE_DIR="/home/deploy/app"

# Path to your SSH private key (default works if you used ssh-keygen defaults)
SSH_KEY="$HOME/.ssh/id_rsa"

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

echo ""
echo "============================================================"
info "Deploying Kijiji Competitor Scraper to $DROPLET_IP"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Test SSH connectivity before doing any work
# ---------------------------------------------------------------------------
info "Testing SSH connection to $SSH_TARGET..."
ssh $SSH_OPTS "$SSH_TARGET" "echo 'SSH OK'" || \
  error "Cannot connect to $SSH_TARGET. Check DROPLET_IP, SSH_KEY, and that the deploy user exists."
success "SSH connection verified."

# ---------------------------------------------------------------------------
# Step 2: Ensure the data directory exists on the server
#         This directory persists across deployments — never rsync'd over.
# ---------------------------------------------------------------------------
info "Ensuring data directory exists on server..."
ssh $SSH_OPTS "$SSH_TARGET" "mkdir -p $REMOTE_DIR/data"
success "Remote data directory ready."

# ---------------------------------------------------------------------------
# Step 3: rsync project files to the server
#
#   Excluded from transfer:
#     node_modules/     - installed fresh on server via npm install
#     .next/            - built fresh on server via npm run build
#     data/             - persistent SQLite DB and listings JSON; never overwrite
#     .env              - local dev env; use .env.production on server
#     .env.*            - all env files (copy manually via scp)
#     *.log             - local log files
#     deploy-scripts/   - only needed locally
#     .git/             - not needed on server
# ---------------------------------------------------------------------------
info "Syncing files to $SSH_TARGET:$REMOTE_DIR ..."
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
success "Files synced to server."

# ---------------------------------------------------------------------------
# Step 4: Remote — install dependencies and build the app
# ---------------------------------------------------------------------------
info "Installing dependencies and building on server..."

ssh $SSH_OPTS "$SSH_TARGET" bash << REMOTE
  set -e

  echo ""
  echo "--- Remote: installing Node dependencies ---"
  cd "$REMOTE_DIR"

  # Tell Puppeteer to skip bundled Chromium download; use system Chromium
  export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
  export PUPPETEER_EXECUTABLE_PATH=\$(command -v chromium-browser 2>/dev/null \
    || command -v chromium 2>/dev/null \
    || echo /usr/bin/chromium)

  npm install --prefer-offline --no-audit --no-fund
  echo ""
  echo "--- Remote: building Next.js app ---"

  # Load .env.production for any build-time variables
  if [[ -f "$REMOTE_DIR/.env.production" ]]; then
    set -a
    source "$REMOTE_DIR/.env.production"
    set +a
  fi

  # Use Turbopack (Next.js 16 default).  The next.config.js turbopack block
  # declares Node built-in externals so child_process, fs, etc. are never
  # bundled.  Standalone scripts (scraper.js, facebook-worker-runner.js) are
  # excluded from the bundle entirely — they are copied by rsync and run
  # directly by PM2 / API spawn calls.
  npm run build

  echo ""
  echo "--- Remote: setting file permissions ---"
  # Ensure data directory is writable for SQLite and JSON writes
  chmod 755 "$REMOTE_DIR/data"

  echo "Build complete."
REMOTE

success "Dependencies installed and Next.js build complete."

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Deployment files synced and app built successfully!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Next step: start the app with PM2 on the server:"
echo ""
echo "    ssh $SSH_TARGET"
echo "    bash $REMOTE_DIR/deploy-scripts/03-start-pm2.sh"
echo ""
echo "  Or copy 03-start-pm2.sh to the server and run it:"
echo "    scp -i $SSH_KEY deploy-scripts/03-start-pm2.sh $SSH_TARGET:~/"
echo "    ssh $SSH_OPTS $SSH_TARGET 'bash ~/03-start-pm2.sh'"
echo ""
