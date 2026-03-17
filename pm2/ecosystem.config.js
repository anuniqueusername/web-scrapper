// =============================================================================
// PM2 Ecosystem Configuration — Kijiji Competitor Scraper
//
// Manages two processes:
//   1. next-app      — Next.js production server (cluster mode, all CPU cores)
//   2. scraper-worker — Node.js Puppeteer scraper (fork mode, single instance)
//
// Usage:
//   Start all:    pm2 start ecosystem.config.js
//   Reload all:   pm2 reload ecosystem.config.js --update-env
//   Stop all:     pm2 stop ecosystem.config.js
//   Delete all:   pm2 delete ecosystem.config.js
//   Status:       pm2 list
//   Logs:         pm2 logs
//   Monitor:      pm2 monit
//
// After first start, save the process list so it survives reboots:
//   pm2 save
// =============================================================================

const path = require('path');

// The app directory — when deployed via deploy.sh this file lives at
// /var/www/web-scraper/current/ecosystem.config.js
const APP_DIR = __dirname;

module.exports = {
  apps: [
    // -------------------------------------------------------------------------
    // Process 1: Next.js production server
    //
    // Runs in CLUSTER mode to utilise all available CPU cores.
    // PM2 will fork one process per core and load-balance incoming requests.
    // Zero-downtime reloads: pm2 reload next-app
    // -------------------------------------------------------------------------
    {
      name: 'next-app',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: APP_DIR,

      // Cluster mode — set instances to 'max' for all cores, or a number
      exec_mode: 'cluster',
      instances: 'max',

      // Environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Restart policy
      autorestart: true,
      watch: false,           // Never watch in production — use reload instead
      max_memory_restart: '512M',

      // Graceful shutdown — Next.js handles SIGTERM cleanly
      kill_timeout: 5000,     // ms to wait before SIGKILL after SIGTERM
      listen_timeout: 10000,  // ms to wait for app to be ready after start

      // Logging
      out_file: path.join(APP_DIR, '../shared/logs/next-app-out.log'),
      error_file: path.join(APP_DIR, '../shared/logs/next-app-error.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Exponential backoff restart — avoids restart storms on crash loops
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '10s',
    },

    // -------------------------------------------------------------------------
    // Process 2: Puppeteer scraper worker
    //
    // Runs in FORK mode (single process) because Puppeteer manages its own
    // Chromium instances and is not safely cluster-able.
    //
    // The scraper reads scraper-config.json on each run so interval/URL
    // changes take effect without restarting this process.
    //
    // To disable scraping without stopping the process, set
    // scraper-config.json -> "enabled": false via the dashboard.
    // -------------------------------------------------------------------------
    {
      name: 'scraper-worker',
      script: 'scraper.js',
      cwd: APP_DIR,

      exec_mode: 'fork',
      instances: 1,

      env_production: {
        NODE_ENV: 'production',
        // Tell Puppeteer to use the system Chromium installed by setup-droplet.sh
        // Set PUPPETEER_EXECUTABLE_PATH in .env.production for the exact path.
        PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
      },

      autorestart: true,
      watch: false,
      max_memory_restart: '768M',   // Puppeteer is memory-hungry

      // Give Puppeteer extra time to shut down gracefully (close browser)
      kill_timeout: 15000,

      // Logging
      out_file: path.join(APP_DIR, '../shared/logs/scraper-out.log'),
      error_file: path.join(APP_DIR, '../shared/logs/scraper-error.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      exp_backoff_restart_delay: 5000,  // 5s minimum between restarts
      max_restarts: 5,
      min_uptime: '30s',
    },
  ],
};
