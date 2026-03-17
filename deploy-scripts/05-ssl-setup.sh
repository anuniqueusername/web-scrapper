#!/bin/bash
# =============================================================================
# Script:       05-ssl-setup.sh
# Description:  Obtain a Let's Encrypt SSL certificate via Certbot for the
#               Nginx reverse proxy, then configure automatic renewal.
#
# Run this on:  THE SERVER as root or with sudo
#               (ssh root@<DROPLET_IP> then bash 05-ssl-setup.sh)
#
# Usage:        sudo bash 05-ssl-setup.sh
#
# Prerequisites:
#   - 04-nginx-setup.sh has been run with a real domain name (not _)
#   - Your domain's A record is pointing at the Droplet IP
#   - Port 80 is open in UFW (done by 06-firewall-setup.sh or 01-server-setup.sh)
#   - Nginx is running and the site is accessible over HTTP
#
# WARNING: This script will fail if your domain DNS is not yet pointing at
#          this server. Let's Encrypt validates domain ownership over HTTP.
# =============================================================================
set -e

# ---------------------------------------------------------------------------
# Configuration — EDIT THIS before running
# ---------------------------------------------------------------------------
DOMAIN="your-domain.com"          # e.g. scraper.mycompany.com
EMAIL="admin@your-domain.com"     # Used for Let's Encrypt expiry notifications

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warning() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Must run as root
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  error "Run with sudo: sudo bash 05-ssl-setup.sh"
fi

# ---------------------------------------------------------------------------
# Validate configuration
# ---------------------------------------------------------------------------
if [[ "$DOMAIN" == "your-domain.com" ]]; then
  error "Edit the DOMAIN variable in this script before running."
fi

if [[ "$EMAIL" == "admin@your-domain.com" ]]; then
  error "Edit the EMAIL variable in this script before running."
fi

echo ""
echo "============================================================"
info "Setting up SSL/TLS for $DOMAIN"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Verify DNS resolves to this server before calling certbot
# ---------------------------------------------------------------------------
info "Checking that $DOMAIN resolves to this server..."
SERVER_IP=$(curl -sf https://api.ipify.org 2>/dev/null || curl -sf https://ifconfig.me 2>/dev/null || echo "unknown")
DNS_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -1 || echo "")

if [[ "$DNS_IP" == "$SERVER_IP" ]]; then
  success "DNS check passed: $DOMAIN -> $SERVER_IP"
elif [[ -z "$DNS_IP" ]]; then
  warning "Could not resolve $DOMAIN. Make sure your A record is set to $SERVER_IP"
  warning "Proceeding anyway — certbot will give a clearer error if DNS is wrong."
else
  warning "DNS mismatch: $DOMAIN resolves to $DNS_IP but this server is $SERVER_IP"
  warning "If this is wrong, fix your DNS A record before continuing."
  warning "Proceeding anyway — certbot will validate over HTTP."
fi

# ---------------------------------------------------------------------------
# Step 2: Install certbot and the Nginx plugin
#         Idempotent: snap refresh is safe to re-run
# ---------------------------------------------------------------------------
if command -v certbot &>/dev/null; then
  warning "Certbot already installed — skipping installation."
else
  info "Installing Certbot via snap..."
  # snap is the recommended install method for certbot on Ubuntu 22.04
  snap install --classic certbot 2>/dev/null || apt-get install -y certbot python3-certbot-nginx
  # Ensure the certbot command is available
  ln -sf /snap/bin/certbot /usr/bin/certbot 2>/dev/null || true
  success "Certbot installed."
fi

# Also install the Nginx plugin for apt-installed certbot (no-op if snap)
apt-get install -y python3-certbot-nginx 2>/dev/null || true

# ---------------------------------------------------------------------------
# Step 3: Obtain the certificate
#         --nginx   : automatically edits the Nginx config to add HTTPS
#         --agree-tos / --non-interactive : skip prompts in scripts
# ---------------------------------------------------------------------------
info "Requesting certificate for $DOMAIN from Let's Encrypt..."
certbot --nginx \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --redirect

success "SSL certificate obtained and Nginx updated."

# ---------------------------------------------------------------------------
# Step 4: Verify auto-renewal timer is active
#         On Ubuntu 22.04 with snap certbot, a systemd timer handles renewal.
#         With the apt package, a cron job is added automatically.
#         We ensure at least one mechanism is in place.
# ---------------------------------------------------------------------------
info "Verifying auto-renewal..."

if systemctl is-active --quiet snap.certbot.renew.timer 2>/dev/null; then
  success "Certbot renewal timer (snap) is active."
elif systemctl is-active --quiet certbot.timer 2>/dev/null; then
  success "Certbot renewal timer (systemd) is active."
else
  # Fallback: add a cron job that runs twice daily (certbot only renews when
  # the certificate is within 30 days of expiry, so running twice daily is safe)
  warning "No systemd timer found — adding renewal cron job as fallback."
  CRON_JOB="0 3,15 * * * root certbot renew --quiet --nginx"
  if ! grep -qF "certbot renew" /etc/crontab 2>/dev/null; then
    echo "$CRON_JOB" >> /etc/crontab
    success "Cron job added: $CRON_JOB"
  else
    warning "Cron job already present — skipping."
  fi
fi

# ---------------------------------------------------------------------------
# Step 5: Do a dry-run renewal to confirm everything is wired up correctly
# ---------------------------------------------------------------------------
info "Running a dry-run renewal test..."
certbot renew --dry-run --quiet && success "Dry-run renewal succeeded." \
  || warning "Dry-run renewal reported an issue. Run 'certbot renew --dry-run' manually to diagnose."

# ---------------------------------------------------------------------------
# Step 6: Reload Nginx to pick up any config changes certbot made
# ---------------------------------------------------------------------------
info "Reloading Nginx..."
systemctl reload nginx
success "Nginx reloaded."

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  SSL certificate installed successfully!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Your app is now available at: https://$DOMAIN"
echo ""
echo "  Certificate details:"
certbot certificates 2>/dev/null | grep -A4 "Certificate Name: $DOMAIN" || true
echo ""
echo "  Auto-renewal: certificates are renewed automatically when they"
echo "  have less than 30 days remaining. No manual action needed."
echo ""
echo "  To renew manually:  certbot renew"
echo "  To check expiry:    certbot certificates"
echo ""
