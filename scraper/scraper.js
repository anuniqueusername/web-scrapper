const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'listings.json');
const CONFIG_FILE = path.join(__dirname, '..', 'scraper-config.json');
const STATUS_FILE = path.join(__dirname, '..', 'scraper-status.json');
const INSTANCE_LOCK = '/tmp/scraper.instance.lock'; // Use /tmp so it clears on deploy

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let browser;
let reusablePage = null; // Reuse same page across scrapes to prevent memory growth
let scrapeInterval = null;
let isRunning = false;
let startTime = null;

// Get or create a reusable page to avoid memory churn
async function getReusablePage() {
  try {
    if (reusablePage) {
      try {
        // Verify page is still valid
        await reusablePage.evaluate(() => 1);
        // Reset to blank between uses to clear DOM
        await reusablePage.goto('about:blank', { waitUntil: 'domcontentloaded' }).catch(() => {});
        return reusablePage;
      } catch (e) {
        // Page is dead, create a new one
        console.log(`[${new Date().toISOString()}] ⚠️  Reusable page is dead, creating new one...`);
        reusablePage = null;
      }
    }

    // Create new page if we don't have one
    reusablePage = await browser.newPage();
    console.log(`[${new Date().toISOString()}] 📄 Created new reusable page`);

    // Set up stealth mode BEFORE first navigation (persists for all future navigations)
    await reusablePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await reusablePage.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    return reusablePage;
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Error getting reusable page:`, e.message);
    throw e;
  }
}

// Memory management - close extra pages if they accumulate
async function cleanupBrowserPages() {
  if (!browser) return;

  try {
    const pages = await browser.pages();

    // Close all pages except blank/about:blank pages and the reusable page
    for (const page of pages) {
      try {
        if (page === reusablePage) continue; // Don't close the reusable page
        const url = page.url();
        // Only keep blank pages, close all others
        if (url && url !== 'about:blank') {
          await page.close();
        }
      } catch (e) {
        // Ignore close errors
      }
    }

    const remaining = await browser.pages();
    if (remaining.length > 0) {
      console.log(`[${new Date().toISOString()}] 🧹 Page cleanup complete. Remaining pages: ${remaining.length}`);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Error cleaning up pages:`, e.message);
  }
}

// Load configuration with defaults
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error loading config:`, error.message);
  }

  // Return default config
  return {
    url: 'https://www.kijiji.ca/b-canada/vending-machine/k0l0?view=list',
    interval: 60000,
    enabled: true,
    scrapeAllPages: false,
    alertMode: 'newOnly',
    discord: {
      enabled: true,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    },
    slack: {
      enabled: false,
      webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    },
    filters: {
      minPrice: null,
      maxPrice: null,
      location: null,
      keywords: [],
    },
  };
}

// Save status for UI
function saveStatus(statusUpdate) {
  try {
    const existingStatus = loadStatus();
    const newStatus = {
      ...existingStatus,
      ...statusUpdate,
    };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(newStatus, null, 2));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error saving status:`, error.message);
  }
}

