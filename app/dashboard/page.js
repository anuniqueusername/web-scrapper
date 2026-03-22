'use client';

import { useState, useEffect } from 'react';
import StatusDashboard from '@/components/StatusDashboard';
import ScraperControls from '@/components/ScraperControls';
import ScraperLogs from '@/components/ScraperLogs';
import FacebookScraper from '@/components/FacebookScraper';
import styles from './Dashboard.module.css';

function getStatusLabel(status, type) {
  if (type === 'kijiji') {
    if (status?.running || status?.processStarted) return { label: 'Running', color: 'running' };
    if (status?.enabled === false) return { label: 'Disabled', color: 'disabled' };

    // Check if scheduled to run
    if (status?.nextRun && new Date(status.nextRun) > new Date()) {
      return { label: 'Scheduled', color: 'scheduled' };
    }

    return { label: 'Idle', color: 'idle' };
  }
  // facebook
  if (status?.running || status?.processStarted) return { label: 'Running', color: 'running' };
  if (status?.nextRun && new Date(status.nextRun) > new Date()) {
    return { label: 'Scheduled', color: 'scheduled' };
  }
  return { label: 'Idle', color: 'idle' };
}

function ScraperSelectorCard({ type, label, icon, status, totalListings, lastRun, selected, onClick }) {
  const badge = getStatusLabel(status, type);
  return (
    <button
      className={`${styles.selectorCard} ${selected ? styles.selectorCardSelected : styles.selectorCardUnselected}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <div className={styles.selectorCardHeader}>
        <span className={styles.selectorCardIcon}>
          <i className={icon}></i>
        </span>
        <span className={styles.selectorCardName}>{label}</span>
        <span className={`${styles.selectorBadge} ${styles[`badge${badge.color.charAt(0).toUpperCase() + badge.color.slice(1)}`]}`}>
          <i className="fas fa-circle" style={{ fontSize: '0.55em', marginRight: '5px' }}></i>
          {badge.label}
        </span>
      </div>
      <div className={styles.selectorCardMeta}>
        <div className={styles.selectorMetaItem}>
          <span className={styles.selectorMetaLabel}>Listings</span>
          <span className={styles.selectorMetaValue}>{totalListings ?? 0}</span>
        </div>
        <div className={styles.selectorMetaItem}>
          <span className={styles.selectorMetaLabel}>Last Run</span>
          <span className={styles.selectorMetaValue}>
            {lastRun ? new Date(lastRun).toLocaleTimeString() : 'Never'}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const [selectedScraper, setSelectedScraper] = useState('kijiji');
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [facebookStatus, setFacebookStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshStatus();
    }, 10000); // Increased from 5s to 10s to reduce API polling overhead
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [configRes, statusRes, facebookRes] = await Promise.all([
        fetch('/api/scraper/config'),
        fetch('/api/scraper/status'),
        fetch('/api/facebook/status'),
      ]);

      if (configRes.ok) setConfig(await configRes.json());
      if (statusRes.ok) setStatus(await statusRes.json());
      if (facebookRes.ok) setFacebookStatus(await facebookRes.json());
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus() {
    try {
      const [statusRes, controlRes, facebookRes] = await Promise.all([
        fetch('/api/scraper/status'),
        fetch('/api/scraper/control'),
        fetch('/api/facebook/status'),
      ]);

      if (statusRes.ok) {
        const newStatus = await statusRes.json();
        setStatus(newStatus);
      }
      if (controlRes.ok) {
        const controlStatus = await controlRes.json();
        setStatus(prev => ({ ...prev, ...controlStatus }));
      }
      if (facebookRes.ok) {
        setFacebookStatus(await facebookRes.json());
      }
    } catch (error) {
      console.error('Error refreshing status:', error);
    }
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
      }
    } catch (error) {
      console.error('Error updating config:', error);
    }
  }

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1><i className="fas fa-chart-line"></i> Dashboard</h1>
        <p>Monitor your scrapers in real-time</p>
      </header>

      {/* Scraper selector cards */}
      <div className={styles.selectorRow}>
        <ScraperSelectorCard
          type="kijiji"
          label="Kijiji"
          icon="fas fa-spider"
          status={status}
          totalListings={status?.totalListings}
          lastRun={status?.lastRun}
          selected={selectedScraper === 'kijiji'}
          onClick={() => setSelectedScraper('kijiji')}
        />
        <ScraperSelectorCard
          type="facebook"
          label="Facebook Marketplace"
          icon="fab fa-facebook"
          status={facebookStatus}
          totalListings={facebookStatus?.totalListings}
          lastRun={facebookStatus?.lastRun}
          selected={selectedScraper === 'facebook'}
          onClick={() => setSelectedScraper('facebook')}
        />
      </div>

      {/* Controls row — kept below cards, per-scraper */}
      <div className={styles.controlsRow}>
        {selectedScraper === 'kijiji' ? (
          <ScraperControls
            status={status}
            onStatusChange={(newStatus) => setStatus(newStatus)}
          />
        ) : (
          <FacebookScraper
            status={facebookStatus}
            onStatusChange={(newStatus) => setFacebookStatus(newStatus)}
          />
        )}
      </div>

      {/* Status — driven by selectedScraper */}
      <StatusDashboard
        selectedScraper={selectedScraper}
        status={status}
        config={config}
      />

      {/* Logs — driven by selectedScraper */}
      <div className={styles.logsRow}>
        <ScraperLogs selectedScraper={selectedScraper} />
      </div>
    </div>
  );
}
