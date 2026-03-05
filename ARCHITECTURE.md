# Architecture & Data Flow

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SCRAPER MANAGER SYSTEM                    │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────┐              ┌──────────────────────────┐
│   Next.js Dashboard      │              │   Node.js Scraper        │
│   (Port 3000)            │              │   (Background Process)    │
│                          │              │                          │
│  • Search Parameters     │◄────────────►│  • Puppeteer Browser     │
│  • Scheduling Control    │              │  • Page Extraction       │
│  • Status Display        │              │  • Listing Merge         │
│  • Results Filter        │              │  • Notification Sender   │
│  • Listings Table        │              │                          │
└──────────────────────────┘              └──────────────────────────┘
         │                                          │
         │                                          │
         ├─────────────────────────────────────────┤
         │                                         │
         ▼                                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   File System (Shared)                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  scraper-config.json ◄──────────┐  ┌────────► scraper-status.json
│  ┌─────────────────────────────┐│  │ ┌──────────────────────────┐
│  │ url, interval, enabled      ││  │ │ running, lastRun, errors │
│  │ discord, slack              ││  │ │ newListingsLastRun, etc  │
│  │ filters (keywords, price)   ││  │ │                          │
│  └─────────────────────────────┘│  │ └──────────────────────────┘
│        ▲                         │  │         ▲
│        │ Reads on each          │  │         │ Updates after
│        │ interval               │  │         │ each scrape
│        │                        │  │         │
│   (Written by)            (Read by)      (Written by)
│   Dashboard UI             Scraper      Scraper
│                                          │
│   data/listings.json                    │
│   ┌──────────────────────────────────────┤
│   │ Array of listings:                   │
│   │ [                                    │
│   │   {id, title, price, location, ...} │
│   │   {id, title, price, location, ...} │
│   │ ]                                    │
│   └──────────────────────────────────────┤
│        ▲                                 │
│        │ Reads for display              │ Appends new
│   (Read by)                             │ listings
│   Dashboard API                    (Modified by)
│                                   Scraper
│
└─────────────────────────────────────────────────────────────┘
```

## Data Flow: Configuration Change

```
USER INTERACTION:
┌──────────────────────────────────────────────────────────────┐
│ User opens Dashboard at localhost:3000                       │
│ Clicks: Scheduling → ⚙️ Configure                           │
│ Changes: Interval from 60s to 30s                           │
│ Clicks: ✅ Save Changes                                     │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ React Component Updates State                                │
│ Calls: fetch('/api/scraper/config', {                       │
│   method: 'POST',                                           │
│   body: {interval: 30000, ...otherConfig}                   │
│ })                                                           │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Next.js API Route: /api/scraper/config                      │
│ POST handler:                                               │
│ 1. Load existing config                                     │
│ 2. Merge with new values                                    │
│ 3. Write to scraper-config.json                            │
│ 4. Return success response                                  │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Browser Shows Success Message                               │
│ "Configuration saved successfully"                          │
│ Component re-renders with new values                        │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Scraper Process (running in background)                     │
│ Before next interval:                                       │
│ 1. Checks scraper-config.json                              │
│ 2. Sees interval changed to 30000ms                         │
│ 3. Logs: "Interval changed. Updating..."                    │
│ 4. Clears old interval                                      │
│ 5. Sets new interval (30 seconds)                           │
│ 6. Next scrape runs in 30 seconds instead of 60             │
└──────────────────────────────────────────────────────────────┘
```

## Data Flow: Scraper Run → Dashboard Display

```
SCRAPER STARTS RUN:
┌──────────────────────────────────────────────────────────────┐
│ scraper.js interval triggers (60000ms)                       │
│ Calls: async scrapeListings()                               │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Load current config from scraper-config.json            │
│ 2. Save status: {running: true}                            │
│ 3. Initialize browser & page                               │
│ 4. Navigate to URL (from config)                           │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ DURING SCRAPE:                                              │
│ • Extract listings from page                               │
│ • Merge with existing listings.json                        │
│ • Identify new listings                                    │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ AFTER SCRAPE:                                               │
│ Save status to scraper-status.json:                         │
│ {                                                           │
│   running: false,                                           │
│   lastRun: "2024-03-04T10:31:00.123Z",                     │
│   lastRunDuration: 15234,                                  │
│   newListingsLastRun: 2,                                   │
│   totalListings: 42,                                        │
│   nextRun: "2024-03-04T10:32:00.123Z"                      │
│ }                                                           │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ DASHBOARD AUTO-REFRESH (Every 2 seconds):                   │
│ useEffect interval runs:                                    │
│ 1. fetch('/api/scraper/status')                            │
│ 2. Gets latest scraper-status.json                         │
│ 3. Updates React state: setStatus(newStatus)               │
│ 4. Components re-render with new data                      │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ DASHBOARD DISPLAYS:                                         │
│                                                             │
│  Status: 🟢 Active (from config.enabled)                   │
│  Last Run: 10:31:00 AM (from status.lastRun)              │
│  Duration: 15.23s (from status.lastRunDuration/1000)      │
│  New Listings: 2 (from status.newListingsLastRun)          │
│  Next Run In: 28s (calculated from nextRun)               │
│  Total: 42 (from status.totalListings)                    │
│  New Listings Table: Updated with 2 new items             │
└──────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
Home (app/page.js)
├── Header
├── Message Alert
│
├── SearchParameters
│   ├── Display view (read-only)
│   │   ├── URL display
│   │   ├── Keywords display
│   │   ├── Price range display
│   │   └── Location display
│   │
│   └── Edit view (form)
│       ├── URL input
│       ├── Keywords textarea
│       ├── Min price input
│       ├── Max price input
│       └── Location input
│
├── ScraperScheduling
│   ├── Status badge (running/stopped)
│   ├── Display view (read-only)
│   │   ├── Enabled toggle
│   │   ├── Interval display
│   │   ├── Discord status
│   │   ├── Slack status
│   │   ├── Run Now button
│   │   ├── Configure button
│   │   └── Last run info
│   │
│   └── Edit view (form)
│       ├── Enabled checkbox
│       ├── Interval selector
│       ├── Discord checkbox + URL input
│       ├── Slack checkbox + URL input
│       └── Save/Cancel buttons
│
├── StatusDashboard
│   ├── Stat box (Total Listings)
│   ├── Stat box (Last Run time)
│   ├── Stat box (New This Run)
│   ├── Stat box (Next Run In)
│   └── Error list (if any)
│
├── ResultsFilter
│   ├── Search input
│   ├── Min price input
│   ├── Max price input
│   ├── Sort selector
│   └── Reset filters button
│
└── ListingsTable
    ├── Table header (Title, Price, Location, Date, Action)
    └── Table rows (one per listing)
        ├── Title (with description)
        ├── Price
        ├── Location
        ├── Date
        └── View button (link to Kijiji)
