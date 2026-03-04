const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class FacebookWorker {
  constructor(workerId, config = {}) {
    this.workerId = workerId;
    this.browser = null;
    this.discordWebhookUrl = config.discordWebhookUrl;
    this.outputFile = config.outputFile;
    this.url = config.url || 'https://www.facebook.com/marketplace/toronto/search?query=vending%20machines';
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
          color: 1297598, // Facebook blue
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
        content: `🔔 **[Worker ${this.workerId}] ${newListings.length} New Facebook Marketplace Listing(s) Found!**`
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

      page.setDefaultTimeout(60000);
      page.setDefaultNavigationTimeout(60000);

      const response = await page.goto(this.url, { waitUntil: 'networkidle0' });
      this.log(`HTTP Status: ${response.status()}`);

      if (!response.ok()) {
        this.log(`⚠️  Page returned status ${response.status()}`);
      }

      // Wait longer for React to fully render content
      this.log(`Waiting for content to render...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Scroll down to load more listings
      this.log(`Scrolling to load more listings...`);
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Scroll again
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Scroll to bottom to load all listings
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 3000));

      this.log(`Page loaded. Searching for listings...`);

      // Debug: Save page content for inspection
      const pageContent = await page.content();
      const debugFile = path.join(path.dirname(this.outputFile), 'facebook-debug.html');
      fs.writeFileSync(debugFile, pageContent);
      this.log(`📄 Page content saved to ${debugFile}`);

      const listings = await page.evaluate(() => {
        const items = [];

        // Try multiple selectors as Facebook's DOM structure varies
        let listingContainers = [];

        // Try looking for marketplace specific containers
        listingContainers = document.querySelectorAll('[data-testid*="marketplace"], [data-testid*="listing"], div[role="img"]');

        if (listingContainers.length === 0) {
          // Fallback: look for articles which often contain listings
          listingContainers = document.querySelectorAll('[role="article"]');
        }

        if (listingContainers.length === 0) {
          // Last resort: look for divs with aria-label (often used for listing items)
          listingContainers = document.querySelectorAll('div[aria-label*="Listing"], a[href*="/marketplace/item/"]');
        }

        // Also check for any links pointing to marketplace items
        const marketplaceLinks = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));

        marketplaceLinks.forEach((linkEl) => {
          try {
            const url = linkEl.href || '';
            if (!url) return;

            let title = linkEl.textContent?.trim() || '';
            if (!title) {
              // Try to get title from aria-label or alt text
              title = linkEl.getAttribute('aria-label') || '';
            }

            if (!title) return;

            // Navigate up the DOM tree to find the parent container with more info
            let container = linkEl.closest('[role="article"]') || linkEl.closest('div[class*="listing"]') || linkEl.parentElement;

            let price = '';
            let location = '';
            let image = '';

            if (container) {
              // Look for price in container
              const priceSpans = Array.from(container.querySelectorAll('span')).filter(el => /^\$?\d+/.test(el.textContent?.trim()));
              if (priceSpans.length > 0) {
                price = priceSpans[0].textContent?.trim() || '';
              }

              // Look for location
              const locationSpans = Array.from(container.querySelectorAll('span')).filter(el => {
                const text = el.textContent?.trim() || '';
                return text && !text.includes('$') && text.length < 50 && text.length > 2 && !text.match(/^\d+/);
              });
              if (locationSpans.length > 0) {
                location = locationSpans[0].textContent?.trim() || '';
              }

              // Look for image
              const img = container.querySelector('img[alt], img[src*="marketplace"]');
              image = img?.src || '';
            }

            // Create unique ID
            const id = url.split('/').filter(p => p).pop() || title.replace(/\s+/g, '-');

            // Avoid duplicates
            if (!items.find(item => item.id === id)) {
              items.push({
                id: id,
                title: title,
                price: price,
                location: location,
                date: new Date().toISOString(),
                url: url,
                image: image,
                description: '',
                scrapedAt: new Date().toISOString(),
                source: 'facebook'
              });
            }
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
    console.log(`[${timestamp}] [Facebook Worker ${this.workerId}] ${message} ${details}`);
  }
}

module.exports = FacebookWorker;
