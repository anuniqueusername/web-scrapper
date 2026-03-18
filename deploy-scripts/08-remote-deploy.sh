#!/bin/bash
# =============================================================================
# 08-remote-deploy.sh — Server-side deployment script
# Kijiji Competitor Scraper (Next.js + Puppeteer scraper)
#
# Description:
#   Executed on the Digital Ocean droplet by the GitHub Actions deploy job.
#   Unpacks a release tarball, links shared persistent files, writes
#   .env.production from the base64-encoded ENV_B64 variable, installs
#   Node.js dependencies, swaps the current symlink, and reloads PM2 processes.
#   Designed to be idempotent — safe to re-run on retry or manual deploy.
#
# Prerequisites (one-time, done by 01-server-setup.sh):
#   - Node.js 20 LTS + npm installed
#   - PM2 installed globally (npm install -g pm2)
#   - App directory layout:
#       /var/www/web-scraper/
#         releases/          <- timestamped release snapshots
#         shared/
#           data/            <- listings.json, scraper.db (persists across deploys)
#           logs/            <- pm2 log output
#           .env.production  <- written/updated by this script on every deploy
#           scraper-config.json   <- persists across deploys (created by dashboard)
#           scraper-status.json   <- persists across deploys (written by scraper)
#           ecosystem.config.js   <- PM2 process definition (written once)
#         current -> releases/<latest>  <- symlink updated atomically
#
# Environment variables (set by the GitHub Actions step that calls this script):
#   ENV_B64           Base64-encoded contents of .env.production
#   RELEASE_ARCHIVE   Path to the release tarball (e.g. /tmp/release-abc123.tar.gz)
#   GIT_SHA           Git commit SHA for release naming
#   SKIP_BUILD        'true' to skip the npm run build step (pre-built .next included)
#   APP_USER          OS user that owns the app directory (e.g. deploy)
#
# Usage (local test without GitHub Actions):
#   ENV_B64="$(cat .env.production | base64 -w 0)" \
#   RELEASE_ARCHIVE=/tmp/release.tar.gz \
#   GIT_SHA=local \
#   SKIP_BUILD=false \
#   APP_USER=deploy \
#   bash deploy-scripts/08-remote-deploy.sh
#
# Estimated runtime: 2–4 minutes
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Colour helpers
# -----------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warning() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

# -----------------------------------------------------------------------------
# Configuration — all paths defined in one place
# -----------------------------------------------------------------------------
APP_ROOT="/var/www/web-scraper"
RELEASES_DIR="${APP_ROOT}/releases"
SHARED_DIR="${APP_ROOT}/shared"
CURRENT_LINK="${APP_ROOT}/current"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

# Env / inputs
ENV_B64="${ENV_B64:-}"
RELEASE_ARCHIVE="${RELEASE_ARCHIVE:-/tmp/release.tar.gz}"
GIT_SHA="${GIT_SHA:-$(date +%s)}"
SKIP_BUILD="${SKIP_BUILD:-false}"
APP_USER="${APP_USER:-deploy}"

# Derive a timestamped release ID — makes releases sortable and human-readable
RELEASE_ID="$(date +%Y%m%d_%H%M%S)_${GIT_SHA:0:7}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"

# -----------------------------------------------------------------------------
# Validation
# -----------------------------------------------------------------------------
[[ -z "$ENV_B64" ]] && die "ENV_B64 is not set. Cannot write .env.production."
[[ ! -f "$RELEASE_ARCHIVE" ]] && die "Release archive not found: $RELEASE_ARCHIVE"
command -v pm2 >/dev/null 2>&1 || die "pm2 is not installed. Run 01-server-setup.sh first."
command -v node >/dev/null 2>&1 || die "node is not installed. Run 01-server-setup.sh first."

info "======================================================="
info "  Kijiji Scraper — Release ${RELEASE_ID}"
info "  Archive : ${RELEASE_ARCHIVE}"
info "  Node    : $(node --version)"
info "  PM2     : $(pm2 --version)"
info "======================================================="

# -----------------------------------------------------------------------------
# Step 1: Ensure directory layout
# -----------------------------------------------------------------------------
info "Ensuring directory layout..."
mkdir -p \
  "${RELEASES_DIR}" \
  "${SHARED_DIR}/data" \
  "${SHARED_DIR}/logs"

# Create placeholder files so symlinks don't point to nothing on first deploy
touch "${SHARED_DIR}/scraper-config.json"   2>/dev/null || true
touch "${SHARED_DIR}/scraper-status.json"   2>/dev/null || true
touch "${SHARED_DIR}/facebook-scraper-status.json" 2>/dev/null || true
success "Directory layout ready."

