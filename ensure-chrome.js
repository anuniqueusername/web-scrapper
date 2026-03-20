#!/usr/bin/env node

/**
 * Ensure Chrome/Chromium is installed before starting the app
 * Run this before spawning the scraper process
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function ensureChrome() {
  console.log('[Chrome] Checking if Chromium is available...');

  try {
    // Try to launch puppeteer - it will download Chrome if needed
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const version = await browser.version();
    console.log('[Chrome] ✓ Chromium available:', version);

    await browser.close();
    return true;
  } catch (error) {
    console.error('[Chrome] ✗ Failed to ensure Chromium:', error.message);

    // Try manual download as fallback
    console.log('[Chrome] Attempting manual download...');
    try {
      const browserFetcher = puppeteer.createBrowserFetcher();
      const revisionInfo = await browserFetcher.download('145');
      console.log('[Chrome] ✓ Downloaded to:', revisionInfo.folderPath);
      return true;
    } catch (downloadError) {
      console.error('[Chrome] ✗ Manual download failed:', downloadError.message);
      return false;
    }
  }
}

ensureChrome()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('[Chrome] Fatal error:', error);
    process.exit(1);
  });