// Load existing status
function loadStatus() {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error loading status:`, error.message);
  }

  return {
    running: false,
    lastRun: null,
    lastRunDuration: null,
    nextRun: null,
    totalListings: 0,
    newListingsLastRun: 0,
    errors: [],
  };
}

async function initBrowser() {
  if (!browser) {
    const launchConfig = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--single-process=false'
      ]
    };

    // Only set executablePath if PUPPETEER_EXECUTABLE_PATH env var is provided
    // Otherwise let Puppeteer use bundled Chromium
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchConfig);
  }
  return browser;
}

/**
 * Detect whether a Kijiji URL is a category browse URL (e.g. /b-laptops/canada/c773l0)
 * vs a keyword search URL (e.g. /b-canada/vending-machine/k0l0).
 * Category URLs use path-based pagination: /page-N/ inserted before the category code segment.
 * Search/keyword URLs use query-based pagination: ?page=N.
 */
function buildKijijiPageUrl(baseUrl, pageNum) {
  if (pageNum === 1) return baseUrl;

  // Category browse URLs contain a category code segment like c773l0 or c0l0 at the end of the path.
  // Pattern: path ends with /cNNN or /cNNNlNNN (category+location code).
  const urlObj = new URL(baseUrl);
  const categoryCodePattern = /\/c\d+l?\d*\/?$/;

  if (categoryCodePattern.test(urlObj.pathname)) {
    // Inject /page-N/ before the category code segment
    // e.g. /b-laptops/canada/c773l0 -> /b-laptops/canada/page-2/c773l0
    const newPathname = urlObj.pathname.replace(
      /(\/c\d+l?\d*\/?$)/,
      `/page-${pageNum}$1`
    );
    urlObj.pathname = newPathname;
    return urlObj.toString();
  }

  // Keyword search URLs: use ?page=N query param
  if (urlObj.searchParams.has('page')) {
    urlObj.searchParams.set('page', pageNum);
  } else {
    urlObj.searchParams.append('page', pageNum);
  }
  return urlObj.toString();
}

/**
 * Extract listings from the current page using a multi-strategy selector chain.
 * Strategy 1 (primary):  li[data-testid^="listing-card-list-item-"] > section[data-testid="listing-card"]
 * Strategy 2 (fallback): section[data-testid="listing-card"] anywhere on the page
 * Strategy 3 (fallback): article elements with a data-listingid attribute
 *
 * Returns an array of listing objects and a diagnostics string for logging.
 */
async function extractListingsFromPage(page) {
  return page.evaluate(() => {
    const items = [];

    // --- Strategy 1: standard list-view structure ---
    // Count first to avoid querying multiple times
    const listItems = document.querySelectorAll('li[data-testid^="listing-card-list-item-"]');
    const hasStrategy1 = listItems.length > 0;

    if (hasStrategy1) {
      listItems.forEach((listItem, index) => {
        try {
          const cardSection = listItem.querySelector('section[data-testid="listing-card"]');
          if (!cardSection) return;

          const listingId = cardSection.getAttribute('data-listingid');
          if (!listingId) return;

          const titleEl = cardSection.querySelector('[data-testid="listing-title"]');
          const priceEl = cardSection.querySelector('[data-testid="listing-price"]');
          const linkEl = cardSection.querySelector('[data-testid="listing-link"]');
          const imgEl = cardSection.querySelector('[data-testid="listing-card-image"]');
          const locationEl = cardSection.querySelector('[data-testid="listing-location"]');
          const dateEl = cardSection.querySelector('[data-testid="listing-date"]');
          const descriptionEl = cardSection.querySelector('[data-testid="listing-description"]');

          items.push({
            id: listingId,
            title: titleEl?.textContent?.trim() || '',
            price: priceEl?.textContent?.trim() || '',
            location: locationEl?.textContent?.trim() || '',
            date: dateEl?.textContent?.trim() || '',
            url: linkEl?.href || '',
            image: imgEl?.src || '',
            description: descriptionEl?.textContent?.trim() || '',
            scrapedAt: new Date().toISOString(),
            order: index + 1
          });
        } catch (e) { /* skip */ }
      });

      return { items, strategy: 1, diagnostics: `strategy-1 (li[data-testid] wrapper): ${listItems.length} li elements found` };
    }

    // --- Strategy 2: section[data-testid="listing-card"] anywhere (grid view / alternate layout) ---
    // Only query if strategy 1 had no results
    const cardSections = document.querySelectorAll('section[data-testid="listing-card"]');
    const hasStrategy2 = cardSections.length > 0;

    if (hasStrategy2) {
      cardSections.forEach((cardSection, index) => {
        try {
          const listingId = cardSection.getAttribute('data-listingid');
          if (!listingId) return;

          const titleEl = cardSection.querySelector('[data-testid="listing-title"]');
          const priceEl = cardSection.querySelector('[data-testid="listing-price"]');
          const linkEl = cardSection.querySelector('[data-testid="listing-link"]');
          const imgEl = cardSection.querySelector('[data-testid="listing-card-image"]');
          const locationEl = cardSection.querySelector('[data-testid="listing-location"]');
          const dateEl = cardSection.querySelector('[data-testid="listing-date"]');
          const descriptionEl = cardSection.querySelector('[data-testid="listing-description"]');

          items.push({
            id: listingId,
            title: titleEl?.textContent?.trim() || '',
            price: priceEl?.textContent?.trim() || '',
            location: locationEl?.textContent?.trim() || '',
            date: dateEl?.textContent?.trim() || '',
            url: linkEl?.href || '',
            image: imgEl?.src || '',
            description: descriptionEl?.textContent?.trim() || '',
            scrapedAt: new Date().toISOString(),
            order: index + 1
          });
        } catch (e) { /* skip */ }
      });

      return { items, strategy: 2, diagnostics: `strategy-2 (section[data-testid="listing-card"]): ${cardSections.length} sections found` };
    }

    // --- Strategy 3: article[data-listingid] (older Kijiji markup) ---
    // Only query if both strategy 1 and 2 had no results
    const articles = document.querySelectorAll('article[data-listingid]');
    const hasStrategy3 = articles.length > 0;

    if (hasStrategy3) {
      articles.forEach((article, index) => {
        try {
          const listingId = article.getAttribute('data-listingid');
          if (!listingId) return;

          const titleEl = article.querySelector('a.title, [class*="title"]');
          const priceEl = article.querySelector('[class*="price"]');
          const linkEl = article.querySelector('a[href*="/v-"]');
          const imgEl = article.querySelector('img');
          const locationEl = article.querySelector('[class*="location"]');
          const dateEl = article.querySelector('[class*="date"]');

          items.push({
            id: listingId,
            title: titleEl?.textContent?.trim() || '',
            price: priceEl?.textContent?.trim() || '',
            location: locationEl?.textContent?.trim() || '',
            date: dateEl?.textContent?.trim() || '',
            url: linkEl?.href || '',
            image: imgEl?.src || '',
            description: '',
            scrapedAt: new Date().toISOString(),
            order: index + 1
          });
        } catch (e) { /* skip */ }
      });

      return { items, strategy: 3, diagnostics: `strategy-3 (article[data-listingid]): ${articles.length} articles found` };
    }

    // --- Nothing matched: collect diagnostics to help debug ---
    const bodySnippet = document.body?.innerHTML?.substring(0, 500) || '';
    const allDataTestIds = [...document.querySelectorAll('[data-testid]')]
      .map(el => el.getAttribute('data-testid'))
      .slice(0, 20);

    return {
      items: [],
      strategy: 0,
      diagnostics: `strategy-0 (no selectors matched). data-testid values on page: [${allDataTestIds.join(', ')}]. Body snippet: ${bodySnippet}`
    };
  });
}

async function sendDiscordNotification(newListings, config) {
  if (!config.discord?.enabled || !config.discord?.webhookUrl || newListings.length === 0) {
    if (!config.discord?.enabled) {
      console.log(`[${new Date().toISOString()}] ⚠️  Discord webhook not enabled. Skipping notification.`);
    }
    return;
  }

  try {
    console.log(`[${new Date().toISOString()}] 📤 Sending Discord notification for ${newListings.length} new listing(s)...`);

    const embeds = newListings.slice(0, 10).map(listing => {
      const embed = {
        title: listing.title || 'Untitled',
        url: listing.url || undefined,
        color: 3447003,
        fields: [
          {
            name: 'Price',
            value: listing.price || 'N/A',
            inline: true
          },
          {
            name: 'Location',
            value: listing.location || 'N/A',
            inline: true
          },
          {
            name: 'Posted',
            value: listing.date || 'N/A',
            inline: false
          }
        ],
        timestamp: new Date().toISOString()
      };

      if (listing.description) {
        embed.description = listing.description.substring(0, 200) + (listing.description.length > 200 ? '...' : '');
      }

      if (listing.image) {
        embed.image = { url: listing.image };
      }

      return embed;
    });

    const payload = {
      content: `🔔 **${newListings.length} New Vending Machine Listing(s) Found!**`
    };

    if (embeds.length > 0) {
      payload.embeds = embeds;
    }

    const response = await axios.post(config.discord.webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`[${new Date().toISOString()}] ✅ Discord message sent successfully! Status: ${response.status}`);
    console.log(`[${new Date().toISOString()}] 📝 Details: ${newListings.length} listing(s) with ${embeds.length} embed(s)`);
    console.log(`[${new Date().toISOString()}] 📋 Listings sent:`);
    newListings.forEach((listing, index) => {
      console.log(`   ${index + 1}. "${listing.title}" - ${listing.price} (${listing.location})`);
      console.log(`      URL: ${listing.url}`);
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error sending Discord notification:`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Response: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error(`   No response received from Discord. Check your internet connection.`);
    } else {
      console.error(`   Message: ${error.message}`);
    }

    // Log error to status
    const status = loadStatus();
    const errors = status.errors || [];
    errors.push(`Discord notification failed: ${error.message}`);
    saveStatus({ errors: errors.slice(-10) }); // Keep last 10 errors
  }
}

