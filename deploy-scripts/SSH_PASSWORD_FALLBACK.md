# SSH Password Authentication Fallback

Use this ONLY as a short-term emergency measure if key-based auth cannot be resolved
quickly and you need to unblock a deployment. Re-enable key-based auth and disable
password auth as soon as the key issue is fixed.

---

## Part 1 — Enable Password Auth on the Droplet

Access the droplet via the Digital Ocean web console (browser-based terminal):

```bash
# 1. Open sshd_config
nano /etc/ssh/sshd_config

# 2. Find the PasswordAuthentication line and set it to yes
#    (Change 'no' to 'yes', or uncomment and add if missing)
PasswordAuthentication yes

# 3. If connecting as root, also verify:
PermitRootLogin yes

# 4. Save and exit (Ctrl+O, Enter, Ctrl+X in nano)

# 5. Validate the config before restarting (prevents locking yourself out)
sshd -t && echo "Config is valid" || echo "Config has errors — do NOT restart"

# 6. Restart sshd only if the test passed
systemctl restart ssh

# 7. Verify sshd is still running
systemctl status ssh --no-pager
```

---

## Part 2 — Add Password to GitHub Secrets

Go to your repository on GitHub:

```
Settings → Secrets and variables → Actions → New repository secret
```

Add a new secret:

| Name | Value |
|---|---|
| `DROPLET_SSH_PASS` | The root (or deploy user) password on the droplet |

---

## Part 3 — Modified GitHub Actions Step (Password Auth)

Replace the `Install SSH key` and `Upload release tarball and deploy script` steps in
`.github/workflows/deploy.yml` with the versions below.

### Install sshpass on the runner

Add this step BEFORE the current "Install SSH key" step:

```yaml
- name: Install sshpass
  run: sudo apt-get install -y sshpass
```

### Replace "Install SSH key" step

```yaml
- name: Configure SSH (password mode)
  run: |
    install -d -m 700 ~/.ssh
    # Populate known_hosts to avoid interactive host verification prompts
    ssh-keyscan \
      -p "${{ secrets.DROPLET_SSH_PORT || '22' }}" \
      "${{ secrets.DROPLET_HOST }}" \
      >> ~/.ssh/known_hosts 2>/dev/null
    echo "known_hosts populated."
```

### Replace all SSH/SCP commands in subsequent steps

Wherever the workflow uses:
```yaml
ssh -i ~/.ssh/deploy_key ...
scp -i ~/.ssh/deploy_key ...
```

Replace with:
```yaml
# ssh
sshpass -p "${{ secrets.DROPLET_SSH_PASS }}" \
  ssh -o BatchMode=no \
      -o ConnectTimeout=30 \
      -o StrictHostKeyChecking=no \
      -p "${{ secrets.DROPLET_SSH_PORT || '22' }}" \
      "${{ secrets.DROPLET_USER }}@${{ secrets.DROPLET_HOST }}" \
      "YOUR COMMAND HERE"

# scp
sshpass -p "${{ secrets.DROPLET_SSH_PASS }}" \
  scp -o StrictHostKeyChecking=no \
      -P "${{ secrets.DROPLET_SSH_PORT || '22' }}" \
      LOCAL_FILE \
      "${{ secrets.DROPLET_USER }}@${{ secrets.DROPLET_HOST }}:/REMOTE/PATH"
```

Note: Remove `-o BatchMode=yes` when using passwords. BatchMode=yes disables password
prompts, which is what you want with keys but the opposite of what you want here.

---

## Part 4 — Complete Password-Based deploy.yml Snippet

Below is a drop-in replacement for the deploy job's SSH-dependent steps.
Copy this to replace lines 233–383 of `.github/workflows/deploy.yml`.