# -----------------------------------------------------------------------------
# Step 2: Write .env.production from the base64-encoded secret
# This runs on every deploy so secrets are always current.
# -----------------------------------------------------------------------------
info "Writing .env.production..."
echo "${ENV_B64}" | base64 -d > "${SHARED_DIR}/.env.production"
chmod 640 "${SHARED_DIR}/.env.production"
success ".env.production written ($(wc -l < "${SHARED_DIR}/.env.production") lines)."

# -----------------------------------------------------------------------------
# Step 3: Unpack release archive into a new timestamped directory
# -----------------------------------------------------------------------------
info "Unpacking release into ${RELEASE_DIR}..."
mkdir -p "${RELEASE_DIR}"
tar -xzf "${RELEASE_ARCHIVE}" -C "${RELEASE_DIR}"
success "Release unpacked."

# -----------------------------------------------------------------------------
# Step 4: Link shared persistent files into the new release
#
# data/          — SQLite DB (scraper.db) and listings.json. Never overwrite.
# .env.production — written above; linked into release for Next.js + scraper.
# scraper-config.json  — dashboard writes this; must survive across releases.
# scraper-status.json  — scraper writes this; must survive across releases.
# ecosystem.config.js  — PM2 config; copied (not symlinked) so it is editable.
# -----------------------------------------------------------------------------
info "Linking shared files..."

# data/ — use symlink so both the Next.js API routes and scraper.js read the
# same SQLite file regardless of which release is current.
rm -rf "${RELEASE_DIR}/data"
ln -sfn "${SHARED_DIR}/data" "${RELEASE_DIR}/data"

# .env files — Next.js reads .env.production at startup
ln -sfn "${SHARED_DIR}/.env.production" "${RELEASE_DIR}/.env.production"
# Also expose as .env.local so Next.js API routes pick it up without extra config
ln -sfn "${SHARED_DIR}/.env.production" "${RELEASE_DIR}/.env.local"

# Scraper runtime files
ln -sfn "${SHARED_DIR}/scraper-config.json"          "${RELEASE_DIR}/scraper-config.json"
ln -sfn "${SHARED_DIR}/scraper-status.json"          "${RELEASE_DIR}/scraper-status.json"
ln -sfn "${SHARED_DIR}/facebook-scraper-status.json" "${RELEASE_DIR}/facebook-scraper-status.json"

# ecosystem.config.js — copy from shared if a customised version exists there,
# otherwise copy the one that shipped with the repo into shared for persistence.
if [[ -f "${SHARED_DIR}/ecosystem.config.js" ]]; then
  cp "${SHARED_DIR}/ecosystem.config.js" "${RELEASE_DIR}/ecosystem.config.js"
  info "Using ecosystem.config.js from shared/."
elif [[ -f "${RELEASE_DIR}/pm2/ecosystem.config.js" ]]; then
  cp "${RELEASE_DIR}/pm2/ecosystem.config.js" "${RELEASE_DIR}/ecosystem.config.js"
  cp "${RELEASE_DIR}/pm2/ecosystem.config.js" "${SHARED_DIR}/ecosystem.config.js"
  info "Copied ecosystem.config.js from pm2/ -> shared/."
else
  warning "No ecosystem.config.js found in shared/ or pm2/. PM2 startup may need manual intervention."
fi

success "Shared files linked."

# -----------------------------------------------------------------------------
# Step 5: Install Node.js dependencies
# npm ci honours package-lock.json exactly — deterministic and fast.
# PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: use system Chromium (installed by 01-server-setup.sh)
# -----------------------------------------------------------------------------
info "Installing Node.js dependencies..."
cd "${RELEASE_DIR}"
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH
PUPPETEER_EXECUTABLE_PATH="$(command -v chromium-browser 2>/dev/null \
  || command -v chromium 2>/dev/null \
  || echo '/usr/bin/chromium-browser')"

npm ci --prefer-offline --no-audit --no-fund
success "npm ci complete."

# -----------------------------------------------------------------------------
# Step 6: Build Next.js (only if SKIP_BUILD is not 'true')
# When triggered from GitHub Actions, the .next/ directory was already built
# on the GitHub runner and is included in the release tarball, so we skip
# the build here to save time and ensure the exact same binary is deployed.
# When deploying manually without a pre-built artefact, set SKIP_BUILD=false.
# -----------------------------------------------------------------------------
if [[ "${SKIP_BUILD}" == "true" ]]; then
  info "Skipping Next.js build (SKIP_BUILD=true — using pre-built .next/ from CI)."
  if [[ ! -d "${RELEASE_DIR}/.next" ]]; then
    warning ".next/ directory not found in tarball but SKIP_BUILD=true. The app may not start."
  fi
else
  info "Building Next.js..."
  # Source .env.production so NEXT_PUBLIC_* vars are available at build time
  set -a
  # shellcheck source=/dev/null
  source "${SHARED_DIR}/.env.production"
  set +a
  npm run build
  success "Next.js build complete."
fi

