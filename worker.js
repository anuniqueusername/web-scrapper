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

      this.log(`Starting scrape...`);

      await this.init();
      page = await this.browser.newPage();

      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      const response = await page.goto(this.url, { waitUntil: 'networkidle2' });
      this.log(`HTTP Status: ${response.status()}`);

      if (!response.ok()) {
        this.log(`⚠️  Page returned status ${response.status()}`);
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
      this.log(`Page loaded. Searching for listings...`);

      const listings = await page.evaluate(() => {
        const items = [];
        const listItems = document.querySelectorAll('li[data-testid^="listing-card-list-item-"]');

        listItems.forEach((listItem) => {
          try {
            const testId = listItem.getAttribute('data-testid');
            const indexMatch = testId.match(/listing-card-list-item-(\d+)/);
            const index = indexMatch ? indexMatch[1] : null;

            if (!index) return;

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
