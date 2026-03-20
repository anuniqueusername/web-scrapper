#!/bin/bash
# =============================================================================
# Quick Script to Run Scraper on Droplet
# Usage: bash run-scraper.sh [start|stop|restart|logs|status]
# =============================================================================

set -e

APP_DIR="/var/www/web-scraper"
ACTION="${1:-status}"

if [ ! -d "$APP_DIR" ]; then
  echo "❌ App directory not found: $APP_DIR"
  exit 1
fi

case "$ACTION" in
  start)
    echo "Starting scraper..."
    pm2 start scraper/scraper.js --name "scraper-worker" --max-memory-restart "512M"
    pm2 logs scraper-worker --lines 20 --nostream
    ;;
  stop)
    echo "Stopping scraper..."
    pm2 stop scraper-worker
    ;;
  restart)
    echo "Restarting scraper..."
    pm2 restart scraper-worker
    sleep 2
    pm2 logs scraper-worker --lines 20 --nostream
    ;;
  logs)
    pm2 logs scraper-worker
    ;;
  status)
    pm2 status
    echo ""
    pm2 logs scraper-worker --lines 10 --nostream
    ;;
  *)
    echo "Usage: $0 [start|stop|restart|logs|status]"
    exit 1
    ;;
esac