```yaml
      - name: Install sshpass
        run: sudo apt-get install -y sshpass

      - name: Configure SSH known_hosts
        run: |
          install -d -m 700 ~/.ssh
          ssh-keyscan \
            -p "${{ secrets.DROPLET_SSH_PORT || '22' }}" \
            "${{ secrets.DROPLET_HOST }}" \
            >> ~/.ssh/known_hosts 2>/dev/null
          echo "known_hosts populated."

      - name: Build .env.production (base64)
        id: env_b64
        env:
          APP_BASE_URL: ${{ secrets.APP_BASE_URL }}
          APP_PORT: ${{ secrets.APP_PORT || '3000' }}
          APP_DISCORD_WEBHOOK_URL: ${{ secrets.APP_DISCORD_WEBHOOK_URL }}
          APP_SLACK_WEBHOOK_URL: ${{ secrets.APP_SLACK_WEBHOOK_URL }}
          APP_DISCORD_DEPLOY_WEBHOOK: ${{ secrets.DISCORD_DEPLOY_WEBHOOK }}
          APP_SESSION_SECRET: ${{ secrets.APP_SESSION_SECRET }}
          APP_SCRAPER_DEFAULT_URL: ${{ secrets.APP_SCRAPER_DEFAULT_URL || 'https://www.kijiji.ca/b-canada/vending-machine/k0l0?view=list' }}
          APP_PUPPETEER_PATH: ${{ secrets.APP_PUPPETEER_PATH || '/usr/bin/chromium-browser' }}
        run: |
          ENV_FILE=$(cat <<EOF
          NODE_ENV=production
          PORT=${APP_PORT}
          NEXT_PUBLIC_BASE_URL=${APP_BASE_URL}
          DISCORD_WEBHOOK_URL=${APP_DISCORD_WEBHOOK_URL}
          DISCORD_DEPLOY_WEBHOOK=${APP_DISCORD_DEPLOY_WEBHOOK}
          SLACK_WEBHOOK_URL=${APP_SLACK_WEBHOOK_URL}
          SESSION_SECRET=${APP_SESSION_SECRET}
          SCRAPER_DEFAULT_URL=${APP_SCRAPER_DEFAULT_URL}
          SCRAPER_DEFAULT_INTERVAL=60000
          PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
          PUPPETEER_EXECUTABLE_PATH=${APP_PUPPETEER_PATH}
          EOF
          )
          ENV_FILE=$(echo "$ENV_FILE" | sed 's/^[[:space:]]*//')
          echo "value=$(echo "$ENV_FILE" | base64 -w 0)" >> "$GITHUB_OUTPUT"

      - name: Create release tarball
        run: |
          tar \
            --exclude='.git' \
            --exclude='node_modules' \
            --exclude='.next/cache' \
            --exclude='data' \
            --exclude='scraper-config.json' \
            --exclude='scraper-status.json' \
            --exclude='facebook-scraper-status.json' \
            --exclude='*.log' \
            --exclude='.env' \
            --exclude='.env.*' \
            --exclude='tmp' \
            --exclude='temp' \
            -czf /tmp/release.tar.gz .
          echo "Tarball size: $(du -sh /tmp/release.tar.gz | cut -f1)"

      - name: Upload release tarball and deploy script (password auth)
        env:
          SSH_PASS: ${{ secrets.DROPLET_SSH_PASS }}
          SSH_PORT: ${{ secrets.DROPLET_SSH_PORT || '22' }}
        run: |
          DROPLET_USER=$(echo -n "${{ secrets.DROPLET_USER }}" | tr -d '\n\r' | xargs)
          DROPLET_HOST=$(echo -n "${{ secrets.DROPLET_HOST }}" | tr -d '\n\r' | xargs)
          DEST="${DROPLET_USER}@${DROPLET_HOST}"

          SCP_BASE="sshpass -p ${SSH_PASS} scp -o StrictHostKeyChecking=no -P ${SSH_PORT}"

          echo "--- Testing SSH connection ---"
          sshpass -p "${SSH_PASS}" \
            ssh -o BatchMode=no -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
            -p "${SSH_PORT}" "${DEST}" \
            "echo 'SSH connection successful (password auth)'"

          echo "--- Uploading files ---"
          $SCP_BASE /tmp/release.tar.gz "${DEST}:/tmp/release-${{ github.sha }}.tar.gz"
          $SCP_BASE deploy-scripts/08-remote-deploy.sh "${DEST}:/tmp/08-remote-deploy.sh"
          echo "Upload complete."

      - name: Run remote deploy (password auth)
        env:
          SSH_PASS: ${{ secrets.DROPLET_SSH_PASS }}
          SSH_PORT: ${{ secrets.DROPLET_SSH_PORT || '22' }}
        run: |
          DROPLET_USER=$(echo -n "${{ secrets.DROPLET_USER }}" | tr -d '\n\r' | xargs)
          DROPLET_HOST=$(echo -n "${{ secrets.DROPLET_HOST }}" | tr -d '\n\r' | xargs)

          sshpass -p "${SSH_PASS}" \
            ssh \
            -o BatchMode=no \
            -o ConnectTimeout=30 \
            -o StrictHostKeyChecking=no \
            -p "${SSH_PORT}" \
            "${DROPLET_USER}@${DROPLET_HOST}" \
            "chmod +x /tmp/08-remote-deploy.sh && \
             ENV_B64='${{ steps.env_b64.outputs.value }}' \
             RELEASE_ARCHIVE='/tmp/release-${{ github.sha }}.tar.gz' \
             GIT_SHA='${{ github.sha }}' \
             SKIP_BUILD='true' \
             APP_USER='${DROPLET_USER}' \
             bash /tmp/08-remote-deploy.sh"

      - name: Health check — remote (password auth)
        env:
          SSH_PASS: ${{ secrets.DROPLET_SSH_PASS }}
          SSH_PORT: ${{ secrets.DROPLET_SSH_PORT || '22' }}
        run: |
          DROPLET_USER=$(echo -n "${{ secrets.DROPLET_USER }}" | tr -d '\n\r' | xargs)
          DROPLET_HOST=$(echo -n "${{ secrets.DROPLET_HOST }}" | tr -d '\n\r' | xargs)

          sshpass -p "${SSH_PASS}" \
            ssh \
            -o BatchMode=no \
            -o ConnectTimeout=30 \
            -o StrictHostKeyChecking=no \
            -p "${SSH_PORT}" \
            "${DROPLET_USER}@${DROPLET_HOST}" \
            "$(cat <<'HEALTHCHECK'
              set -e
              echo 'Waiting for Next.js to be ready...'
              for i in $(seq 1 18); do
                CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000 2>/dev/null || echo 000)
                if echo "$CODE" | grep -qE '^(200|301|302|304)$'; then
                  echo "Health check passed (HTTP $CODE) on attempt $i"
                  exit 0
                fi
                echo "Attempt $i/18: HTTP $CODE — retrying in 5s..."
                sleep 5
              done
              echo "ERROR: Health check failed after 90 seconds"
              pm2 logs next-app --lines 30 --nostream || true
              exit 1
            HEALTHCHECK
            )"
```

---

## Part 5 — Reverting to Key Auth (Do This As Soon As Possible)

Once the key auth issue is resolved:

1. On the droplet, revert `PasswordAuthentication` back to `no` in `/etc/ssh/sshd_config`:
   ```bash
   sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
   sshd -t && systemctl restart ssh
   ```

2. Revert `deploy.yml` to the key-based version (restore the `Install SSH key` step and
   remove the `sshpass` steps).

3. Delete the `DROPLET_SSH_PASS` GitHub secret.

---

## Security Notes

- `sshpass` passes the password as a command-line argument. On Linux this is visible in
  `/proc` for a brief window. GitHub Actions runners are ephemeral and sandboxed, so this
  risk is low in practice, but it is still a reason to treat this as temporary.
- Never commit `DROPLET_SSH_PASS` or any password to the repository. Always use GitHub Secrets.
- Digital Ocean droplets created with SSH key auth only have no root password by default.
  If you need to set one: `passwd root` (or `passwd deploy`) via the DO web console.