async function scrapeAllPages() {
  let page;
  let browserInstance;
  const scrapeStartTime = Date.now();
  let allPageListings = [];

  try {
    isRunning = true;
    const config = loadConfig();

    console.log(`[${new Date().toISOString()}] 🔄 Starting multi-page scrape with config interval: ${config.interval}ms`);
    console.log(`[${new Date().toISOString()}] 🌐 Scraping URL: ${config.url}`);

    // Log memory usage
    const memUsage = process.memoryUsage();
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    console.log(`[${new Date().toISOString()}] 💾 Memory usage: ${usedMB}MB / ${totalMB}MB`);

    browserInstance = await initBrowser();

    // Log current pages before creating new one (scrapeAllPages)
    const pagesBefore = await browserInstance.pages();
    console.log(`[${new Date().toISOString()}] 📄 [scrapeAllPages] Pages before new page: ${pagesBefore.length}`);

    page = await browserInstance.newPage();

    const pagesAfter = await browserInstance.pages();
    console.log(`[${new Date().toISOString()}] 📄 [scrapeAllPages] Pages after new page: ${pagesAfter.length}`);

    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Stealth: suppress navigator.webdriver and mimic real browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    // Scrape first page to determine total pages
    let currentPage = 1;
    let totalPages = 1;
    let hasMorePages = true;

    while (hasMorePages && currentPage <= totalPages) {
      const pageUrl = buildKijijiPageUrl(config.url, currentPage);

      console.log(`[${new Date().toISOString()}] 📄 Scraping page ${currentPage}: ${pageUrl}`);

      const response = await page.goto(pageUrl, { waitUntil: 'networkidle2' });

      console.log(`[${new Date().toISOString()}] HTTP Status: ${response.status()}`);
      if (!response.ok()) {
        throw new Error(`Page ${currentPage} returned status ${response.status()}`);
      }

      // Wait for any listing card variant to appear; try all known selectors in order
      await Promise.race([
        page.waitForSelector('li[data-testid^="listing-card-list-item-"]', { timeout: 8000 }),
        page.waitForSelector('section[data-testid="listing-card"]', { timeout: 8000 }),
        page.waitForSelector('article[data-listingid]', { timeout: 8000 }),
      ]).catch(() => {
        console.log(`[${new Date().toISOString()}] ⚠️  No known listing selector appeared on page ${currentPage} within 8s, attempting extraction anyway...`);
      });

      // Extract listings using multi-strategy extractor
      const extractResult = await extractListingsFromPage(page);

      // Determine total pages from the page (only needed once, on page 1)
      const paginationInfo = await page.evaluate(() => {
        const resultsText = document.querySelector('[data-testid="srp-results"]')?.textContent || '';
        const match = resultsText.match(/of\s+([\d,]+)/);
        if (match) {
          const totalResults = parseInt(match[1].replace(/,/g, ''));
          return Math.ceil(totalResults / 40);
        }
        // Fallback: check for a next-page link
        const hasNext = !!document.querySelector('[data-testid="pagination-next-link"], a[title="Next"], a[aria-label="Next"]');
        return hasNext ? 999 : 1; // 999 = sentinel meaning "keep going until no next link"
      });

      if (currentPage === 1) {
        totalPages = paginationInfo;
      }

      // Assign correct order offset so order numbers are globally sequential
      const offset = allPageListings.length;
      const pageItems = extractResult.items.map((item, i) => ({ ...item, order: offset + i + 1 }));

      allPageListings.push(...pageItems);

      console.log(`[${new Date().toISOString()}] ✅ Page ${currentPage} complete. Selector: ${extractResult.diagnostics}. Found ${pageItems.length} listings. Total pages: ${totalPages}`);

      if (pageItems.length === 0) {
        console.log(`[${new Date().toISOString()}] ⚠️  0 listings extracted on page ${currentPage}. Stopping pagination.`);
        hasMorePages = false;
      }

      // Check if there are more pages
      if (currentPage >= totalPages) {
        hasMorePages = false;
      } else {
        currentPage++;
      }
    }

    // Deduplicate listings within this scrape (same listing appears on multiple pages)
    const seenInScrape = new Set();
    const uniquePageListings = [];
    for (const listing of allPageListings) {
      if (!seenInScrape.has(listing.id)) {
        seenInScrape.add(listing.id);
        uniquePageListings.push(listing);
      }
    }
    // Clear the full list to free memory
    allPageListings = null;

    // Load existing IDs only (not full listings) to save memory
    let existingIds = new Set();
    let totalListings = 0;
    if (fs.existsSync(OUTPUT_FILE)) {
      try {
        const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
        if (Array.isArray(existingData)) {
          totalListings = existingData.length;
          existingIds = new Set(existingData.map(l => l.id));
        }
      } catch (e) {
        console.error(`[${new Date().toISOString()}] Error reading existing listings:`, e.message);
      }
    }

    // Filter only new listings (ones not in existingIds)
    const newListings = uniquePageListings.filter(l => l.id && !existingIds.has(l.id));
    const newListingsCount = newListings.length;

    // Append new listings to file instead of loading/writing everything
    if (newListingsCount > 0) {
      try {
        let updatedData = [];
        if (fs.existsSync(OUTPUT_FILE)) {
          const content = fs.readFileSync(OUTPUT_FILE, 'utf-8');
          const existingData = JSON.parse(content);
          updatedData = Array.isArray(existingData) ? existingData : [];
        }
        updatedData.push(...newListings);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(updatedData, null, 2));
        totalListings = updatedData.length;
      } catch (e) {
        console.error(`[${new Date().toISOString()}] Error updating listings:`, e.message);
      }

      // Send Discord notification if there are new listings (before clearing memory)
      await sendDiscordNotification(newListings, config);
    }


    const duration = Date.now() - scrapeStartTime;

    console.log(`[${new Date().toISOString()}] ✅ Multi-page scrape complete. Found ${seenInScrape.size} unique. Added ${newListingsCount} new. Total: ${totalListings}`);

    // Update status in UI
    saveStatus({
      running: false,
      lastRun: new Date().toISOString(),
      lastRunDuration: duration,
      totalListings: totalListings,
      newListingsLastRun: newListingsCount,
      nextRun: new Date(Date.now() + config.interval).toISOString(),
      errors: [], // Clear errors on success
    });

  } catch (error) {
    const duration = Date.now() - scrapeStartTime;
    const errorMsg = `Error scraping all pages: ${error.message}`;

    console.error(`[${new Date().toISOString()}] ❌ ${errorMsg}`);

    // Update status with error
    const status = loadStatus();
    const errors = status.errors || [];
    errors.push(`${new Date().toISOString()} - ${errorMsg}`);

    saveStatus({
      running: false,
      lastRunDuration: duration,
      errors: errors.slice(-10), // Keep last 10 errors
    });

  } finally {
    isRunning = false;
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error(`[${new Date().toISOString()}] Error closing page:`, e.message);
      }
    }

    // Clear memory
    allPageListings = [];

    // Cleanup any lingering pages
    await cleanupBrowserPages();

    // Log final page count
    const finalPages = await browserInstance.pages();
    console.log(`[${new Date().toISOString()}] 📄 [scrapeAllPages] Final page count: ${finalPages.length}`);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log(`[${new Date().toISOString()}] 🗑️  Garbage collection triggered`);
    }
  }
}

