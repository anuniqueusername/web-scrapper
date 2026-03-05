import fs from 'fs';
import path from 'path';

const PID_FILE = path.join(process.cwd(), 'scraper.pid');

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

function isProcessRunning(pid) {
  try {
    if (!pid) return false;
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

export async function POST(request) {
  try {
    // Check if scraper is running
    const pid = getPid();
    const isRunning = pid && isProcessRunning(pid);

    if (!isRunning) {
      return Response.json(
        {
          success: false,
          message: 'Scraper is not running. Click "Start Scraper" in Scraper Controls first.',
        },
        { status: 400 }
      );
    }

    // Scraper is running, just record that a manual run was requested
    // The scraper will pick up the next scheduled interval
    console.log('[API] Manual scraper run requested');

    return Response.json({
      success: true,
      message: 'Scraper will run on next interval (or wait for scheduled time)',
      timestamp: new Date().toISOString(),
      isRunning: true,
      pid: pid,
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 400 }
    );
  }
}
