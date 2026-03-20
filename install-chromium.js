#!/usr/bin/env node

/**
 * Install chromium-browser via apt-get
 * This runs as part of npm install via postinstall hook
 */

const { execSync } = require('child_process');
const os = require('os');

console.log('[Chromium] Checking if chromium-browser is installed...');

// Only try to install on Linux
if (os.platform() !== 'linux') {
  console.log('[Chromium] Skipping installation (not on Linux)');
  process.exit(0);
}

try {
  // Check if chromium-browser is already installed
  execSync('which chromium-browser', { stdio: 'ignore' });
  console.log('[Chromium] ✓ chromium-browser already installed');
  process.exit(0);
} catch (error) {
  // Not installed, try to install
  console.log('[Chromium] Installing chromium-browser...');

  try {
    // Update package list
    execSync('apt-get update', {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000
    });

    // Install chromium-browser (non-interactive)
    execSync('DEBIAN_FRONTEND=noninteractive apt-get install -y chromium-browser', {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000
    });

    console.log('[Chromium] ✓ chromium-browser installed successfully');
    process.exit(0);
  } catch (installError) {
    console.error('[Chromium] Installation failed:', installError.message);
    console.log('[Chromium] Continuing anyway - chromium-browser may already be available');
    process.exit(0);
  }
}
