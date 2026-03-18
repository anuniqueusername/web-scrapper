# Deployment Scripts — Kijiji Competitor Scraper

Step-by-step guide to deploying the Next.js dashboard and Puppeteer scraper
on a Digital Ocean Droplet running Ubuntu 22.04 LTS.

---

## Prerequisites

Before you start, you need:

- A Digital Ocean Droplet — Ubuntu 22.04 LTS (1 GB RAM minimum; 2 GB recommended for Puppeteer)
- SSH root access to the Droplet
- Your SSH public key (`~/.ssh/id_rsa.pub` or similar)
- The Droplet's IP address
- (Optional) A domain name with an A record pointing at the Droplet IP

---

## Script Overview

| Script | Where to Run | Purpose |
|--------|-------------|---------|
| `01-server-setup.sh` | Server (as root) | One-time: installs Node, PM2, Nginx, Chromium, UFW; creates `/var/www/web-scraper` layout |
| `02-deploy.sh` | Local machine | **Manual fallback**: first-time deploy via rsync + remote build to `/home/deploy/app` |
| `03-start-pm2.sh` | Server (as deploy) | **Manual fallback**: start Next.js dashboard and scraper under PM2 |
| `04-nginx-setup.sh` | Server (as root) | Configure Nginx reverse proxy to port 3000 |
| `05-ssl-setup.sh` | Server (as root) | Obtain Let's Encrypt SSL cert and configure HTTPS |
| `06-firewall-setup.sh` | Server (as root) | Configure UFW (run standalone to reset firewall rules) |
| `07-update.sh` | Local machine | **Manual fallback**: re-deploy latest code without restarting the scraper |
| `08-remote-deploy.sh` | Server (called by GitHub Actions) | **CI/CD path**: extract release tarball, link shared files, npm ci, pm2 reload |

**Primary deployment path: GitHub Actions calls `08-remote-deploy.sh` automatically on every push to `main`.**
Scripts `02-deploy.sh`, `03-start-pm2.sh`, and `07-update.sh` are retained as manual fallbacks.

---

## Step-by-Step Setup

### Step 0 — Prepare your local machine

Make sure you have `rsync` and `ssh` available. On Windows, run these scripts
from Git Bash or WSL.

Edit the configuration variables at the top of `02-deploy.sh` and `07-update.sh`:

```
DROPLET_IP="167.99.123.45"     # Your actual Droplet IP
DEPLOY_USER="deploy"
REMOTE_DIR="/home/deploy/app"
SSH_KEY="$HOME/.ssh/id_rsa"    # Path to your SSH private key
```

### Step 1 — Run server setup (once, on the Droplet)

SSH into your Droplet as root and run:

```bash
ssh root@<DROPLET_IP>
curl -o 01-server-setup.sh https://raw.githubusercontent.com/...  # or scp it
bash 01-server-setup.sh
```

Or copy the script from your local machine first:

```bash
scp deploy-scripts/01-server-setup.sh root@<DROPLET_IP>:~/
ssh root@<DROPLET_IP> 'bash ~/01-server-setup.sh'
```

This installs:
- Node.js 20 LTS
- PM2 (process manager)
- Nginx (reverse proxy)
- Chromium + all Puppeteer Linux shared libraries
- fail2ban (SSH brute-force protection)
- UFW firewall (ports 22, 80, 443 open; 3000 internal only)
- The `deploy` user with sudo rights

At the end, the script prints the `PUPPETEER_EXECUTABLE_PATH` you need in `.env.production`.

### Step 2 — Copy your SSH key to the deploy user

```bash
ssh-copy-id deploy@<DROPLET_IP>
```

Verify it works:

```bash
ssh deploy@<DROPLET_IP> 'echo "SSH OK"'
```

### Step 3 — Copy .env.production to the server

**Do this manually — never commit `.env` files to git or include them in rsync.**

```bash
scp .env.production deploy@<DROPLET_IP>:/home/deploy/app/.env.production
```

Your `.env.production` should contain at minimum:

```
NODE_ENV=production
PORT=3000

# Puppeteer — use system Chromium installed by 01-server-setup.sh
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Optional: Discord webhook for deployment notifications
# DISCORD_DEPLOY_WEBHOOK=https://discord.com/api/webhooks/...

# Optional: Slack webhook
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Step 4 — Deploy the code (from your local machine)

```bash
bash deploy-scripts/02-deploy.sh
```

This rsync's the project to the server (excluding `node_modules`, `.next`,
`data/`, `.env` files), then SSHes in and runs `npm install && npm run build`.

### Step 5 — Start PM2 (on the server)

```bash
ssh deploy@<DROPLET_IP>
bash /home/deploy/app/deploy-scripts/03-start-pm2.sh
```

Or run it remotely from your local machine:

```bash
ssh -i ~/.ssh/id_rsa deploy@<DROPLET_IP> 'bash /home/deploy/app/deploy-scripts/03-start-pm2.sh'
```

PM2 starts two processes:
- `dashboard` — the Next.js production server on port 3000
- `scraper` — the Puppeteer scraper worker (`scraper.js`)

The script will print a `sudo env ...` command — **copy and run it** to enable
PM2 auto-start after server reboots.

### Step 6 — Configure Nginx (on the server, as root)

To serve by IP only (no domain):

```bash
sudo bash /home/deploy/app/deploy-scripts/04-nginx-setup.sh
```

To serve by domain name:

```bash
sudo bash /home/deploy/app/deploy-scripts/04-nginx-setup.sh yourdomain.com
```

After this, the dashboard is accessible at `http://<DROPLET_IP>` or `http://yourdomain.com`.

