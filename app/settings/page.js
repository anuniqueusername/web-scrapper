'use client';

import { useState, useEffect } from 'react';
import SearchParameters from '@/components/SearchParameters';
import ScraperScheduling from '@/components/ScraperScheduling';
import styles from './Settings.module.css';

export default function SettingsPage() {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

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
      const [configRes, statusRes] = await Promise.all([
        fetch('/api/scraper/config'),
        fetch('/api/scraper/status'),
      ]);

      if (configRes.ok) setConfig(await configRes.json());
      if (statusRes.ok) setStatus(await statusRes.json());
    } catch (error) {
      console.error('Error loading data:', error);
      showMessage('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus() {
    try {
      const res = await fetch('/api/scraper/status');
      if (res.ok) {
        setStatus(await res.json());
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
        showMessage('Settings saved successfully', 'success');
      } else {
        showMessage('Failed to save settings', 'error');
      }
    } catch (error) {
      console.error('Error updating config:', error);
      showMessage('Error: ' + error.message, 'error');
    }
  }

  function showMessage(text, type = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }

  if (loading) {
    return <div className={styles.loading}>Loading settings...</div>;
  }

  return (
    <div className={styles.settings}>
      <header className={styles.header}>
        <h1><i className="fas fa-gear"></i> Settings</h1>
        <p>Configure your scraper parameters and notifications</p>
      </header>

      {message && (
        <div className={`${styles.alert} ${styles[`alert-${message.type}`]}`}>
          {message.text}
        </div>
      )}

      <div className={styles.grid}>
        <SearchParameters
          config={config}
          onUpdate={handleConfigUpdate}
        />

        <ScraperScheduling
          config={config}
          status={status}
          onUpdate={handleConfigUpdate}
          onRun={loadData}
        />
      </div>
    </div>
  );
}
