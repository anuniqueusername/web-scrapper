#!/bin/bash
# =============================================================================
# 08-remote-deploy.sh — Server-side deployment script
# Kijiji Competitor Scraper (Next.js + Puppeteer scraper)
#
# Description:
#   Executed on the Digital Ocean droplet by the GitHub Actions deploy job.
#   Extracts a release tarball that was uploaded by GitHub Actions (the tarball
#   already contains the pre-built .next/ directory from the CI runner), links
#   shared persistent files, writes .env.production from the base64-encoded
#   ENV_B64 variable, installs Node.js dependencies, swaps the current symlink,
#   and reloads PM2 processes.
#   Designed to be idempotent — safe to re-run on retry or manual deploy.
#
# -----------------------------------------------------------------------
# What GitHub Actions uploads before calling this script:
# -----------------------------------------------------------------------
#   /tmp/release-<git-sha>.tar.gz   Full project tree including .next/ (pre-built
#                                   by the CI runner). Excludes: .git, node_modules,
#                                   .next/cache, data/, scraper-config.json,
#                                   scraper-status.json, facebook-scraper-status.json,
#                                   *.log, .env*, tmp/, temp/
#   /tmp/08-remote-deploy.sh        This script itself
#
# -----------------------------------------------------------------------
# GitHub Actions call site:
# -----------------------------------------------------------------------
#   ssh root@droplet \
#     "chmod +x /tmp/08-remote-deploy.sh && \
#      ENV_B64='...' \
#      RELEASE_ARCHIVE='/tmp/release-<sha>.tar.gz' \
#      GIT_SHA='<sha>' \
#      SKIP_BUILD='true' \
#      APP_USER='root' \
#      bash /tmp/08-remote-deploy.sh"
#
# -----------------------------------------------------------------------
# Server directory layout (created by 01-server-setup.sh):
# -----------------------------------------------------------------------
#   /var/www/web-scraper/
#     releases/          <- timestamped release snapshots
#     shared/
#       data/            <- listings.json, scraper.db (persists across deploys)
#       logs/            <- pm2 log output
#       .env.production  <- written/updated by this script on every deploy
#       scraper-config.json   <- persists across deploys (created by dashboard)
#       scraper-status.json   <- persists across deploys (written by scraper)
#       facebook-scraper-status.json <- persists across deploys
#       ecosystem.config.js   <- PM2 process definition (written once)
#     current -> releases/<latest>  <- symlink updated atomically
#
# -----------------------------------------------------------------------
# Environment variables (set by the GitHub Actions step):
# -----------------------------------------------------------------------
#   ENV_B64           Base64-encoded contents of .env.production
#   RELEASE_ARCHIVE   Path to the release tarball (e.g. /tmp/release-abc123.tar.gz)
#   GIT_SHA           Git commit SHA for release naming
#   SKIP_BUILD        'true' to skip npm run build (pre-built .next/ is in tarball).
#                     GitHub Actions always sets this to 'true' because the tarball
#                     already contains .next/ from the CI runner.
#                     Set to 'false' only for a manual deploy without a pre-built artefact.
#   APP_USER          OS user that owns the app directory (default: root when
#                     GitHub Actions deploys as root)
#   KEEP_RELEASES     Number of old releases to retain (default: 5)
#
# -----------------------------------------------------------------------
# Usage (local test without GitHub Actions):
# -----------------------------------------------------------------------
#   ENV_B64="$(cat .env.production | base64 -w 0)" \
#   RELEASE_ARCHIVE=/tmp/release.tar.gz \
#   GIT_SHA=local \
#   SKIP_BUILD=true \
#   APP_USER=root \
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
# SKIP_BUILD defaults to 'true' because GitHub Actions always includes the
# pre-built .next/ in the tarball. Only set to 'false' when deploying a tarball
# that does NOT contain .next/ (e.g. a manual deploy from a plain git export).
SKIP_BUILD="${SKIP_BUILD:-true}"
APP_USER="${APP_USER:-root}"

# Derive a timestamped release ID — makes releases sortable and human-readable
RELEASE_ID="$(date +%Y%m%d_%H%M%S)_${GIT_SHA:0:7}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"

# -----------------------------------------------------------------------------
# Validation
# -----------------------------------------------------------------------------
[[ -z "$ENV_B64" ]]           && die "ENV_B64 is not set. Cannot write .env.production."
[[ ! -f "$RELEASE_ARCHIVE" ]] && die "Release archive not found: $RELEASE_ARCHIVE"
command -v pm2  >/dev/null 2>&1 || die "pm2 is not installed. Run 01-server-setup.sh first."
command -v node >/dev/null 2>&1 || die "node is not installed. Run 01-server-setup.sh first."
command -v tar  >/dev/null 2>&1 || die "tar is not installed."

