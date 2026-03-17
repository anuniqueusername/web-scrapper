#!/bin/bash
# =============================================================================
# Description:  Deployment script for the Kijiji Competitor Scraper.
#               Run from your LOCAL machine to deploy to the Digital Ocean
#               droplet over SSH. Safe to run multiple times (idempotent).
#
# Usage:        bash scripts/deploy.sh [OPTIONS]
#
#   Options:
#     --host <ip>       Droplet IP or hostname (overrides DEPLOY_HOST env var)
#     --user <user>     SSH user (default: scraper)
#     --key  <path>     Path to SSH private key (default: ~/.ssh/id_rsa)
#     --branch <name>   Git branch to deploy (default: main)
#     --skip-build      Skip npm build (useful for config-only deploys)
#     --rollback        Roll back to the previous release
#
# Prerequisites:
#   - SSH key copied to the droplet:  ssh-copy-id scraper@<DROPLET_IP>
#   - setup-droplet.sh has been run on the server
#   - DEPLOY_HOST environment variable set (or use --host flag)
#
# Estimated time: 2-4 minutes (depends on build cache)
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults (override via flags or environment variables)
# ---------------------------------------------------------------------------
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-scraper}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"
BRANCH="${BRANCH:-main}"
APP_DIR="/var/www/web-scraper"
SKIP_BUILD=false
ROLLBACK=false

# Notification webhook (optional — set in your shell environment)
DISCORD_WEBHOOK="${DISCORD_DEPLOY_WEBHOOK:-}"

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warning() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
step()    { echo -e "\n${CYAN}>>> $*${NC}"; }

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)     DEPLOY_HOST="$2";  shift 2 ;;
    --user)     DEPLOY_USER="$2";  shift 2 ;;
    --key)      SSH_KEY="$2";      shift 2 ;;
    --branch)   BRANCH="$2";       shift 2 ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --rollback) ROLLBACK=true;     shift ;;
    *) error "Unknown option: $1. See script header for usage." ;;
  esac
done

# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------
[[ -z "$DEPLOY_HOST" ]] && error "No deploy host set. Use --host <ip> or export DEPLOY_HOST=<ip>"
[[ ! -f "$SSH_KEY" ]]   && error "SSH key not found at $SSH_KEY. Use --key <path> to specify."

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o BatchMode=yes"
SSH_TARGET="$DEPLOY_USER@$DEPLOY_HOST"
DEPLOY_START=$(date +%s)

# ---------------------------------------------------------------------------
# Optional: send Discord notification
# ---------------------------------------------------------------------------
notify_discord() {
  local message="$1"
  local color="${2:-3066993}"  # default green
  if [[ -n "$DISCORD_WEBHOOK" ]]; then
    curl -s -X POST "$DISCORD_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"embeds\":[{\"title\":\"Kijiji Scraper Deployment\",\"description\":\"$message\",\"color\":$color}]}" \
      >/dev/null 2>&1 || true
  fi
}

# ---------------------------------------------------------------------------
# Rollback mode: swap symlink back to previous release
# ---------------------------------------------------------------------------
if $ROLLBACK; then
  step "Rolling back to previous release..."
  ssh $SSH_OPTS "$SSH_TARGET" bash << REMOTE
    set -euo pipefail
    cd "$APP_DIR"
    if [[ ! -d releases ]]; then
      echo "No releases directory found — cannot roll back."
      exit 1
    fi
    CURRENT=\$(readlink -f current 2>/dev/null || echo "")
    PREV_RELEASE=\$(ls -1t releases | sed -n '2p')
    if [[ -z "\$PREV_RELEASE" ]]; then
      echo "No previous release to roll back to."
      exit 1
    fi
    echo "Rolling back to: \$PREV_RELEASE"
    ln -sfn "releases/\$PREV_RELEASE" current
    cd current
    pm2 reload ecosystem.config.js --update-env
    echo "Rollback complete."
REMOTE
  success "Rollback complete."
  notify_discord "Rolled back to previous release on $DEPLOY_HOST" "16711680"
  exit 0
fi

