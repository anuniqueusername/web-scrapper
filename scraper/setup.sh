#!/bin/bash
# Setup both Kijiji and Facebook scrapers with PM2 + all dependencies
set -e

APP_DIR="${APP_DIR:-.}"
APP_USER="${APP_USER:-root}"
SCRAPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRAPER_DIR")"

echo "=========================================="
echo "Setting up scrapers with PM2"
echo "=========================================="
echo ""

# Check if running as root (needed for system packages)
if [ "$EUID" -ne 0 ] && command -v sudo &> /dev/null; then
  echo "⚠️  Some system dependencies require root. Running with sudo..."
fi

# ---------------------------------------------------------------------------
# System Dependencies for Puppeteer/Chromium
# ---------------------------------------------------------------------------
echo "Installing system dependencies..."
apt-get update -qq 2>/dev/null || true

# Install Chromium and Puppeteer dependencies
apt-get install -y -qq \
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
  libasound2 \
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
  2>/dev/null || true

# Install Node.js + npm if not present
if ! command -v node &> /dev/null; then
  echo "Installing Node.js..."
  apt-get install -y -qq nodejs npm 2>/dev/null || true
fi

echo "✓ System dependencies installed"
echo ""

# ---------------------------------------------------------------------------
# Node.js Dependencies
# ---------------------------------------------------------------------------
echo "Installing Node.js dependencies..."

if [ ! -d "$PARENT_DIR" ]; then
  echo "❌ ERROR: Parent directory not found: $PARENT_DIR"
  exit 1
fi

cd "$PARENT_DIR"

# Check for package.json
if [ ! -f "package.json" ]; then
  echo "❌ ERROR: package.json not found in $PARENT_DIR"
  ls -la "$PARENT_DIR" | head -20
  exit 1
fi

echo "Installing npm packages from $PARENT_DIR..."
npm ci --prefer-offline --no-audit --no-fund || npm install --prefer-offline --no-audit --no-fund

# Verify puppeteer is installed
if [ ! -d "node_modules/puppeteer" ]; then
  echo "⚠️  Puppeteer not found, installing directly..."
  npm install puppeteer
fi

echo "✓ npm packages installed"

# ---------------------------------------------------------------------------
# PM2 Global Installation
# ---------------------------------------------------------------------------
echo "Installing PM2 globally..."
npm install -g pm2 2>&1 | grep -v "npm WARN" || true
echo "✓ PM2 installed"
echo ""

# Create logs directory
mkdir -p "$PARENT_DIR/logs"
chmod 755 "$PARENT_DIR/logs"

# ---------------------------------------------------------------------------
# Start Scrapers with PM2
# ---------------------------------------------------------------------------
echo "Stopping any existing scraper processes..."
pm2 stop kijiji-scraper facebook-scraper 2>/dev/null || true
pm2 delete kijiji-scraper facebook-scraper 2>/dev/null || true
sleep 1

echo ""
echo "Starting Kijiji scraper..."
pm2 start "$SCRAPER_DIR/scraper.js" \
  --name "kijiji-scraper" \
  --node-args="--max-old-space-size=512" \
  --max-memory-restart "512M"

echo "Starting Facebook scraper..."
pm2 start "$SCRAPER_DIR/facebook-worker-runner.js" \
  --name "facebook-scraper" \
  --node-args="--max-old-space-size=512" \
  --max-memory-restart "512M"

sleep 2

# Save PM2 config and enable auto-restart on reboot
echo ""
echo "Saving PM2 configuration..."
pm2 save
pm2 startup systemd -u "$APP_USER" --hp "$PARENT_DIR" --update 2>/dev/null || true

echo ""
echo "=========================================="
echo "✅ Scraper setup complete!"
echo "=========================================="
echo ""
pm2 status
echo ""
echo "View logs:"
echo "  pm2 logs kijiji-scraper"
echo "  pm2 logs facebook-scraper"
echo ""
