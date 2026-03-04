import fs from 'fs';
import path from 'path';

const STATUS_FILE = path.join(process.cwd(), 'scraper-status.json');

function getDefaultStatus() {
  return {
    running: false,
    lastRun: null,
    lastRunDuration: null,
    nextRun: null,
    totalListings: 0,
    newListingsLastRun: 0,
    errors: [],
    uptime: 0,
  };
}

function loadStatus() {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const data = fs.readFileSync(STATUS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading status:', error);
  }
  return getDefaultStatus();
}

function saveStatus(status) {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving status:', error);
    return false;
  }
}

export async function GET() {
  const status = loadStatus();
  return Response.json(status);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const status = loadStatus();

    const updated = {
      ...status,
      ...body,
    };

    if (saveStatus(updated)) {
      return Response.json({
        success: true,
        status: updated,
      });
    } else {
      return Response.json(
        { success: false, message: 'Failed to update status' },
        { status: 500 }
      );
    }
  } catch (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 400 }
    );
  }
}
