const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const WorkerPool = require('./worker-pool');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'listings.json');
const fs = require('fs');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Configuration
const config = {
  numWorkers: process.env.NUM_WORKERS ? parseInt(process.env.NUM_WORKERS) : 2,
  scraperInterval: process.env.SCRAPER_INTERVAL ? parseInt(process.env.SCRAPER_INTERVAL) : 60000,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  outputFile: OUTPUT_FILE,
  url: 'https://www.kijiji.ca/b-canada/vending-machine/k0l0?view=list'
};

const pool = new WorkerPool(config);

// Start the pool
pool.start().catch(error => {
  console.error('Failed to start worker pool:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await pool.stop();
  process.exit(0);
});

// Status check every 30 seconds
setInterval(() => {
  const statuses = pool.getStatus();
  const runningWorkers = statuses.filter(s => s.isRunning).length;
  console.log(`[Status] ${runningWorkers}/${statuses.length} workers currently scraping`);
}, 30000);
