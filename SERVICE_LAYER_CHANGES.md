# Service Layer Integration - What Changed

## TL;DR

The scraper is now controlled entirely through the Next.js UI. One command starts everything:

```bash
npm start
```

Then open http://localhost:3000 and use the **Scraper Controls** panel to:
- ▶️ **Start** the scraper
- ⏹️ **Stop** the scraper
- 🔄 **Restart** the scraper

## What Changed

### ✨ New Features

1. **ScraperControls Component** (`components/ScraperControls.js`)
   - Start/Stop/Restart buttons
   - Real-time process status (🟢 Running / 🔴 Stopped)
   - Process ID display
   - Loading states and error messages

2. **Process Control API** (`app/api/scraper/control/route.js`)
   - `POST /api/scraper/control?action=start` - Start scraper
   - `POST /api/scraper/control?action=stop` - Stop scraper
   - `POST /api/scraper/control?action=restart` - Restart scraper
   - `GET /api/scraper/control` - Get process status

3. **Process Management**
   - Spawns `scraper.js` as child process
   - Saves PID to `scraper.pid`
   - Pipes output to `scraper.log`
   - Graceful shutdown (SIGINT with timeout, fallback to SIGKILL)
   - Process tracking and monitoring

### 🗑️ Removed

- ❌ `service-manager.js` (separate Express server)
- ❌ `scraper-service.js` (service class)
- ❌ Separate service port (3001)
- ❌ Express dependency
- ❌ CORS dependency
- ❌ Concurrently dependency

### 📝 Updated Files

1. **package.json**
   - Changed `npm start` to run `next dev` (instead of scraper.js)
   - New script: `npm run build` for production
   - New script: `npm run production` for running built app
   - Removed: express, cors, concurrently

2. **app/page.js**
   - Added `ScraperControls` import
   - Added `ScraperControls` component to UI
   - Updated `refreshStatus()` to include control status

3. **app/api/scraper/control/route.js** (NEW)
   - Process spawning and management
   - PID tracking
   - Log file streaming
   - Status updates

4. **.gitignore**
   - Added `scraper.log` (process output logs)
   - Added `scraper.pid` (process ID file)

## How It Works Now

### Before (Two Separate Processes)
```
Terminal 1: npm start       → Runs scraper.js directly
Terminal 2: npm run web     → Runs Next.js dashboard (port 3000)
                           → Calls Express service (port 3001)
```

### After (One Process)
```
Terminal: npm start → Runs Next.js (port 3000)
                   → Hosts dashboard UI
                   → Controls scraper via API routes
                   → Spawns scraper.js when requested
```

## New User Flow

1. **Start Dashboard**
   ```bash
   npm start
   ```
   Opens http://localhost:3000

2. **See Status**
   - Dashboard loads with scraper status (🔴 Stopped)
   - Process ID shows if running

3. **Control Scraper**
   - Click **▶️ Start Scraper**
   - Status changes to 🟢 Running
   - Process ID appears
   - Real-time updates every 2 seconds

4. **Stop When Done**
   - Click **⏹️ Stop Scraper**
   - Graceful shutdown (5-second timeout)
   - Status changes to 🔴 Stopped

## File Changes Detail

### New Component Structure
```
components/
├── ScraperControls.js (NEW)
│   - Manages process control UI
│   - Calls /api/scraper/control
│   - Shows PID and status
│
├── StatusDashboard.js (unchanged)
├── ScraperScheduling.js (unchanged)
└── ... (others unchanged)
```

### New API Route
```
app/api/scraper/control/route.js (NEW)
├─ POST handler
│  ├─ action=start → handleStart()
│  ├─ action=stop → handleStop()
│  └─ action=restart → handleRestart()
├─ GET handler → returns process status
└─ Helper functions
   ├─ savePid()
   ├─ getPid()
   ├─ clearPid()
   ├─ updateStatus()
   ├─ isProcessRunning()
   └─ graceful shutdown
```

## Auto Files Created

When you start the scraper, these files are auto-created:

```
scraper.pid         # Stores process ID (deleted on exit)
scraper.log         # Contains all scraper output logs
scraper-config.json # Your saved configuration
scraper-status.json # Runtime status (updated by scraper)
```

## Benefits

✅ **Single Entry Point** - One command to start everything
✅ **Integrated Service** - No separate process to manage
✅ **Cleaner Architecture** - Service layer lives in Next.js
✅ **Better Control** - Start/stop from UI anytime
✅ **Simpler Deployment** - One port, one server, one process
✅ **Fewer Dependencies** - Removed express, cors, concurrently

## Running It

```bash
# Install dependencies (if you haven't)
npm install

# Start everything
npm start

# Opens http://localhost:3000 automatically
# Use Scraper Controls panel to start/stop scraper
```

## Backward Compatibility

You can still run the scraper standalone if needed:

```bash
# Old way (still works)
npm run legacy:scraper

# New way (recommended)
npm start    # Then click "Start Scraper" in UI
```

## Configuration

Configuration is still the same:
- **Edit from UI** - Scheduling panel changes settings
- **Auto-start** - Set `enabled: true` in scraper-config.json
- **Manual file editing** - Still supported

## Logs

Check scraper output anytime:

```bash
# In real-time
tail -f scraper.log

# Via API
GET /api/scraper/logs?lines=100

# Via dashboard (future enhancement)
```

## Status Tracking

Process status is tracked in `scraper-status.json`:

```json
{
  "running": true,
  "pid": 12345,
  "processStarted": true,
  "lastStatusUpdate": "2024-03-04T10:31:05.456Z"
}
```

Plus all original scraper status fields:
- `lastRun`, `lastRunDuration`
- `totalListings`, `newListingsLastRun`
- `errors`

## Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Start: `npm start`
3. ✅ Open: http://localhost:3000
4. ✅ Click "▶️ Start Scraper" in Scraper Controls
5. ✅ Watch it run in real-time!

---

**Everything you need is built in. No separate services. One command. Much simpler!** 🚀
