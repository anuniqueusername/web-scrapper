#!/bin/bash
# =============================================================================
# Description:  Set up Let's Encrypt SSL certificates via Certbot for the
#               Kijiji Competitor Scraper on Nginx.
#
# Usage:        Run on the droplet as root AFTER:
#                 1. DNS A record is pointing to this server's IP
#                 2. Nginx is already installed and serving port 80
#                 3. setup-droplet.sh has been run
#
#   bash setup-ssl.sh yourdomain.com [admin@yourdomain.com]
#
# Prerequisites:
#   - Domain DNS must resolve to this server's public IP
#   - Port 80 must be open (Certbot uses HTTP-01 challenge)
#   - Nginx must be running
#
# Estimated time: 1-2 minutes
# =============================================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
NGINX_CONF="/etc/nginx/sites-available/web-scraper.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/web-scraper.conf"

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
# Validate inputs
# ---------------------------------------------------------------------------
[[ $EUID -ne 0 ]] && error "Must run as root: sudo bash setup-ssl.sh $*"
[[ -z "$DOMAIN" ]] && error "Usage: bash setup-ssl.sh <domain.com> [email]"

if [[ -z "$EMAIL" ]]; then
  warning "No email provided — certificate expiry warnings won't be sent."
  EMAIL_OPTS="--register-unsafely-without-email"
else
  EMAIL_OPTS="--email $EMAIL"
fi

# ---------------------------------------------------------------------------
# 1. Verify DNS resolves to this machine
# ---------------------------------------------------------------------------
info "Checking DNS resolution for $DOMAIN..."
SERVER_IP=$(curl -s4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DOMAIN_IP=$(dig +short "$DOMAIN" A 2>/dev/null | tail -1 || getent hosts "$DOMAIN" | awk '{print $1}')

if [[ "$SERVER_IP" != "$DOMAIN_IP" ]]; then
  warning "DNS mismatch: server IP=$SERVER_IP, domain resolves to=$DOMAIN_IP"
  warning "Certbot may fail if DNS is not yet propagated."
  read -rp "Continue anyway? [y/N] " CONFIRM
  [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]] && exit 1
else
  success "DNS verified: $DOMAIN -> $SERVER_IP"
fi

# ---------------------------------------------------------------------------
# 2. Install Certbot
# ---------------------------------------------------------------------------
if command -v certbot &>/dev/null; then
  warning "Certbot already installed ($(certbot --version 2>&1)) — skipping install."
else
  info "Installing Certbot and Nginx plugin..."
  apt-get update -qq
  apt-get install -y certbot python3-certbot-nginx
  success "Certbot installed."
fi

# ---------------------------------------------------------------------------
# 3. Ensure Nginx config exists and is enabled
# ---------------------------------------------------------------------------
if [[ ! -f "$NGINX_CONF" ]]; then
  error "Nginx config not found at $NGINX_CONF. Copy nginx/app.conf first."
fi

[[ ! -L "$NGINX_ENABLED" ]] && ln -sf "$NGINX_CONF" "$NGINX_ENABLED"

info "Testing Nginx configuration..."
nginx -t
systemctl reload nginx
success "Nginx config valid and reloaded."

# ---------------------------------------------------------------------------
# 4. Obtain certificate
# ---------------------------------------------------------------------------
info "Requesting SSL certificate for $DOMAIN..."

certbot --nginx \
  --non-interactive \
  --agree-tos \
  $EMAIL_OPTS \
  --domains "$DOMAIN" \
  --redirect           # Automatically add HTTP -> HTTPS redirect

success "SSL certificate issued for $DOMAIN."

# ---------------------------------------------------------------------------
# 5. Verify auto-renewal
# ---------------------------------------------------------------------------
info "Testing automatic certificate renewal (dry run)..."
certbot renew --dry-run --quiet
success "Auto-renewal dry run passed."

# ---------------------------------------------------------------------------
# 6. Ensure systemd renewal timer is active
# ---------------------------------------------------------------------------
if systemctl is-active --quiet certbot.timer 2>/dev/null; then
  success "Certbot systemd renewal timer is active."
else
  # Fall back to cron if systemd timer is not available
  info "Adding cron job for certificate renewal..."
  if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
    success "Cron job added: daily renewal check at 03:00."
  else
    warning "Cron renewal already exists — skipping."
  fi
fi

# ---------------------------------------------------------------------------
# 7. Final Nginx reload to activate HTTPS blocks added by Certbot
# ---------------------------------------------------------------------------
nginx -t && systemctl reload nginx
success "Nginx reloaded with SSL configuration."

# ---------------------------------------------------------------------------
# Print result
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}==========================================================${NC}"
echo -e "${GREEN}  SSL setup complete for: https://$DOMAIN${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo ""
echo "  Certificate path:   /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "  Private key path:   /etc/letsencrypt/live/$DOMAIN/privkey.pem"
echo "  Renewal:            Automatic (certbot.timer or daily cron)"
echo ""
echo "  Test your SSL grade at: https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"
echo ""
