# Scraping Patterns Reference

## Kijiji URL Pattern Detection

```js
// Category browse URL: path ends with /cNNNlNNN or /cNNN
const categoryCodePattern = /\/c\d+l?\d*\/?$/;

function buildKijijiPageUrl(baseUrl, pageNum) {
  if (pageNum === 1) return baseUrl;
  const urlObj = new URL(baseUrl);

  if (categoryCodePattern.test(urlObj.pathname)) {
    // /b-laptops/canada/c773l0 -> /b-laptops/canada/page-2/c773l0
    urlObj.pathname = urlObj.pathname.replace(/(\/c\d+l?\d*\/?$)/, `/page-${pageNum}$1`);
    return urlObj.toString();
  }

  // Keyword search: use ?page=N
  urlObj.searchParams.set('page', pageNum);
  return urlObj.toString();
}
```

Known category URL examples:
- `/b-laptops/canada/c773l0` -> page 2: `/b-laptops/canada/page-2/c773l0`
- `/b-buy-sell/canada/c10l0` -> page 2: `/b-buy-sell/canada/page-2/c10l0`
- `/b-cars-trucks/canada/c174l0` -> page 2: `/b-cars-trucks/canada/page-2/c174l0`

Known search URL examples:
- `/b-canada/vending-machine/k0l0?view=list` -> page 2: `?page=2`
- `/b-canada/laptop/k0l0?view=list` -> page 2: `?page=2`

## Kijiji Pagination Detection from Page

```js
const paginationInfo = await page.evaluate(() => {
  // Method 1: results counter text "X - Y of Z results"
  const resultsText = document.querySelector('[data-testid="srp-results"]')?.textContent || '';
  const match = resultsText.match(/of\s+([\d,]+)/);
  if (match) {
    const totalResults = parseInt(match[1].replace(/,/g, ''));
    return Math.ceil(totalResults / 40); // 40 items per page
  }
  // Method 2: presence of a "next page" link
  const hasNext = !!document.querySelector(
    '[data-testid="pagination-next-link"], a[title="Next"], a[aria-label="Next"]'
  );
  return hasNext ? 999 : 1; // 999 = keep paginating until no next link
});
```

## 0-Results Diagnostic Pattern

When extraction returns 0 items, always log these from within page.evaluate:
```js
const allDataTestIds = [...document.querySelectorAll('[data-testid]')]
  .map(el => el.getAttribute('data-testid'))
  .slice(0, 20);
const bodySnippet = document.body?.innerHTML?.substring(0, 500) || '';
```

Common causes of 0 results:
1. Bot detection / CAPTCHA — body snippet will show challenge page content
2. Wrong pagination URL — page loads but shows wrong/empty results
3. Selector outdated — data-testid list will be missing expected values
4. Page not fully loaded — waitForSelector timed out before React hydration

## Promise.race waitForSelector Pattern

Use this instead of a single waitForSelector to handle multiple possible page layouts:
```js
await Promise.race([
  page.waitForSelector('SELECTOR_A', { timeout: 8000 }),
  page.waitForSelector('SELECTOR_B', { timeout: 8000 }),
  page.waitForSelector('SELECTOR_C', { timeout: 8000 }),
]).catch(() => {
  console.log('No selector appeared within 8s, attempting extraction anyway');
});
```

The `.catch()` is intentional — extraction should still run even if wait times out,
because the page may have rendered with a different layout than expected.
Do not use a hard `setTimeout` fallback; event-based waiting is always preferred.
