const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const LOG_FILE = path.join(__dirname, '..', 'facebook-scraper.log');

function appendToLog(line) {
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
  } catch (e) {
    // Silently ignore log write failures so scraping is never blocked
  }
}

// Major Ontario cities for Facebook Marketplace scraping
const ONTARIO_CITIES = [
  'toronto',
  'ottawa',
  'mississauga',
  'brampton',
  'hamilton',
  'london_ontario',
  'kitchener',
  'waterloo',
  'cambridge',
  'guelph',
  'barrie',
  'thunder-bay',
  'sudbury',
  'windsor',
  'markham',
  'vaughan',
  'richmond-hill',
  'oakville',
  'burlington',
  'niagara-falls',
  'st-catharines',
  'peterborough',
  'kingston',
  'belleville',
  'oshawa',
  'whitby',
  'ajax',
  'pickering',
  'aurora'
];

class FacebookWorker {
  constructor(workerId, config = {}) {
    this.workerId = workerId;
    this.browser = null;
    this.discordWebhookUrl = config.discordWebhookUrl;
    this.outputFile = config.outputFile;
    this.url = config.url || 'https://www.facebook.com/marketplace/toronto/search?daysSinceListed=1&query=vending%20machines';
    this.cities = config.cities || null; // null = single URL, array = multiple cities
    this.delayBetweenCities = config.delayBetweenCities || 2000; // Delay in ms between city scrapes
    this.currentCityIndex = 0;
    this.isRunning = false;
  }

  // Build URL for a specific city
  buildCityUrl(city) {
    const baseUrl = 'https://www.facebook.com/marketplace';
    return `${baseUrl}/${city}/search?daysSinceListed=1&query=vending%20machines`;
  }

  // Get next city in rotation, or return null if done
  getNextCity() {
    if (!this.cities || this.cities.length === 0) {
      return null;
    }
    if (this.currentCityIndex >= this.cities.length) {
      return null;
    }
    const city = this.cities[this.currentCityIndex];
    this.currentCityIndex++;
    return city;
  }

