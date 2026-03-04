import fs from 'fs';
import path from 'path';

const LISTINGS_FILE = path.join(process.cwd(), 'data', 'listings.json');

function loadListings() {
  try {
    if (fs.existsSync(LISTINGS_FILE)) {
      const data = fs.readFileSync(LISTINGS_FILE, 'utf-8');
      return Array.isArray(JSON.parse(data)) ? JSON.parse(data) : [];
    }
  } catch (error) {
    console.error('Error loading listings:', error);
  }
  return [];
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const listings = loadListings();

    // Apply filters
    let filtered = listings;

    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sortBy');

    if (minPrice) {
      const min = parseFloat(minPrice);
      filtered = filtered.filter(l => {
        const price = parseFloat(l.price?.replace(/[^0-9.-]/g, '') || 0);
        return price >= min;
      });
    }

    if (maxPrice) {
      const max = parseFloat(maxPrice);
      filtered = filtered.filter(l => {
        const price = parseFloat(l.price?.replace(/[^0-9.-]/g, '') || 0);
        return price <= max;
      });
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        l =>
          (l.title?.toLowerCase().includes(searchLower) ||
            l.location?.toLowerCase().includes(searchLower) ||
            l.description?.toLowerCase().includes(searchLower)) ?? false
      );
    }

    // Sort
    if (sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.scrapedAt) - new Date(a.scrapedAt));
    } else if (sortBy === 'price-low') {
      filtered.sort((a, b) => {
        const priceA = parseFloat(a.price?.replace(/[^0-9.-]/g, '') || 0);
        const priceB = parseFloat(b.price?.replace(/[^0-9.-]/g, '') || 0);
        return priceA - priceB;
      });
    } else if (sortBy === 'price-high') {
      filtered.sort((a, b) => {
        const priceA = parseFloat(a.price?.replace(/[^0-9.-]/g, '') || 0);
        const priceB = parseFloat(b.price?.replace(/[^0-9.-]/g, '') || 0);
        return priceB - priceA;
      });
    }

    return Response.json({
      total: listings.length,
      filtered: filtered.length,
      listings: filtered,
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 400 }
    );
  }
}
