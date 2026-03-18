// Server-only guard: causes a build error if this module is accidentally
// imported by a Client Component.
import 'server-only';

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const PID_FILE = path.join(process.cwd(), 'scraper.pid');
const LOG_FILE = path.join(process.cwd(), 'scraper.log');
const CONFIG_FILE = path.join(process.cwd(), 'scraper-config.json');
const STATUS_FILE = path.join(process.cwd(), 'scraper-status.json');

// Global process reference (per server instance)
let scraperProcess = null;

function savePid(pid) {
  try {
    fs.writeFileSync(PID_FILE, pid.toString());
  } catch (error) {
    console.error('[API] Error saving PID:', error.message);
  }
}

function getPid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      return parseInt(fs.readFileSync(PID_FILE, 'utf-8'), 10);
    }
  } catch (error) {
    console.error('[API] Error reading PID:', error.message);
  }
  return null;
}

function clearPid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch (error) {
    console.error('[API] Error clearing PID:', error.message);
  }
}

function updateStatus(update) {
  try {
    const currentStatus = loadStatus();
    const newStatus = {
      ...currentStatus,
      ...update,
      lastStatusUpdate: new Date().toISOString(),
    };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(newStatus, null, 2));
  } catch (error) {
    console.error('[API] Error updating status:', error.message);
  }
}

function loadStatus() {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('[API] Error loading status:', error.message);
  }
  return {
    running: false,
    pid: null,
    processStarted: false,
  };
}

/**
 * POST /api/scraper/control?action=start|stop|restart
 */
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (!action || !['start', 'stop', 'restart'].includes(action)) {
    return Response.json(
      { success: false, message: 'Invalid action. Use: start, stop, or restart' },
      { status: 400 }
    );
  }

  try {
    if (action === 'start') {
      return await handleStart();
    } else if (action === 'stop') {
      return await handleStop();
    } else if (action === 'restart') {
      return await handleRestart();
    }
  } catch (error) {
    console.error('[API] Error:', error.message);
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/scraper/control - Get scraper process status
 */
export async function GET(request) {
  try {
    const pid = getPid();
    const isRunning = pid && isProcessRunning(pid);

    const status = {
      running: isRunning,
      pid: isRunning ? pid : null,
      processStarted: isRunning,
      lastStatusUpdate: new Date().toISOString(),
    };

    // Merge with status file data
    const fileStatus = loadStatus();
    const merged = { ...fileStatus, ...status };

    return Response.json(merged);
  } catch (error) {
    console.error('[API] Error getting status:', error.message);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

async function handleStart() {
  if (scraperProcess) {
    return Response.json(
      { success: false, message: 'Scraper is already running' },
      { status: 400 }
    );
  }

  const pid = getPid();
  if (pid && isProcessRunning(pid)) {
    // Process still running but not in memory, reattach
    scraperProcess = { pid };
    return Response.json({
      success: true,
      message: 'Scraper is already running',
      pid,
    });
  }

  try {
    console.log('[API] Starting scraper...');

    // Spawn scraper process
    scraperProcess = spawn('node', [path.join(process.cwd(), 'scraper.js')], {
      cwd: process.cwd(),
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Save PID
    savePid(scraperProcess.pid);

    // Stream output to both log file and console
    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    scraperProcess.stdout.pipe(logStream);
    scraperProcess.stdout.pipe(process.stdout);
    scraperProcess.stderr.pipe(logStream);
    scraperProcess.stderr.pipe(process.stderr);

    // Handle process exit
    scraperProcess.on('exit', (code, signal) => {
      console.log(`[API] Scraper process exited with code ${code}, signal ${signal}`);
      scraperProcess = null;
      clearPid();
      updateStatus({ running: false, processStarted: false });
    });

    // Update status
    updateStatus({ running: true, processStarted: true });

    console.log(`[API] Scraper started with PID ${scraperProcess.pid}`);

    return Response.json({
      success: true,
      message: 'Scraper started successfully',
      pid: scraperProcess.pid,
    });
  } catch (error) {
    console.error('[API] Error starting scraper:', error.message);
    return Response.json(
      { success: false, message: `Failed to start scraper: ${error.message}` },
      { status: 500 }
    );
  }
}

async function handleStop() {
  if (!scraperProcess) {
    const pid = getPid();
    if (!pid) {
      return Response.json(
        { success: false, message: 'Scraper is not running' },
        { status: 400 }
      );
    }

    // Try to kill existing process
    try {
      process.kill(pid, 'SIGINT');
    } catch (error) {
      // Process already dead, that's fine
      if (error.code !== 'ESRCH') {
        console.error('[API] Error killing process:', error.message);
      }
    }

    clearPid();
    updateStatus({ running: false, processStarted: false });
    return Response.json({
      success: true,
      message: 'Scraper stopped successfully',
    });
  }

  try {
    console.log('[API] Stopping scraper...');

    // Send SIGINT for graceful shutdown
    try {
      scraperProcess.kill('SIGINT');
    } catch (error) {
      // Process already dead, that's fine
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }

    // Wait for process to exit (with timeout)
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (scraperProcess) {
          console.log('[API] Force killing scraper...');
          try {
            scraperProcess.kill('SIGKILL');
          } catch (e) {
            // Already dead
          }
        }
        resolve();
      }, 5000);

      const exitListener = () => {
        clearTimeout(timeout);
        resolve();
      };

      if (scraperProcess) {
        scraperProcess.once('exit', exitListener);
      } else {
        resolve();
      }
    });

    scraperProcess = null;
    clearPid();
    updateStatus({ running: false, processStarted: false });

    console.log('[API] Scraper stopped successfully');

    return Response.json({
      success: true,
      message: 'Scraper stopped successfully',
    });
  } catch (error) {
    console.error('[API] Error stopping scraper:', error.message);
    return Response.json(
      { success: false, message: `Failed to stop scraper: ${error.message}` },
      { status: 500 }
    );
  }
}

async function handleRestart() {
  try {
    console.log('[API] Restarting scraper...');

    const stopReq = new Request(new URL('http://localhost/api/scraper/control?action=stop'));
    const stopResult = await handleStop();

    if (!stopResult.ok) {
      return Response.json(
        { success: false, message: 'Failed to stop scraper during restart' },
        { status: 500 }
      );
    }

    // Wait before restarting
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return await handleStart();
  } catch (error) {
    console.error('[API] Error restarting scraper:', error.message);
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

function isProcessRunning(pid) {
  try {
    // Sending signal 0 tests if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}