# -----------------------------------------------------------------------------
# Step 7: Atomic symlink swap
# ln -sfn is atomic on Linux (it creates a new symlink then renames it in one
# syscall), so Nginx never serves a half-deployed state.
# -----------------------------------------------------------------------------
info "Swapping current symlink to ${RELEASE_ID}..."
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"
success "current -> ${RELEASE_ID}"

# -----------------------------------------------------------------------------
# Step 8: Reload/start PM2 processes
#
# next-app    : pm2 reload (zero-downtime rolling reload in cluster mode)
# scraper-worker: pm2 restart (Puppeteer is not safely hot-reloadable; it needs
#                 a clean process with the new scraper.js code)
# -----------------------------------------------------------------------------
info "Reloading PM2 processes..."
cd "${CURRENT_LINK}"

ECOSYSTEM="${CURRENT_LINK}/ecosystem.config.js"

if [[ ! -f "$ECOSYSTEM" ]]; then
  die "ecosystem.config.js not found at ${ECOSYSTEM}. Cannot start PM2 processes."
fi

# Check which processes are already running
NEXT_RUNNING=false
SCRAPER_RUNNING=false
pm2 list --no-color 2>/dev/null | grep -q "next-app"       && NEXT_RUNNING=true
pm2 list --no-color 2>/dev/null | grep -q "scraper-worker" && SCRAPER_RUNNING=true

if [[ "$NEXT_RUNNING" == "true" ]]; then
  info "Reloading next-app (zero-downtime cluster reload)..."
  pm2 reload "${ECOSYSTEM}" --only next-app --update-env
else
  info "Starting next-app for the first time..."
  pm2 start "${ECOSYSTEM}" --only next-app --env production
fi

if [[ "$SCRAPER_RUNNING" == "true" ]]; then
  info "Restarting scraper-worker (graceful stop + start)..."
  pm2 restart "${ECOSYSTEM}" --only scraper-worker --update-env
else
  info "Starting scraper-worker for the first time..."
  pm2 start "${ECOSYSTEM}" --only scraper-worker --env production
fi

# Save PM2 process list so it survives server reboots
pm2 save --force
success "PM2 processes updated and saved."

# Short pause to let the cluster workers come up before health check
sleep 3

# Local health check — confirm Next.js is responding on port 3000
info "Running local health check on port 3000..."
HEALTH_PASS=false
for i in $(seq 1 18); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000 2>/dev/null || echo 000)
  if echo "$CODE" | grep -qE '^(200|301|302|304)$'; then
    HEALTH_PASS=true
    success "localhost:3000 returned HTTP ${CODE} on attempt ${i}."
    break
  fi
  info "Attempt ${i}/18: HTTP ${CODE} — waiting 5s..."
  sleep 5
done

if [[ "$HEALTH_PASS" == "false" ]]; then
  error "Health check failed after 90 seconds."
  echo ""
  echo "--- PM2 status ---"
  pm2 list || true
  echo ""
  echo "--- next-app last 40 log lines ---"
  pm2 logs next-app --lines 40 --nostream || true
  exit 1
fi

# -----------------------------------------------------------------------------
# Step 9: Prune old releases
# Keep the last KEEP_RELEASES release directories; remove the rest.
# The oldest releases are listed last by ls -1t (newest first).
# -----------------------------------------------------------------------------
info "Pruning releases (keeping last ${KEEP_RELEASES})..."
RELEASE_COUNT=$(ls -1 "${RELEASES_DIR}" | wc -l)
if [[ "$RELEASE_COUNT" -gt "$KEEP_RELEASES" ]]; then
  TO_DELETE=$(ls -1t "${RELEASES_DIR}" | tail -n +"$((KEEP_RELEASES + 1))")
  for OLD in $TO_DELETE; do
    # Safety check: never delete the currently active release
    ACTIVE=$(readlink -f "${CURRENT_LINK}" || true)
    CANDIDATE="${RELEASES_DIR}/${OLD}"
    if [[ "$CANDIDATE" == "$ACTIVE" ]]; then
      warning "Skipping deletion of active release: $OLD"
      continue
    fi
    info "Removing old release: ${OLD}"
    rm -rf "${CANDIDATE}"
  done
  success "Pruned $((RELEASE_COUNT - KEEP_RELEASES)) old release(s)."
else
  info "Only ${RELEASE_COUNT} release(s) — nothing to prune."
fi

# -----------------------------------------------------------------------------
# Step 10: Clean up temp files
# -----------------------------------------------------------------------------
rm -f "${RELEASE_ARCHIVE}" /tmp/08-remote-deploy.sh 2>/dev/null || true

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
echo ""
success "======================================================="
success "  Deployment complete: ${RELEASE_ID}"
success "  Active release : ${CURRENT_LINK} -> ${RELEASE_DIR}"
success "  Node version   : $(node --version)"
success "  PM2 status:"
pm2 list --no-color | grep -E "next-app|scraper-worker" || true
success "======================================================="
