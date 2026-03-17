#!/bin/bash
# =============================================================================
# Script:       01-server-setup.sh
# Description:  One-time server provisioning for the Kijiji Competitor Scraper.
#               Installs Node.js 20, PM2, Nginx, Chromium + all Puppeteer deps,
#               creates the 'deploy' user, and locks down the firewall.
#
# Run this on:  THE SERVER (Digital Ocean Droplet — Ubuntu 22.04 LTS)
# Run as:       root  (ssh root@<DROPLET_IP> then bash 01-server-setup.sh)
#
# Usage:        bash 01-server-setup.sh
#
# Estimated time: 5-10 minutes on a fresh droplet
# =============================================================================
set -e

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEPLOY_USER="deploy"
APP_DIR="/home/deploy/app"
NODE_VERSION="20"

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
# Must run as root
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  error "Run this script as root: sudo bash 01-server-setup.sh"
fi

echo ""
echo "============================================================"
info "Starting server setup for Kijiji Competitor Scraper"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# 1. System update
# ---------------------------------------------------------------------------
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git unzip build-essential \
  ca-certificates gnupg lsb-release \
  software-properties-common \
  fail2ban logrotate rsync
success "System packages updated."

# ---------------------------------------------------------------------------
# 2. Create 'deploy' user
#    Idempotent: skips if user already exists.
# ---------------------------------------------------------------------------
if id "$DEPLOY_USER" &>/dev/null; then
  warning "User '$DEPLOY_USER' already exists — skipping creation."
else
  info "Creating user '$DEPLOY_USER'..."
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  # Disable password login — SSH key auth only
  passwd -l "$DEPLOY_USER"
  success "User '$DEPLOY_USER' created and added to sudo group."
fi

# Create the app directory and hand it to the deploy user
mkdir -p "$APP_DIR/data"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER"
success "App directory created at $APP_DIR"

# ---------------------------------------------------------------------------
# 3. Node.js 20 LTS via NodeSource
#    Idempotent: checks for an existing v20.x install before running setup.
# ---------------------------------------------------------------------------
if node --version 2>/dev/null | grep -q "^v${NODE_VERSION}"; then
  warning "Node.js $(node --version) already installed — skipping."
else
  info "Installing Node.js ${NODE_VERSION} LTS..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
  success "Node.js $(node --version) installed."
fi

# ---------------------------------------------------------------------------
# 4. PM2 — global process manager
# ---------------------------------------------------------------------------
if command -v pm2 &>/dev/null; then
  warning "PM2 already installed ($(pm2 --version)) — skipping."
else
  info "Installing PM2 globally..."
  npm install -g pm2
  success "PM2 $(pm2 --version) installed."
fi

# ---------------------------------------------------------------------------
# 5. Nginx
# ---------------------------------------------------------------------------
if command -v nginx &>/dev/null; then
  warning "Nginx already installed — skipping."
else
  info "Installing Nginx..."
  apt-get install -y nginx
  systemctl enable nginx
  systemctl start nginx
  success "Nginx installed and started."
fi

# ---------------------------------------------------------------------------
# 6. Chromium + all Puppeteer Linux dependencies
#
#    Puppeteer requires a full set of shared libraries that are not present
#    on a minimal Ubuntu server image. Every package below is needed for
#    Chromium to launch in headless mode without --no-sandbox disabled.
#    We still pass --no-sandbox in the scraper because we run as non-root,
#    but these libraries must exist even so.
# ---------------------------------------------------------------------------
if command -v chromium-browser &>/dev/null || command -v chromium &>/dev/null; then
  warning "Chromium already installed — skipping."
else
  info "Installing Chromium and Puppeteer dependencies..."
  apt-get install -y \
    chromium-browser \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libcups2 \
    libxss1 \
    libxrandr2 \
    libasound2t64 \
    libatk1.0-0 \
    libgtk-3-0 \
    libdrm2 \
    libgbm1 \
    libxkbcommon0 \
    libatk-bridge2.0-0 \
    libxfixes3 \
    libnspr4 \
    libdbus-1-3 \
    fonts-liberation \
    xdg-utils \
    --no-install-recommends
  success "Chromium and dependencies installed."
fi

# Resolve the chromium binary path so we can tell the operator what to put
# in their .env file for PUPPETEER_EXECUTABLE_PATH.
CHROMIUM_PATH=$(command -v chromium-browser 2>/dev/null \
  || command -v chromium 2>/dev/null \
  || echo "/usr/bin/chromium")
info "Chromium binary detected at: $CHROMIUM_PATH"

# ---------------------------------------------------------------------------
# 7. fail2ban — SSH brute-force protection
# ---------------------------------------------------------------------------
if systemctl is-active --quiet fail2ban; then
  warning "fail2ban already running — skipping."
else
  systemctl enable fail2ban
  systemctl start fail2ban
  success "fail2ban enabled."
fi

# ---------------------------------------------------------------------------
# 8. UFW firewall
#    Allow SSH (22), HTTP (80), HTTPS (443).
#    Port 3000 (Next.js) must NOT be opened publicly — Nginx proxies to it.
# ---------------------------------------------------------------------------
info "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
# Port 3000 is intentionally left closed to the internet
ufw --force enable
success "UFW firewall enabled: ports 22, 80, 443 open. Port 3000 internal only."

# ---------------------------------------------------------------------------
# 9. Logrotate for app and scraper logs
# ---------------------------------------------------------------------------
info "Configuring log rotation..."
cat > /etc/logrotate.d/competitor-scraper << LOGROTATE
/home/deploy/app/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 deploy deploy
    sharedscripts
    postrotate
        pm2 reloadLogs 2>/dev/null || true
    endscript
}
LOGROTATE
success "Log rotation configured."

# ---------------------------------------------------------------------------
# Done — print next steps
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Server setup complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Next steps (from your LOCAL machine):"
echo ""
echo "  1. Copy your SSH public key to the deploy user:"
echo "       ssh-copy-id deploy@<DROPLET_IP>"
echo ""
echo "  2. Copy your .env.production file to the server:"
echo "       scp .env.production deploy@<DROPLET_IP>:$APP_DIR/.env.production"
echo ""
echo "     Add this line to your .env.production:"
echo "       PUPPETEER_EXECUTABLE_PATH=$CHROMIUM_PATH"
echo "       PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true"
echo ""
echo "  3. Run the deploy script from your local machine:"
echo "       bash deploy-scripts/02-deploy.sh"
echo ""
echo "  4. Then on the server, start PM2:"
echo "       bash deploy-scripts/03-start-pm2.sh"
echo ""
echo "  5. Then on the server, configure Nginx:"
echo "       sudo bash deploy-scripts/04-nginx-setup.sh"
echo ""
