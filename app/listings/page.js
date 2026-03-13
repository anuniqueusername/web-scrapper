'use client';

import { useState, useEffect, useCallback } from 'react';
import ResultsFilter from '@/components/ResultsFilter';
import ListingsTable from '@/components/ListingsTable';
import styles from './Listings.module.css';

const TABS = [
  { key: 'kijiji',   label: 'Kijiji',   icon: 'fas fa-tag' },
  { key: 'facebook', label: 'Facebook', icon: 'fab fa-facebook-f' },
  { key: 'all',      label: 'All',      icon: 'fas fa-layer-group' },
];

export default function ListingsPage() {
  const [activeTab, setActiveTab] = useState('kijiji');

  const [kijijiListings, setKijijiListings]     = useState([]);
  const [facebookListings, setFacebookListings] = useState([]);

  const [filteredListings, setFilteredListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    minPrice: '',
    maxPrice: '',
    sortBy: 'newest',
  });

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    loadAllListings();
  }, []);

  async function loadAllListings() {
    setLoading(true);
    try {
      const [kijRes, fbRes] = await Promise.all([
        fetch('/api/listings'),
        fetch('/api/facebook/listings'),
      ]);

      if (kijRes.ok) {
        const data = await kijRes.json();
        // Tag every Kijiji listing with source so "All" tab has it
        const tagged = (data.listings || []).map(l => ({ ...l, source: 'kijiji' }));
        setKijijiListings(tagged);
      }

      if (fbRes.ok) {
        const data = await fbRes.json();
        setFacebookListings(data.listings || []);
      }
    } catch (error) {
      console.error('Error loading listings:', error);
    } finally {
      setLoading(false);
    }
  }

  // ── Filtering / sorting ───────────────────────────────────────────────────

  const applyFilters = useCallback(() => {
    // Select source pool
    let pool;
    if (activeTab === 'kijiji')       pool = kijijiListings;
    else if (activeTab === 'facebook') pool = facebookListings;
    else                               pool = [...kijijiListings, ...facebookListings];

    let filtered = [...pool];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(
        l =>
          l.title?.toLowerCase().includes(q) ||
          l.description?.toLowerCase().includes(q) ||
          l.location?.toLowerCase().includes(q) ||
          l.city?.toLowerCase().includes(q)
      );
    }

    if (filters.minPrice) {
      const min = parseFloat(filters.minPrice);
      filtered = filtered.filter(l => {
        const p = parseFloat(l.price?.replace(/[^0-9.-]/g, '') || 0);
        return p >= min;
      });
    }

    if (filters.maxPrice) {
      const max = parseFloat(filters.maxPrice);
      filtered = filtered.filter(l => {
        const p = parseFloat(l.price?.replace(/[^0-9.-]/g, '') || 0);
        return p <= max;
      });
    }

    if (filters.sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.scrapedAt) - new Date(a.scrapedAt));
    } else if (filters.sortBy === 'price-asc') {
      filtered.sort((a, b) => {
        const pa = parseFloat(a.price?.replace(/[^0-9.-]/g, '') || 0);
        const pb = parseFloat(b.price?.replace(/[^0-9.-]/g, '') || 0);
        return pa - pb;
      });
    } else if (filters.sortBy === 'price-desc') {
      filtered.sort((a, b) => {
        const pa = parseFloat(a.price?.replace(/[^0-9.-]/g, '') || 0);
        const pb = parseFloat(b.price?.replace(/[^0-9.-]/g, '') || 0);
        return pb - pa;
      });
    }

    setFilteredListings(filtered);
  }, [activeTab, kijijiListings, facebookListings, filters]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // ── Counts for stat bar ───────────────────────────────────────────────────

  const totalForTab =
    activeTab === 'kijiji'
      ? kijijiListings.length
      : activeTab === 'facebook'
      ? facebookListings.length
      : kijijiListings.length + facebookListings.length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.listings}>
      <header className={styles.header}>
        <h1><i className="fas fa-list"></i> Listings</h1>
        <p>View and filter scraped listings</p>
      </header>

      {/* Source tabs */}
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <i className={tab.icon} />
            {tab.label}
            <span className={styles.tabCount}>
              {tab.key === 'kijiji'
                ? kijijiListings.length
                : tab.key === 'facebook'
                ? facebookListings.length
                : kijijiListings.length + facebookListings.length}
            </span>
          </button>
        ))}
      </div>

      <div className={styles.container}>
        <aside className={styles.sidebar}>
          <ResultsFilter
            filters={filters}
            onFilterChange={setFilters}
          />
        </aside>

        <main className={styles.main}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.label}>Total:</span>
              <span className={styles.value}>{totalForTab}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.label}>Filtered:</span>
              <span className={styles.value}>{filteredListings.length}</span>
            </div>
            {activeTab === 'all' && (
              <div className={styles.stat}>
                <span className={styles.label}>Kijiji:</span>
                <span className={styles.value}>{kijijiListings.length}</span>
              </div>
            )}
            {activeTab === 'all' && (
              <div className={styles.stat}>
                <span className={styles.label}>Facebook:</span>
                <span className={styles.value}>{facebookListings.length}</span>
              </div>
            )}
          </div>

          {loading ? (
            <div className={styles.loading}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }} />
              Loading listings...
            </div>
          ) : filteredListings.length === 0 ? (
            <div className={styles.empty}>
              <p>No listings found</p>
              <small>Try adjusting your filters or switching tabs</small>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <ListingsTable
                listings={filteredListings}
                showSource={activeTab === 'all'}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
