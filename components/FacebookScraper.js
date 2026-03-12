'use client';

import { useState, useEffect } from 'react';

export default function FacebookScraper({ status, onStatusChange }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [mode, setMode] = useState('all');

  function showMessage(text, type = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }

  async function handleAction(action) {
    setLoading(true);
    try {
      const url = `/api/facebook/control?action=${action}&mode=${mode}`;
      const response = await fetch(url, { method: 'POST' });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Request failed');
      }

      const result = await response.json();

      if (result.success) {
        showMessage(`Facebook scraper ${action}ed successfully`);
        setTimeout(async () => {
          const statusRes = await fetch('/api/facebook/control');
          if (statusRes.ok) {
            const newStatus = await statusRes.json();
            if (onStatusChange) onStatusChange(newStatus);
          }
        }, 500);
      } else {
        showMessage(result.message || `Failed to ${action} scraper`, 'error');
      }
    } catch (error) {
      showMessage(`Error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  const isRunning = status?.running || status?.processStarted;

  const modes = [
    { value: 'single', label: 'Toronto', icon: 'fa-location-dot' },
    { value: 'multi', label: 'Top 9', icon: 'fa-earth-americas' },
    { value: 'all', label: 'All 29', icon: 'fa-map' },
  ];

  return (
    <div className="card">
      <h2><i className="fab fa-facebook"></i> Facebook Marketplace Scraper</h2>

      {message && (
        <div className={`alert alert-${message.type}`} style={{ marginBottom: '15px' }}>
          {message.text}
        </div>
      )}

      <div className="status-badge" style={{
        background: isRunning ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
        color: isRunning ? '#86efac' : '#fca5a5',
        borderColor: isRunning ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        marginBottom: '20px',
      }}>
        Status: {isRunning ? <><i className="fas fa-circle" style={{color: '#86efac', marginRight: '8px'}}></i>Running</> : <><i className="fas fa-circle" style={{color: '#fca5a5', marginRight: '8px'}}></i>Stopped</>}
      </div>

      {status?.pid && (
        <div style={{ marginBottom: '15px', fontSize: '0.9em', color: '#a1aec8' }}>
          <strong>Process ID:</strong> {status.pid}
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: '#a1aec8', fontSize: '13px' }}>
          Scope:
        </label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
        }}>
          {modes.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              disabled={loading || isRunning}
              style={{
                padding: '10px',
                background: mode === m.value
                  ? 'linear-gradient(135deg, #d8b4fe 0%, #c084fc 100%)'
                  : 'rgba(15, 23, 42, 0.6)',
                color: mode === m.value ? '#0f172a' : '#e2e8f0',
                border: `1px solid ${mode === m.value ? 'rgba(216, 180, 254, 0.4)' : 'rgba(216, 180, 254, 0.15)'}`,
                borderRadius: '8px',
                cursor: (loading || isRunning) ? 'not-allowed' : 'pointer',
                opacity: (loading || isRunning) ? 0.6 : 1,
                fontSize: '12px',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
            >
              <div><i className={`fas ${m.icon}`}></i></div>
              <div>{m.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="button-group">
        <button
          className="button button-success"
          onClick={() => handleAction('start')}
          disabled={loading || isRunning}
        >
          {loading ? <><i className="fas fa-spinner fa-spin"></i> Starting...</> : <><i className="fas fa-play"></i> Start</>}
        </button>

        <button
          className="button button-danger"
          onClick={() => handleAction('stop')}
          disabled={loading || !isRunning}
        >
          {loading ? <><i className="fas fa-spinner fa-spin"></i> Stopping...</> : <><i className="fas fa-stop"></i> Stop</>}
        </button>

        <button
          className="button button-primary"
          onClick={() => handleAction('restart')}
          disabled={loading}
        >
          {loading ? <><i className="fas fa-spinner fa-spin"></i> Restarting...</> : <><i className="fas fa-arrows-rotate"></i> Restart</>}
        </button>
      </div>
    </div>
  );
}
