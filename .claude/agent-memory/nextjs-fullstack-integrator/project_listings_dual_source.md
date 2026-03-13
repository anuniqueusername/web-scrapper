---
name: Dual-source listings page (Kijiji + Facebook)
description: /listings page now shows both Kijiji and Facebook Marketplace listings with a tab switcher and source badges
type: project
---

Facebook Marketplace listings are shown alongside Kijiji listings on the /listings page via a three-tab switcher (Kijiji | Facebook | All).

**Why:** User requested unified view of both scraped sources with per-source filtering and an "All" combined view with source badges.

**How to apply:** When touching the listings page or ListingsTable, account for both sources. Key design decisions below.

## Files changed

- `app/api/facebook/listings/route.js` — NEW. Reads `data/facebook-listings.json`, normalises `source: 'facebook'` on every record, applies same filter/sort query params as Kijiji route (minPrice, maxPrice, search, sortBy).
- `app/listings/page.js` — Rewritten. Fetches both APIs in parallel via `Promise.all`. Holds `kijijiListings` and `facebookListings` in separate state. `applyFilters` merges based on `activeTab`. Passes `showSource={activeTab === 'all'}` to ListingsTable.
- `components/ListingsTable.js` — Rewritten. Accepts `showSource` prop; renders a `SourceBadge` column when true. Facebook badge: blue (#60a5fa). Kijiji badge: purple (#c084fc). Includes `cleanFacebookTitle()` helper that strips leading `CA$NNN` price tokens and trailing city/province from FB titles (they concatenate price+city into the title field).
- `app/listings/Listings.module.css` — Added `.tabs`, `.tab`, `.tabActive`, `.tabCount` styles. Removed `transform: translateY(-2px)` from `.stat:hover` (banned pattern).

## Data structure differences

| Field     | Kijiji                          | Facebook                        |
|-----------|---------------------------------|---------------------------------|
| source    | absent (tagged `kijiji` by UI)  | `"facebook"` in JSON            |
| location  | city string                     | `"N/A"` — use `city` field instead |
| date      | relative string e.g. `"1 mo"`  | ISO timestamp                   |
| title     | clean product name              | `CA$NNNProduct NameCity, ON` concatenated |
| order     | integer (scrape position)       | absent — shows `—`              |

## Tab behaviour

- Kijiji tab: only kijijiListings, no source column
- Facebook tab: only facebookListings, no source column
- All tab: merged array, Source badge column visible, extra stat boxes for per-source counts
- Switching tabs re-runs `applyFilters` via `useCallback` dependency on `activeTab`
