const FacebookWorker = require('./facebook-worker');
const path = require('path');
require('dotenv').config();

// Get Discord webhook from environment (same as Kijiji scraper)
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';

// Example 1: Single city (Toronto)
const workerSingleCity = new FacebookWorker(1, {
  outputFile: path.join(__dirname, 'data', 'facebook-listings.json'),
  url: 'https://www.facebook.com/marketplace/toronto/search?query=vending%20machines',
  discordWebhookUrl: discordWebhookUrl
});

// Example 2: Multiple major Ontario cities
const workerMultiCity = new FacebookWorker(2, {
  outputFile: path.join(__dirname, 'data', 'facebook-listings.json'),
  cities: ['toronto', 'ottawa', 'mississauga', 'hamilton', 'london_ontario', 'kitchener', 'whitby', 'peterborough', 'kingston'],
  delayBetweenCities: 2000, // 2 seconds between each city (default)
  discordWebhookUrl: discordWebhookUrl
});

// Example 3: All major Ontario cities
const workerAllCities = new FacebookWorker(3, {
  outputFile: path.join(__dirname, 'data', 'facebook-listings.json'),
  cities: [
    'toronto', 'ottawa', 'mississauga', 'brampton', 'hamilton', 'london_ontario',
    'kitchener', 'waterloo', 'cambridge', 'guelph', 'barrie', 'thunder-bay',
    'sudbury', 'windsor', 'markham', 'vaughan', 'richmond-hill', 'oakville',
    'burlington', 'niagara-falls', 'st-catharines', 'peterborough', 'kingston',
    'belleville', 'oshawa', 'whitby', 'ajax', 'pickering', 'aurora'
  ],
  discordWebhookUrl: discordWebhookUrl
});

// Choose which worker to run:
// - workerSingleCity: Traditional single city search
// - workerMultiCity: Search top 6 Ontario cities
// - workerAllCities: Search all 29 major Ontario cities

const activeWorkers = [workerAllCities]; // Change this to use different modes

(async () => {
  try {
    console.log('🚀 Starting Facebook Marketplace scraper(s)...\n');

    for (const worker of activeWorkers) {
      await worker.scrape();
      await worker.close();
    }

    console.log('\n✅ All scrapers completed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n');
    process.exit(1);
  }
})();
