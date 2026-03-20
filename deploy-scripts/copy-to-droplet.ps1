# =============================================================================
# Copy scraper to Digital Ocean droplet and setup
# Usage: .\copy-to-droplet.ps1
# =============================================================================

# Configuration
$DROPLET_IP = "134.122.32.27"
$DROPLET_USER = "root"
$SSH_KEY = "C:\Users\nianj\.ssh\id_ed25519"
$REMOTE_APP_DIR = "/var/www/web-scraper"
$LOCAL_PROJECT_DIR = "d:\Projects\Competitor Scraper"

# Color output
function Write-Success { Write-Host "✓ $args" -ForegroundColor Green }
function Write-Error { Write-Host "❌ $args" -ForegroundColor Red }
function Write-Info { Write-Host "ℹ️  $args" -ForegroundColor Cyan }

# Check if SSH key exists
if (-not (Test-Path $SSH_KEY)) {
  Write-Error "SSH key not found: $SSH_KEY"
  exit 1
}

Write-Info "Starting copy to droplet..."
Write-Info "Droplet: $DROPLET_USER@$DROPLET_IP"
Write-Info "Target: $REMOTE_APP_DIR"

# Create tarball excluding node_modules and .git
Write-Info "Creating tarball (excluding node_modules, .git, cache)..."

# Change to project directory
Push-Location $LOCAL_PROJECT_DIR

# Create tarball with exclusions
tar --exclude='node_modules' `
    --exclude='.git' `
    --exclude='.next/cache' `
    --exclude='*.log' `
    -czf scraper.tar.gz `
    scraper/ `
    data/ `
    package.json `
    package-lock.json

Write-Success "Tarball created: scraper.tar.gz"

# Copy tarball to droplet
Write-Info "Uploading to droplet..."
scp -i $SSH_KEY scraper.tar.gz "${DROPLET_USER}@${DROPLET_IP}:/tmp/"

if ($LASTEXITCODE -eq 0) {
  Write-Success "Tarball uploaded"
} else {
  Write-Error "Failed to upload tarball"
  exit 1
}

# Copy setup script
Write-Info "Copying setup script..."
scp -i $SSH_KEY deploy-scripts/09-setup-scraper.sh "${DROPLET_USER}@${DROPLET_IP}:/tmp/"

Write-Success "Setup script uploaded"

# Extract and setup on droplet
Write-Info "Extracting and setting up on droplet..."
ssh -i $SSH_KEY "${DROPLET_USER}@${DROPLET_IP}" @"
set -e
echo 'Extracting tarball...'
cd $REMOTE_APP_DIR
tar -xzf /tmp/scraper.tar.gz
echo '✓ Extraction complete'

echo 'Installing npm dependencies...'
npm ci --prefer-offline --no-audit --no-fund

echo 'Running scraper setup...'
cd scraper
bash setup.sh

echo '✓ Setup complete!'
"@

if ($LASTEXITCODE -eq 0) {
  Write-Success "Deployment complete!"
  Write-Info "Check scraper status with:"
  Write-Info "  ssh -i $SSH_KEY ${DROPLET_USER}@${DROPLET_IP} 'pm2 logs scraper-worker'"
} else {
  Write-Error "Setup failed"
  exit 1
}

# Cleanup
Write-Info "Cleaning up local files..."
Remove-Item scraper.tar.gz -Force
Write-Success "Done!"

Pop-Location
