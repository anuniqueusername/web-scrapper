const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class KijijiWorker {
  constructor(workerId, config = {}) {
    this.workerId = workerId;
    this.browser = null;
    this.discordWebhookUrl = config.discordWebhookUrl;
    this.outputFile = config.outputFile;
    this.url = config.url || 'https://www.kijiji.ca/b-canada/vending-machine/k0l0?view=list';
    this.isRunning = false;
  }

  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--single-process=false'
        ]
      });
    }
  }

  async sendDiscordNotification(newListings) {
    if (!this.discordWebhookUrl || newListings.length === 0) {
      return;
    }

    try {
      this.log(`📤 Sending Discord notification for ${newListings.length} new listing(s)...`);

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
        content: `🔔 **[Worker ${this.workerId}] ${newListings.length} New Vending Machine Listing(s) Found!**`
      };

      if (embeds.length > 0) {
        payload.embeds = embeds;
      }

      const response = await axios.post(this.discordWebhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      this.log(`✅ Discord message sent successfully! Status: ${response.status}`);
      this.log(`📝 Details: ${newListings.length} listing(s) with ${embeds.length} embed(s)`);
      this.log(`📋 Listings sent:`);
      newListings.forEach((listing, index) => {
        this.log(`   ${index + 1}. "${listing.title}" - ${listing.price} (${listing.location})`);
      });
    } catch (error) {
      this.log(`❌ Error sending Discord notification:`, error.message);
    }
  }

  async scrape() {
    let page;
    try {
      this.isRunning = true;
      const memUsage = process.memoryUsage();
      const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      this.log(`💾 Memory usage: ${usedMB}MB / ${totalMB}MB`);

      const cpuUsage = process.cpuUsage();
      const userCpuMs = Math.round(cpuUsage.user / 1000);
      const systemCpuMs = Math.round(cpuUsage.system / 1000);
      this.log(`⚙️  CPU usage: User: ${userCpuMs}ms | System: ${systemCpuMs}ms`);

      this.log(`Starting scrape...`);

      await this.init();
      page = await this.browser.newPage();

      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      // Stealth: suppress navigator.webdriver and mimic real browser
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
      });

      const response = await page.goto(this.url, { waitUntil: 'networkidle2' });
      this.log(`HTTP Status: ${response.status()}`);

      if (!response.ok()) {
        this.log(`⚠️  Page returned status ${response.status()}`);
      }

      // Wait for any known listing card variant; all three selectors race simultaneously
      await Promise.race([
        page.waitForSelector('li[data-testid^="listing-card-list-item-"]', { timeout: 8000 }),
        page.waitForSelector('section[data-testid="listing-card"]', { timeout: 8000 }),
        page.waitForSelector('article[data-listingid]', { timeout: 8000 }),
      ]).catch(() => {
        this.log(`⚠️  No known listing selector appeared within 8s, attempting extraction anyway...`);
      });

      this.log(`Page loaded. Searching for listings...`);

      // Multi-strategy extraction with fallback selectors and diagnostics
      const extractResult = await page.evaluate(() => {
        const items = [];

        // Strategy 1: standard list-view li wrapper
        const listItems = document.querySelectorAll('li[data-testid^="listing-card-list-item-"]');
        if (listItems.length > 0) {
          listItems.forEach((listItem, index) => {
            try {
              const cardSection = listItem.querySelector('section[data-testid="listing-card"]');
              if (!cardSection) return;
              const listingId = cardSection.getAttribute('data-listingid');
              if (!listingId) return;
              items.push({
                id: listingId,
                title: cardSection.querySelector('[data-testid="listing-title"]')?.textContent?.trim() || '',
                price: cardSection.querySelector('[data-testid="listing-price"]')?.textContent?.trim() || '',
                location: cardSection.querySelector('[data-testid="listing-location"]')?.textContent?.trim() || '',
                date: cardSection.querySelector('[data-testid="listing-date"]')?.textContent?.trim() || '',
                url: cardSection.querySelector('[data-testid="listing-link"]')?.href || '',
                image: cardSection.querySelector('[data-testid="listing-card-image"]')?.src || '',
                description: cardSection.querySelector('[data-testid="listing-description"]')?.textContent?.trim() || '',
                scrapedAt: new Date().toISOString(),
                order: index + 1
              });
            } catch (e) { /* skip */ }
          });
          return { items, strategy: 1, diagnostics: `strategy-1 (li wrapper): ${listItems.length} elements` };
        }

        // Strategy 2: section[data-testid="listing-card"] anywhere (grid / alternate layout)
        const cardSections = document.querySelectorAll('section[data-testid="listing-card"]');
        if (cardSections.length > 0) {
          cardSections.forEach((cardSection, index) => {
            try {
              const listingId = cardSection.getAttribute('data-listingid');
              if (!listingId) return;
              items.push({
                id: listingId,
                title: cardSection.querySelector('[data-testid="listing-title"]')?.textContent?.trim() || '',
                price: cardSection.querySelector('[data-testid="listing-price"]')?.textContent?.trim() || '',
                location: cardSection.querySelector('[data-testid="listing-location"]')?.textContent?.trim() || '',
                date: cardSection.querySelector('[data-testid="listing-date"]')?.textContent?.trim() || '',
                url: cardSection.querySelector('[data-testid="listing-link"]')?.href || '',
                image: cardSection.querySelector('[data-testid="listing-card-image"]')?.src || '',
                description: cardSection.querySelector('[data-testid="listing-description"]')?.textContent?.trim() || '',
                scrapedAt: new Date().toISOString(),
                order: index + 1
              });
            } catch (e) { /* skip */ }
          });
          return { items, strategy: 2, diagnostics: `strategy-2 (section card): ${cardSections.length} elements` };
        }

        // Strategy 3: article[data-listingid] (older Kijiji markup)
        const articles = document.querySelectorAll('article[data-listingid]');
        if (articles.length > 0) {
          articles.forEach((article, index) => {
            try {
              const listingId = article.getAttribute('data-listingid');
              if (!listingId) return;
              items.push({
                id: listingId,
                title: article.querySelector('a.title, [class*="title"]')?.textContent?.trim() || '',
                price: article.querySelector('[class*="price"]')?.textContent?.trim() || '',
                location: article.querySelector('[class*="location"]')?.textContent?.trim() || '',
                date: article.querySelector('[class*="date"]')?.textContent?.trim() || '',
                url: article.querySelector('a[href*="/v-"]')?.href || '',
                image: article.querySelector('img')?.src || '',
                description: '',
                scrapedAt: new Date().toISOString(),
                order: index + 1
              });
            } catch (e) { /* skip */ }
          });
          return { items, strategy: 3, diagnostics: `strategy-3 (article): ${articles.length} elements` };
        }

        // Nothing matched — collect diagnostics
        const allDataTestIds = [...document.querySelectorAll('[data-testid]')]
          .map(el => el.getAttribute('data-testid'))
          .slice(0, 20);
        return {
          items: [],
          strategy: 0,
          diagnostics: `strategy-0 (no match). data-testid values: [${allDataTestIds.join(', ')}]`
        };
      });

      this.log(`Selector: ${extractResult.diagnostics}`);
      const listings = extractResult.items;

      if (listings.length === 0) {
        this.log(`⚠️  0 listings extracted. Check selector diagnostics above.`);
      }

      // Load existing data
      let allListings = [];
      if (fs.existsSync(this.outputFile)) {
        const existingData = JSON.parse(fs.readFileSync(this.outputFile, 'utf-8'));
        allListings = Array.isArray(existingData) ? existingData : [];
      }

      // Merge new listings
      const existingIds = new Set(allListings.map(l => l.id));
      const newListings = listings.filter(l => l.id && !existingIds.has(l.id));

      allListings.push(...newListings);

      // Save to JSON
      fs.writeFileSync(this.outputFile, JSON.stringify(allListings, null, 2));

      this.log(`Scrape complete. Found ${listings.length} listings. Added ${newListings.length} new listings. Total: ${allListings.length}`);

      // Log all found listings
      if (listings.length > 0) {
        this.log(`📋 All listings found:`);
        listings.forEach((listing) => {
          this.log(`${listing.title} | ${listing.price}`);
        });
      }

      // Send Discord notification if there are new listings
      if (newListings.length > 0) {
        await this.sendDiscordNotification(newListings);
      }

    } catch (error) {
      this.log(`Error scraping:`, error.message);
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (e) {
          this.log(`Error closing page:`, e.message);
        }
      }
      this.isRunning = false;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  log(message, details = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Worker ${this.workerId}] ${message} ${details}`);
  }
}

module.exports = KijijiWorker;
