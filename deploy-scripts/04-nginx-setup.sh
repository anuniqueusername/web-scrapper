#!/bin/bash
# =============================================================================
# Script:       04-nginx-setup.sh
# Description:  Configure Nginx as a reverse proxy to the Next.js app on
#               port 3000. Creates the site config, symlinks it, removes the
#               default site, tests the config, and reloads Nginx.
#
# Run this on:  THE SERVER as root or with sudo
#               (ssh root@<DROPLET_IP> then bash 04-nginx-setup.sh)
#               OR:  sudo bash 04-nginx-setup.sh
#
# Usage:        sudo bash 04-nginx-setup.sh [domain]
#
#   Optional argument:  your domain name, e.g.  bash 04-nginx-setup.sh example.com
#   If no argument is given, the config will match any hostname (IP access).
#
# Prerequisites:
#   - 01-server-setup.sh has been run (Nginx is installed)
#   - 03-start-pm2.sh has been run (Next.js is listening on port 3000)
# =============================================================================
set -e

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# Pass your domain as $1, or leave blank to use _ (matches any hostname/IP)
SERVER_NAME="${1:-_}"
APP_PORT="3000"
NGINX_CONF_NAME="competitor-scraper"
NGINX_AVAILABLE="/etc/nginx/sites-available/$NGINX_CONF_NAME"
NGINX_ENABLED="/etc/nginx/sites-enabled/$NGINX_CONF_NAME"
SNIPPETS_DIR="/etc/nginx/snippets"

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
  error "Run with sudo: sudo bash 04-nginx-setup.sh [domain]"
fi

echo ""
echo "============================================================"
info "Configuring Nginx reverse proxy"
info "Server name: $SERVER_NAME"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Create proxy-params snippet
#         Centralises the proxy header settings so the main config stays clean.
# ---------------------------------------------------------------------------
info "Writing proxy-params snippet to $SNIPPETS_DIR/proxy-params.conf..."
mkdir -p "$SNIPPETS_DIR"

cat > "$SNIPPETS_DIR/proxy-params.conf" << 'SNIPPET'
# Proxy headers — included by the competitor-scraper site config
proxy_set_header Host               $host;
proxy_set_header X-Real-IP          $remote_addr;
proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto  $scheme;
proxy_set_header X-Forwarded-Host   $host;
proxy_set_header X-Forwarded-Port   $server_port;

# HTTP/1.1 required for upstream keepalive
proxy_http_version 1.1;
proxy_set_header Upgrade    $http_upgrade;
proxy_set_header Connection 'upgrade';

# Timeouts — generous for the dashboard's auto-refresh polling
proxy_connect_timeout   10s;
proxy_send_timeout      60s;
proxy_read_timeout      60s;

# Disable buffering for streaming/SSE API responses
proxy_buffering         off;
proxy_request_buffering off;

# Cache bypass — never cache Next.js dynamic routes
proxy_cache_bypass $http_upgrade;
SNIPPET

success "proxy-params snippet written."

# ---------------------------------------------------------------------------
# Step 2: Write the main Nginx site config
# ---------------------------------------------------------------------------
info "Writing Nginx site config to $NGINX_AVAILABLE..."

cat > "$NGINX_AVAILABLE" << NGINXCONF
# =============================================================================
# Nginx Site Config — Kijiji Competitor Scraper
# Managed by 04-nginx-setup.sh — regenerate with: sudo bash 04-nginx-setup.sh
#
# After running 05-ssl-setup.sh, certbot will add the HTTPS server block
# and convert this HTTP block to a redirect automatically.
# =============================================================================

# Upstream points to the Next.js cluster managed by PM2
upstream nextjs_upstream {
    server 127.0.0.1:${APP_PORT};
    keepalive 64;
}

# ---------------------------------------------------------------------------
# HTTP server — serves the app directly until SSL is configured.
# certbot will automatically convert this to an HTTPS redirect.
# ---------------------------------------------------------------------------
server {
    listen 80;
    listen [::]:80;

    server_name ${SERVER_NAME};

    # Let's Encrypt ACME challenge — must be reachable over plain HTTP
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    # Security headers (basic set; expanded headers added by certbot for HTTPS)
    add_header X-Frame-Options        "SAMEORIGIN"   always;
    add_header X-Content-Type-Options "nosniff"      always;
    add_header X-XSS-Protection       "1; mode=block" always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;

    # Deny direct access to sensitive runtime files
    location ~* \.(env|log)$ {
        deny all;
        return 404;
    }

    # Block access to scraper config/status JSON over HTTP
    location ~* (scraper-config|scraper-status|facebook-scraper-status)\.json$ {
        deny all;
        return 404;
    }

    # Next.js static assets — long cache TTL (filenames are hashed by Next.js)
    location /_next/static/ {
        proxy_pass http://nextjs_upstream;
        add_header Cache-Control "public, max-age=31536000, immutable";
        include $SNIPPETS_DIR/proxy-params.conf;
    }

    # Next.js image optimisation endpoint
    location /_next/image {
        proxy_pass http://nextjs_upstream;
        include $SNIPPETS_DIR/proxy-params.conf;
    }

    # All other requests — proxy to Next.js
    location / {
        proxy_pass http://nextjs_upstream;
        include $SNIPPETS_DIR/proxy-params.conf;
    }
}
NGINXCONF

success "Nginx site config written."

# ---------------------------------------------------------------------------
# Step 3: Enable the site by symlinking to sites-enabled
# ---------------------------------------------------------------------------
if [[ -L "$NGINX_ENABLED" ]]; then
  warning "Symlink $NGINX_ENABLED already exists — overwriting."
fi
ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
success "Site enabled: $NGINX_ENABLED -> $NGINX_AVAILABLE"

# ---------------------------------------------------------------------------
# Step 4: Remove the default Nginx site (shows nginx welcome page by default)
# ---------------------------------------------------------------------------
if [[ -f /etc/nginx/sites-enabled/default ]]; then
  rm /etc/nginx/sites-enabled/default
  success "Default Nginx site removed."
else
  warning "Default site was already removed — skipping."
fi

# ---------------------------------------------------------------------------
# Step 5: Test Nginx config and reload
# ---------------------------------------------------------------------------
info "Testing Nginx configuration..."
nginx -t || error "Nginx config test failed. Review the output above."
success "Nginx config test passed."

info "Reloading Nginx..."
systemctl reload nginx
success "Nginx reloaded."

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Nginx configured successfully!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""

if [[ "$SERVER_NAME" == "_" ]]; then
  echo "  The app is now accessible at: http://<YOUR_DROPLET_IP>"
  echo ""
  echo "  To add a domain later, re-run with your domain as an argument:"
  echo "    sudo bash 04-nginx-setup.sh yourdomain.com"
else
  echo "  The app is now accessible at: http://$SERVER_NAME"
  echo ""
  echo "  To add SSL, run:"
  echo "    sudo bash 05-ssl-setup.sh"
fi
echo ""
