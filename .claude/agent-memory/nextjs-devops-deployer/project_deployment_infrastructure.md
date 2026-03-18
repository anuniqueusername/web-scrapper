---
name: deployment_infrastructure
description: Digital Ocean droplet deployment setup — paths, ports, users, file layout, PM2 processes, and Nginx configuration for the Kijiji Scraper project
type: project
---

Full production deployment infrastructure has been created for the Kijiji Competitor Scraper.

**Why:** User requested a complete production deployment setup to Digital Ocean with GitHub Actions CI/CD, PM2 process management, and Nginx reverse proxy.

**How to apply:** Reference these paths and decisions in all future deployment-related work. Do not propose changes that conflict with the established layout.

## Server Layout

- App root:         `/var/www/web-scraper/`
- Repo mirror:      `/var/www/web-scraper/repo/` (git fetch target)
- Active release:   `/var/www/web-scraper/current/` (symlink to latest release)
- Release history:  `/var/www/web-scraper/releases/<YYYYMMDD_HHMMSS>/` (last 5 kept)
- Persistent data:  `/var/www/web-scraper/shared/data/` (SQLite + JSON, symlinked into each release)
- Shared configs:   `/var/www/web-scraper/shared/.env.production`
                    `/var/www/web-scraper/shared/scraper-config.json`
                    `/var/www/web-scraper/shared/scraper-status.json`
                    `/var/www/web-scraper/shared/ecosystem.config.js`
- Log files:        `/var/www/web-scraper/shared/logs/`

## Server User

- GitHub Actions deploy: SSHes as `root` (DROPLET_USER secret = root). Files in `/var/www/web-scraper/` are root-owned.
- Manual rsync deploy: uses `deploy` user, files live in `/home/deploy/app/`
- Password login disabled; SSH key auth only

## PM2 Processes

| Process name    | Script          | exec_mode | Port |
|-----------------|-----------------|-----------|------|
| next-app        | next start      | cluster   | 3000 |
| scraper-worker  | scraper.js      | fork      | N/A  |

- next-app uses cluster mode (all CPU cores) for zero-downtime reloads
- scraper-worker uses fork mode (Puppeteer is not safely cluster-able)
- Memory limit: next-app 512M, scraper-worker 768M (Puppeteer is heavy)
- scraper-worker kill_timeout: 15000ms (gives Puppeteer time to close browser)

## Nginx

- Config installed at: `/etc/nginx/sites-available/web-scraper.conf`
- Proxy snippet at:    `/etc/nginx/snippets/proxy-params.conf`
- Proxies port 80/443 -> 127.0.0.1:3000 (port 3000 is NOT exposed publicly via UFW)
- SSL managed by Certbot / Let's Encrypt

## Firewall (UFW)

- Allowed inbound: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- Port 3000 is internal only — never exposed

## Node.js & Puppeteer

- Node.js: 20 LTS (via NodeSource)
- Puppeteer: uses system Chromium installed via apt (not bundled download)
  - PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
  - PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
- System Chromium installed alongside all required shared libraries

## Deployment Files Created

### Original set (advanced — git release-based, with rollback):
- `.github/workflows/deploy.yml`   — GitHub Actions CI/CD (build check + SSH deploy)
- `scripts/setup-droplet.sh`       — One-time server provisioning (user: `scraper`, dir: `/var/www/kijiji-scraper`)
- `scripts/deploy.sh`              — Local machine SSH deploy script with release snapshots + rollback
- `scripts/rollback.sh`            — Rollback to previous release
- `scripts/setup-ssl.sh`           — Let's Encrypt SSL via Certbot
- `pm2/ecosystem.config.js`        — PM2 process definitions (next-app cluster + scraper-worker fork)
- `nginx/app.conf`                 — Nginx reverse proxy site config
- `nginx/proxy-params.conf`        — Nginx proxy headers snippet
- `.env.production.example`        — Environment variable template

### Simplified set (rsync-based, numbered workflow — in `deploy-scripts/`):
User: `deploy`, App dir: `/home/deploy/app`

