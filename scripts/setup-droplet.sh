#!/bin/bash
# =============================================================================
# Description:  One-time Digital Ocean Droplet provisioning script
#               Sets up Ubuntu 22.04 LTS with all dependencies for the
#               Kijiji Competitor Scraper (Next.js + Puppeteer workers).
#
# Usage:        Run once as root (or via sudo) on a fresh droplet:
#                 bash setup-droplet.sh
#               Or provide your repo URL as the first argument:
#                 bash setup-droplet.sh https://github.com/youruser/yourrepo.git
#
# Prerequisites:
#   - Ubuntu 22.04 LTS (Droplet)
#   - Root or sudo access
#   - Git repo URL ready (or pass as $1)
#
# Estimated time: 5-10 minutes on a standard droplet
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — edit these before running
# ---------------------------------------------------------------------------
APP_USER="scraper"                         # Non-root user that owns the app
APP_DIR="/var/www/web-scraper"          # Where the app lives on the server
NODE_VERSION="20"                          # Node.js LTS major version
REPO_URL="${1:-}"                          # Pass your git clone URL as arg $1
APP_PORT="3000"                            # Next.js default port

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Colour

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warning() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Must be run as root
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root. Try: sudo bash setup-droplet.sh"
fi

info "Starting Droplet provisioning for Web Scraper..."
echo "-----------------------------------------------------------"

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
  ufw fail2ban logrotate
success "System packages updated."

# ---------------------------------------------------------------------------
# 2. Create non-root app user
# ---------------------------------------------------------------------------
if id "$APP_USER" &>/dev/null; then
  warning "User '$APP_USER' already exists — skipping creation."
else
  useradd --create-home --shell /bin/bash --groups sudo "$APP_USER"
  # Lock password login; SSH key auth only
  passwd -l "$APP_USER"
  success "Created user '$APP_USER' (password login disabled)."
fi

# ---------------------------------------------------------------------------
# 3. Node.js 20 LTS via NodeSource
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
# 4. PM2 — process manager
# ---------------------------------------------------------------------------
if command -v pm2 &>/dev/null; then
  warning "PM2 $(pm2 --version) already installed — skipping."
else
  info "Installing PM2 globally..."
  npm install -g pm2
  pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -1 | bash || true
  success "PM2 installed and configured for startup."
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
  success "Nginx installed and enabled."
fi

# ---------------------------------------------------------------------------
# 6. Chromium for Puppeteer
#    Puppeteer 24+ can download its own bundled Chromium via npm install,
#    but we also install the system Chromium as a fallback and for the
#    PUPPETEER_EXECUTABLE_PATH env var.
# ---------------------------------------------------------------------------
if command -v chromium-browser &>/dev/null || command -v chromium &>/dev/null; then
  warning "Chromium already installed — skipping."
else
  info "Installing Chromium and dependencies for Puppeteer..."
  apt-get install -y \
    chromium-browser \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends
  success "Chromium installed."
fi

# Resolve the chromium binary path for the .env file later
CHROMIUM_PATH=$(command -v chromium-browser 2>/dev/null || command -v chromium 2>/dev/null || echo "/usr/bin/chromium")
info "Chromium binary: $CHROMIUM_PATH"

# ---------------------------------------------------------------------------
# 7. UFW Firewall rules
# ---------------------------------------------------------------------------
info "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh        # port 22
ufw allow http       # port 80
ufw allow https      # port 443
# Do NOT expose port 3000 publicly — Nginx proxies to it internally
ufw --force enable
success "UFW firewall configured (22/80/443 open, 3000 internal only)."

# ---------------------------------------------------------------------------
# 8. fail2ban — SSH brute-force protection
# ---------------------------------------------------------------------------
if systemctl is-active --quiet fail2ban; then
  warning "fail2ban already running — skipping."
else
  systemctl enable fail2ban
  systemctl start fail2ban
  success "fail2ban enabled."
fi

# ---------------------------------------------------------------------------
# 9. Application directory
# ---------------------------------------------------------------------------
info "Creating application directory at $APP_DIR..."
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/data"        # SQLite + JSON data — persists across deploys
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
success "App directory created and owned by $APP_USER."

# ---------------------------------------------------------------------------
# 10. Clone the repository (only if REPO_URL was provided)
# ---------------------------------------------------------------------------
if [[ -n "$REPO_URL" ]]; then
  if [[ -d "$APP_DIR/.git" ]]; then
    warning "Git repo already exists at $APP_DIR — skipping clone."
  else
    info "Cloning $REPO_URL into $APP_DIR..."
    sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
    success "Repository cloned."
  fi
else
  warning "No REPO_URL provided. Clone manually:"
  warning "  sudo -u $APP_USER git clone <your-repo-url> $APP_DIR"
fi

# ---------------------------------------------------------------------------
# 11. Copy Nginx config stub (will be overwritten by nginx.conf later)
# ---------------------------------------------------------------------------
info "Disabling default Nginx site..."
rm -f /etc/nginx/sites-enabled/default
success "Default Nginx site disabled."

# ---------------------------------------------------------------------------
# 12. Logrotate for the app logs
# ---------------------------------------------------------------------------
info "Configuring log rotation for scraper logs..."
cat > /etc/logrotate.d/web-scraper << 'LOGROTATE'
/var/www/web-scraper/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 scraper scraper
    sharedscripts
    postrotate
        pm2 reloadLogs 2>/dev/null || true
    endscript
}
LOGROTATE
success "Log rotation configured."

# ---------------------------------------------------------------------------
# 13. Print next-step instructions
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}==========================================================${NC}"
echo -e "${GREEN}  Droplet provisioning complete!${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Copy your .env.production file to the server:"
echo "       scp .env.production $APP_USER@<DROPLET_IP>:$APP_DIR/.env.production"
echo ""
echo "  2. Copy the Nginx site config:"
echo "       scp nginx/app.conf root@<DROPLET_IP>:/etc/nginx/sites-available/web-scraper.conf"
echo "       ssh root@<DROPLET_IP> 'ln -sf /etc/nginx/sites-available/web-scraper.conf /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx'"
echo ""
echo "  3. Copy the PM2 ecosystem config:"
echo "       scp pm2/ecosystem.config.js $APP_USER@<DROPLET_IP>:$APP_DIR/ecosystem.config.js"
echo ""
echo "  4. Run the first deployment:"
echo "       bash scripts/deploy.sh"
echo ""
echo "  5. (Optional) Set up SSL after DNS is pointing at this server:"
echo "       bash scripts/setup-ssl.sh yourdomain.com"
echo ""
echo "  Chromium binary path (add to .env.production):"
echo "       PUPPETEER_EXECUTABLE_PATH=$CHROMIUM_PATH"
echo ""
