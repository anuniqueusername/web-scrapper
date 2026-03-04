# Quick Start Guide - Scraper Manager Dashboard

## What was created?

A modern Next.js web interface for managing your Kijiji scraper with:
- Search parameter configuration (URL, keywords, price filters)
- Scheduling and interval management
- Discord/Slack webhook notifications
- Real-time status monitoring
- Results filtering and viewing

## Getting Started (30 seconds)

1. **Start the dashboard:**
   ```bash
   npm run web
   ```

2. **Open in browser:**
   ```
   http://localhost:3000
   ```

3. **You'll see:**
   - 🔎 Search Parameters panel (left)
   - ⏰ Scheduling & Notifications panel (right)
   - 📊 Live status metrics
   - 🎯 Filter results
   - 📋 Listings table

## Key Features

### 1. Configure Search Parameters
- Set target URL
- Add keywords to monitor
- Set price range filters
- Add location filters
Click **✏️ Edit Parameters** to modify

### 2. Set Scraping Schedule
- Choose interval: 30s → 1 day
- Enable Discord notifications
- Enable Slack notifications
- Click **▶️ Run Now** to trigger immediately
Click **⚙️ Configure** to modify

### 3. Monitor Status
- See total listings collected
- Check last run time
- See how many new listings found
- View time until next run
- View recent errors (if any)

### 4. Filter Results
- Search by title/location/description
- Filter by price range
- Sort: Newest, oldest, price (low→high, high→low)
- Click **View** to open listing on Kijiji

## File Locations

### Configuration Files (Auto-created)
- `scraper-config.json` - Your settings (saved via UI)
- `scraper-status.json` - Runtime metrics (auto-updated)

### Existing Data
- `data/listings.json` - All scraped listings

## Integration with Your Scraper

To connect the dashboard with your Node.js scraper:

### In your `scraper.js`, add at the top:
```javascript
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync('scraper-config.json', 'utf-8'));
  } catch (e) {
    return {}; // Use defaults if config doesn't exist
  }
}
```

### Use config in your interval:
```javascript
let config = loadConfig();
setInterval(async () => {
  // Your scraping code
  config = loadConfig(); // Reload config each time
}, config.interval || 60000);
```

### Update status after scraping:
```javascript
const status = {
  lastRun: new Date().toISOString(),
  totalListings: allListings.length,
  newListingsLastRun: newListings.length,
  lastRunDuration: Date.now() - startTime,
};
fs.writeFileSync('scraper-status.json', JSON.stringify(status, null, 2));
```

## Project Structure

```
your-project/
├── app/                           # Next.js application
│   ├── page.js                   # Main dashboard
│   ├── layout.js                 # Root layout
│   ├── globals.css               # Styles
│   └── api/                      # API endpoints
│       ├── scraper/
│       │   ├── config/route.js
│       │   ├── status/route.js
│       │   └── run/route.js
│       └── listings/route.js
│
├── components/                    # Reusable React components
│   ├── SearchParameters.js
│   ├── ScraperScheduling.js
│   ├── StatusDashboard.js
│   ├── ResultsFilter.js
│   └── ListingsTable.js
│
├── scraper.js                    # Your existing scraper
├── worker.js                     # Your existing worker
├── facebook-scraper-pool.js      # Facebook variant
├── data/listings.json            # Listings output
│
├── next.config.js                # Next.js config
├── jsconfig.json                 # Path aliases
├── package.json                  # Dependencies
└── DASHBOARD_README.md           # Full documentation
```

## Troubleshooting

**Dashboard won't load?**
- Make sure port 3000 is available
- If port 3000 is used: `PORT=3001 npm run web`
- Check browser console for errors

**Settings aren't saving?**
- Check that `scraper-config.json` has read/write permissions
- File will be auto-created on first save

**Listings not showing?**
- Run the scraper first to generate `data/listings.json`
- Check that JSON format is valid (use the original scraper)

**Want to change colors/styling?**
- Edit `app/globals.css`
- Look for `#667eea` (purple) for the primary color
- Styles are in CSS (no CSS-in-JS)

## Next Steps

1. ✅ Start dashboard: `npm run web`
2. ✅ Configure settings in UI
3. ✅ Integrate with your scraper (see integration section above)
4. ✅ Set up Discord/Slack webhooks (in Scheduling panel)
5. ✅ Run scraper and monitor from dashboard

## API Reference (Advanced)

All endpoints return JSON. Examples:

**Get current config:**
```bash
curl http://localhost:3000/api/scraper/config
```

**Update config:**
```bash
curl -X POST http://localhost:3000/api/scraper/config \
  -H "Content-Type: application/json" \
  -d '{"interval": 300000}'
```

**Get status:**
```bash
curl http://localhost:3000/api/scraper/status
```

**Get filtered listings:**
```bash
curl "http://localhost:3000/api/listings?search=vending&minPrice=1000&sortBy=price-low"
```

See `DASHBOARD_README.md` for complete API documentation.

## Questions?

Check `DASHBOARD_README.md` for detailed docs on:
- Configuration options
- Notification setup
- Filtering examples
- Future enhancements
