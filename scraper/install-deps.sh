#!/bin/bash
# Quick dependency installer for scrapers
set -e

PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"

echo "Installing dependencies in $PARENT_DIR..."
cd "$PARENT_DIR"

# Check package.json exists
if [ ! -f "package.json" ]; then
  echo "❌ ERROR: package.json not found"
  exit 1
fi

# Install npm packages
echo "Running npm install..."
npm install --prefer-offline --no-audit --no-fund

# Verify puppeteer
if [ -d "node_modules/puppeteer" ]; then
  echo "✓ Puppeteer installed successfully"
else
  echo "⚠️  Installing puppeteer separately..."
  npm install puppeteer
fi

echo "✓ All dependencies installed"
ls -la node_modules | grep -E "puppeteer|axios|dotenv|better-sqlite3" | head -10