async function scrapeListings() {
  let page;
  const scrapeStartTime = Date.now();

  try {
    isRunning = true;
    const config = loadConfig();

    // Update UI that scraper is running
    saveStatus({
      running: true,
      nextRun: new Date(Date.now() + config.interval).toISOString(),
    });

    console.log(`[${new Date().toISOString()}] 🔄 Starting scrape with config interval: ${config.interval}ms`);
    console.log(`[${new Date().toISOString()}] 🌐 Scraping URL: ${config.url}`);

    // Log memory usage
    const memUsage = process.memoryUsage();
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    console.log(`[${new Date().toISOString()}] 💾 Memory usage: ${usedMB}MB / ${totalMB}MB`);

    // Initialize browser if needed
    await initBrowser();

    // Reuse the same page to avoid memory churn
    page = await getReusablePage();

    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Use URL from config
    const response = await page.goto(config.url, { waitUntil: 'networkidle2' });

    console.log(`[${new Date().toISOString()}] HTTP Status: ${response.status()}`);
    if (!response.ok()) {
      throw new Error(`Page returned status ${response.status()}`);
    }

    // Wait for any listing card variant to appear; try all known selectors in order
    await Promise.race([
      page.waitForSelector('li[data-testid^="listing-card-list-item-"]', { timeout: 8000 }),
      page.waitForSelector('section[data-testid="listing-card"]', { timeout: 8000 }),
      page.waitForSelector('article[data-listingid]', { timeout: 8000 }),
    ]).catch(() => {
      console.log(`[${new Date().toISOString()}] ⚠️  No known listing selector appeared within 8s, attempting extraction anyway...`);
    });

    // Extract listings using multi-strategy extractor
    const extractResult = await extractListingsFromPage(page);
    const listings = extractResult.items;

    console.log(`[${new Date().toISOString()}] Selector used: ${extractResult.diagnostics}`);

    if (listings.length === 0) {
      console.log(`[${new Date().toISOString()}] ⚠️  0 listings extracted. Check selector diagnostics above. The page structure may have changed or bot detection may have blocked the request.`);
    }

    // Load existing IDs only (not full listings) to save memory
    let existingIds = new Set();
    let totalListings = 0;
    if (fs.existsSync(OUTPUT_FILE)) {
      try {
        const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
        if (Array.isArray(existingData)) {
          totalListings = existingData.length;
          existingIds = new Set(existingData.map(l => l.id));
        }
      } catch (e) {
        console.error(`[${new Date().toISOString()}] Error reading existing listings:`, e.message);
      }
    }

    // Filter only new listings (ones not in existingIds)
    const newListings = listings.filter(l => l.id && !existingIds.has(l.id));
    const newListingsCount = newListings.length;

    // Append new listings to file instead of loading/writing everything
    if (newListingsCount > 0) {
      try {
        let updatedData = [];
        if (fs.existsSync(OUTPUT_FILE)) {
          const content = fs.readFileSync(OUTPUT_FILE, 'utf-8');
          const existingData = JSON.parse(content);
          updatedData = Array.isArray(existingData) ? existingData : [];
        }
        updatedData.push(...newListings);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(updatedData, null, 2));
        totalListings = updatedData.length;
      } catch (e) {
        console.error(`[${new Date().toISOString()}] Error updating listings:`, e.message);
      }

      // Send Discord notification if there are new listings (before clearing memory)
      await sendDiscordNotification(newListings, config);
    }


    const duration = Date.now() - scrapeStartTime;

    console.log(`[${new Date().toISOString()}] ✅ Scrape complete. Found ${listings.length} listings. Added ${newListingsCount} new. Total: ${totalListings}`);

    // Log all found listings
    if (listings.length > 0) {
      console.log(`[${new Date().toISOString()}] 📋 Listings found:`);
      listings.forEach((listing) => {
        console.log(`   ${listing.title} | ${listing.price}`);
      });
    }

    // Update status in UI
    saveStatus({
      running: false,
      lastRun: new Date().toISOString(),
      lastRunDuration: duration,
      totalListings: totalListings,
      newListingsLastRun: newListingsCount,
      nextRun: new Date(Date.now() + config.interval).toISOString(),
      errors: [], // Clear errors on success
    });

  } catch (error) {
    const duration = Date.now() - scrapeStartTime;
    const errorMsg = `Error scraping: ${error.message}`;

    console.error(`[${new Date().toISOString()}] ❌ ${errorMsg}`);

    // Update status with error
    const status = loadStatus();
    const errors = status.errors || [];
    errors.push(`${new Date().toISOString()} - ${errorMsg}`);

    saveStatus({
      running: false,
      lastRunDuration: duration,
      errors: errors.slice(-10), // Keep last 10 errors
    });

  } finally {
    isRunning = false;
    // Don't close the reusable page - it will be cleaned and reused on the next scrape
    // Just clean up any other lingering pages
    await cleanupBrowserPages();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log(`[${new Date().toISOString()}] 🗑️  Garbage collection triggered`);
    }
  }
}

