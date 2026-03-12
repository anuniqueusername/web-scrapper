'use client';

import { useState, useEffect } from 'react';
import ResultsFilter from '@/components/ResultsFilter';
import ListingsTable from '@/components/ListingsTable';
import styles from './Listings.module.css';

export default function ListingsPage() {
  const [listings, setListings] = useState([]);
  const [filteredListings, setFilteredListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    minPrice: '',
    maxPrice: '',
    sortBy: 'newest',
  });

  useEffect(() => {
    loadListings();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [listings, filters]);

  async function loadListings() {
    try {
      setLoading(true);
      const res = await fetch('/api/listings');
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings || []);
      }
    } catch (error) {
      console.error('Error loading listings:', error);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    let filtered = [...listings];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.title?.toLowerCase().includes(searchLower) ||
          l.description?.toLowerCase().includes(searchLower)
      );
    }

    // Price filters
    if (filters.minPrice) {
      const minPrice = parseFloat(filters.minPrice);
      filtered = filtered.filter((l) => {
        const price = parseFloat(l.price?.replace('$', '').replace(',', '') || 0);
        return price >= minPrice;
      });
    }

    if (filters.maxPrice) {
      const maxPrice = parseFloat(filters.maxPrice);
      filtered = filtered.filter((l) => {
        const price = parseFloat(l.price?.replace('$', '').replace(',', '') || 0);
        return price <= maxPrice;
      });
    }

    // Sorting
    if (filters.sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.scrapedAt) - new Date(a.scrapedAt));
    } else if (filters.sortBy === 'price-asc') {
      filtered.sort((a, b) => {
        const priceA = parseFloat(a.price?.replace('$', '').replace(',', '') || 0);
        const priceB = parseFloat(b.price?.replace('$', '').replace(',', '') || 0);
        return priceA - priceB;
      });
    } else if (filters.sortBy === 'price-desc') {
      filtered.sort((a, b) => {
        const priceA = parseFloat(a.price?.replace('$', '').replace(',', '') || 0);
        const priceB = parseFloat(b.price?.replace('$', '').replace(',', '') || 0);
        return priceB - priceA;
      });
    }

    setFilteredListings(filtered);
  }

  function handleFilterChange(newFilters) {
    setFilters(newFilters);
  }

  return (
    <div className={styles.listings}>
      <header className={styles.header}>
        <h1><i className="fas fa-list"></i> Listings</h1>
        <p>View and filter scraped listings</p>
      </header>

      <div className={styles.container}>
        <aside className={styles.sidebar}>
          <ResultsFilter
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </aside>

        <main className={styles.main}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.label}>Total:</span>
              <span className={styles.value}>{listings.length}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.label}>Filtered:</span>
              <span className={styles.value}>{filteredListings.length}</span>
            </div>
          </div>

          {loading ? (
            <div className={styles.loading}>Loading listings...</div>
          ) : filteredListings.length === 0 ? (
            <div className={styles.empty}>
              <p>No listings found</p>
              <small>Try adjusting your filters</small>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <ListingsTable listings={filteredListings} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
