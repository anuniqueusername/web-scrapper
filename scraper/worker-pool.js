const KijijiWorker = require('./worker');

class WorkerPool {
  constructor(config = {}) {
    this.numWorkers = config.numWorkers || 1;
    this.scraperInterval = config.scraperInterval || 60000; // 1 minute
    this.discordWebhookUrl = config.discordWebhookUrl;
    this.outputFile = config.outputFile;
    this.url = config.url;
    this.workers = [];
    this.intervals = [];
  }

  async start() {
    console.log(`🚀 Starting worker pool with ${this.numWorkers} workers...`);

    // Initialize all workers
    for (let i = 1; i <= this.numWorkers; i++) {
      const worker = new KijijiWorker(i, {
        discordWebhookUrl: this.discordWebhookUrl,
        outputFile: this.outputFile,
        url: this.url
      });

      await worker.init();
      this.workers.push(worker);
      console.log(`✅ Worker ${i} initialized`);
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

      console.log(`⏱️  Worker ${worker.workerId} will start in ${delayMs}ms`);
    });

    console.log(`✅ All workers started. Scraping every ${this.scraperInterval / 1000} seconds`);
  }

  async stop() {
    console.log('\n🛑 Shutting down worker pool...');

    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];

    // Close all workers
    for (const worker of this.workers) {
      await worker.close();
      console.log(`✅ Worker ${worker.workerId} closed`);
    }

    this.workers = [];
    console.log('✅ Worker pool shut down');
  }

  getStatus() {
    const statuses = this.workers.map(w => ({
      workerId: w.workerId,
      isRunning: w.isRunning
    }));
    return statuses;
  }
}

module.exports = WorkerPool;
