import { spawnFacebookScraper } from '@/lib/spawn-facebook-scraper';

export async function POST(request) {
  try {
    const { mode = 'all' } = await request.json();

    const validModes = ['single', 'multi', 'all'];
    if (!validModes.includes(mode)) {
      return Response.json(
        { success: false, message: 'Invalid mode. Use: single, multi, or all' },
        { status: 400 }
      );
    }

    const { pid } = spawnFacebookScraper(mode);

    const modeLabel = {
      single: 'Toronto only',
      multi: 'Top 9 Ontario cities',
      all: 'All 29 Ontario cities',
    };

    return Response.json({
      success: true,
      message: `Facebook scraper started (${modeLabel[mode]})`,
      mode,
      pid,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