// Initialize and run
(async () => {
  try {
    await initBrowser();
    console.log(`[${new Date().toISOString()}] 🌐 Browser initialized`);

    // Load config
    const config = loadConfig();
    console.log(`[${new Date().toISOString()}] ⚙️  Configuration loaded`);
    console.log(`   URL: ${config.url}`);
    console.log(`   Interval: ${config.interval}ms (${config.interval / 1000}s)`);
    console.log(`   Scrape All Pages: ${config.scrapeAllPages ? '✅ Yes' : '❌ No'}`);
    console.log(`   Alert Mode: ${config.alertMode || 'newOnly'}`);
    console.log(`   Discord: ${config.discord?.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   Slack: ${config.slack?.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   Saving listings to: ${OUTPUT_FILE}`);

    // Initialize status
    saveStatus({
      running: false,
      nextRun: new Date(Date.now() + config.interval).toISOString(),
    });

    // Run immediately if enabled
    if (config.enabled !== false) {
      console.log(`[${new Date().toISOString()}] 🚀 Running initial scrape...`);
      if (config.scrapeAllPages) {
        await scrapeAllPages();
      } else {
        await scrapeListings();
      }
    } else {
      console.log(`[${new Date().toISOString()}] ⏸️  Scraper is disabled. Enable from UI.`);
    }

    // Set up interval - reload config each time to pick up changes from UI
    let lastInterval = null;

    function setupInterval() {
      if (scrapeInterval) {
        clearInterval(scrapeInterval);
      }

      const currentConfig = loadConfig();
      const interval = currentConfig.interval || 60000;
      lastInterval = interval;

      scrapeInterval = setInterval(async () => {
        const latestConfig = loadConfig();

        // Check if enabled
        if (latestConfig.enabled === false) {
          console.log(`[${new Date().toISOString()}] ⏸️  Scraper disabled. Waiting...`);
          return;
        }

        // Memory pressure check - restart browser if memory usage exceeds threshold
        const memUsage = process.memoryUsage();
        const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const memThreshold = 400; // 400MB threshold
        if (heapMB > memThreshold && browser) {
          console.log(`[${new Date().toISOString()}] ⚠️  Memory pressure detected (${heapMB}MB > ${memThreshold}MB). Restarting browser...`);
          try {
            await browser.close();
            browser = null;
          } catch (e) {
            console.error(`[${new Date().toISOString()}] Error closing browser:`, e.message);
          }
        }

        if (latestConfig.scrapeAllPages) {
          await scrapeAllPages();
        } else {
          await scrapeListings();
        }

        // Re-setup interval if interval changed
        if (latestConfig.interval !== lastInterval) {
          console.log(`[${new Date().toISOString()}] 🔄 Interval changed from ${lastInterval}ms to ${latestConfig.interval}ms. Updating...`);
          setupInterval();
        }
      }, interval);

      console.log(`[${new Date().toISOString()}] ✅ Scraper scheduled. Runs every ${interval}ms`);
    }

    setupInterval();

  } catch (error) {
    console.error(`[${new Date().toISOString()}] 💥 Fatal error during startup:`, error.message);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(`\n[${new Date().toISOString()}] 🛑 Shutting down gracefully...`);

  // Stop the scheduled interval
  if (scrapeInterval) {
    clearInterval(scrapeInterval);
    scrapeInterval = null;
    console.log(`[${new Date().toISOString()}] ⏹️  Scraping interval cleared`);
  }

  // Mark as not running
  isRunning = false;

  // Update status to indicate not running
  saveStatus({ running: false, processStarted: false });

  // Close browser
  if (browser) {
    try {
      await browser.close();
      console.log(`[${new Date().toISOString()}] 🌐 Browser closed`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Error closing browser:`, e.message);
    }
  }

  console.log(`[${new Date().toISOString()}] 👋 Scraper stopped`);
  process.exit(0);
});

// Cleanup on exit
process.on('exit', () => {
  try {
    if (fs.existsSync(INSTANCE_LOCK)) {
      fs.unlinkSync(INSTANCE_LOCK);
      console.log(`[${new Date().toISOString()}] 🔓 Instance lock removed`);
    }
  } catch (e) {
    // Ignore cleanup errors
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(`[${new Date().toISOString()}] 💥 Uncaught exception:`, error);
  const status = loadStatus();
  const errors = status.errors || [];
  errors.push(`Uncaught exception: ${error.message}`);
  saveStatus({ errors: errors.slice(-10) });
});
