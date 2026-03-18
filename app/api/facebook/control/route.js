// Server-only guard: causes a build error if this module is accidentally
// imported by a Client Component.
import 'server-only';

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const FACEBOOK_PID_FILE = path.join(process.cwd(), 'facebook-scraper.pid');
const FACEBOOK_LOG_FILE = path.join(process.cwd(), 'facebook-scraper.log');
const FACEBOOK_STATUS_FILE = path.join(process.cwd(), 'facebook-scraper-status.json');

let facebookProcess = null;

function savePid(pid) {
  try {
    fs.writeFileSync(FACEBOOK_PID_FILE, pid.toString());
  } catch (error) {
    console.error('[Facebook API] Error saving PID:', error.message);
  }
}

function getPid() {
  try {
    if (fs.existsSync(FACEBOOK_PID_FILE)) {
      return parseInt(fs.readFileSync(FACEBOOK_PID_FILE, 'utf-8'), 10);
    }
  } catch (error) {
    console.error('[Facebook API] Error reading PID:', error.message);
  }
  return null;
}

function clearPid() {
  try {
    if (fs.existsSync(FACEBOOK_PID_FILE)) {
      fs.unlinkSync(FACEBOOK_PID_FILE);
    }
  } catch (error) {
    console.error('[Facebook API] Error clearing PID:', error.message);
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
    fs.writeFileSync(FACEBOOK_STATUS_FILE, JSON.stringify(newStatus, null, 2));
  } catch (error) {
    console.error('[Facebook API] Error updating status:', error.message);
  }
}

function loadStatus() {
  try {
    if (fs.existsSync(FACEBOOK_STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(FACEBOOK_STATUS_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('[Facebook API] Error loading status:', error.message);
  }
  return {
    running: false,
    pid: null,
    processStarted: false,
  };
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const mode = searchParams.get('mode') || 'all';

  if (!action || !['start', 'stop', 'restart'].includes(action)) {
    return Response.json(
      { success: false, message: 'Invalid action. Use: start, stop, or restart' },
      { status: 400 }
    );
  }

  try {
    if (action === 'start') {
      return await handleStart(mode);
    } else if (action === 'stop') {
      return await handleStop();
    } else if (action === 'restart') {
      return await handleRestart(mode);
    }
  } catch (error) {
    console.error('[Facebook API] Error:', error.message);
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

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

    const fileStatus = loadStatus();
    const merged = { ...fileStatus, ...status };

    return Response.json(merged);
  } catch (error) {
    console.error('[Facebook API] Error getting status:', error.message);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

async function handleStart(mode = 'all') {
  if (facebookProcess) {
    return Response.json(
      { success: false, message: 'Facebook scraper is already running' },
      { status: 400 }
    );
  }

  const pid = getPid();
  if (pid && isProcessRunning(pid)) {
    facebookProcess = { pid };
    return Response.json({
      success: true,
      message: 'Facebook scraper is already running',
      pid,
    });
  }

  try {
    console.log('[Facebook API] Starting Facebook scraper...');

    facebookProcess = spawn('node', [path.join(process.cwd(), 'facebook-worker-runner.js')], {
      cwd: process.cwd(),
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FACEBOOK_MODE: mode }
    });

    savePid(facebookProcess.pid);

    const logStream = fs.createWriteStream(FACEBOOK_LOG_FILE, { flags: 'a' });
    facebookProcess.stdout.pipe(logStream);
    facebookProcess.stdout.pipe(process.stdout);
    facebookProcess.stderr.pipe(logStream);
    facebookProcess.stderr.pipe(process.stderr);

    facebookProcess.on('exit', (code, signal) => {
      console.log(`[Facebook API] Process exited with code ${code}, signal ${signal}`);
      facebookProcess = null;
      clearPid();
      updateStatus({ running: false, processStarted: false });
    });

    updateStatus({ running: true, processStarted: true, mode });

    console.log(`[Facebook API] Facebook scraper started with PID ${facebookProcess.pid}`);

    return Response.json({
      success: true,
      message: 'Facebook scraper started successfully',
      pid: facebookProcess.pid,
    });
  } catch (error) {
    console.error('[Facebook API] Error starting scraper:', error.message);
    return Response.json(
      { success: false, message: `Failed to start scraper: ${error.message}` },
      { status: 500 }
    );
  }
}

async function handleStop() {
  if (!facebookProcess) {
    const pid = getPid();
    if (!pid) {
      return Response.json(
        { success: false, message: 'Facebook scraper is not running' },
        { status: 400 }
      );
    }

    try {
      process.kill(pid, 'SIGINT');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        console.error('[Facebook API] Error killing process:', error.message);
      }
    }

    clearPid();
    updateStatus({ running: false, processStarted: false });
    return Response.json({
      success: true,
      message: 'Facebook scraper stopped successfully',
    });
  }

  try {
    console.log('[Facebook API] Stopping Facebook scraper...');

    try {
      facebookProcess.kill('SIGINT');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (facebookProcess) {
          console.log('[Facebook API] Force killing Facebook scraper...');
          try {
            facebookProcess.kill('SIGKILL');
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

      if (facebookProcess) {
        facebookProcess.once('exit', exitListener);
      } else {
        resolve();
      }
    });

    facebookProcess = null;
    clearPid();
    updateStatus({ running: false, processStarted: false });

    console.log('[Facebook API] Facebook scraper stopped successfully');

    return Response.json({
      success: true,
      message: 'Facebook scraper stopped successfully',
    });
  } catch (error) {
    console.error('[Facebook API] Error stopping scraper:', error.message);
    return Response.json(
      { success: false, message: `Failed to stop scraper: ${error.message}` },
      { status: 500 }
    );
  }
}

async function handleRestart(mode = 'all') {
  try {
    console.log('[Facebook API] Restarting Facebook scraper...');

    await handleStop();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return await handleStart(mode);
  } catch (error) {
    console.error('[Facebook API] Error restarting scraper:', error.message);
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
