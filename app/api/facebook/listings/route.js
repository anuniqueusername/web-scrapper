import fs from 'fs';
import path from 'path';

const FACEBOOK_LISTINGS_FILE = path.join(process.cwd(), 'data', 'facebook-listings.json');

function loadFacebookListings() {
  try {
    if (fs.existsSync(FACEBOOK_LISTINGS_FILE)) {
      const data = fs.readFileSync(FACEBOOK_LISTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (error) {
    console.error('Error loading facebook listings:', error);
  }
  return [];
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    let listings = loadFacebookListings();

    // Normalise: ensure every record has source = 'facebook'
    listings = listings.map(l => ({ ...l, source: 'facebook' }));

    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sortBy');

    if (minPrice) {
      const min = parseFloat(minPrice);
      listings = listings.filter(l => {
        const price = parseFloat(l.price?.replace(/[^0-9.-]/g, '') || 0);
        return price >= min;
      });
    }

    if (maxPrice) {
      const max = parseFloat(maxPrice);
      listings = listings.filter(l => {
        const price = parseFloat(l.price?.replace(/[^0-9.-]/g, '') || 0);
        return price <= max;
      });
    }

    if (search) {
      const searchLower = search.toLowerCase();
      listings = listings.filter(
        l =>
          l.title?.toLowerCase().includes(searchLower) ||
          l.location?.toLowerCase().includes(searchLower) ||
          l.city?.toLowerCase().includes(searchLower) ||
          l.description?.toLowerCase().includes(searchLower)
      );
    }

    if (sortBy === 'newest') {
      listings.sort((a, b) => new Date(b.scrapedAt) - new Date(a.scrapedAt));
    } else if (sortBy === 'price-low') {
      listings.sort((a, b) => {
        const priceA = parseFloat(a.price?.replace(/[^0-9.-]/g, '') || 0);
        const priceB = parseFloat(b.price?.replace(/[^0-9.-]/g, '') || 0);
        return priceA - priceB;
      });
    } else if (sortBy === 'price-high') {
      listings.sort((a, b) => {
        const priceA = parseFloat(a.price?.replace(/[^0-9.-]/g, '') || 0);
        const priceB = parseFloat(b.price?.replace(/[^0-9.-]/g, '') || 0);
        return priceB - priceA;
      });
    }

    return Response.json({
      success: true,
      total: listings.length,
      listings,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
