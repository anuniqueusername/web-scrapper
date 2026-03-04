const FacebookWorker = require('./facebook-worker');
const WorkerPool = require('./worker-pool');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, 'data');
const FB_OUTPUT_FILE = path.join(DATA_DIR, 'facebook-listings.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Create a custom Facebook Worker Pool
class FacebookWorkerPool {
  constructor(config = {}) {
    this.numWorkers = config.numWorkers || 1;
    this.scraperInterval = config.scraperInterval || 60000; // 60 seconds
    this.discordWebhookUrl = config.discordWebhookUrl;
    this.outputFile = config.outputFile;
    this.url = config.url;
    this.workers = [];
    this.intervals = [];
  }

  async start() {
    console.log(`🚀 Starting Facebook worker pool with ${this.numWorkers} workers...`);

    // Initialize all workers
    for (let i = 1; i <= this.numWorkers; i++) {
      const worker = new FacebookWorker(i, {
        discordWebhookUrl: this.discordWebhookUrl,
        outputFile: this.outputFile,
        url: this.url
      });

      await worker.init();
      this.workers.push(worker);
      console.log(`✅ Facebook Worker ${i} initialized`);
    }

    // Start scraping on each worker
    this.workers.forEach((worker, index) => {
      // Stagger the first scrape to avoid simultaneous requests
      const delayMs = index * (this.scraperInterval / this.numWorkers);

      setTimeout(() => {
        worker.scrape();
        const interval = setInterval(() => {
          worker.scrape();
        }, this.scraperInterval);
        this.intervals.push(interval);
      }, delayMs);

      console.log(`⏱️  Facebook Worker ${worker.workerId} will start in ${delayMs}ms`);
    });

    console.log(`✅ All workers started. Scraping every ${this.scraperInterval / 1000} seconds`);
  }

  async stop() {
    console.log('\n🛑 Shutting down Facebook worker pool...');

    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];

    // Close all workers
    for (const worker of this.workers) {
      await worker.close();
      console.log(`✅ Facebook Worker ${worker.workerId} closed`);
    }

    this.workers = [];
    console.log('✅ Facebook worker pool shut down');
  }

  getStatus() {
    const statuses = this.workers.map(w => ({
      workerId: w.workerId,
      isRunning: w.isRunning
    }));
    return statuses;
  }
}

// Initialize and run
(async () => {
  const pool = new FacebookWorkerPool({
    numWorkers: parseInt(process.env.NUM_WORKERS) || 1,
    scraperInterval: parseInt(process.env.SCRAPER_INTERVAL) || 60000,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
    outputFile: FB_OUTPUT_FILE,
    url: 'https://www.facebook.com/marketplace/toronto/search?query=vending%20machines'
  });

  await pool.start();

  console.log(`Saving Facebook listings to: ${FB_OUTPUT_FILE}`);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await pool.stop();
    process.exit(0);
  });
})();
