'use client';

import { useState, useEffect } from 'react';
import SearchParameters from '@/components/SearchParameters';
import styles from './Settings.module.css';

export default function SettingsPage() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      const res = await fetch('/api/scraper/config');
      if (res.ok) {
        setConfig(await res.json());
      }
    } catch (error) {
      console.error('Error loading config:', error);
      showMessage('Failed to load configuration', 'error');
    } finally {
      setLoading(false);
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
        <h1>⚙️ Settings</h1>
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
      </div>
    </div>
  );
}
