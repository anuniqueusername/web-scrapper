# "Run Now" Feature Guide

## How "Run Now" Works

The **"Run Now"** button in the Scheduling & Notifications panel triggers an immediate scrape. But it requires the scraper to be running first.

## Workflow

### Step 1: Start the Scraper
1. Go to **Scraper Controls** panel (left side of dashboard)
2. Click **▶️ Start Scraper**
3. Status changes to **🟢 Running**
4. Process ID appears (e.g., "Process ID: 12345")

### Step 2: Run Now (Optional)
1. Go to **Scheduling & Notifications** panel (right side)
2. Click **▶️ Run Now**
3. Button changes to **⏳ Running...**
4. Scraper executes immediately
5. Dashboard updates with new listings

## Why Start First?

The scraper must be running because:
- **▶️ Run Now** just tells the running scraper to scrape immediately
- It doesn't start the scraper, it only triggers the running process
- Think of it like pressing "refresh" on an active application

## Status Indicators

### Before Starting Scraper
```
Scheduling & Notifications panel:
- "Run Now" button is DISABLED (grayed out)
- Yellow warning: "⚠️ Scraper is stopped..."
- Status badge shows 🔴 Disabled
```

### After Starting Scraper
```
Scraper Controls panel:
- Status badge shows 🟢 Running
- Process ID displays (e.g., "Process ID: 12345")

Scheduling & Notifications panel:
- "Run Now" button is ENABLED
- Yellow warning disappears
```

## Complete Workflow

```
┌─────────────────────────────────────────┐
│  Open http://localhost:3000              │
└────────────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────────┐
        │ Scraper Controls    │
        │ (Left Panel)        │
        │ ▶️ Start Scraper    │
        └────────┬────────────┘
                 │
                 ▼
        Status: 🟢 Running
        Process ID: 12345
                 │
                 ▼
     ┌───────────────────────────┐
     │ Scheduling & Notifications │
     │ (Right Panel)              │
     │ ▶️ Run Now (now ENABLED)   │
     └───────────┬───────────────┘
                 │
                 ▼
     Scraper executes immediately
     Dashboard updates with results
                 │
                 ▼
     Last Run: 10:31:00 AM
     Duration: 15.23s
     New Listings: 2
```

## Two Ways to Trigger Scrape

### Method 1: Scheduled Interval
- Scraper runs automatically on set interval (30s to 1 day)
- Set interval in **Scheduling & Notifications** → **Configure**
- Example: Set to 5 minutes, scraper runs every 5 minutes

### Method 2: Run Now (Manual)
- Trigger immediately from **Run Now** button
- Works anytime the scraper is running
- Useful for:
  - Testing after config changes
  - Getting fresh data immediately
  - Checking new listings without waiting

## Configuration Flow

```
Make Config Change
        │
        ▼
Save Config (from Search Parameters or Scheduling panels)
        │
        ▼
Scraper reads new config
        │
        ├─→ On next interval (automatic)
        │
        └─→ Or click "Run Now" for immediate effect
```

## Troubleshooting

### "Run Now" Button is Disabled
**Problem:** Button appears grayed out
**Solution:**
1. Click **Scraper Controls** panel
2. Click **▶️ Start Scraper**
3. Wait for status to change to 🟢 Running
4. Now "Run Now" button will be enabled

### Seeing Warning: "Scraper is stopped..."
**Problem:** Yellow warning appears
**Solution:**
1. You need to start the scraper first
2. Use **Scraper Controls** panel
3. Click **▶️ Start Scraper**
4. Warning will disappear

### "Run Now" Clicked but Nothing Happens
**Problem:** Button appears to work but no scrape happens
**Solution:**
1. Check if scraper is still running:
   - Look at **Scraper Controls** status
   - Should show 🟢 Running with Process ID
2. Check scraper logs:
   - Terminal: `tail -f scraper.log`
   - Look for errors
3. If stopped, restart with **▶️ Start Scraper**

### Scraper Runs But No New Listings
**Possible reasons:**
- No new listings found (normal, depends on data)
- Configuration filters are too strict
- Configuration enabled but search parameters need updating
- Check **Status Dashboard** for:
  - Last Run time
  - New Listings count
  - Any error messages

## Key Points

✅ **Start First** - Use Scraper Controls to start the scraper
✅ **Then Run Now** - Use the Run Now button to trigger immediate scrape
✅ **Or Wait** - Let automatic interval handle it
✅ **Status Always Visible** - Dashboard shows real-time status
✅ **Disable Scheduling** - Toggle in Scheduling panel if you only want manual runs

## Advanced: Configuration + Run Now

Workflow for testing configuration changes:

```
1. Go to Search Parameters or Scheduling panel
2. Make changes (URL, keywords, price range, interval, etc.)
3. Click Save
4. Go to Scheduling & Notifications
5. Click "▶️ Run Now"
6. Changes take effect immediately
7. Dashboard shows results right away
```

This is faster than waiting for the next scheduled interval!

## Integration with Scraper Controls

The two panels work together:

| Panel | Control | Purpose |
|-------|---------|---------|
| **Scraper Controls** | ▶️ Start | Start the scraper process |
| **Scraper Controls** | ⏹️ Stop | Stop the scraper process |
| **Scraper Controls** | 🔄 Restart | Restart after changes |
| **Scheduling** | ▶️ Run Now | Trigger immediate scrape (requires running) |
| **Scheduling** | ⚙️ Configure | Set interval and notifications |
| **Search Parameters** | ✏️ Edit | Change URL and filters |

## Summary

**"Run Now" requires the scraper to be running.**

1. **Start scraper** → Use Scraper Controls panel
2. **Run now** → Use Run Now button in Scheduling panel
3. **Monitor** → Dashboard auto-refreshes every 2 seconds

That's it! Simple and straightforward.