- `deploy-scripts/01-server-setup.sh`  — Server provisioning (Node 20, PM2, Nginx, Chromium, UFW, fail2ban)
- `deploy-scripts/02-deploy.sh`        — Local: rsync + remote npm install + npm run build
- `deploy-scripts/03-start-pm2.sh`     — Server: pm2 start dashboard + scraper, pm2 save, pm2 startup
- `deploy-scripts/04-nginx-setup.sh`   — Server (root): write Nginx config + proxy-params snippet, reload
- `deploy-scripts/05-ssl-setup.sh`     — Server (root): certbot --nginx, auto-renewal, dry-run verify
- `deploy-scripts/06-firewall-setup.sh`— Server (root): UFW reset + allow 22/80/443, deny 3000
- `deploy-scripts/07-update.sh`        — Local: rsync + build + pm2 restart dashboard (scraper preserved)
- `deploy-scripts/README.md`           — Full step-by-step deployment guide with troubleshooting

## package.json Note

The `npm run start` script currently runs `next dev` (not `next start`). The correct production command is `npm run production` which runs `next start`. PM2 ecosystem.config.js invokes `node_modules/.bin/next start` directly to avoid this ambiguity.

## GitHub Actions Workflows (three files)

| File                                        | Trigger          | Purpose                                              |
|---------------------------------------------|------------------|------------------------------------------------------|
| `.github/workflows/deploy.yml`              | push to main     | Full deploy: build check + SSH deploy + health check |
| `.github/workflows/update-env.yml`          | manual only      | Push updated .env.production without full redeploy   |
| `.github/workflows/rollback.yml`            | manual only      | Repoint current symlink to a previous release        |

### Remote deploy script
- `deploy-scripts/08-remote-deploy.sh` — executed over SSH by deploy.yml
  - Unpacks tarball, links shared files, runs npm ci, swaps symlink, reloads PM2

### Key design decisions
- .next/ is built on GitHub runner, included in tarball — server never rebuilds
- SKIP_BUILD is hardcoded to 'true' in the workflow SSH call (not derived from the `skip_build` input). The `skip_build` input only controls whether the CI build step runs; the server-side build is always skipped because the tarball always ships .next/.
- Tarball is verified with `gzip -t` before extraction; extraction errors are surfaced cleanly with a captured stderr log
- .next/BUILD_ID is verified after extraction when SKIP_BUILD=true — a missing BUILD_ID is a hard failure
- ENV_B64: .env.production passed as base64 over SSH to avoid shell escaping issues with webhook URLs
- Placeholder files (scraper-config.json etc.) are created with `echo '{}'` only if absent — avoids zeroing out existing config on re-run
- pm2 reload (next-app) vs pm2 restart (scraper-worker): cluster reload is zero-downtime; scraper cannot safely hot-reload because Puppeteer holds a browser process

## GitHub Secrets Required

| Secret                      | Value                                                     |
|-----------------------------|-----------------------------------------------------------|
| DROPLET_HOST                | IP address of the Digital Ocean droplet                   |
| DROPLET_SSH_KEY             | Full PEM private key contents (-----BEGIN ... -----)      |
| DROPLET_USER                | SSH username on the droplet (e.g. deploy)                 |
| DROPLET_SSH_PORT            | SSH port (omit to default to 22)                          |
| DISCORD_DEPLOY_WEBHOOK      | Discord webhook URL for deploy notifications              |
| APP_BASE_URL                | https://yourdomain.com                                    |
| APP_PORT                    | 3000 (omit to default)                                    |
| APP_DISCORD_WEBHOOK_URL     | Scraper listing-alert Discord webhook                     |
| APP_SLACK_WEBHOOK_URL       | Scraper listing-alert Slack webhook                       |
| APP_SESSION_SECRET          | 64-char random hex string                                 |
| APP_SCRAPER_DEFAULT_URL     | Default Kijiji search URL                                 |
| APP_PUPPETEER_PATH          | /usr/bin/chromium-browser (omit to default)               |
