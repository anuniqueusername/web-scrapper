import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
}

/* OLD CODE - Kept as reference
'use client';

import { useState, useEffect } from 'react';
import SearchParameters from '@/components/SearchParameters';
import ScraperScheduling from '@/components/ScraperScheduling';
import ScraperControls from '@/components/ScraperControls';
import ResultsFilter from '@/components/ResultsFilter';
import StatusDashboard from '@/components/StatusDashboard';
import ListingsTable from '@/components/ListingsTable';

export function OldHome() {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    minPrice: '',
    maxPrice: '',
    sortBy: 'newest',
  });

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  // Auto-refresh status every 5 seconds (only status, not listings)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [configRes, statusRes, listingsRes] = await Promise.all([
        fetch('/api/scraper/config'),
        fetch('/api/scraper/status'),
        fetch('/api/listings'),
      ]);

      if (configRes.ok) setConfig(await configRes.json());
      if (statusRes.ok) setStatus(await statusRes.json());
      if (listingsRes.ok) {
        const data = await listingsRes.json();
        setListings(data.listings || []);
      }
    } catch (error) {
      showMessage('Failed to load data: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus() {
    try {
      // Only refresh status, not listings (reduce API calls)
      const [statusRes, controlRes] = await Promise.all([
        fetch('/api/scraper/status'),
        fetch('/api/scraper/control'),
      ]);

      if (statusRes.ok) {
        const newStatus = await statusRes.json();
        setStatus(newStatus);
      }

      if (controlRes.ok) {
        const controlStatus = await controlRes.json();
        // Merge control status with scraper status
        setStatus(prev => ({ ...prev, ...controlStatus }));
      }
    } catch (error) {
      // Silent fail for auto-refresh
    }
  }

  function showMessage(text, type = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }

  async function handleConfigUpdate(newConfig) {
    try {
      const res = await fetch('/api/scraper/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });

      if (res.ok) {
        const updated = await res.json();
        setConfig(updated.config);
        showMessage('Configuration saved successfully');
        loadData(); // Refresh data
      } else {
        showMessage('Failed to save configuration', 'error');
      }
    } catch (error) {
      showMessage('Error: ' + error.message, 'error');
    }
  }

  async function handleRunScraper() {
    try {
      const res = await fetch('/api/scraper/run', { method: 'POST' });
      if (res.ok) {
        showMessage('Scraper triggered successfully');
        setTimeout(loadData, 2000);
      } else {
        showMessage('Failed to trigger scraper', 'error');
      }
    } catch (error) {
      showMessage('Error: ' + error.message, 'error');
    }
  }

  async function handleFilterChange(newFilters) {
    setFilters(newFilters);
    // Fetch with filters applied
    try {
      const params = new URLSearchParams();
      if (newFilters.search) params.set('search', newFilters.search);
      if (newFilters.minPrice) params.set('minPrice', newFilters.minPrice);
      if (newFilters.maxPrice) params.set('maxPrice', newFilters.maxPrice);
      if (newFilters.sortBy) params.set('sortBy', newFilters.sortBy);

      const res = await fetch(`/api/listings?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings || []);
      }
    } catch (error) {
      showMessage('Error filtering listings: ' + error.message, 'error');
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="header">
          <h1>Scraper Manager</h1>
          <p>Manage search parameters, scheduling, and results</p>
        </div>
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🔍 Scraper Manager</h1>
        <p>Manage search parameters, scheduling, and results</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="main-layout">
        <SearchParameters
          config={config}
          onUpdate={handleConfigUpdate}
        />
        <ScraperScheduling
          config={config}
          status={status}
          onUpdate={handleConfigUpdate}
          onRun={handleRunScraper}
        />
      </div>

      <div className="main-layout">
        <ScraperControls
          status={status}
          onStatusChange={setStatus}
        />
        <StatusDashboard status={status} config={config} />
      </div>

      <div className="card">
        <ResultsFilter
          filters={filters}
          onFilterChange={handleFilterChange}
        />

        <ListingsTable listings={listings} />
      </div>
    </div>
  );
}
*/