# ---------------------------------------------------------------------------
# Deployment — runs entirely on the remote server via a heredoc
# ---------------------------------------------------------------------------
step "Connecting to $SSH_TARGET..."
ssh $SSH_OPTS "$SSH_TARGET" -t bash << REMOTE
  set -euo pipefail

  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
  info()    { echo -e "\${BLUE}[INFO]\${NC}  \$*"; }
  success() { echo -e "\${GREEN}[OK]\${NC}    \$*"; }
  warning() { echo -e "\${YELLOW}[WARN]\${NC}  \$*"; }
  error()   { echo -e "\${RED}[ERROR]\${NC} \$*" >&2; exit 1; }

  APP_DIR="$APP_DIR"
  RELEASE_ID="\$(date +%Y%m%d_%H%M%S)"
  RELEASE_DIR="\$APP_DIR/releases/\$RELEASE_ID"

  # -------------------------------------------------------------------
  # Step 1: Ensure directory layout
  # -------------------------------------------------------------------
  info "Preparing release directory layout..."
  mkdir -p "\$APP_DIR/releases"
  mkdir -p "\$APP_DIR/shared/data"    # Persistent SQLite + JSON
  mkdir -p "\$APP_DIR/shared/logs"    # Persistent log files

  # -------------------------------------------------------------------
  # Step 2: Pull latest code into a timestamped release folder
  # -------------------------------------------------------------------
  info "Fetching latest code from branch '$BRANCH'..."
  if [[ -d "\$APP_DIR/repo/.git" ]]; then
    cd "\$APP_DIR/repo"
    git fetch --all --prune
    git checkout "$BRANCH"
    git reset --hard "origin/$BRANCH"
  else
    git clone --branch "$BRANCH" --single-branch \
      "\$(cat \$APP_DIR/.repo-url 2>/dev/null || echo '')" "\$APP_DIR/repo" \
      2>/dev/null || error "No repo URL found. Create \$APP_DIR/.repo-url with your git clone URL."
  fi

  # Copy the working tree to a new immutable release snapshot
  rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
    "\$APP_DIR/repo/" "\$RELEASE_DIR/"
  success "Release snapshot created at \$RELEASE_DIR"

  # -------------------------------------------------------------------
  # Step 3: Symlink shared persistent data into the release
  # -------------------------------------------------------------------
  info "Linking shared persistent files..."
  ln -sfn "\$APP_DIR/shared/data"             "\$RELEASE_DIR/data"
  ln -sfn "\$APP_DIR/shared/scraper-config.json"  "\$RELEASE_DIR/scraper-config.json"  2>/dev/null || true
  ln -sfn "\$APP_DIR/shared/scraper-status.json"  "\$RELEASE_DIR/scraper-status.json"  2>/dev/null || true
  ln -sfn "\$APP_DIR/shared/.env.production"      "\$RELEASE_DIR/.env.production"       2>/dev/null || true
  # facebook status
  ln -sfn "\$APP_DIR/shared/facebook-scraper-status.json" \
    "\$RELEASE_DIR/facebook-scraper-status.json" 2>/dev/null || true

  # -------------------------------------------------------------------
  # Step 4: Install dependencies
  # -------------------------------------------------------------------
  info "Installing Node dependencies (npm ci)..."
  cd "\$RELEASE_DIR"

  # Tell Puppeteer to skip its bundled Chromium download and use system Chromium
  export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
  export PUPPETEER_EXECUTABLE_PATH="\$(command -v chromium-browser 2>/dev/null || command -v chromium || echo /usr/bin/chromium)"

  npm ci --prefer-offline --no-audit --no-fund
  success "Dependencies installed."

  # -------------------------------------------------------------------
  # Step 5: Build Next.js
  # -------------------------------------------------------------------
  if [[ "$SKIP_BUILD" != "true" ]]; then
    info "Building Next.js app..."
    # Load production env for build-time variables
    if [[ -f "\$APP_DIR/shared/.env.production" ]]; then
      set -a; source "\$APP_DIR/shared/.env.production"; set +a
    fi
    npm run build
    success "Next.js build complete."
  else
    warning "Skipping build (--skip-build flag was set)."
  fi

  # -------------------------------------------------------------------
  # Step 6: Copy PM2 ecosystem config into the release
  # -------------------------------------------------------------------
  if [[ -f "\$APP_DIR/shared/ecosystem.config.js" ]]; then
    cp "\$APP_DIR/shared/ecosystem.config.js" "\$RELEASE_DIR/ecosystem.config.js"
  fi

  # -------------------------------------------------------------------
  # Step 7: Swap the 'current' symlink atomically
  # -------------------------------------------------------------------
  info "Updating 'current' symlink..."
  ln -sfn "\$RELEASE_DIR" "\$APP_DIR/current"
  success "Symlink updated: \$APP_DIR/current -> \$RELEASE_DIR"

  # -------------------------------------------------------------------
  # Step 8: Zero-downtime PM2 reload
  # -------------------------------------------------------------------
  info "Reloading PM2 processes..."
  cd "\$APP_DIR/current"

  if pm2 list | grep -q "web-scraper\|next-app\|scraper-worker"; then
    pm2 reload ecosystem.config.js --update-env
  else
    pm2 start ecosystem.config.js
  fi

  pm2 save
  success "PM2 processes reloaded."

  # -------------------------------------------------------------------
  # Step 9: Health check — wait for Next.js to respond
  # -------------------------------------------------------------------
  info "Running health check..."
  HEALTH_OK=false
  for i in \$(seq 1 15); do
    if curl -sf "http://localhost:3000" >/dev/null 2>&1; then
      HEALTH_OK=true
      break
    fi
    echo "  Waiting for app to start... (\${i}/15)"
    sleep 2
  done

  if \$HEALTH_OK; then
    success "Health check passed — app is responding on port 3000."
  else
    echo -e "\${RED}[ERROR]\${NC} Health check failed after 30s. Checking PM2 logs..."
    pm2 logs --nostream --lines 20
    exit 1
  fi

  # -------------------------------------------------------------------
  # Step 10: Prune old releases (keep last 5)
  # -------------------------------------------------------------------
  info "Pruning old releases (keeping last 5)..."
  ls -1t "\$APP_DIR/releases" | tail -n +6 | while read -r old; do
    rm -rf "\$APP_DIR/releases/\$old"
    echo "  Removed old release: \$old"
  done

  echo ""
  echo -e "\${GREEN}==========================================================\${NC}"
  echo -e "\${GREEN}  Deployment successful! Release: \$RELEASE_ID\${NC}"
  echo -e "\${GREEN}==========================================================\${NC}"
REMOTE

# ---------------------------------------------------------------------------
# Local post-deploy steps
# ---------------------------------------------------------------------------
DEPLOY_END=$(date +%s)
DURATION=$(( DEPLOY_END - DEPLOY_START ))

success "Deployment finished in ${DURATION}s."
notify_discord "Deployment succeeded on \`$DEPLOY_HOST\` (branch: \`$BRANCH\`) in ${DURATION}s" "3066993"