info "======================================================="
info "  Kijiji Scraper — Release ${RELEASE_ID}"
info "  Archive    : ${RELEASE_ARCHIVE} ($(du -sh "${RELEASE_ARCHIVE}" | cut -f1))"
info "  SKIP_BUILD : ${SKIP_BUILD}"
info "  APP_USER   : ${APP_USER}"
info "  Node       : $(node --version)"
info "  PM2        : $(pm2 --version)"
info "======================================================="

# -----------------------------------------------------------------------------
# Step 1: Ensure directory layout
# -----------------------------------------------------------------------------
info "Ensuring directory layout..."
mkdir -p \
  "${RELEASES_DIR}" \
  "${SHARED_DIR}/data" \
  "${SHARED_DIR}/logs"

# Create placeholder files so symlinks don't point to nothing on first deploy.
# touch with || true because the file may already be a populated JSON file and
# we must not zero it out — touch only updates mtime if it already exists.
[[ -f "${SHARED_DIR}/scraper-config.json" ]]          || echo '{}' > "${SHARED_DIR}/scraper-config.json"
[[ -f "${SHARED_DIR}/scraper-status.json" ]]          || echo '{}' > "${SHARED_DIR}/scraper-status.json"
[[ -f "${SHARED_DIR}/facebook-scraper-status.json" ]] || echo '{}' > "${SHARED_DIR}/facebook-scraper-status.json"

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
#
# Error handling:
#   - Verify the tarball is a valid gzip archive before extracting (avoids
#     extracting a corrupt/partial upload and leaving a half-deployed release).
#   - After extraction, confirm .next/BUILD_ID exists when SKIP_BUILD=true,
#     because the entire point of the tarball approach is to ship the pre-built
#     .next/ from CI — a missing BUILD_ID means the CI artefact was not bundled.
# -----------------------------------------------------------------------------
info "Verifying tarball integrity..."
if ! gzip -t "${RELEASE_ARCHIVE}" 2>/dev/null; then
  die "Tarball integrity check failed — the archive may be corrupt or incomplete: ${RELEASE_ARCHIVE}"
fi
success "Tarball integrity OK."

info "Unpacking release into ${RELEASE_DIR}..."
mkdir -p "${RELEASE_DIR}"

# Capture tar stderr separately so we can surface a clean error on failure
TAR_LOG=$(mktemp)
if ! tar -xzf "${RELEASE_ARCHIVE}" -C "${RELEASE_DIR}" 2>"${TAR_LOG}"; then
  error "tar extraction failed. Output:"
  cat "${TAR_LOG}" >&2
  rm -f "${TAR_LOG}"
  die "Aborting deployment due to extraction failure."
fi
rm -f "${TAR_LOG}"
success "Release unpacked ($(du -sh "${RELEASE_DIR}" | cut -f1))."

# Verify the .next/ directory was extracted when SKIP_BUILD=true
if [[ "${SKIP_BUILD}" == "true" ]]; then
  info "Verifying .next/ was included in the tarball..."
  if [[ ! -d "${RELEASE_DIR}/.next" ]]; then
    die ".next/ directory is missing from the extracted tarball but SKIP_BUILD=true. \
The CI build artefact was not included in the tarball. Check the 'Create release tarball' \
step in the GitHub Actions workflow — the artifact download must run before the tarball is created."
  fi
  if [[ ! -f "${RELEASE_DIR}/.next/BUILD_ID" ]]; then
    die ".next/ directory exists but .next/BUILD_ID is absent. The Next.js build in CI \
did not complete successfully. Check the 'Build Next.js' step in GitHub Actions."
  fi
  BUILD_ID="$(cat "${RELEASE_DIR}/.next/BUILD_ID")"
  success ".next/ verified. BUILD_ID: ${BUILD_ID}"
fi

# -----------------------------------------------------------------------------
# Step 4: Link shared persistent files into the new release
#
# data/                     — SQLite DB (scraper.db) and listings.json. Never overwrite.
# .env.production           — written above; linked into release for Next.js + scraper.
# scraper-config.json       — dashboard writes this; must survive across releases.
# scraper-status.json       — scraper writes this; must survive across releases.
# facebook-scraper-status.json — scraper writes this; must survive across releases.
# ecosystem.config.js       — PM2 config; copied (not symlinked) so it is editable.
# -----------------------------------------------------------------------------
info "Linking shared files..."

# data/ — symlink so both Next.js API routes and scraper.js read the same
# SQLite file regardless of which release is current.
rm -rf "${RELEASE_DIR}/data"
ln -sfn "${SHARED_DIR}/data" "${RELEASE_DIR}/data"

# .env files — Next.js reads .env.production at startup.
# Also expose as .env.local so Next.js API routes pick it up without extra config.
ln -sfn "${SHARED_DIR}/.env.production" "${RELEASE_DIR}/.env.production"
ln -sfn "${SHARED_DIR}/.env.production" "${RELEASE_DIR}/.env.local"

