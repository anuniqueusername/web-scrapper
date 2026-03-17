#!/bin/bash
# =============================================================================
# Script:       03-start-pm2.sh
# Description:  Start the Next.js dashboard and the scraper worker under PM2.
#               Run this once after the first deployment. For subsequent
#               deployments use 07-update.sh which does a graceful reload
#               instead of a cold start.
#
# Run this on:  THE SERVER as the 'deploy' user
#               (ssh deploy@<DROPLET_IP> then bash 03-start-pm2.sh)
#
# Usage:        bash 03-start-pm2.sh
#
# Prerequisites:
#   - 01-server-setup.sh has been run (PM2 is installed)
#   - 02-deploy.sh has been run (app is built in /home/deploy/app)
#   - .env.production is present at /home/deploy/app/.env.production
# =============================================================================
set -e

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
APP_DIR="/home/deploy/app"

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

echo ""
echo "============================================================"
info "Starting PM2 processes for Kijiji Competitor Scraper"
echo "============================================================"
echo ""

# Verify the app directory exists
[[ -d "$APP_DIR" ]] || error "App directory $APP_DIR not found. Run 02-deploy.sh first."

# Load .env.production so the processes inherit production environment variables
if [[ -f "$APP_DIR/.env.production" ]]; then
  info "Loading .env.production..."
  set -a
  source "$APP_DIR/.env.production"
  set +a
  success ".env.production loaded."
else
  warning ".env.production not found at $APP_DIR/.env.production"
  warning "Puppeteer and notification webhooks may not work correctly."
fi

# Make sure PUPPETEER_SKIP_CHROMIUM_DOWNLOAD is set so Puppeteer uses system Chromium
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH="${PUPPETEER_EXECUTABLE_PATH:-$(command -v chromium-browser 2>/dev/null || command -v chromium 2>/dev/null || echo /usr/bin/chromium)}"
info "Puppeteer will use Chromium at: $PUPPETEER_EXECUTABLE_PATH"

cd "$APP_DIR"

# ---------------------------------------------------------------------------
# Stop existing processes if they are already running (idempotent)
# ---------------------------------------------------------------------------
if pm2 list | grep -qE "dashboard|scraper"; then
  warning "PM2 processes already running — stopping them first for a clean start."
  pm2 delete dashboard 2>/dev/null || true
  pm2 delete scraper   2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Start Process 1: Next.js production server
#
#   --name dashboard       PM2 process name (used in pm2 restart/logs)
#   npm -- start           Runs "next start" as defined in package.json "production"
#                          NOTE: package.json uses "production" not "start" for next start.
#                          We pass the actual next start command directly to be explicit.
# ---------------------------------------------------------------------------
info "Starting Next.js dashboard (port 3000)..."
pm2 start node_modules/.bin/next \
  --name "dashboard" \
  --max-memory-restart 512M \
  --restart-delay 3000 \
  --max-restarts 10 \
  --log "$APP_DIR/logs/dashboard.log" \
  --merge-logs \
  -- start

success "Dashboard process started."

# ---------------------------------------------------------------------------
# Start Process 2: Puppeteer scraper worker
#
#   Fork mode (single instance) is required for Puppeteer — it manages its
#   own Chromium child processes and is not safe to run in cluster mode.
#
#   The scraper reads scraper-config.json on each run cycle, so interval
#   and URL changes made via the dashboard take effect without restarting.
# ---------------------------------------------------------------------------
info "Starting scraper worker..."
pm2 start scraper.js \
  --name "scraper" \
  --max-memory-restart 768M \
  --restart-delay 5000 \
  --max-restarts 5 \
  --kill-timeout 15000 \
  --log "$APP_DIR/logs/scraper.log" \
  --merge-logs

success "Scraper process started."

# ---------------------------------------------------------------------------
# Save the process list so PM2 restores it after a server reboot
# ---------------------------------------------------------------------------
info "Saving PM2 process list..."
pm2 save
success "PM2 process list saved."

# ---------------------------------------------------------------------------
# Configure PM2 to start on server boot
# ---------------------------------------------------------------------------
info "Configuring PM2 startup..."
echo ""
echo -e "${YELLOW}========================================================${NC}"
echo -e "${YELLOW}  ACTION REQUIRED — run the command printed below       ${NC}"
echo -e "${YELLOW}  with sudo to enable PM2 auto-start on reboot:         ${NC}"
echo -e "${YELLOW}========================================================${NC}"
echo ""

# pm2 startup prints the sudo command you need to run; we capture and display it
STARTUP_CMD=$(pm2 startup systemd --no-daemon 2>&1 | grep "sudo env" || true)

if [[ -n "$STARTUP_CMD" ]]; then
  echo "  $STARTUP_CMD"
  echo ""
  echo "  Copy the line above and run it as root/sudo."
else
  # Fallback — generate it manually
  pm2 startup systemd
fi

echo ""

# ---------------------------------------------------------------------------
# Health check — wait up to 30 seconds for Next.js to respond on port 3000
# ---------------------------------------------------------------------------
info "Waiting for Next.js to become ready..."
READY=false
for i in $(seq 1 15); do
  if curl -sf "http://localhost:3000" >/dev/null 2>&1; then
    READY=true
    break
  fi
  echo "  Attempt $i/15 — waiting 2s..."
  sleep 2
done

if $READY; then
  success "Next.js is responding on http://localhost:3000"
else
  warning "Next.js did not respond within 30s. Check logs:"
  echo "  pm2 logs dashboard --lines 30"
fi

# ---------------------------------------------------------------------------
# Print status and useful commands
# ---------------------------------------------------------------------------
echo ""
pm2 list
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  PM2 processes started!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Useful commands:"
echo "    pm2 list                  — show all processes"
echo "    pm2 logs                  — tail all logs"
echo "    pm2 logs dashboard        — Next.js logs only"
echo "    pm2 logs scraper          — scraper logs only"
echo "    pm2 restart dashboard     — restart dashboard only"
echo "    pm2 restart scraper       — restart scraper"
echo "    pm2 stop scraper          — stop scraper without killing dashboard"
echo "    pm2 monit                 — live process monitor"
echo ""
echo "  Next steps:"
echo "    sudo bash 04-nginx-setup.sh   — configure Nginx reverse proxy"
echo ""
