# Scraper Scripts

Minimal setup and control scripts for running both Kijiji and Facebook scrapers with PM2.

## Quick Start

**First time setup:**
```bash
bash setup.sh
```

This installs PM2 and starts both scrapers automatically.

## Control Commands

```bash
bash control.sh start        # Start both scrapers
bash control.sh stop         # Stop both scrapers
bash control.sh restart      # Restart both scrapers
bash control.sh logs         # View all logs
bash control.sh kijiji       # View Kijiji logs only
bash control.sh facebook     # View Facebook logs only
bash control.sh status       # Check status
```

Or use PM2 directly:
```bash
# Start individually
pm2 start scraper.js --name "kijiji-scraper"
pm2 start facebook-worker-runner.js --name "facebook-scraper"

# View logs
pm2 logs kijiji-scraper
pm2 logs facebook-scraper
pm2 logs  # All logs

# Control
pm2 restart kijiji-scraper facebook-scraper
pm2 stop kijiji-scraper facebook-scraper
```

## Environment Variables

The scraper reads from `.env` or `.env.production` in the parent directory.

Required for Kijiji scraper:
- `SCRAPER_DEFAULT_URL` - Kijiji search URL
- `SCRAPER_DEFAULT_INTERVAL` - Interval in milliseconds (default: 60000)

Optional Discord/Slack webhooks:
- `DISCORD_WEBHOOK_URL`
- `SLACK_WEBHOOK_URL`

## Files

- `scraper.js` - Main Kijiji scraper
- `worker.js` - Worker for parallel scraping
- `facebook-worker.js` - Facebook Marketplace scraper
- `db.js` - SQLite database module
- `setup.sh` - Initial setup with PM2
- `start.sh` - Quick start
- `control.sh` - Control scraper (start/stop/restart/logs)

## Monitoring

```bash
# View scraper logs
pm2 logs scraper-worker

# Check all PM2 processes
pm2 status

# View last 50 log lines
pm2 logs scraper-worker --lines 50 --nostream
```

## Auto-restart

After setup, the scraper automatically restarts on droplet reboot via systemd.

To verify:
```bash
systemctl status pm2-root
```
