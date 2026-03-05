# Service Layer Integration Guide

## Overview

The scraper is now fully controlled through the Next.js UI's server-side API routes. The service layer is integrated directly into the Next.js backend, eliminating the need for a separate service process.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Next.js UI (localhost:3000)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Components (React)                                         │
│  ├─ ScraperControls (new)                                  │
│  │  - Start/Stop/Restart buttons                           │
│  │  - Process ID display                                    │
│  │  - Real-time status                                      │
│  └─ StatusDashboard                                         │
│                                                              │
│  API Routes (Server-Side)                                  │
│  ├─ POST /api/scraper/control?action=start|stop|restart   │
│  ├─ GET  /api/scraper/control                             │
│  ├─ GET  /api/scraper/status                              │
│  ├─ GET  /api/scraper/config                              │
│  └─ POST /api/scraper/config                              │
│                                                              │
│  Service Layer (scraper-service equivalent)               │
│  ├─ Process Management                                     │
│  ├─ PID Tracking                                           │
│  ├─ Status Persistence                                     │
│  └─ Log File Management                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
                   Spawned Scraper Process
                   (scraper.js running)
```

## How It Works

### 1. **Single Command to Start Everything**

```bash
npm start
```

This starts the Next.js server which:
- Hosts the dashboard UI
- Provides all API routes
- Manages scraper process via API routes
- Logs all scraper output

### 2. **UI Controls the Scraper**

**ScraperControls Component** provides buttons to:

- **▶️ Start Scraper** - Spawn scraper.js process
- **⏹️ Stop Scraper** - Gracefully terminate with SIGINT (5s timeout, then SIGKILL)
- **🔄 Restart Scraper** - Stop and start in sequence

### 3. **API Routes Handle Process Management**

**File: `app/api/scraper/control/route.js`**

```javascript
// Endpoints:
POST /api/scraper/control?action=start
POST /api/scraper/control?action=stop
POST /api/scraper/control?action=restart
GET  /api/scraper/control
```

Features:
- Spawns scraper.js as child process
- Saves process ID to `scraper.pid`
- Pipes stdout/stderr to `scraper.log`
- Tracks process status in real-time
- Handles graceful shutdown (SIGINT → timeout → SIGKILL)
- Detects orphaned processes

### 4. **Status Persistence**

Status is stored in `scraper-status.json`:

```json
{
  "running": true,
  "pid": 12345,
  "processStarted": true,
  "lastRun": "2024-03-04T10:31:00.123Z",
  "totalListings": 42,
  "newListingsLastRun": 2,
  "lastStatusUpdate": "2024-03-04T10:31:05.456Z"
}
```

### 5. **Log Management**

All scraper output goes to `scraper.log`:

```
[2024-03-04T10:30:45.123Z] 🌐 Browser initialized
[2024-03-04T10:30:45.456Z] ⚙️  Configuration loaded
[2024-03-04T10:31:00.456Z] ✅ Scrape complete. Found 5 listings...
```

Accessed via dashboard or API: `GET /api/scraper/logs`

## Running the System

### Development Mode

```bash
npm start
# or
npm run dev
```

Starts on `http://localhost:3000`

### Production Mode

```bash
npm run build
npm run production
```

## UI Components

### ScraperControls Component

**Location:** `components/ScraperControls.js`

Displays:
- Current process status (🟢 Running / 🔴 Stopped)
- Process ID
- Action buttons (Start, Stop, Restart)
- Last status update time

**Features:**
- Calls `/api/scraper/control?action=start|stop|restart`
- Auto-refreshes status after action
- Shows loading state during operation
- Displays error messages

### Integration with Dashboard

```javascript
// In app/page.js
<div className="main-layout">
  <ScraperControls
    status={status}
    onStatusChange={setStatus}
  />
  <StatusDashboard status={status} config={config} />
</div>
```

## API Reference

### Control Endpoints

#### Start Scraper
```bash
POST /api/scraper/control?action=start
```

Response:
```json
{
  "success": true,
  "message": "Scraper started successfully",
  "pid": 12345
}
```

#### Stop Scraper
```bash
POST /api/scraper/control?action=stop
```

Response:
```json
{
  "success": true,
  "message": "Scraper stopped successfully"
}
```

#### Restart Scraper
```bash
POST /api/scraper/control?action=restart
```

Response:
```json
{
  "success": true,
  "message": "Scraper restarted successfully",
  "pid": 12346
}
```

#### Get Process Status
```bash
GET /api/scraper/control
```

Response:
```json
{
  "running": true,
  "pid": 12345,
  "processStarted": true,
  "lastStatusUpdate": "2024-03-04T10:31:05.456Z"
}
```

### Log Endpoints

#### Get Logs
```bash
GET /api/scraper/logs?lines=100
```