```

## API Endpoints

```
┌─────────────────────────────────────────────────────────────┐
│               DASHBOARD API ROUTES                           │
└─────────────────────────────────────────────────────────────┘

Configuration Management:
┌─────────────────────────────────────────────────────────────┐
│ GET /api/scraper/config                                     │
│ Returns: { url, interval, enabled, discord, slack, ... }   │
│ Used by: SearchParameters, ScraperScheduling (on load)      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ POST /api/scraper/config                                    │
│ Body: { url?, interval?, enabled?, discord?, slack?, ... }  │
│ Returns: { success: true, config: {...} }                  │
│ Used by: SearchParameters, ScraperScheduling (on save)      │
└─────────────────────────────────────────────────────────────┘

Status Monitoring:
┌─────────────────────────────────────────────────────────────┐
│ GET /api/scraper/status                                     │
│ Returns: { running, lastRun, lastRunDuration, ... }         │
│ Used by: StatusDashboard, auto-refresh every 2s             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ POST /api/scraper/status                                    │
│ Body: { running?, lastRun?, lastRunDuration?, ... }         │
│ Returns: { success: true, status: {...} }                  │
│ Used by: scraper.js (to update status)                      │
└─────────────────────────────────────────────────────────────┘

Trigger Scrape:
┌─────────────────────────────────────────────────────────────┐
│ POST /api/scraper/run                                       │
│ Body: {} (empty)                                            │
│ Returns: { success: true, message: "..." }                 │
│ Used by: ScraperScheduling (Run Now button)                │
└─────────────────────────────────────────────────────────────┘

