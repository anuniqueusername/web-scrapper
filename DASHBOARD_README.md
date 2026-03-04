# Scraper Manager Dashboard

A modern Next.js web UI for managing search parameters, scheduling, and filtering scraper results.

## Features

- 🔎 **Search Parameter Management**: Configure target URLs, keywords, and price filters
- ⏰ **Scheduler Control**: Set scraping intervals (30s to 1 day) and enable/disable scraper
- 🔔 **Notifications**: Integrate Discord and Slack webhooks for alerts
- 📊 **Real-time Status**: Monitor scraper status, last run time, and upcoming runs
- 🎯 **Results Filtering**: Search, sort, and filter listings by price, location, and keywords
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile devices

## Installation

The dependencies are already installed. If you need to reinstall:

```bash
npm install
```

## Running the Dashboard

Start the Next.js development server:

```bash
npm run web
```

The dashboard will be available at `http://localhost:3000`

## Project Structure

```
app/
├── page.js                    # Main dashboard page
├── layout.js                  # Root layout with metadata
├── globals.css                # Global styles
└── api/
    ├── scraper/
    │   ├── config/route.js   # GET/POST scraper configuration
    │   ├── status/route.js   # GET/POST scraper status
    │   └── run/route.js      # POST trigger scraper run
    └── listings/route.js     # GET filtered listings

components/
├── SearchParameters.js        # Configure URL, keywords, price filters
├── ScraperScheduling.js       # Set intervals and notifications
├── StatusDashboard.js         # Display scraper metrics and status
├── ResultsFilter.js           # Filter and sort results
└── ListingsTable.js           # Display listings in table format
```

## API Routes

### GET /api/scraper/config
Retrieve current scraper configuration.

### POST /api/scraper/config
Update scraper configuration. Body example:
```json
{
  "url": "https://www.kijiji.ca/...",
  "interval": 60000,
  "discord": {
    "enabled": true,
    "webhookUrl": "https://discord.com/api/webhooks/..."
  },
  "filters": {
    "minPrice": 1000,
    "maxPrice": 5000,
    "location": "Ontario",
    "keywords": ["vending", "machine"]
  }
}
```

### GET /api/scraper/status
Get current scraper status and metrics.

### POST /api/scraper/status
Update scraper status.

### POST /api/scraper/run
Trigger an immediate scraper run.

### GET /api/listings
Retrieve listings with optional filters. Query parameters:
- `search`: Search in title, location, description
- `minPrice`: Minimum price filter
- `maxPrice`: Maximum price filter
- `sortBy`: Sort order (newest, oldest, price-low, price-high)

Example: `/api/listings?search=vending&minPrice=1000&maxPrice=5000&sortBy=price-low`

## Configuration Files

The dashboard uses two persistent JSON files:

### `scraper-config.json`
Stores scraper configuration including URL, schedule, and notification settings.

### `scraper-status.json`
Tracks runtime status including:
- Whether scraper is running
- Last run time and duration
- Total listings collected
- Recent errors

## Integration with Node.js Scraper

The dashboard works alongside your existing Node.js scraper (`scraper.js`, `worker.js`, etc.). To integrate them:

1. The dashboard reads/writes configuration from `scraper-config.json`
2. The Node.js scraper should read this file to get runtime settings
3. The scraper should update `scraper-status.json` with runtime metrics

Example integration in scraper.js:
```javascript
function loadConfig() {
  return JSON.parse(fs.readFileSync('scraper-config.json', 'utf-8'));
}

async function run() {
  const config = loadConfig();

  // Use config.filters.keywords, config.url, config.interval, etc.
  // Update status in scraper-status.json after each run
}
```

## Development

Edit components and files directly. Next.js will hot-reload the changes automatically when you save.

### Adding New Filters

Edit `components/ResultsFilter.js` to add new filter fields, then update `app/api/listings/route.js` to handle the new filters.

### Customizing Styles

Modify `app/globals.css` to change colors, spacing, and layout. The dashboard uses a modern purple gradient theme by default.

## Production Build

Build for production:
```bash
npm run web:build
npm run web:start
```

## Troubleshooting

- **Port 3000 already in use**: Kill the process on port 3000 or specify a different port with `PORT=3001 npm run web`
- **Configuration not persisting**: Ensure the `scraper-config.json` file exists and is writable
- **Listings not showing**: Check that `data/listings.json` exists with proper data format

## Future Enhancements

- [ ] Real-time updates via WebSocket
- [ ] Scraper logs viewer
- [ ] Historical charts and statistics
- [ ] Export listings to CSV/Excel
- [ ] Email notifications
- [ ] Multiple scraper job management
- [ ] User authentication
- [ ] Database backend for better persistence
