'use client';

import { useState, useEffect } from 'react';

export default function ScraperLogs() {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadLogs();
    }, 3000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  async function loadLogs() {
    try {
      const res = await fetch('/api/scraper/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || '');
      }
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  }

  function downloadLogs() {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(logs));
    element.setAttribute('download', `scraper-logs-${new Date().toISOString()}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  return (
    <div className="card">
      <h2>📝 Scraper Logs</h2>

      <div className="button-group">
        <button
          className="button button-primary"
          onClick={loadLogs}
          disabled={loading}
        >
          🔄 Refresh
        </button>
        <button
          className="button button-secondary"
          onClick={downloadLogs}
          disabled={!logs}
        >
          ⬇️ Download
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#e2e8f0', fontWeight: '500', margin: '0' }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Auto-refresh
        </label>
      </div>

      {loading && !logs ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#a1aec8' }}>
          Loading logs...
        </div>
      ) : logs ? (
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
          {(typeof logs === 'string' ? logs : String(logs)).split('\n').map((line, idx) => (
            <div key={idx} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#a1aec8', marginTop: '20px' }}>
          <p style={{ fontSize: '1.1em', marginBottom: '8px', color: '#e2e8f0' }}>No logs yet</p>
          <small>Logs will appear here when the scraper runs</small>
        </div>
      )}
    </div>
  );
}
