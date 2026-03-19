#!/bin/bash
# =============================================================================
# Description : SSH Authentication Diagnostic Script
#               Run this DIRECTLY on the Digital Ocean droplet (not via GitHub
#               Actions) to verify that the SSH configuration is correct and
#               that GitHub Actions will be able to authenticate.
#
# Usage       : bash diagnose-ssh.sh [EXPECTED_FINGERPRINT]
#               EXPECTED_FINGERPRINT is the SHA256 fingerprint of the public
#               key you intend to use from GitHub Actions (optional but
#               recommended).
#               Example:
#                 bash diagnose-ssh.sh SHA256:zBx5NRp4RKAs0ShIKYJg6ICaJu8AAT7uLdSbuSAHGNA
#
# Prerequisites: Run as root on the Digital Ocean droplet, or as the user
#               that GitHub Actions SSHes in as (e.g. root, deploy).
#               Access the droplet via the Digital Ocean console if SSH is
#               fully broken.
#
# Estimated time: 30 seconds
# =============================================================================

set -uo pipefail

EXPECTED_FP="${1:-}"

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()      { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
fail()    { echo -e "${RED}[FAIL]${RESET}  $*"; }
section() { echo -e "\n${BOLD}${CYAN}=== $* ===${RESET}"; }

ISSUES=0
flag_issue() { ISSUES=$((ISSUES + 1)); fail "$*"; }

# ---------------------------------------------------------------------------
# 1. Identify which user we are running as
# ---------------------------------------------------------------------------
section "Running User"
CURRENT_USER=$(whoami)
CURRENT_HOME=$(eval echo "~${CURRENT_USER}")
info "Running as user : ${CURRENT_USER}"
info "Home directory  : ${CURRENT_HOME}"

if [ "${CURRENT_USER}" = "root" ]; then
  warn "Running as root. If GitHub Actions SSHes as a non-root user (e.g. 'deploy'), re-run this script as that user."
fi

# ---------------------------------------------------------------------------
# 2. sshd service status
# ---------------------------------------------------------------------------
section "SSH Daemon (sshd) Status"
if systemctl is-active --quiet sshd 2>/dev/null || systemctl is-active --quiet ssh 2>/dev/null; then
  ok "sshd is running."
else
  flag_issue "sshd is NOT running. Fix: systemctl start ssh && systemctl enable ssh"
fi

# ---------------------------------------------------------------------------
# 3. sshd_config key settings
# ---------------------------------------------------------------------------
section "sshd_config Relevant Settings"
SSHD_CONFIG="/etc/ssh/sshd_config"

check_sshd_option() {
  local key="$1"
  local good_val="$2"
  local bad_val="${3:-}"

  # Check the effective (last uncommented) value for this key
  local val
  val=$(grep -i "^${key}" "${SSHD_CONFIG}" 2>/dev/null | tail -1 | awk '{print $2}')

  if [ -z "$val" ]; then
    info "${key} not explicitly set in sshd_config (using sshd default)."
    return
  fi

  if [ "${val,,}" = "${good_val,,}" ]; then
    ok "${key} = ${val}"
  elif [ -n "${bad_val}" ] && [ "${val,,}" = "${bad_val,,}" ]; then
    flag_issue "${key} = ${val}  <-- THIS BLOCKS KEY AUTH. Fix: set ${key} ${good_val} in ${SSHD_CONFIG} then: systemctl restart ssh"
  else
    warn "${key} = ${val}  (expected '${good_val}' — verify this is correct)"
  fi
}

check_sshd_option "PubkeyAuthentication"   "yes"  "no"
check_sshd_option "AuthorizedKeysFile"     ".ssh/authorized_keys"
check_sshd_option "PasswordAuthentication" "no"

# Check if PermitRootLogin matters
if [ "${CURRENT_USER}" = "root" ]; then
  ROOT_LOGIN=$(grep -i "^PermitRootLogin" "${SSHD_CONFIG}" 2>/dev/null | tail -1 | awk '{print $2}')
  if [ -z "${ROOT_LOGIN}" ]; then
    warn "PermitRootLogin not explicitly set (default varies by distro — often 'prohibit-password' which ALLOWS key auth but blocks passwords)."
  elif [ "${ROOT_LOGIN,,}" = "yes" ] || [ "${ROOT_LOGIN,,}" = "prohibit-password" ] || [ "${ROOT_LOGIN,,}" = "without-password" ]; then
    ok "PermitRootLogin = ${ROOT_LOGIN}  (key-based login for root is allowed)"
  else
    flag_issue "PermitRootLogin = ${ROOT_LOGIN}  <-- Root SSH is blocked. Fix: set PermitRootLogin prohibit-password in ${SSHD_CONFIG}"
  fi
fi

# Drop-in config fragments can override sshd_config — check them too
if [ -d /etc/ssh/sshd_config.d ]; then
  DROPINS=$(ls /etc/ssh/sshd_config.d/*.conf 2>/dev/null | wc -l)
  if [ "${DROPINS}" -gt 0 ]; then
    warn "Found ${DROPINS} drop-in config file(s) in /etc/ssh/sshd_config.d/ — these can override sshd_config settings:"
    grep -h -i "PubkeyAuthentication\|AuthorizedKeysFile\|PermitRootLogin\|PasswordAuthentication" \
      /etc/ssh/sshd_config.d/*.conf 2>/dev/null | sed 's/^/  /' || true
  fi
fi

# ---------------------------------------------------------------------------
# 4. authorized_keys file
# ---------------------------------------------------------------------------
section "authorized_keys File"
AUTH_KEYS="${CURRENT_HOME}/.ssh/authorized_keys"

if [ ! -d "${CURRENT_HOME}/.ssh" ]; then
  flag_issue "~/.ssh directory does not exist for user '${CURRENT_USER}'."
  info "Fix: mkdir -p ${CURRENT_HOME}/.ssh && chmod 700 ${CURRENT_HOME}/.ssh"
else
  ok "~/.ssh directory exists."
  SSH_DIR_PERMS=$(stat -c "%a" "${CURRENT_HOME}/.ssh")
  if [ "${SSH_DIR_PERMS}" = "700" ]; then
    ok "~/.ssh permissions = ${SSH_DIR_PERMS}  (correct)"
  else
    flag_issue "~/.ssh permissions = ${SSH_DIR_PERMS}  (must be 700). Fix: chmod 700 ${CURRENT_HOME}/.ssh"
  fi
fi

if [ ! -f "${AUTH_KEYS}" ]; then
  flag_issue "authorized_keys does NOT exist at ${AUTH_KEYS}"
  info "Fix: touch ${AUTH_KEYS} && chmod 600 ${AUTH_KEYS}"
  info "Then paste your GitHub Actions public key into that file."
else
  ok "authorized_keys exists at ${AUTH_KEYS}"

  AUTH_PERMS=$(stat -c "%a" "${AUTH_KEYS}")
  if [ "${AUTH_PERMS}" = "600" ]; then
    ok "authorized_keys permissions = ${AUTH_PERMS}  (correct)"
  else
    flag_issue "authorized_keys permissions = ${AUTH_PERMS}  (must be 600). Fix: chmod 600 ${AUTH_KEYS}"
  fi

  AUTH_OWNER=$(stat -c "%U" "${AUTH_KEYS}")
  if [ "${AUTH_OWNER}" = "${CURRENT_USER}" ]; then
    ok "authorized_keys owner = ${AUTH_OWNER}  (correct)"
  else
    flag_issue "authorized_keys is owned by '${AUTH_OWNER}', not '${CURRENT_USER}'. Fix: chown ${CURRENT_USER}:${CURRENT_USER} ${AUTH_KEYS}"
  fi

  KEY_COUNT=$(grep -c "^ssh-" "${AUTH_KEYS}" 2>/dev/null || echo 0)
  info "Number of public keys in authorized_keys: ${KEY_COUNT}"
  if [ "${KEY_COUNT}" -eq 0 ]; then
    flag_issue "authorized_keys is empty or contains no valid 'ssh-*' entries."
  fi
fi

# ---------------------------------------------------------------------------
# 5. Home directory permissions (sshd is strict about this)
# ---------------------------------------------------------------------------
section "Home Directory Permissions"
HOME_PERMS=$(stat -c "%a" "${CURRENT_HOME}")
if [[ "${HOME_PERMS}" =~ ^[0-9]$ ]] || [ "${HOME_PERMS}" -gt 755 ]; then
  flag_issue "Home directory permissions = ${HOME_PERMS}. sshd rejects key auth if home dir is world/group-writable. Fix: chmod 755 ${CURRENT_HOME}"
else
  ok "Home directory permissions = ${HOME_PERMS}  (acceptable)"
fi

# Check home ownership
HOME_OWNER=$(stat -c "%U" "${CURRENT_HOME}")
if [ "${HOME_OWNER}" != "${CURRENT_USER}" ] && [ "${CURRENT_USER}" != "root" ]; then
  flag_issue "Home directory owned by '${HOME_OWNER}', not '${CURRENT_USER}'. Fix: chown -R ${CURRENT_USER}:${CURRENT_USER} ${CURRENT_HOME}"
else
  ok "Home directory owner = ${HOME_OWNER}"
fi

# ---------------------------------------------------------------------------
# 6. Fingerprint check (optional)
# ---------------------------------------------------------------------------
section "Public Key Fingerprint Verification"
if [ -n "${EXPECTED_FP}" ] && [ -f "${AUTH_KEYS}" ]; then
  info "Expected fingerprint from GitHub Actions: ${EXPECTED_FP}"
  info "Fingerprints of keys in authorized_keys:"

  FOUND=false
  while IFS= read -r line; do
    # Skip blank lines and comments
    [[ -z "${line}" || "${line}" =~ ^# ]] && continue
    # Write key to a temp file and get its fingerprint
    TMPKEY=$(mktemp)
    echo "${line}" > "${TMPKEY}"
    FP=$(ssh-keygen -lf "${TMPKEY}" 2>/dev/null | awk '{print $2}')
    rm -f "${TMPKEY}"
    if [ -z "${FP}" ]; then
      warn "  Could not parse key line: ${line:0:60}..."
      continue
    fi
    if [ "${FP}" = "${EXPECTED_FP}" ]; then
      ok "  MATCH: ${FP}"
      FOUND=true
    else
      info "  No match: ${FP}"
    fi
  done < "${AUTH_KEYS}"

  if [ "${FOUND}" = "false" ]; then
    flag_issue "FINGERPRINT NOT FOUND in authorized_keys."
    echo ""
    echo "  The key GitHub Actions is presenting (${EXPECTED_FP}) is not in"
    echo "  ${AUTH_KEYS}."
    echo ""
    echo "  This means either:"
    echo "    a) The DROPLET_SSH_KEY secret in GitHub contains a DIFFERENT private"
    echo "       key than the one whose public key is in authorized_keys."
    echo "    b) The public key was never added to this server."
    echo ""
    echo "  TO FIX:"
    echo "    1. On your LOCAL machine, identify the private key you stored in"
    echo "       the DROPLET_SSH_KEY GitHub secret."
    echo "    2. Run:  ssh-keygen -yf <path-to-that-private-key>"
    echo "       This outputs the matching PUBLIC key."
    echo "    3. Paste that public key into ${AUTH_KEYS} on the droplet."
    echo "    4. Re-run this script to confirm the fingerprint matches."
  fi
elif [ -n "${EXPECTED_FP}" ] && [ ! -f "${AUTH_KEYS}" ]; then
  warn "Cannot check fingerprint — authorized_keys does not exist."
else
  info "No expected fingerprint supplied. Listing all keys in authorized_keys:"
  if [ -f "${AUTH_KEYS}" ]; then
    while IFS= read -r line; do
      [[ -z "${line}" || "${line}" =~ ^# ]] && continue
      TMPKEY=$(mktemp)
      echo "${line}" > "${TMPKEY}"
      FP=$(ssh-keygen -lf "${TMPKEY}" 2>/dev/null)
      rm -f "${TMPKEY}"
      info "  ${FP}"
    done < "${AUTH_KEYS}"
  fi
fi

# ---------------------------------------------------------------------------
# 7. SELinux / AppArmor context (Ubuntu rarely has this for SSH, but worth
#    checking because it can silently block authorized_keys reads)
# ---------------------------------------------------------------------------
section "SELinux / AppArmor"
if command -v getenforce &>/dev/null; then
  SELINUX_STATUS=$(getenforce 2>/dev/null || echo "unknown")
  info "SELinux status: ${SELINUX_STATUS}"
  if [ "${SELINUX_STATUS}" = "Enforcing" ]; then
    warn "SELinux is Enforcing. If your droplet is CentOS/RHEL-based, check:"
    warn "  restorecon -Rv ~/.ssh"
    warn "  chcon -Rv --type=ssh_home_t ~/.ssh"
  fi
else
  ok "SELinux not present (typical for Ubuntu/Debian droplets)."
fi

if command -v aa-status &>/dev/null; then
  info "AppArmor is installed. For SSH issues run: aa-status | grep sshd"
fi

# ---------------------------------------------------------------------------
# 8. UFW / iptables — is port 22 (or custom port) open?
# ---------------------------------------------------------------------------
section "Firewall — Port 22 (SSH)"
SSH_PORT_CFG=$(grep -i "^Port " "${SSHD_CONFIG}" 2>/dev/null | awk '{print $2}' | head -1)
SSH_PORT="${SSH_PORT_CFG:-22}"
info "sshd is listening on port: ${SSH_PORT}"

if command -v ufw &>/dev/null; then
  UFW_STATUS=$(ufw status 2>/dev/null | head -1)
  info "UFW status: ${UFW_STATUS}"
  if echo "${UFW_STATUS}" | grep -qi "active"; then
    UFW_SSH=$(ufw status 2>/dev/null | grep -E "^${SSH_PORT}|^OpenSSH|^22" | head -5)
    if [ -n "${UFW_SSH}" ]; then
      ok "UFW has a rule for port ${SSH_PORT}:"
      echo "  ${UFW_SSH}"
    else
      flag_issue "UFW is active but no rule found for port ${SSH_PORT}. Fix: ufw allow ${SSH_PORT}/tcp"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 9. Check sshd is actually listening
# ---------------------------------------------------------------------------
section "sshd Listening Port"
if command -v ss &>/dev/null; then
  LISTENING=$(ss -tlnp 2>/dev/null | grep ":${SSH_PORT} " || true)
  if [ -n "${LISTENING}" ]; then
    ok "sshd is listening on port ${SSH_PORT}:"
    echo "  ${LISTENING}"
  else
    flag_issue "Nothing is listening on port ${SSH_PORT}. sshd may be down or listening on a different port."
    info "Run: ss -tlnp | grep sshd"
  fi
fi

# ---------------------------------------------------------------------------
# 10. AuthLog — recent SSH failures
# ---------------------------------------------------------------------------
section "Recent SSH Authentication Failures (last 20 lines)"
AUTH_LOG=""
for f in /var/log/auth.log /var/log/secure; do
  [ -f "$f" ] && AUTH_LOG="$f" && break
done

if [ -n "${AUTH_LOG}" ]; then
  RECENT=$(grep -E "publickey|Invalid user|authentication failure|FAILED" "${AUTH_LOG}" 2>/dev/null | tail -20 || true)
  if [ -n "${RECENT}" ]; then
    warn "Recent failures found in ${AUTH_LOG}:"
    echo "${RECENT}" | sed 's/^/  /'
  else
    ok "No recent SSH authentication failures in ${AUTH_LOG}."
  fi
else
  warn "Auth log not found at /var/log/auth.log or /var/log/secure."
  info "Try: journalctl -u ssh --since '1 hour ago' | grep -i 'publickey\|fail'"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
section "Diagnostic Summary"
if [ "${ISSUES}" -eq 0 ]; then
  ok "All checks passed. SSH key authentication should work."
  echo ""
  info "If GitHub Actions is still failing after all checks pass, the most"
  info "likely cause is a key MISMATCH — the DROPLET_SSH_KEY GitHub secret"
  info "does not correspond to any public key in authorized_keys."
  info ""
  info "Run this script with the expected fingerprint to verify:"
  info "  bash diagnose-ssh.sh SHA256:zBx5NRp4RKAs0ShIKYJg6ICaJu8AAT7uLdSbuSAHGNA"
else
  fail "${ISSUES} issue(s) found. Fix each [FAIL] item above and re-run this script."
fi
