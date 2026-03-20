#!/bin/bash
# Start both scrapers with PM2
SCRAPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Kijiji scraper..."
pm2 start "$SCRAPER_DIR/scraper.js" --name "kijiji-scraper" --max-memory-restart "512M"

echo "Starting Facebook scraper..."
pm2 start "$SCRAPER_DIR/facebook-worker-runner.js" --name "facebook-scraper" --max-memory-restart "512M"

echo ""
pm2 status
echo ""
pm2 logs --lines 20 --nostream
