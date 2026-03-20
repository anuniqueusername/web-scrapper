#!/bin/bash
# =============================================================================
# Setup Scraper on Digital Ocean Droplet
# Installs dependencies, configures PM2, and starts the scraper worker
# =============================================================================

set -e  # Exit on any error

echo "=========================================="
echo "Setting up Scraper on Droplet"
echo "=========================================="

# Configuration
APP_DIR="/var/www/web-scraper"
APP_USER="${APP_USER:-root}"
NODE_VERSION="20"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Please install Node.js ${NODE_VERSION} LTS first."
  exit 1
fi

echo "✓ Node.js $(node --version)"
echo "✓ npm $(npm --version)"

# Navigate to app directory
if [ ! -d "$APP_DIR" ]; then
  echo "❌ ERROR: $APP_DIR does not exist"
  exit 1
fi

cd "$APP_DIR"

echo "📂 Working directory: $(pwd)"

# Install dependencies
echo ""
echo "--- Installing npm dependencies ---"
npm ci --prefer-offline --no-audit --no-fund

# Check if scraper folder exists
if [ ! -d "scraper" ]; then
  echo "❌ ERROR: scraper/ folder not found in $APP_DIR"
  exit 1
fi

# Ensure data folder exists
mkdir -p "$APP_DIR/data"
chmod 755 "$APP_DIR/data"

# Ensure logs folder exists
mkdir -p "$APP_DIR/logs"
chmod 755 "$APP_DIR/logs"

# Check if .env.production exists (from deploy step)
if [ ! -f "$APP_DIR/.env.production" ]; then
  echo "⚠️  WARNING: .env.production not found"
  echo "   The scraper may fail if it needs configuration from .env"
fi

# Install PM2 globally if not already installed
if ! command -v pm2 &> /dev/null; then
  echo ""
  echo "--- Installing PM2 process manager ---"
  npm install -g pm2
fi

echo "✓ PM2 $(pm2 --version)"

# Stop existing scraper processes (if running)
echo ""
echo "--- Checking for existing scraper processes ---"
pm2 stop scraper-worker 2>/dev/null || true
pm2 delete scraper-worker 2>/dev/null || true

# Start the scraper with PM2
echo ""
echo "--- Starting scraper worker with PM2 ---"
pm2 start scraper/scraper.js \
  --name "scraper-worker" \
  --node-args="--max-old-space-size=512" \
  --max-memory-restart "512M" \
  --error "$APP_DIR/logs/scraper-error.log" \
  --out "$APP_DIR/logs/scraper-out.log" \
  --log-date-format "YYYY-MM-DD HH:mm:ss Z" \
  --merge-logs

# Save PM2 configuration to auto-restart on droplet reboot
echo ""
echo "--- Saving PM2 startup configuration ---"
pm2 save

# Generate PM2 startup script for systemd
pm2 startup systemd -u "$APP_USER" --hp "$APP_DIR"

# Display status
echo ""
echo "=========================================="
echo "✅ Scraper setup complete!"
echo "=========================================="
echo ""
pm2 logs scraper-worker --lines 20 --nostream

echo ""
echo "Monitor the scraper with:"
echo "  pm2 logs scraper-worker      # View logs"
echo "  pm2 status                   # Check status"
echo "  pm2 stop scraper-worker      # Stop"
echo "  pm2 restart scraper-worker   # Restart"
echo ""
