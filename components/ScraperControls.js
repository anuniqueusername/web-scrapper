'use client';

import { useState } from 'react';

export default function ScraperControls({ status, onStatusChange }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  function showMessage(text, type = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }

  async function handleAction(action) {
    setLoading(true);
    try {
      const response = await fetch(`/api/scraper/control?action=${action}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Request failed');
      }

      const result = await response.json();

      if (result.success) {
        showMessage(`Scraper ${action}ed successfully`);
        // Refresh status
        setTimeout(async () => {
          const statusRes = await fetch('/api/scraper/control');
          if (statusRes.ok) {
            const newStatus = await statusRes.json();
            onStatusChange(newStatus);
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

  return (
    <div className="card">
      <h2>🎮 Scraper Controls</h2>

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
        Status: {isRunning ? '🟢 Running' : '🔴 Stopped'}
      </div>

      {status?.pid && (
        <div style={{ marginBottom: '15px', fontSize: '0.9em', color: '#a1aec8' }}>
          <strong>Process ID:</strong> {status.pid}
        </div>
      )}

      <div className="button-group">
        <button
          className="button button-success"
          onClick={() => handleAction('start')}
          disabled={loading || isRunning}
        >
          {loading ? '⏳ Starting...' : '▶️ Start Scraper'}
        </button>

        <button
          className="button button-danger"
          onClick={() => handleAction('stop')}
          disabled={loading || !isRunning}
        >
          {loading ? '⏳ Stopping...' : '⏹️ Stop Scraper'}
        </button>

        <button
          className="button button-primary"
          onClick={() => handleAction('restart')}
          disabled={loading}
        >
          {loading ? '⏳ Restarting...' : '🔄 Restart Scraper'}
        </button>
      </div>

      {status?.lastStatusUpdate && (
        <div style={{
          marginTop: '15px',
          paddingTop: '15px',
          borderTop: '1px solid rgba(216, 180, 254, 0.1)',
          fontSize: '0.85em',
          color: '#a1aec8',
        }}>
          Last update: {new Date(status.lastStatusUpdate).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
