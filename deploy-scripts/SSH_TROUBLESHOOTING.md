# SSH Authentication Troubleshooting Guide

## Symptom

GitHub Actions fails with:

```
Permission denied (publickey,password)
```

The fingerprint shown in the GitHub Actions log is:

```
SHA256:zBx5NRp4RKAs0ShIKYJg6ICaJu8AAT7uLdSbuSAHGNA
```

---

## Why This Happens

SSH public-key authentication involves a PAIR of files that must match:

| Where it lives | What it is |
|---|---|
| GitHub Actions secret `DROPLET_SSH_KEY` | The PRIVATE key (never leaves GitHub) |
| `~/.ssh/authorized_keys` on the droplet | The PUBLIC key (derived from the private key) |

The error fires whenever:

1. The public key in `authorized_keys` does NOT correspond to the private key in `DROPLET_SSH_KEY` (key mismatch — the most common cause).
2. The public key IS correct but `authorized_keys` has wrong file permissions (must be `600`).
3. `~/.ssh/` directory has wrong permissions (must be `700`).
4. `PubkeyAuthentication` is disabled in `/etc/ssh/sshd_config`.
5. `PermitRootLogin` is set to `no` (only relevant when SSHing as root).
6. The home directory is world-writable (`chmod 777 /root` etc.) — sshd silently rejects key auth.
7. The key format in the GitHub secret is malformed (missing header line, Windows line endings).

---

## Step 1 — Run the Diagnostic Script on the Droplet

Access your droplet via the Digital Ocean web console (not SSH, since SSH is broken) and run:

```bash
bash /path/to/deploy-scripts/diagnose-ssh.sh SHA256:zBx5NRp4RKAs0ShIKYJg6ICaJu8AAT7uLdSbuSAHGNA
```

Or upload the script first via the DO console "Copy/Paste" approach:

```bash
curl -o /tmp/diagnose-ssh.sh https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/deploy-scripts/diagnose-ssh.sh
bash /tmp/diagnose-ssh.sh SHA256:zBx5NRp4RKAs0ShIKYJg6ICaJu8AAT7uLdSbuSAHGNA
```

The script will identify the exact problem and print a targeted fix.

---

## Step 2 — Most Likely Fix: Key Mismatch

The fingerprint `SHA256:zBx5NRp4RKAs0ShIKYJg6ICaJu8AAT7uLdSbuSAHGNA` is the fingerprint of the **public key** derived from the private key stored in the `DROPLET_SSH_KEY` GitHub secret.

### Find the matching public key

**Option A — You still have the private key locally:**

```bash
# On your LOCAL machine — substitute the actual path to the private key
ssh-keygen -yf ~/.ssh/your_deploy_key
```

This prints the public key. Paste the output into `~/.ssh/authorized_keys` on the droplet (one line per key, no trailing spaces).

**Option B — The key exists in GitHub but not locally:**

Generate a brand-new key pair, update the GitHub secret, and add the new public key to the droplet:

```bash
# On your LOCAL machine
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/new_deploy_key -N ""

# Print the PUBLIC key — add this to authorized_keys on the droplet
cat ~/.ssh/new_deploy_key.pub

# Print the PRIVATE key — paste this as the DROPLET_SSH_KEY GitHub secret
cat ~/.ssh/new_deploy_key
```

Then on the droplet:
```bash
echo "PASTE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Verify the fingerprint matches

```bash
# On your LOCAL machine — verify the private key produces the expected fingerprint
ssh-keygen -lf ~/.ssh/new_deploy_key
# Should show: 256 SHA256:zBx5NRp4RKAs0ShIKYJg6ICaJu8AAT7uLdSbuSAHGNA ...

