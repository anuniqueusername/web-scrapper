const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'listings.json');
const CONFIG_FILE = path.join(__dirname, 'scraper-config.json');
const STATUS_FILE = path.join(__dirname, 'scraper-status.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let browser;
let sentNotificationIds = new Set();
let scrapeInterval = null;
let isRunning = false;
let startTime = null;

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
    interval: 30000,
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
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Disable /dev/shm to reduce memory usage
        '--disable-gpu',
        '--single-process=false'
      ]
    });
  }
  return browser;
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

    // Log memory usage
    const memUsage = process.memoryUsage();
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    console.log(`[${new Date().toISOString()}] 💾 Memory usage: ${usedMB}MB / ${totalMB}MB`);

    browserInstance = await initBrowser();
    page = await browserInstance.newPage();

    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Scrape first page to determine total pages
    let currentPage = 1;
    let totalPages = 1;
    let hasMorePages = true;

    while (hasMorePages && currentPage <= totalPages) {
      // Build URL with page parameter
      const baseUrl = config.url.includes('?') ? config.url : `${config.url}?view=list`;
      const pageUrl = baseUrl.includes('page=')
        ? baseUrl.replace(/page=\d+/, `page=${currentPage}`)
        : `${baseUrl}&page=${currentPage}`;

      console.log(`[${new Date().toISOString()}] 📄 Scraping page ${currentPage}...`);

      const response = await page.goto(pageUrl, { waitUntil: 'networkidle2' });

      console.log(`[${new Date().toISOString()}] HTTP Status: ${response.status()}`);
      if (!response.ok()) {
        throw new Error(`Page ${currentPage} returned status ${response.status()}`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract listings and pagination info
      const pageData = await page.evaluate(() => {
        const items = [];
        const listItems = document.querySelectorAll('li[data-testid^="listing-card-list-item-"]');

        listItems.forEach((listItem) => {
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
              scrapedAt: new Date().toISOString()
            });
          } catch (e) {
            // Silently skip problematic elements
          }
        });

        // Try to determine total pages from the results text
        const resultsText = document.querySelector('[data-testid="srp-results"]')?.textContent || '';
        let totalPages = 1;
        const match = resultsText.match(/of\s+([\d,]+)/);
        if (match) {
          const totalResults = parseInt(match[1].replace(/,/g, ''));
          totalPages = Math.ceil(totalResults / 40); // 40 items per page
        }

        return { items, totalPages };
      });

      allPageListings.push(...pageData.items);
      totalPages = pageData.totalPages;

      console.log(`[${new Date().toISOString()}] ✅ Page ${currentPage} complete. Found ${pageData.items.length} listings. Total pages: ${totalPages}`);

      // Check if there are more pages
      if (currentPage >= totalPages) {
        hasMorePages = false;
      } else {
        currentPage++;
      }
    }

    // Load existing data
    let allListings = [];
    if (fs.existsSync(OUTPUT_FILE)) {
      const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      allListings = Array.isArray(existingData) ? existingData : [];
    }

    // Merge new listings with existing ones (avoid duplicates)
    const existingIds = new Set(allListings.map(l => l.id));
    const newListings = allPageListings.filter(l => l.id && !existingIds.has(l.id));

    allListings.push(...newListings);

    // Save to JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allListings, null, 2));

    const duration = Date.now() - scrapeStartTime;

    console.log(`[${new Date().toISOString()}] ✅ Multi-page scrape complete. Found ${allPageListings.length} total listings across ${currentPage} page(s). Added ${newListings.length} new. Total: ${allListings.length}`);

    // Update status in UI
    saveStatus({
      running: false,
      lastRun: new Date().toISOString(),
      lastRunDuration: duration,
      totalListings: allListings.length,
      newListingsLastRun: newListings.length,
      nextRun: new Date(Date.now() + config.interval).toISOString(),
      errors: [], // Clear errors on success
    });

    // Send Discord notification if there are new listings
    if (newListings.length > 0) {
      await sendDiscordNotification(newListings, config);
    }

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
  }
}

async function scrapeListings() {
  let page;
  let browserInstance;
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

    // Log memory usage
    const memUsage = process.memoryUsage();
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    console.log(`[${new Date().toISOString()}] 💾 Memory usage: ${usedMB}MB / ${totalMB}MB`);

    browserInstance = await initBrowser();
    page = await browserInstance.newPage();

    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Use URL from config
    const response = await page.goto(config.url, { waitUntil: 'networkidle2' });

    console.log(`[${new Date().toISOString()}] HTTP Status: ${response.status()}`);
    if (!response.ok()) {
      throw new Error(`Page returned status ${response.status()}`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract listings using page.evaluate
    const listings = await page.evaluate(() => {
      const items = [];
      const listItems = document.querySelectorAll('li[data-testid^="listing-card-list-item-"]');

      listItems.forEach((listItem) => {
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
            scrapedAt: new Date().toISOString()
          });
        } catch (e) {
          // Silently skip problematic elements
        }
      });

      return items;
    });

    // Load existing data
    let allListings = [];
    if (fs.existsSync(OUTPUT_FILE)) {
      const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      allListings = Array.isArray(existingData) ? existingData : [];
    }

    // Merge new listings with existing ones (avoid duplicates)
    const existingIds = new Set(allListings.map(l => l.id));
    const newListings = listings.filter(l => l.id && !existingIds.has(l.id));

    allListings.push(...newListings);

    // Save to JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allListings, null, 2));

    const duration = Date.now() - scrapeStartTime;

    console.log(`[${new Date().toISOString()}] ✅ Scrape complete. Found ${listings.length} listings. Added ${newListings.length} new. Total: ${allListings.length}`);

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
      totalListings: allListings.length,
      newListingsLastRun: newListings.length,
      nextRun: new Date(Date.now() + config.interval).toISOString(),
      errors: [], // Clear errors on success
    });

    // Send Discord notification if there are new listings
    if (newListings.length > 0) {
      await sendDiscordNotification(newListings, config);
    }

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
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error(`[${new Date().toISOString()}] Error closing page:`, e.message);
      }
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
    function setupInterval() {
      if (scrapeInterval) {
        clearInterval(scrapeInterval);
      }

      const currentConfig = loadConfig();
      const interval = currentConfig.interval || 60000;

      scrapeInterval = setInterval(async () => {
        const latestConfig = loadConfig();

        // Check if enabled
        if (latestConfig.enabled === false) {
          console.log(`[${new Date().toISOString()}] ⏸️  Scraper disabled. Waiting...`);
          return;
        }

        if (latestConfig.scrapeAllPages) {
          await scrapeAllPages();
        } else {
          await scrapeListings();
        }

        // Re-setup interval if config changed
        const newConfig = loadConfig();
        if (newConfig.interval !== latestConfig.interval) {
          console.log(`[${new Date().toISOString()}] 🔄 Interval changed. Updating...`);
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

  if (scrapeInterval) {
    clearInterval(scrapeInterval);
    console.log(`[${new Date().toISOString()}] ⏹️  Scraping interval cleared`);
  }

  // Update status to indicate not running
  saveStatus({ running: false });

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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(`[${new Date().toISOString()}] 💥 Uncaught exception:`, error);
  const status = loadStatus();
  const errors = status.errors || [];
  errors.push(`Uncaught exception: ${error.message}`);
  saveStatus({ errors: errors.slice(-10) });
});