# Scraper runtime files
ln -sfn "${SHARED_DIR}/scraper-config.json"          "${RELEASE_DIR}/scraper-config.json"
ln -sfn "${SHARED_DIR}/scraper-status.json"          "${RELEASE_DIR}/scraper-status.json"
ln -sfn "${SHARED_DIR}/facebook-scraper-status.json" "${RELEASE_DIR}/facebook-scraper-status.json"

# ecosystem.config.js — use shared copy if a customised version exists there;
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
# PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: use system Chromium (installed by 01-server-setup.sh).
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
# Step 6: Build Next.js
#
# When SKIP_BUILD=true (the default for GitHub Actions):
#   The .next/ directory was verified in Step 3 — nothing to do here.
#
# When SKIP_BUILD=false (manual deploy without a pre-built artefact):
#   Build from source. Source .env.production so NEXT_PUBLIC_* vars are
#   available at build time. Verifies .next/BUILD_ID was produced.
# -----------------------------------------------------------------------------
if [[ "${SKIP_BUILD}" == "true" ]]; then
  info "Skipping Next.js build (SKIP_BUILD=true — using pre-built .next/ from tarball)."
else
  info "Building Next.js (SKIP_BUILD=false — no pre-built .next/ in tarball)..."
  # Source .env.production so NEXT_PUBLIC_* vars are available at build time
  set -a
  # shellcheck source=/dev/null
  source "${SHARED_DIR}/.env.production"
  set +a

  npm run build

  if [[ ! -f "${RELEASE_DIR}/.next/BUILD_ID" ]]; then
    die "npm run build completed but .next/BUILD_ID is missing. The build may have silently failed."
  fi
  success "Next.js build complete. BUILD_ID: $(cat "${RELEASE_DIR}/.next/BUILD_ID")"
fi

# -----------------------------------------------------------------------------
# Step 7: Atomic symlink swap
# ln -sfn is atomic on Linux (creates the symlink then renames in one syscall),
# so Nginx never serves a partially-deployed state during the swap.
# -----------------------------------------------------------------------------
info "Swapping current symlink to ${RELEASE_ID}..."
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"
success "current -> ${RELEASE_ID}"

# -----------------------------------------------------------------------------
# Step 8: Reload/start PM2 processes
#
# next-app       : pm2 reload (zero-downtime rolling reload in cluster mode)
# scraper-worker : pm2 restart (Puppeteer is not safely hot-reloadable; a clean
#                  process with the new scraper.js code is required)
# -----------------------------------------------------------------------------
info "Reloading PM2 processes..."
cd "${CURRENT_LINK}"

ECOSYSTEM="${CURRENT_LINK}/ecosystem.config.js"

if [[ ! -f "$ECOSYSTEM" ]]; then
  die "ecosystem.config.js not found at ${ECOSYSTEM}. Cannot start PM2 processes."
fi

# Determine which processes are currently managed by PM2
NEXT_RUNNING=false
SCRAPER_RUNNING=false
pm2 list --no-color 2>/dev/null | grep -q "next-app"       && NEXT_RUNNING=true    || true
pm2 list --no-color 2>/dev/null | grep -q "scraper-worker" && SCRAPER_RUNNING=true || true

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

# Short pause to let the cluster workers come up before the local health check
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
# Oldest releases are listed last by ls -1t (newest first).
# Safety check: the currently active release is never deleted.
# -----------------------------------------------------------------------------
info "Pruning releases (keeping last ${KEEP_RELEASES})..."
RELEASE_COUNT=$(ls -1 "${RELEASES_DIR}" | wc -l)
if [[ "$RELEASE_COUNT" -gt "$KEEP_RELEASES" ]]; then
  TO_DELETE=$(ls -1t "${RELEASES_DIR}" | tail -n +"$((KEEP_RELEASES + 1))")
  PRUNED=0
  for OLD in $TO_DELETE; do
    ACTIVE=$(readlink -f "${CURRENT_LINK}" || true)
    CANDIDATE="${RELEASES_DIR}/${OLD}"
    if [[ "$CANDIDATE" == "$ACTIVE" ]]; then
      warning "Skipping deletion of active release: $OLD"
      continue
    fi
    info "Removing old release: ${OLD}"
    rm -rf "${CANDIDATE}"
    PRUNED=$(( PRUNED + 1 ))
  done
  success "Pruned ${PRUNED} old release(s)."
else
  info "Only ${RELEASE_COUNT} release(s) present — nothing to prune."
fi

# -----------------------------------------------------------------------------
# Step 10: Clean up temp files uploaded by GitHub Actions
# -----------------------------------------------------------------------------
rm -f "${RELEASE_ARCHIVE}" /tmp/08-remote-deploy.sh 2>/dev/null || true
info "Temporary files removed."

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
