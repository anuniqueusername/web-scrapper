const Database = require('better-sqlite3');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'scraper.db');
const db = new Database(DB_FILE);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize tables
function initializeDatabase() {
  try {
    // Config table (stores entire config as JSON)
    db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    // Listings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        scrapedAt TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
    `);

    // Status table (stores entire status as JSON)
    db.exec(`
      CREATE TABLE IF NOT EXISTS status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        lastStatusUpdate TEXT
      );
    `);

    // Create indexes for faster queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_listings_scrapedAt ON listings(scrapedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_listings_order ON listings("order" DESC);
    `);

    console.log(`[${new Date().toISOString()}] ✅ Database initialized at ${DB_FILE}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error initializing database:`, error.message);
    throw error;
  }
}

// Config operations
const configOps = {
  load() {
    try {
      const stmt = db.prepare('SELECT data, createdAt, updatedAt FROM config WHERE id = 1');
      let row = stmt.get();

      if (!row) {
        // Create default config if not exists
        const defaults = {
          url: 'https://www.kijiji.ca/b-canada/vending-machine/k0l0?view=list',
          interval: 60000,
          enabled: true,
          scrapeAllPages: false,
          alertMode: 'newOnly',
          discord: { enabled: false, webhookUrl: '' },
          slack: { enabled: false, webhookUrl: '' },
          filters: { keywords: [], minPrice: null, maxPrice: null, location: null }
        };
        this.save(defaults);
        row = stmt.get();
      }

      return JSON.parse(row.data);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error loading config:`, error.message);
      return null;
    }
  },

  save(config) {
    try {
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT createdAt FROM config WHERE id = 1').get();

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO config (id, data, createdAt, updatedAt)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(
        1,
        JSON.stringify(config),
        existing?.createdAt || now,
        now
      );
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error saving config:`, error.message);
    }
  }
};

// Listings operations
const listingsOps = {
  getAll() {
    try {
      const stmt = db.prepare('SELECT id, data, scrapedAt, createdAt FROM listings ORDER BY scrapedAt DESC');
      const rows = stmt.all();
      return rows.map(row => ({
        ...JSON.parse(row.data),
        id: row.id,
        scrapedAt: row.scrapedAt,
        createdAt: row.createdAt
      }));
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error loading listings:`, error.message);
      return [];
    }
  },

  addMany(listings) {
    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO listings (id, data, scrapedAt, createdAt)
        VALUES (?, ?, ?, ?)
      `);

      const insertMany = db.transaction((items) => {
        for (const item of items) {
          stmt.run(
            item.id,
            JSON.stringify(item),
            item.scrapedAt,
            new Date().toISOString()
          );
        }
      });

      insertMany(listings);
      return listings.length;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error adding listings:`, error.message);
      return 0;
    }
  },

  countNew(listings) {
    try {
      const existingIds = db.prepare('SELECT id FROM listings').pluck().all();
      const existingSet = new Set(existingIds);
      return listings.filter(l => !existingSet.has(l.id)).length;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error counting new listings:`, error.message);
      return 0;
    }
  },

  clear() {
    try {
      db.prepare('DELETE FROM listings').run();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error clearing listings:`, error.message);
    }
  }
};

// Status operations
const statusOps = {
  load() {
    try {
      const stmt = db.prepare('SELECT data FROM status WHERE id = 1');
      let row = stmt.get();

      if (!row) {
        const defaults = {
          running: false,
          lastRun: null,
          lastRunDuration: null,
          nextRun: null,
          totalListings: 0,
          newListingsLastRun: 0,
          errors: [],
          processStarted: false
        };
        this.save(defaults);
        row = stmt.get();
      }

      return JSON.parse(row.data);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error loading status:`, error.message);
      return null;
    }
  },

  save(statusUpdate) {
    try {
      const current = this.load() || {};
      const updated = { ...current, ...statusUpdate };

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO status (id, data, lastStatusUpdate)
        VALUES (?, ?, ?)
      `);

      stmt.run(
        1,
        JSON.stringify(updated),
        new Date().toISOString()
      );
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error saving status:`, error.message);
    }
  }
};

// Initialize on module load
initializeDatabase();

module.exports = {
  db,
  config: configOps,
  listings: listingsOps,
  status: statusOps
};
