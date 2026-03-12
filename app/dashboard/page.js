'use client';

import { useState, useEffect } from 'react';
import StatusDashboard from '@/components/StatusDashboard';
import ScraperControls from '@/components/ScraperControls';
import ScraperLogs from '@/components/ScraperLogs';
import FacebookScraper from '@/components/FacebookScraper';
import styles from './Dashboard.module.css';

export default function DashboardPage() {
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
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [configRes, statusRes, facebookRes] = await Promise.all([
        fetch('/api/scraper/config'),
        fetch('/api/scraper/status'),
        fetch('/api/facebook/control'),
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
        fetch('/api/facebook/control'),
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
        const newFacebookStatus = await facebookRes.json();
        setFacebookStatus(newFacebookStatus);
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
        <p>Monitor your Kijiji scraper in real-time</p>
      </header>

      <div className={styles.grid}>
        <ScraperControls
          status={status}
          onStatusChange={(newStatus) => setStatus(newStatus)}
        />

        <FacebookScraper
          status={facebookStatus}
          onStatusChange={(newStatus) => setFacebookStatus(newStatus)}
        />

        <StatusDashboard status={status} />

        <div className={styles.fullWidth}>
          <ScraperLogs />
        </div>
      </div>
    </div>
  );
}