Response:
```json
{
  "logs": [
    "[2024-03-04T10:30:45.123Z] 🌐 Browser initialized",
    "...",
  ],
  "total": 245
}
```

#### Clear Logs
```bash
DELETE /api/scraper/logs
```

Response:
```json
{
  "success": true,
  "message": "Logs cleared"
}
```

## File Structure

```
root/
├── scraper.js                      (Original scraper - spawned by API)
├── scraper-config.json             (Auto-created, persisted)
├── scraper-status.json             (Auto-created, updated by API)
├── scraper.pid                     (Process ID, auto-created)
├── scraper.log                     (Scraper output, auto-created)
│
├── app/
│   └── api/
│       └── scraper/
│           ├── control/route.js    (✨ NEW - Process control)
│           ├── config/route.js     (Updated)
│           ├── status/route.js     (Updated)
│           ├── logs/route.js       (Updated)
│           └── run/route.js        (Original)
│
└── components/
    └── ScraperControls.js          (✨ NEW - UI Controls)
```

## Key Changes

### What's New
- ✨ **Process Management** - Start/stop/restart scraper from UI
- ✨ **ScraperControls Component** - UI for process control
- ✨ **Live Process Status** - Real-time PID and status
- ✨ **Log Streaming** - Scraper output to file
- ✨ **Graceful Shutdown** - 5-second SIGINT timeout before force kill

### What's Different
- **No separate service process** - Service layer is in Next.js API routes
- **Single command to start** - `npm start` runs dashboard + service
- **Simplified architecture** - All in one Next.js app
- **No external dependencies** - Removed express, cors, concurrently

### What's Unchanged
- ✓ Scraper.js still works the same way
- ✓ Configuration management still the same
- ✓ Dashboard UI is unchanged
- ✓ All filtering and status features work the same

## Error Handling

### Process Won't Start
- Check if port 3000 is available
- Check if `scraper.js` exists
- Check file permissions
- Review `scraper.log` for errors

### Process Shows as Running but Not Scraping
- Check if config is enabled: `config.enabled = true`
- Check scraper logs for errors
- Verify interval is set correctly

### Can't Stop Scraper
- API attempts SIGINT (graceful) for 5 seconds
- Falls back to SIGKILL (force) if needed
- Check for zombie processes: `ps aux | grep node`

## Auto-Start Configuration

The scraper auto-starts on dashboard startup if configured:

```json
// In scraper-config.json
{
  "enabled": true  // ← Set to true to auto-start
}
```

Enable/disable toggle is in the **Scheduling** panel of the dashboard.

## Monitoring & Logs

### View Recent Logs
```bash
tail -f scraper.log
```

### View in Dashboard
- Check browser developer console
- View via API: `GET /api/scraper/logs?lines=50`

### Log Rotation
Logs are appended to `scraper.log`. To clear:
- `DELETE /api/scraper/logs`
- Or manually: `rm scraper.log`

## Process Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    User Clicks "Start"                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│         POST /api/scraper/control?action=start              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│    Spawn child process: node scraper.js                     │
│    Save PID to scraper.pid                                  │
│    Pipe stdout/stderr to scraper.log                        │
│    Set status.running = true                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│    Scraper.js runs independently                            │
│    Reads config every interval                              │
│    Writes status after each scrape                          │
│    Logs to scraper.log via pipe                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    (User clicks "Stop")
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│      POST /api/scraper/control?action=stop                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│    Send SIGINT to process (graceful shutdown)               │
│    Wait up to 5 seconds for exit                            │
│    If still running, send SIGKILL (force)                  │
│    Clear PID file                                           │
│    Set status.running = false                               │
└─────────────────────────────────────────────────────────────┘
```

## Configuration Changes During Runtime

When you change configuration from the dashboard:

1. Dashboard saves to `scraper-config.json` via `/api/scraper/config`
2. Scraper reads config on next interval
3. Changes take effect immediately (no restart needed)
4. To make changes take effect sooner, click "Run Now"

## Tips & Best Practices

1. **Always use the UI** - Don't start scraper.js manually
2. **Check status regularly** - Dashboard shows real-time status
3. **Review logs** - Check `scraper.log` for debugging
4. **Graceful shutdown** - Use "Stop" button, not force kill
5. **Clear old logs** - Logs grow over time, clear periodically
6. **Enable in config** - Set `enabled: true` to auto-start

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Scraper is already running" | Kill existing process or check `scraper.pid` |
| "Failed to start scraper" | Check `scraper.log`, ensure `scraper.js` exists |
| Process stuck after stop | Use "Restart" or manually: `rm scraper.pid` |
| Dashboard shows PID but no output | Check if process is zombie, restart |
| Config changes not applying | Wait for next interval or click "Run Now" |

---

**Summary:** The service layer is now fully integrated into Next.js. Start the dashboard with `npm start` and control the scraper directly from the UI. No separate services needed!
