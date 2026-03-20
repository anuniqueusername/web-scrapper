#!/bin/bash
# Fix Puppeteer to use system Chromium instead of downloaded Chrome
set -e

PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"

echo "Fixing Puppeteer to use system Chromium..."
cd "$PARENT_DIR"

# Install any missing system libraries
echo "Installing missing system libraries..."
apt-get update -qq
apt-get install -y -qq \
  libatk-1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxfixes3 \
  libxi6 \
  libxkbcommon0 \
  libxrandr2 \
  libxss1 \
  libxtst6 \
  libx11-xcb1 \
  xdg-utils \
  chromium-browser \
  2>/dev/null || true

echo "✓ System libraries installed"

# Set environment to use system Chromium
echo "Configuring .env to use system Chromium..."
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Update or create .env.production
if [ -f ".env.production" ]; then
  # Update existing
  sed -i 's|.*PUPPETEER_EXECUTABLE_PATH.*|PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser|' .env.production
  if ! grep -q "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD" .env.production; then
    echo "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true" >> .env.production
  fi
else
  # Create new
  cat > .env.production << EOF
NODE_ENV=production
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
EOF
fi

echo "✓ .env.production configured"

# Verify Chromium is installed
CHROMIUM_PATH=$(which chromium-browser || which chromium || echo "/usr/bin/chromium-browser")
if [ -f "$CHROMIUM_PATH" ]; then
  echo "✓ Chromium found at: $CHROMIUM_PATH"
else
  echo "❌ Chromium not found at $CHROMIUM_PATH"
  echo "Trying to install chromium..."
  apt-get install -y chromium-browser
fi

echo ""
echo "✓ Puppeteer fixed"
echo ""
echo "Restart scrapers with:"
echo "  pm2 restart kijiji-scraper facebook-scraper"
