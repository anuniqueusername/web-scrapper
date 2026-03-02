const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const URL = 'https://www.kijiji.ca/b-canada/vending-machine/k0l0?view=list';
const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'listings.json');

// Discord webhook configuration
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
const discordEnabled = !!discordWebhookUrl;

// Slack webhook configuration
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
const slackEnabled = !!slackWebhookUrl;

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let browser;
let sentNotificationIds = new Set(); // Track which listings we've already sent notifications for

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

async function sendDiscordNotification(newListings) {
  if (!discordEnabled || newListings.length === 0) {
    if (!discordEnabled) {
      console.log(`[${new Date().toISOString()}] ⚠️  Discord webhook not configured. Skipping notification.`);
    }
    return;
  }

  try {
    console.log(`[${new Date().toISOString()}] 📤 Sending Discord notification for ${newListings.length} new listing(s)...`);

    // Create embeds for each listing (max 10 embeds per message)
    const embeds = newListings.slice(0, 10).map(listing => {
      const embed = {
        title: listing.title || 'Untitled',
        url: listing.url || undefined,
        color: 3447003, // Blue color
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

    const response = await axios.post(discordWebhookUrl, payload, {
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
  }
}

async function scrapeListings() {
  let page;
  let browserInstance;
  try {
    // Log memory usage
    const memUsage = process.memoryUsage();
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    console.log(`[${new Date().toISOString()}] 💾 Memory usage: ${usedMB}MB / ${totalMB}MB`);

    console.log(`[${new Date().toISOString()}] Starting scrape...`);

    browserInstance = await initBrowser();
    page = await browserInstance.newPage();

    // Set a reasonable timeout
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Navigate to the page
    const response = await page.goto(URL, { waitUntil: 'networkidle2' });

    console.log(`HTTP Status: ${response.status()}`);
    if (!response.ok()) {
      console.error(`Page returned status ${response.status()}`);
    }

    // Wait a bit for content to render
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('Page loaded. Searching for listings...');

    // First, let's debug what's on the page
    const pageDebug = await page.evaluate(() => {
      const containers = document.querySelectorAll('[class*="listing-card-list-item-"]');
      const titles = document.querySelectorAll('[data-testid="listing-title"]');
      return {
        containerCount: containers.length,
        titleCount: titles.length,
        pageTitle: document.title,
        hasListings: document.body.innerHTML.includes('listing-card-list-item-')
      };
    });

    console.log('Page Debug Info:', pageDebug);

    // Extract listings using page.evaluate
    const listings = await page.evaluate(() => {
      const items = [];

      // Look for listing cards using data-testid attribute
      const listItems = document.querySelectorAll('li[data-testid^="listing-card-list-item-"]');

      listItems.forEach((listItem) => {
        try {
          // Extract index from data-testid (e.g., "listing-card-list-item-0" -> "0")
          const testId = listItem.getAttribute('data-testid');
          const indexMatch = testId.match(/listing-card-list-item-(\d+)/);
          const index = indexMatch ? indexMatch[1] : null;

          if (!index) return;

          // Find the section element which contains the actual card data
          const cardSection = listItem.querySelector('section[data-testid="listing-card"]');
          if (!cardSection) return;

          // Extract listing ID from data-listingid attribute
          const listingId = cardSection.getAttribute('data-listingid');
          if (!listingId) return;

          // Extract data using the specified selectors within the card
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

    console.log(`[${new Date().toISOString()}] Scrape complete. Found ${listings.length} listings. Added ${newListings.length} new listings. Total: ${allListings.length}`);

    // Log all found listings
    if (listings.length > 0) {
      console.log(`[${new Date().toISOString()}] 📋 All listings found:`);
      listings.forEach((listing) => {
        console.log(`${listing.title} | ${listing.price}`);
      });
    }

    // Send Discord notification if there are new listings
    if (newListings.length > 0) {
      await sendDiscordNotification(newListings);
    }

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error scraping:`, error.message);
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error('Error closing page:', e.message);
      }
    }
  }
}

// Initialize and run
(async () => {
  await initBrowser();

  // Run immediately on start
  await scrapeListings();

  // Then run every minute (60000 ms)
  setInterval(scrapeListings, 60000);

  console.log('Scraper started. Scraping every minute...');
  console.log(`Saving listings to: ${OUTPUT_FILE}`);
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});
