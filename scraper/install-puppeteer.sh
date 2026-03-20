#!/bin/bash
# Install Puppeteer with all dependencies
set -e

PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"

echo "Installing Puppeteer with system dependencies..."
cd "$PARENT_DIR"

# Ensure system dependencies are installed
echo "Installing system libraries for Puppeteer..."
apt-get update -qq
apt-get install -y -qq \
  chromium-browser \
  chromium \
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

echo "✓ System dependencies installed"

# Install npm packages
echo "Installing npm packages..."
npm install --prefer-offline --no-audit --no-fund

echo "Installing Puppeteer..."
npm install puppeteer --save

# Use system Chromium instead of downloading
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

echo ""
echo "✓ Puppeteer installed"
echo ""
echo "Verify with:"
echo "  node -e \"const puppeteer = require('puppeteer'); console.log('✓ Puppeteer works');\""
