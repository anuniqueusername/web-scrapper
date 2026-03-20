#!/bin/bash
# Control scrapers: start|stop|restart|logs|status|kijiji|facebook
ACTION="${1:-status}"
SCRAPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$ACTION" in
  start)
    pm2 start "$SCRAPER_DIR/scraper.js" --name "kijiji-scraper"
    pm2 start "$SCRAPER_DIR/facebook-worker-runner.js" --name "facebook-scraper"
    pm2 status
    ;;
  stop)
    pm2 stop kijiji-scraper facebook-scraper
    ;;
  restart)
    pm2 restart kijiji-scraper facebook-scraper
    sleep 1
    pm2 status
    echo ""
    pm2 logs --lines 20 --nostream
    ;;
  logs)
    pm2 logs
    ;;
  kijiji)
    pm2 logs kijiji-scraper
    ;;
  facebook)
    pm2 logs facebook-scraper
    ;;
  status)
    pm2 status
    echo ""
    pm2 logs --lines 10 --nostream
    ;;
  *)
    echo "Usage: $0 [start|stop|restart|logs|status|kijiji|facebook]"
    echo ""
    echo "Examples:"
    echo "  $0 start          # Start both scrapers"
    echo "  $0 stop           # Stop both scrapers"
    echo "  $0 restart        # Restart both"
    echo "  $0 status         # Show status"
    echo "  $0 logs           # View all logs"
    echo "  $0 kijiji         # View Kijiji logs only"
    echo "  $0 facebook       # View Facebook logs only"
    exit 1
    ;;
esac
