# Facebook Marketplace Multi-City Scraper

The Facebook scraper now supports searching across multiple Ontario cities in a single run.

## Usage

### Single City (Default)
```javascript
const scraper = new FacebookWorker(1, {
  outputFile: './data/facebook-listings.json',
  url: 'https://www.facebook.com/marketplace/toronto/search?query=vending%20machines',
  discordWebhookUrl: ''
});

await scraper.scrape();
```

### Multiple Cities
Pass a `cities` array to search multiple locations:

```javascript
const scraper = new FacebookWorker(1, {
  outputFile: './data/facebook-listings.json',
  cities: ['toronto', 'ottawa', 'mississauga', 'hamilton', 'london', 'kitchener'],
  discordWebhookUrl: ''
});

await scraper.scrape();
```

## Available Ontario Cities

The following 29 major Ontario cities are supported:

```
toronto, ottawa, mississauga, brampton, hamilton, london_ontario, kitchener, waterloo,
cambridge, guelph, barrie, thunder-bay, sudbury, windsor, markham, vaughan,
richmond-hill, oakville, burlington, niagara-falls, st-catharines, peterborough,
kingston, belleville, oshawa, whitby, ajax, pickering, aurora
```

## How It Works

1. **Single URL Mode**: If `url` is provided and `cities` is not set, uses the configured URL directly
2. **Multi-City Mode**: If `cities` array is provided, scrapes each city sequentially:
   - Builds marketplace URL for each city: `https://www.facebook.com/marketplace/{city}/search?...`
   - Scrapes that city and adds `city` field to each listing
   - Adds configurable delay between cities to avoid rate limiting
   - Combines all results into a single output file with city information

## Data Structure

Each listing now includes a `city` field:

```json
{
  "id": "item123456",
  "title": "Vintage Vending Machine",
  "price": "$500",
  "location": "Downtown Toronto",
  "city": "toronto",
  "date": "2026-03-12T10:30:00.000Z",
  "url": "https://facebook.com/marketplace/item/123456",
  "image": "https://...",
  "description": "",
  "scrapedAt": "2026-03-12T10:30:00.000Z",
  "source": "facebook"
}
```

## Features

- ✅ **Sequential Scraping**: Each city is scraped one at a time to avoid rate limiting
- ✅ **Deduplication**: Listings are deduplicated by ID across all cities
- ✅ **City Tracking**: Every listing includes the city it was found in
- ✅ **Single Output File**: All cities' listings combined into one JSON file
- ✅ **Discord Notifications**: Sends alerts with city info for new listings across all cities
- ✅ **Configurable Delays**: Customize wait time between city scrapes (default: 2000ms)
- ✅ **Progress Logging**: Shows which city is currently being scraped with progress counter

## Examples

### Quick Start: Top 6 Cities
```javascript
cities: ['toronto', 'ottawa', 'mississauga', 'hamilton', 'london', 'kitchener']
```

### All Major Ontario Cities
```javascript
cities: [
  'toronto', 'ottawa', 'mississauga', 'brampton', 'hamilton', 'london',
  'kitchener', 'waterloo', 'cambridge', 'guelph', 'barrie', 'thunder-bay',
  'sudbury', 'windsor', 'markham', 'vaughan', 'richmond-hill', 'oakville',
  'burlington', 'niagara-falls', 'st-catharines', 'peterborough', 'kingston',
  'belleville', 'oshawa', 'whitby', 'ajax', 'pickering', 'aurora'
]
```

### Custom City Selection
```javascript
cities: ['toronto', 'waterloo', 'guelph'] // Just these 3 cities
```

## Runner Usage

Both `facebook-worker-runner.js` and `facebook-api-scraper-runner.js` include examples:

```javascript
// Change which scraper to run by modifying this line:
const activeScrapers = [scraperMultiCity];

// Available options:
// - scraperSingleCity: Traditional single city search
// - scraperMultiCity: Search top 6 Ontario cities
// - scraperAllCities: Search all 29 major Ontario cities
```

## Performance Notes

- **Time per city**: ~2-5 minutes depending on results
- **All 29 cities**: ~1-2.5 hours total
- **Memory**: Minimal - pages are closed after each city
- **Rate limiting**: 2-second delay between cities helps avoid blocks

## Files Modified

- `facebook-worker.js` - Added city rotation methods, multi-city scraping
- `facebook-api-scraper.js` - Added city rotation methods, multi-city scraping
- `facebook-worker-runner.js` - Added examples for all three modes
- `facebook-api-scraper-runner.js` - Added examples for all three modes
