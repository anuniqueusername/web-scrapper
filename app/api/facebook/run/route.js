import { spawn } from 'child_process';
import path from 'path';

export async function POST(request) {
  try {
    const { mode = 'all' } = await request.json();

    // Validate mode
    const validModes = ['single', 'multi', 'all'];
    if (!validModes.includes(mode)) {
      return Response.json(
        { success: false, message: 'Invalid mode. Use: single, multi, or all' },
        { status: 400 }
      );
    }

    // Start Facebook scraper in background
    const scriptPath = path.join(process.cwd(), 'facebook-worker-runner.js');

    const child = spawn('node', [scriptPath], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, FACEBOOK_MODE: mode }
    });

    child.unref();

    const modeLabel = {
      single: 'Toronto only',
      multi: 'Top 9 Ontario cities',
      all: 'All 29 Ontario cities'
    };

    return Response.json({
      success: true,
      message: `Facebook scraper started (${modeLabel[mode]})`,
      mode,
      pid: child.pid,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
