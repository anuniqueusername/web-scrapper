#!/bin/bash
# =============================================================================
# Script:       06-firewall-setup.sh
# Description:  Configure UFW (Uncomplicated Firewall) to allow only SSH,
#               HTTP, and HTTPS traffic. Port 3000 (Next.js) is intentionally
#               kept closed to the internet — Nginx proxies to it internally.
#
# Run this on:  THE SERVER as root or with sudo
#               (ssh root@<DROPLET_IP> then sudo bash 06-firewall-setup.sh)
#
# Usage:        sudo bash 06-firewall-setup.sh
#
# NOTE: 01-server-setup.sh already runs this script's logic as part of
#       the full provisioning flow. Run this script standalone only if you
#       need to reset or re-apply firewall rules on an existing server.
#
# WARNING: This script resets all existing UFW rules before applying the new
#          ruleset. If you have custom rules, back them up first.
# =============================================================================
set -e

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
  error "Run with sudo: sudo bash 06-firewall-setup.sh"
fi

echo ""
echo "============================================================"
info "Configuring UFW firewall"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Install UFW if not present (it ships with Ubuntu 22.04 by default)
# ---------------------------------------------------------------------------
if ! command -v ufw &>/dev/null; then
  info "UFW not found — installing..."
  apt-get update -qq
  apt-get install -y ufw
  success "UFW installed."
else
  info "UFW is already installed."
fi

# ---------------------------------------------------------------------------
# Step 2: Reset all existing rules
#         This ensures we start from a known-clean state.
#         --force skips the interactive confirmation prompt.
# ---------------------------------------------------------------------------
info "Resetting UFW rules to defaults..."
ufw --force reset
success "UFW rules cleared."

# ---------------------------------------------------------------------------
# Step 3: Set default policies
#         Deny all incoming traffic by default; allow all outbound.
#         Individual allow rules below punch the necessary holes.
# ---------------------------------------------------------------------------
info "Setting default policies (deny incoming, allow outgoing)..."
ufw default deny incoming
ufw default allow outgoing
success "Default policies set."

# ---------------------------------------------------------------------------
# Step 4: Allow required ports
#
#   22  / SSH  — remote administration
#   80  / HTTP  — Let's Encrypt validation + HTTP traffic (redirected to HTTPS)
#   443 / HTTPS — production traffic
#
#   Port 3000 (Next.js) is NOT opened. The app is only reachable via Nginx
#   on 80/443. Opening 3000 would bypass Nginx security headers and expose
#   the raw Node.js process to the internet.
# ---------------------------------------------------------------------------
info "Allowing OpenSSH (port 22)..."
ufw allow OpenSSH
success "Port 22 (SSH) open."

info "Allowing Nginx Full (ports 80 + 443)..."
ufw allow 'Nginx Full'
success "Ports 80 (HTTP) and 443 (HTTPS) open."

# Explicitly block direct access to port 3000 from outside
# (redundant given the deny default, but makes intent clear in ufw status)
ufw deny 3000/tcp comment 'Block direct Next.js access — use Nginx'

# ---------------------------------------------------------------------------
# Step 5: Enable UFW
#         --force skips the interactive "may disrupt existing ssh" prompt.
# ---------------------------------------------------------------------------
info "Enabling UFW..."
ufw --force enable
success "UFW enabled."

# ---------------------------------------------------------------------------
# Done — print current status
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Firewall configured successfully!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Current UFW status:"
echo ""
ufw status verbose
echo ""
echo "  Open ports:  22 (SSH), 80 (HTTP), 443 (HTTPS)"
echo "  Blocked:     3000 (Next.js — internal only via Nginx)"
echo ""
