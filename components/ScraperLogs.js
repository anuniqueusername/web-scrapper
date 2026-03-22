'use client';

import { useState, useEffect, useRef } from 'react';

const TAB_CONFIG = {
  kijiji: {
    label: 'Kijiji',
    icon: 'fas fa-spider',
    endpoint: '/api/scraper/logs',
    deleteEndpoint: '/api/scraper/logs',
    filename: 'kijiji-logs',
    emptyText: 'Logs will appear here when the Kijiji scraper runs',
  },
  facebook: {
    label: 'Facebook',
    icon: 'fab fa-facebook',
    endpoint: '/api/facebook/logs',
    deleteEndpoint: '/api/facebook/logs',
    filename: 'facebook-logs',
    emptyText: 'Logs will appear here when the Facebook scraper runs',
  },
};

function LogsPanel({ tabKey, autoRefresh }) {
  const config = TAB_CONFIG[tabKey];
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const logEndRef = useRef(null);

  // useEffect(() => {
  //   // Reset loading state and fetch fresh logs whenever the active scraper changes
  //   setLoading(true);
  //   setLogs([]);
  //   loadLogs();
  // }, [tabKey]);

  // useEffect(() => {
  //   if (!autoRefresh) return;
  //   const interval = setInterval(loadLogs, 3000);
  //   return () => clearInterval(interval);
  // }, [autoRefresh, tabKey]);

  async function loadLogs() {
    try {
      const res = await fetch(config.endpoint);
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data.logs) ? data.logs : []);
      }
    } catch (error) {
      console.error(`Error loading ${config.label} logs:`, error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#a1aec8' }}>
        Loading {config.label} logs...
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#a1aec8', marginTop: '20px' }}>
        <p style={{ fontSize: '1.1em', marginBottom: '8px', color: '#e2e8f0' }}>No logs yet</p>
        <small>{config.emptyText}</small>
      </div>
    );
  }

  return (
    <div style={{
      background: '#1a202c',
      color: '#68d391',
      padding: '24px',
      borderRadius: '8px',
      fontFamily: "'Courier New', monospace",
      fontSize: '0.85em',
      lineHeight: '1.8',
      maxHeight: '500px',
      overflowY: 'auto',
      marginTop: '20px',
      border: '1px solid rgba(216, 180, 254, 0.1)',
    }}>
      {logs.map((line, idx) => (
        <div key={idx} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {line || '\u00A0'}
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

export default function ScraperLogs({ selectedScraper }) {
  // selectedScraper drives which log feed is shown; no internal tab switcher
  const activeTab = selectedScraper || 'kijiji';
  const config = TAB_CONFIG[activeTab];

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState(null);
  // Key used to force re-mount the panel on manual refresh click
  const [refreshKey, setRefreshKey] = useState(0);

  function showMessage(text, type = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }

  async function handleClearLogs() {
    setClearing(true);
    try {
      const res = await fetch(config.deleteEndpoint, { method: 'DELETE' });
      if (res.ok) {
        showMessage(`${config.label} logs cleared`);
        setRefreshKey((k) => k + 1);
      } else {
        showMessage(`Failed to clear ${config.label} logs`, 'error');
      }
    } catch (error) {
      showMessage(`Error: ${error.message}`, 'error');
    } finally {
      setClearing(false);
    }
  }

  function handleDownload() {
    fetch(config.endpoint)
      .then((r) => r.json())
      .then((data) => {
        const lines = Array.isArray(data.logs) ? data.logs : [];
        const text = lines.join('\n');
        const el = document.createElement('a');
        el.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        el.setAttribute('download', `${config.filename}-${new Date().toISOString()}.txt`);
        el.style.display = 'none';
        document.body.appendChild(el);
        el.click();
        document.body.removeChild(el);
      })
      .catch((err) => showMessage(`Download failed: ${err.message}`, 'error'));
  }

  return (
    <div className="card">
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(216, 180, 254, 0.2)',
        paddingBottom: '15px',
        marginBottom: '0',
      }}>
        <h2 style={{ borderBottom: 'none', paddingBottom: '0', marginBottom: '0' }}>
          <i className="fas fa-file-lines"></i> Scraper Logs
          <span style={{
            marginLeft: '12px',
            fontSize: '0.65em',
            fontWeight: '500',
            background: 'rgba(216, 180, 254, 0.12)',
            border: '1px solid rgba(216, 180, 254, 0.2)',
            borderRadius: '6px',
            padding: '3px 10px',
            color: '#d8b4fe',
            verticalAlign: 'middle',
          }}>
            <i className={config.icon} style={{ marginRight: '5px' }}></i>
            {config.label}
          </span>
        </h2>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`} style={{ marginTop: '16px', marginBottom: '0' }}>
          {message.text}
        </div>
      )}

      <div className="button-group" style={{ marginTop: '16px' }}>
        <button
          className="button button-primary"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <i className="fas fa-arrows-rotate"></i> Refresh
        </button>
        <button
          className="button button-secondary"
          onClick={handleDownload}
        >
          <i className="fas fa-download"></i> Download
        </button>
        <button
          className="button button-danger"
          onClick={handleClearLogs}
          disabled={clearing}
        >
          {clearing
            ? <><i className="fas fa-spinner fa-spin"></i> Clearing...</>
            : <><i className="fas fa-trash"></i> Clear Logs</>}
        </button>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          color: '#e2e8f0',
          fontWeight: '500',
          margin: '0',
        }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Auto-refresh
        </label>
      </div>

      <LogsPanel
        key={`${activeTab}-${refreshKey}`}
        tabKey={activeTab}
        autoRefresh={autoRefresh}
      />
    </div>
  );
}