### Step 7 — Add SSL (optional but recommended)

**Requires a domain name with DNS already pointing at the Droplet.**

Edit `05-ssl-setup.sh` and set your `DOMAIN` and `EMAIL` variables, then:

```bash
sudo bash /home/deploy/app/deploy-scripts/05-ssl-setup.sh
```

Certbot will obtain a certificate, automatically update the Nginx config to
add an HTTPS server block, and set up auto-renewal.

---

## Updating the App (Future Deployments)

### GitHub Actions (primary path)

Push to `main`. The workflow:
1. Builds `.next/` on the CI runner
2. Creates a release tarball including the pre-built `.next/`
3. Uploads the tarball to `/tmp/release-<sha>.tar.gz` on the droplet
4. Calls `08-remote-deploy.sh` as root over SSH, which:
   - Extracts the tarball into a timestamped `/var/www/web-scraper/releases/` directory
   - Verifies `.next/BUILD_ID` was extracted
   - Runs `npm ci` for dependencies
   - Links shared persistent files (`data/`, `scraper-config.json`, etc.)
   - Atomically swaps the `/var/www/web-scraper/current` symlink
   - `pm2 reload next-app` (zero-downtime) and `pm2 restart scraper-worker`
   - Prunes releases older than the 5 most recent
5. Runs a remote health check on `localhost:3000`
6. Sends a Discord notification on success or failure

No manual steps are needed.

### Manual fallback

If GitHub Actions is not available, use `07-update.sh` from your local machine:

```bash
bash deploy-scripts/07-update.sh
```

This rsync-based path deploys to `/home/deploy/app` (not `/var/www/web-scraper`) and
rebuilds on the server. It does NOT restart the scraper by default. To also restart
the scraper, set `RESTART_SCRAPER="true"` at the top of the script.

---

## Important: Puppeteer `--no-sandbox` Requirement on Linux

Puppeteer (Chromium) running on a Linux server as a non-root user requires
the `--no-sandbox` flag. Without it, Chromium will crash with:

```
Running as root without --no-sandbox is not supported
```

or (as non-root on servers without a user namespace):

```
No usable sandbox! Use --no-sandbox
```

In `scraper.js` and any worker files, ensure the Puppeteer launch call includes:

```javascript
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',   // Prevents crashes on low-memory droplets
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
  ],
});
```

`--disable-dev-shm-usage` is especially important on 1 GB droplets — Chromium's
shared memory usage can cause it to crash without this flag.

---

## Data File Persistence

Persistent files are kept outside the release directory and symlinked in on every deploy.

### GitHub Actions path — `/var/www/web-scraper/shared/`

| Path | Purpose |
|------|---------|
| `shared/data/listings.json` | Cached Kijiji listings |
| `shared/data/scraper.db` | SQLite database |
| `shared/scraper-config.json` | Dashboard configuration (URL, interval, webhooks) |
| `shared/scraper-status.json` | Live scraper status (last run, errors) |
| `shared/facebook-scraper-status.json` | Facebook scraper status |
| `shared/.env.production` | Secrets and environment variables (written by CI on every deploy) |
| `shared/ecosystem.config.js` | PM2 process definition (written once, reused across deploys) |

Each release in `releases/<timestamp>_<sha>/` symlinks to these shared files, so the
active code always reads the live data regardless of which release is current.

### Manual deploy path — `/home/deploy/app/`

| File | Purpose |
|------|---------|
| `data/listings.json` | Cached Kijiji listings |
| `data/scraper.db` | SQLite database |
| `scraper-config.json` | Dashboard configuration |
| `scraper-status.json` | Live scraper status |
| `.env.production` | Secrets and environment variables |

**Never delete `data/scraper.db` or `data/listings.json` on the server** — they contain
your scraped data history. The tarball excludes and rsync exclude rules protect them automatically.

---

## Troubleshooting

### Puppeteer crashes immediately

**Symptom:** `scraper` PM2 process keeps restarting, logs show Chromium errors.

1. Check Chromium is installed: `which chromium-browser || which chromium`
2. Verify `PUPPETEER_EXECUTABLE_PATH` in `.env.production` matches the path above
3. Test Chromium directly: `chromium-browser --headless --no-sandbox --dump-dom https://example.com`
4. Confirm `--no-sandbox` is in the Puppeteer launch args in `scraper.js`

### Out of memory — scraper killed by OOM

**Symptom:** Scraper process disappears, `dmesg | grep -i oom` shows kills.

