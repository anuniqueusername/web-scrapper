const FacebookAPIScraper = require('./facebook-api-scraper');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Get Discord webhook from environment (same as Kijiji scraper)
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';

// Example 1: Single city (Toronto)
const scraperSingleCity = new FacebookAPIScraper(1, {
  outputFile: path.join(__dirname, '..', 'data', 'facebook-listings.json'),
  url: 'https://www.facebook.com/marketplace/toronto/search?daysSinceListed=1&query=vending%20machines',
  discordWebhookUrl: discordWebhookUrl
});

// Example 2: Multiple major Ontario cities
const scraperMultiCity = new FacebookAPIScraper(2, {
  outputFile: path.join(__dirname, '..', 'data', 'facebook-listings.json'),
  cities: ['toronto', 'ottawa', 'mississauga', 'hamilton', 'london_ontario', 'kitchener'],
  delayBetweenCities: 2000, // 2 seconds between each city (default)
  discordWebhookUrl: discordWebhookUrl
});

// Example 3: All major Ontario cities
const scraperAllCities = new FacebookAPIScraper(3, {
  outputFile: path.join(__dirname, '..', 'data', 'facebook-listings.json'),
  cities: [
    'toronto', 'ottawa', 'mississauga', 'brampton', 'hamilton', 'london_ontario',
    'kitchener', 'waterloo', 'cambridge', 'guelph', 'barrie', 'thunder-bay',
    'sudbury', 'windsor', 'markham', 'vaughan', 'richmond-hill', 'oakville',
    'burlington', 'niagara-falls', 'st-catharines', 'peterborough', 'kingston',
    'belleville', 'oshawa', 'whitby', 'ajax', 'pickering', 'aurora'
  ],
  discordWebhookUrl: discordWebhookUrl
});

// Choose which scraper to run:
// - scraperSingleCity: Traditional single city search
// - scraperMultiCity: Search top 6 Ontario cities
// - scraperAllCities: Search all 29 major Ontario cities

const activeScrapers = [scraperMultiCity]; // Change this to use different modes

(async () => {
  try {
    console.log('🚀 Starting Facebook API-based scraper(s)...\n');

    for (const scraper of activeScrapers) {
      await scraper.scrape();
      await scraper.close();
    }

    console.log('\n✅ All scrapers completed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n');
    process.exit(1);
  }
})();