# On the droplet — verify the authorized_keys entry matches
ssh-keygen -lf ~/.ssh/authorized_keys
```

---

## Step 3 — Fix File Permissions

Run on the droplet (as the user GitHub Actions connects as, e.g. `root` or `deploy`):

```bash
# Replace /root with /home/deploy if using a non-root user
chmod 755 /root
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
chown root:root /root/.ssh /root/.ssh/authorized_keys
```

---

## Step 4 — Check sshd_config

```bash
grep -E "PubkeyAuthentication|AuthorizedKeysFile|PermitRootLogin|PasswordAuthentication" /etc/ssh/sshd_config
```

Required values:

| Setting | Required value |
|---|---|
| `PubkeyAuthentication` | `yes` |
| `PermitRootLogin` | `yes` or `prohibit-password` (if connecting as root) |
| `AuthorizedKeysFile` | `.ssh/authorized_keys` (the default) |

If you change anything:

```bash
sshd -t         # Validate config syntax — fix any errors before restarting
systemctl restart ssh
```

---

## Step 5 — Check the GitHub Secret Format

The `DROPLET_SSH_KEY` secret must contain the raw PEM private key text, including headers:

```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAA...
...
-----END OPENSSH PRIVATE KEY-----
```

**Common mistakes:**

| Mistake | Symptom |
|---|---|
| Copied only the base64 body, missing `-----BEGIN` line | "invalid format" error in GitHub Actions |
| Windows line endings (CRLF) in the secret | "Permission denied" even with correct key |
| Trailing newline stripped | Key unreadable |
| Pasted the PUBLIC key (`.pub`) instead of the private key | "Permission denied" — wrong key type |

To check for Windows line endings in GitHub Actions output, look for `^M` characters. The current `deploy.yml` uses `printf '%s\n'` to write the key which preserves content faithfully; verify the secret value itself is clean.

**If you suspect CRLF issues**, re-create the secret by pasting the key through this one-liner on Linux/Mac:

```bash
# Strip carriage returns and confirm the key is valid before pasting
tr -d '\r' < ~/.ssh/your_deploy_key | ssh-keygen -lf /dev/stdin
```

---

## Step 6 — Check SSH Auth Log on the Droplet

The log contains the exact rejection reason:

```bash
# Ubuntu / Debian
tail -50 /var/log/auth.log | grep -E "sshd|publickey"

# Or via journald (works on all systemd distros)
journalctl -u ssh --since "1 hour ago" | grep -E "publickey|FAILED|Invalid"
```

**What to look for:**

| Log message | Meaning |
|---|---|
| `Authentication refused: bad ownership or modes for directory /root` | Home dir permissions wrong |
| `Authentication refused: bad ownership or modes for file /root/.ssh/authorized_keys` | authorized_keys permissions wrong |
| `userauth_pubkey: key type ssh-rsa not in PubkeyAcceptedAlgorithms` | Old RSA key; generate ed25519 |
| `Connection closed by authenticating user root ... [preauth]` | sshd got a key it doesn't recognise |
| `Invalid user deploy` | The DROPLET_USER secret uses a username that doesn't exist on the server |

---

## Step 7 — Test SSH Manually Before Pushing

Once you believe the fix is applied, test from your local machine before triggering another GitHub Actions run:

```bash
ssh -i ~/.ssh/your_deploy_key -p 22 root@YOUR_DROPLET_IP -v 2>&1 | grep -E "Offering|Authentications|Permission|debug1: Authentication"
```

The `-v` flag shows which keys are being offered and whether the server accepts them.

A successful auth will show:
```
debug1: Offering public key: /path/to/key ED25519 SHA256:...
debug1: Server accepts key: ...
```

A failing auth shows:
```
debug1: Offering public key: ...
debug1: send_pubkey_test: no mutual signature algorithm
# or
Received disconnect from ...: Too many authentication failures
```

---

## Step 8 — "Invalid user" Error

If the log shows `Invalid user deploy` (or whatever `DROPLET_USER` is set to), the user does not exist on the server.

```bash
# Create the user if missing
adduser --disabled-password --gecos "" deploy
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
# Add the public key
echo "YOUR_PUBLIC_KEY" > /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

Or change the `DROPLET_USER` secret to `root` if the deploy is intended to run as root (which matches the current project setup — the memory shows DROPLET_USER = root).

---

## Step 9 — Digital Ocean Droplet-Specific Issues

### DO's console-injected key vs your key

Digital Ocean injects the SSH key you select at droplet creation time into `authorized_keys`. If you later re-generated your deploy key, the OLD public key (from the time of droplet creation) is what's in `authorized_keys`, not your new one.

Fix: append the new public key to `authorized_keys` via the DO web console.

### Rebuilding the droplet

If the droplet was rebuilt or restored from a snapshot, the `authorized_keys` may have been reset to only DO's injected key, removing your deploy key.

Fix: re-add your deploy key via the DO console.

---

## Fallback: Password Authentication

If key-based auth cannot be made to work quickly and you need to deploy urgently, see `deploy-scripts/SSH_PASSWORD_FALLBACK.md` for instructions on temporarily enabling password authentication in GitHub Actions.

**Note:** Password auth should only be used as a short-term unblock. Re-enable key-based auth and disable passwords as soon as the key issue is resolved.
