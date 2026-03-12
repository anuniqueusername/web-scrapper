import fs from 'fs';
import path from 'path';

const STATUS_FILE = path.join(process.cwd(), 'facebook-scraper-status.json');
const LISTINGS_FILE = path.join(process.cwd(), 'data', 'facebook-listings.json');

function getDefaultStatus() {
  return {
    running: false,
    lastRun: null,
    lastRunDuration: null,
    totalListings: 0,
    newListingsLastRun: 0,
    errors: [],
  };
}

function loadStatus() {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const data = fs.readFileSync(STATUS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading Facebook status:', error);
  }
  return getDefaultStatus();
}

function getFacebookListingCount() {
  try {
    if (fs.existsSync(LISTINGS_FILE)) {
      const data = fs.readFileSync(LISTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed.length : 0;
    }
  } catch (error) {
    // ignore
  }
  return 0;
}

export async function GET() {
  const status = loadStatus();
  // Augment with live listing count from file
  const totalListings = getFacebookListingCount();
  return Response.json({ ...status, totalListings });
}