  // Reset city index for next full rotation
  resetCityIndex() {
    this.currentCityIndex = 0;
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
          '--single-process=false',
          '--disable-blink-features=AutomationControlled'
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
              name: 'City',
              value: listing.city || 'N/A',
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

  async scrapeCity(url, city = null) {
    let page;
    try {
      this.isRunning = true;
      const memUsage = process.memoryUsage();
      const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      this.log(`💾 Memory usage: ${usedMB}MB / ${totalMB}MB`);

      this.log(`Starting scrape for: ${url}`);

      await this.init();
      page = await this.browser.newPage();

      page.setDefaultTimeout(60000);
      page.setDefaultNavigationTimeout(60000);

      // Set headers to appear as a real browser
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Set viewport
      await page.setViewport({ width: 1280, height: 800 });

      // Inject stealth properties to prevent bot detection
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });

      this.log(`Navigating to ${url}...`);
      const response = await page.goto(url, { waitUntil: 'networkidle0' });
      this.log(`HTTP Status: ${response.status()}`);

      if (!response.ok()) {
        this.log(`⚠️  Page returned status ${response.status()}`);
      }

      // Wait longer for React to fully render content
      this.log(`Waiting for content to render...`);
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Real-time streaming: collect results as they load during scrolling
      this.log(`Streaming results as page loads...`);
      let scrollCount = 0;
      const maxScrolls = 30;
      let noNewContentCount = 0;
      const maxNoNewContentIterations = 3;
      const vendingKeywords = ['vending', 'machine', 'vendor'];
      let previousCount = 0;

      while (scrollCount < maxScrolls) {
        // Scroll down
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight);
        });

        // Wait for lazy-loaded content to render
        await new Promise(resolve => setTimeout(resolve, 4000));

        scrollCount++;

        // Stream extract: get ALL current listings (incremental, not just new ones)
        const streamData = await page.evaluate((keywords) => {
          const marketplaceLinks = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));
          let vendingCount = 0;

          marketplaceLinks.forEach((linkEl) => {
            const text = (linkEl.textContent || '').toLowerCase();
            if (keywords.some(kw => text.includes(kw))) {
              vendingCount++;
            }
          });

          return {
            totalItems: marketplaceLinks.length,
            vendingItems: vendingCount
          };
        }, vendingKeywords);

        const relevancePercentage = streamData.totalItems > 0 ? Math.round((streamData.vendingItems / streamData.totalItems) * 100) : 0;
        const newItemsFound = streamData.totalItems - previousCount;

        // Log streaming progress
        if (newItemsFound > 0) {
          this.log(`⬇️  Scroll ${scrollCount}: +${newItemsFound} items → ${streamData.totalItems} total (${relevancePercentage}% vending)`);
          noNewContentCount = 0;
          previousCount = streamData.totalItems;
        } else {
          noNewContentCount++;
          this.log(`⏸️  Scroll ${scrollCount}: No new items (${noNewContentCount}/${maxNoNewContentIterations}) - ${streamData.totalItems} total (${relevancePercentage}% vending)`);
        }

        // Stop if relevance drops below 30% after initial scrolls
        if (scrollCount > 5 && relevancePercentage < 30) {
          this.log(`⚠️  Stopping: Relevance dropped to ${relevancePercentage}%, too many non-vending items`);
          break;
        }

        // Stop if no new content for 3 consecutive scrolls
        if (noNewContentCount >= maxNoNewContentIterations) {
          this.log(`Stopping: ${maxNoNewContentIterations} consecutive scrolls with no new items`);
          break;
        }
      }

      this.log(`✅ Streaming complete after ${scrollCount} scrolls`);

      // Wait for final renders
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Wait for final renders
      await new Promise(resolve => setTimeout(resolve, 3000));

      this.log(`✅ Scrolling complete. Now extracting all listings from page...`);

      // Diagnostic snapshot — critical for debugging deploy vs local differences
      const pageContent = await page.content();
      const pageTitle = await page.title();
      const pageUrl = page.url();
      this.log(`📄 Final URL: ${pageUrl}`);
      this.log(`📄 Page title: "${pageTitle}"`);
      this.log(`📄 Page HTML length: ${pageContent.length} chars`);

      // Detect login wall / CAPTCHA / blocking pages
      const lowerContent = pageContent.toLowerCase();
      if (lowerContent.includes('log in') || lowerContent.includes('sign in') || lowerContent.includes('login')) {
        this.log(`⚠️  DETECTED: Login wall — Facebook is requiring authentication`);
      }
      if (lowerContent.includes('captcha') || lowerContent.includes('are you a robot') || lowerContent.includes('unusual traffic')) {
        this.log(`⚠️  DETECTED: CAPTCHA / bot detection triggered`);
      }
      if (lowerContent.includes('something went wrong') || lowerContent.includes('error')) {
        this.log(`⚠️  DETECTED: Facebook error page`);
      }

      // Count key DOM markers to understand what Facebook served
      const diagnostics = await page.evaluate(() => {
        return {
          marketplaceLinks: document.querySelectorAll('a[href*="/marketplace/item/"]').length,
          allLinks: document.querySelectorAll('a').length,
          allImages: document.querySelectorAll('img').length,
          roleArticles: document.querySelectorAll('[role="article"]').length,
          bodyText: (document.body?.innerText || '').substring(0, 500),
        };
      });
      this.log(`🔬 DOM diagnostics — marketplace links: ${diagnostics.marketplaceLinks}, all links: ${diagnostics.allLinks}, images: ${diagnostics.allImages}, articles: ${diagnostics.roleArticles}`);
      this.log(`🔬 Body text preview: ${diagnostics.bodyText.replace(/\n/g, ' ').substring(0, 300)}`);

      // Save page content for inspection
      const debugFile = path.join(path.dirname(this.outputFile), 'facebook-debug.html');
      fs.writeFileSync(debugFile, pageContent);
      this.log(`📄 Page content saved to ${debugFile}`);

      // Now extract ALL listings from the fully loaded page
      const allListings = await page.evaluate((cityName) => {
        // List of USA state abbreviations to filter out
        const usaStates = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

        const items = [];
        const seenIds = new Set();

        // Find all marketplace item links on the page
        const marketplaceLinks = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));

        marketplaceLinks.forEach((linkEl) => {
          try {
            const url = linkEl.href || '';
            if (!url || !url.includes('/marketplace/item/')) return;

            // Extract item ID from URL
            const idMatch = url.match(/\/marketplace\/item\/(\d+)/);
            if (!idMatch) return;

            const id = idMatch[1];
            if (seenIds.has(id)) return;

            // Find the parent container
            let container = linkEl.closest('[role="article"]') ||
                           linkEl.closest('div[class*="listing"]') ||
                           linkEl.closest('div[style*="position"]') ||
                           linkEl.parentElement;

            let title = linkEl.textContent?.trim() || '';
            let price = '';
            let location = '';
            let image = '';

            // Extract more details from container
            if (container && container !== linkEl) {
              const containerText = container.innerText || '';

              // Look for price pattern
              const priceMatch = containerText.match(/\$?\d+(?:,\d{3})*(?:\.\d{2})?/);
              if (priceMatch) {
                price = priceMatch[0];
              }

              // Look for image
              const img = container.querySelector('img');
              if (img) {
                image = img.src || img.getAttribute('data-src') || '';
              }

              // Try to extract location
              const allTextElements = Array.from(container.querySelectorAll('span, div'));
              for (const el of allTextElements) {
                const text = el.textContent?.trim() || '';
                if (text && !text.includes('$') && text.length < 100 && text.length > 3 && text !== title && !title.includes(text)) {
                  location = text;
                  break;
                }
              }
            }

            // Filter out USA states - check if location contains a USA state abbreviation
            const locationUpper = location.toUpperCase();
            const hasUsaState = usaStates.some(state => locationUpper.includes(state));
            if (hasUsaState) {
              return; // Skip this listing
            }

            seenIds.add(id);
            items.push({
              id: id,
              title: title || 'Untitled',
              price: price || 'N/A',
              location: location || 'N/A',
              city: cityName || 'Unknown',
              date: new Date().toISOString(),
              url: url,
              image: image,
              description: '',
              scrapedAt: new Date().toISOString(),
              source: 'facebook'
            });
          } catch (e) {
            // Silently skip
          }
        });

        return items;
      }, city);

      this.log(`🔍 Extracted ${allListings.length} listings from fully loaded page`);

      // Load existing data from file
      let savedListings = [];
      if (fs.existsSync(this.outputFile)) {
        try {
          const fileContent = fs.readFileSync(this.outputFile, 'utf-8').trim();
          if (fileContent) {
            const existingData = JSON.parse(fileContent);
            savedListings = Array.isArray(existingData) ? existingData : [];
          }
        } catch (parseError) {
          this.log(`⚠️  Could not parse existing listings file, starting fresh`);
          savedListings = [];
        }
      }

      // Merge with listings found during scroll
      const existingIds = new Set(savedListings.map(l => l.id));
      const newListings = allListings.filter(l => !existingIds.has(l.id));

      // Combine all listings
      const finalListings = [...savedListings, ...newListings];

      // Save to JSON
      fs.writeFileSync(this.outputFile, JSON.stringify(finalListings, null, 2));

      this.log(`Scrape complete. Found ${allListings.length} listings. Added ${newListings.length} new listings. Total: ${finalListings.length}`);

      // Log all new listings
      if (newListings.length > 0) {
        this.log(`📋 New listings found:`);
        newListings.forEach((listing) => {
          this.log(`${listing.title} | ${listing.price}`);
        });
      }

      // Send Discord notification if there are new listings
      if (newListings.length > 0) {
        await this.sendDiscordNotification(newListings);
      }

      return newListings;
    } catch (error) {
      this.log(`Error scraping:`, error.message);
      return [];
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

  // Public scrape method - handles single URL or city rotation
  async scrape() {
    if (this.cities && this.cities.length > 0) {
      // Multi-city mode: scrape all cities in sequence
      this.log(`🌍 Starting multi-city scrape for ${this.cities.length} Ontario cities...`);
      let totalNewListings = 0;
      let allNewListings = [];

      for (let i = 0; i < this.cities.length; i++) {
        const city = this.cities[i];
        this.log(`\n📍 Scraping city: ${city} (${i + 1}/${this.cities.length})`);
        const url = this.buildCityUrl(city);
        const newListings = await this.scrapeCity(url, city);
        totalNewListings += newListings.length;
        allNewListings.push(...newListings);

        // Delay between cities to avoid rate limiting (skip after last city)
        if (i < this.cities.length - 1) {
          this.log(`⏳ Waiting ${this.delayBetweenCities}ms before next city...`);
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenCities));
        }
      }

      this.log(`\n✅ Multi-city scrape complete! Total new listings: ${totalNewListings}`);
      return allNewListings;
    } else {
      // Single URL mode: extract city from URL if possible
      let cityName = 'Unknown';
      const cityMatch = this.url.match(/marketplace\/([^\/]+)\//);
      if (cityMatch) {
        cityName = cityMatch[1];
      }
      return await this.scrapeCity(this.url, cityName);
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
    const memUsage = process.memoryUsage();
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const cpuUsage = process.cpuUsage();
    const totalCPU = ((cpuUsage.user + cpuUsage.system) / 1000).toFixed(2); // Total CPU in milliseconds
    const cpuPercent = ((totalCPU / 1000) * 100).toFixed(1); // Convert to percentage (assuming 1 second = 100%)

    const line = `[${timestamp}] [Worker ${this.workerId}] [CPU: ${cpuPercent}%] [Mem: ${usedMB}MB/${totalMB}MB] ${message} ${details}`;
    console.log(line);
    appendToLog(line);
  }
}

module.exports = FacebookWorker;