1. Upgrade to a 2 GB or 4 GB Droplet — Puppeteer needs ~500 MB per Chromium instance
2. Add swap space as a buffer:
   ```bash
   fallocate -l 2G /swapfile
   chmod 600 /swapfile
   mkswap /swapfile
   swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```
3. Ensure `--disable-dev-shm-usage` is in Puppeteer launch args

### SQLite permission errors

**Symptom:** API routes return 500 errors; logs show `SQLITE_CANTOPEN` or permission denied.

```bash
# GitHub Actions deploy path (root-owned):
ls -la /var/www/web-scraper/shared/data/
chmod 700 /var/www/web-scraper/shared/data/
chmod 600 /var/www/web-scraper/shared/data/*.db 2>/dev/null || true
chmod 644 /var/www/web-scraper/shared/data/*.json 2>/dev/null || true

# Manual deploy path (deploy-user-owned):
ls -la /home/deploy/app/data/
chown deploy:deploy /home/deploy/app/data/
chown deploy:deploy /home/deploy/app/data/*.db /home/deploy/app/data/*.json
chmod 664 /home/deploy/app/data/*.db /home/deploy/app/data/*.json
```

### Next.js build fails in GitHub Actions

**Symptom:** The `Build Next.js` step fails in the CI runner; deploy job never runs.

1. Check for TypeScript / ESLint errors locally: `npm run build`
2. Check the Actions run log for the exact error
3. Ensure the `APP_BASE_URL` secret is set — `NEXT_PUBLIC_BASE_URL` is required at build time

### Next.js build fails in manual deploy

**Symptom:** `02-deploy.sh` or `07-update.sh` exits during `npm run build`.

1. Check for TypeScript / ESLint errors locally first: `npm run build`
2. Check the remote build log: `ssh deploy@<DROPLET_IP> 'pm2 logs dashboard --lines 50'`
3. Ensure `.env.production` is on the server — some Next.js env vars are required at build time

### Tarball extraction failed

**Symptom:** `08-remote-deploy.sh` exits with "Tarball integrity check failed" or "tar extraction failed".

1. Check the GitHub Actions `Upload release tarball and deploy script` step for SCP errors
2. Verify the droplet has enough disk space: `df -h /var/www`
3. Check `/tmp/` is not full: `df -h /tmp`
4. Re-run the workflow manually via `workflow_dispatch` — transient network issues can corrupt uploads

### .next/ missing from tarball

**Symptom:** `08-remote-deploy.sh` exits with ".next/ directory is missing from the extracted tarball".

1. The `Download .next artifact` step in GitHub Actions ran before the `Create release tarball` step,
   or the artifact download was skipped. Check the workflow log for `skip_build=true` being set
   on a `workflow_dispatch` run — if the build step was skipped, there is no `.next/` to include.
2. Ensure the `Download .next artifact` step runs and succeeds before the tarball is created.
   In the workflow, this is controlled by `if: ${{ github.event.inputs.skip_build != 'true' }}`.

### Nginx 502 Bad Gateway

**Symptom:** Browser shows 502 when visiting the Droplet IP or domain.

1. Check PM2 dashboard is running: `pm2 list`
2. Check dashboard is on port 3000: `curl -v http://localhost:3000`
3. Check Nginx error log: `tail -50 /var/log/nginx/error.log`
4. Verify Nginx config: `sudo nginx -t`

### Certbot SSL renewal failing

```bash
certbot renew --dry-run
# If it fails, check:
systemctl status nginx
ufw status   # port 80 must be open for ACME HTTP-01 challenge
```

### PM2 processes not starting after reboot

The `sudo env ...` command printed by `03-start-pm2.sh` must be run once to
register the PM2 startup hook. Run it again:

```bash
pm2 startup systemd
# Copy and run the output command with sudo
pm2 save
```

---

## Useful Server Commands

```bash
# Process status
pm2 list
pm2 monit

# Logs — GitHub Actions deploy path
pm2 logs next-app --lines 50        # last 50 lines of Next.js
pm2 logs scraper-worker --lines 50  # last 50 lines of scraper

# Logs — manual deploy path
pm2 logs dashboard --lines 50   # last 50 lines of Next.js
pm2 logs scraper --lines 50     # last 50 lines of scraper

# Restart — GitHub Actions deploy path
pm2 reload next-app             # zero-downtime reload of Next.js
pm2 restart scraper-worker      # restart scraper

# Restart — manual deploy path
pm2 restart dashboard           # restart Next.js only
pm2 restart scraper             # restart scraper only

# Release management (GitHub Actions path)
ls -1t /var/www/web-scraper/releases/    # list releases, newest first
readlink /var/www/web-scraper/current    # show active release
du -sh /var/www/web-scraper/releases/*/  # disk usage per release

# Nginx
sudo nginx -t                   # test config
sudo systemctl reload nginx     # reload without downtime
sudo tail -f /var/log/nginx/error.log

# Firewall
sudo ufw status verbose

# Disk usage (data files can grow large)
du -sh /var/www/web-scraper/shared/data/   # GitHub Actions path
du -sh /home/deploy/app/data/              # manual deploy path
```
