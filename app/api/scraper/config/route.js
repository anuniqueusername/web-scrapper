import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'scraper-config.json');

function getDefaultConfig() {
  return {
    url: 'https://www.kijiji.ca/b-canada/vending-machine/k0l0?view=list',
    interval: 60000,
    enabled: false,
    scrapeAllPages: false,
    alertMode: 'newOnly',
    discord: {
      enabled: true,
      webhookUrl: '',
    },
    slack: {
      enabled: false,
      webhookUrl: '',
    },
    filters: {
      minPrice: null,
      maxPrice: null,
      location: null,
      keywords: [],
    },
    createdAt: new Date().toISOString(),
  };
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return getDefaultConfig();
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

export async function GET() {
  const config = loadConfig();
  return Response.json(config);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const config = loadConfig();

    // Check if critical settings changed (URL or scrapeAllPages mode)
    const urlChanged = body.url && body.url !== config.url;
    const modeChanged = body.scrapeAllPages !== undefined && body.scrapeAllPages !== config.scrapeAllPages;
    const shouldStop = urlChanged || modeChanged;

    // Update config with new values, but preserve 'enabled' state if not explicitly set
    const updated = {
      ...config,
      ...body,
      updatedAt: new Date().toISOString(),
    };

    // If user didn't explicitly change 'enabled', keep the current state
    if (!body.hasOwnProperty('enabled')) {
      updated.enabled = config.enabled;
    }

    if (saveConfig(updated)) {
      // If critical config changed, trigger a restart
      if (shouldStop) {
        // Send restart in response message, let client trigger it
        // This ensures the scraper restarts with the new config loaded from disk
      }

      return Response.json({
        success: true,
        config: updated,
        message: shouldStop ? 'Configuration saved. Scraper will use new settings on next run.' : 'Configuration saved successfully',
        shouldRestart: shouldStop,
      });
    } else {
      return Response.json(
        { success: false, message: 'Failed to save configuration' },
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
