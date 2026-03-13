# Scraper Architect Agent Memory

## Kijiji URL Pagination Schemes

Two distinct URL structures require different pagination logic:

| URL type | Example | Pagination method |
|---|---|---|
| Keyword search | `/b-canada/vending-machine/k0l0?view=list` | Query param: `?page=N` |
| Category browse | `/b-laptops/canada/c773l0` | Path segment: `/page-N/` inserted before category code |

Category browse URLs end with a segment matching `/c\d+l?\d*` (e.g. `c773l0`, `c0l0`).
Pagination inserts `/page-N/` immediately before that segment:
`/b-laptops/canada/c773l0` -> `/b-laptops/canada/page-2/c773l0`

The helper `buildKijijiPageUrl(baseUrl, pageNum)` in `scraper.js` implements this.
Adding `?page=2` to a category URL silently returns page 1 again — yields 0 new listings every run.

## Kijiji Listing Selector Strategy (Multi-Strategy with Fallbacks)

Kijiji renders differently depending on view mode (list vs grid) and URL type.
Always use a three-strategy fallback chain; never assume a single selector works everywhere.

**Strategy 1** (list view, most common):
`li[data-testid^="listing-card-list-item-"]` -> `section[data-testid="listing-card"]` -> `[data-listingid]`

**Strategy 2** (grid view / category pages):
`section[data-testid="listing-card"]` queried directly anywhere on the page

**Strategy 3** (older Kijiji markup, rare):
`article[data-listingid]` with class-name-based child selectors

**waitForSelector race pattern** — use `Promise.race` across all three selectors with 8s timeout
so whichever renders first unblocks extraction:
```js
await Promise.race([
  page.waitForSelector('li[data-testid^="listing-card-list-item-"]', { timeout: 8000 }),
  page.waitForSelector('section[data-testid="listing-card"]', { timeout: 8000 }),
  page.waitForSelector('article[data-listingid]', { timeout: 8000 }),
]).catch(() => { /* log warning, proceed anyway */ });
```

**Strategy 0 diagnostics** — when all strategies return 0, log all `data-testid` values found
on the page (`document.querySelectorAll('[data-testid]')`) and a body snippet.
This differentiates "bot block / wrong URL" from "selector changed".

## Anti-Detection (Always Apply to Every Page)

```js
// In puppeteer.launch args:
'--disable-blink-features=AutomationControlled'

// After newPage():
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = { runtime: {} };
});
```

Missing stealth headers can cause Kijiji to return a bot-challenge page with 0 listing elements.

## Root Cause of the "0 listings" Bug (2026-03-12)

- URL `https://www.kijiji.ca/b-laptops/canada/c773l0` is a category browse URL
- Old pagination code appended `?page=1` which is a no-op for category URLs; Kijiji ignores it
- `waitForSelector` for Strategy 1 only silently timed out (`.catch(() => {})`) then `querySelectorAll`
  returned 0 elements because the page was in grid/default view, not list view
- No fallback selectors existed, so scrape completed with 0 results but no error

## Files Modified for This Fix

- `D:\Projects\Competitor Scraper\scraper.js` — added `buildKijijiPageUrl()`, `extractListingsFromPage()`,
  stealth headers in both `scrapeListings` and `scrapeAllPages`, `Promise.race` waitForSelector
- `D:\Projects\Competitor Scraper\worker.js` — added stealth headers, `Promise.race` waitForSelector,
  full inline multi-strategy extraction with diagnostics logging

See `patterns.md` for the `buildKijijiPageUrl` regex pattern details.