Listing Management:
┌─────────────────────────────────────────────────────────────┐
│ GET /api/listings?search=x&minPrice=y&maxPrice=z&sortBy=w  │
│ Query Params:                                               │
│   • search (optional) - full-text search                    │
│   • minPrice (optional) - minimum price filter              │
│   • maxPrice (optional) - maximum price filter              │
│   • sortBy (optional) - newest, oldest, price-low, price-high
│                                                             │
│ Returns: { total, filtered, listings: [...] }              │
│ Used by: ResultsFilter, ListingsTable (on filter change)    │
└─────────────────────────────────────────────────────────────┘
```

## File Persistence

```
┌──────────────────────────────────────────────────────────────┐
│                  FILE PERSISTENCE MODEL                      │
└──────────────────────────────────────────────────────────────┘

scraper-config.json
├─ Written by: Dashboard API (/api/scraper/config POST)
├─ Read by: scraper.js (on each interval + startup)
├─ Format: JSON object
├─ Lifespan: Persistent (survives restarts)
└─ Size: ~1KB (small, always in memory)

scraper-status.json
├─ Written by: scraper.js (after each run)
├─ Read by: Dashboard API (/api/scraper/status GET)
├─ Format: JSON object
├─ Lifespan: Persistent (survives restarts)
└─ Size: ~0.5KB (very small)

data/listings.json
├─ Written by: scraper.js (after each scrape)
├─ Read by: Dashboard API (/api/listings GET)
├─ Format: JSON array
├─ Lifespan: Persistent (survives restarts)
└─ Size: Grows with each listing (~0.5KB per listing)

.env (optional)
├─ Read by: scraper.js (as defaults only)
├─ NOT written by: scraper
├─ Ignored by: git (.gitignore)
└─ Purpose: Backup default webhooks

.gitignore
├─ Ignores: node_modules/, .next/, data/, scraper-*.json
├─ Prevents: Large/sensitive files from git
└─ Allows: Source code and documentation to be committed
```

## Process Lifecycle

```
USER STARTS SCRAPER:
┌──────────────────────────────────────────────────────────────┐
│ $ npm start (or: node scraper.js)                           │
│                                                              │
│ 1. Initialize Puppeteer browser                             │
│ 2. Load scraper-config.json (or use defaults)               │
│ 3. Log startup info with config values                      │
│ 4. Initialize scraper-status.json                           │
│ 5. Run initial scrape (if enabled)                          │
│ 6. Set up interval loop (configurable duration)             │
│ 7. Ready for dashboard connections                          │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ STEADY STATE (Running Loop):                                │
│                                                              │
│ Every N seconds (from config.interval):                     │
│ 1. Load latest config (picks up dashboard changes)          │
│ 2. Check if enabled (respects dashboard toggle)             │
│ 3. Run scraping process                                     │
│ 4. Update scraper-status.json                               │
│ 5. Send notifications if enabled                            │
│ 6. Sleep until next interval                                │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ USER STOPS SCRAPER (Ctrl+C):                                │
│                                                              │
│ 1. Clear interval timer                                     │
│ 2. Update status: running = false                           │
│ 3. Close browser                                            │
│ 4. Exit process                                             │
│ 5. Dashboard shows 🔴 Stopped                              │
└──────────────────────────────────────────────────────────────┘
```

## Integration Points Summary

| Component | Reads From | Writes To | Frequency |
|-----------|-----------|-----------|-----------|
| **Dashboard UI** | scraper-config.json<br>scraper-status.json<br>data/listings.json | scraper-config.json | On save |
| **Scraper** | scraper-config.json | scraper-status.json<br>data/listings.json | Per interval |
| **Dashboard API** | scraper-config.json<br>scraper-status.json<br>data/listings.json | scraper-config.json<br>scraper-status.json | On request |

## Technology Stack

**Frontend:**
- Next.js 16 (React server components + client components)
- CSS3 (no CSS-in-JS, vanilla CSS)
- No external component libraries (built from scratch)

**Backend:**
- Node.js (JavaScript runtime)
- Puppeteer (headless browser automation)
- Axios (HTTP client for notifications)
- File system (JSON persistence)

**DevOps:**
- npm (package manager)
- git (version control)
- .gitignore (selective tracking)

---

**Visual Summary:**
```
┌─────────────────────────────────────────────────────────────┐
│ DASHBOARD (Browser)  ◄────────────►  SCRAPER (Node Process)│
│  (reads/writes)      HTTP/API        (reads/writes)        │
└─────────────────────────────────────────────────────────────┘
              │                              │
              └──────────► JSON FILES ◄──────┘
                  (scraper-config.json)
                  (scraper-status.json)
                  (data/listings.json)
```
