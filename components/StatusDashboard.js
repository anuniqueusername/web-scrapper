'use client';

import { useState, useEffect } from 'react';

function KijijiStatus({ status, config }) {
  function getNextRunTime() {
    if (!status?.lastRun || !config?.interval) return 'Not calculated';
    const lastTime = new Date(status.lastRun).getTime();
    const nextTime = lastTime + config.interval;
    const now = Date.now();

    if (nextTime > now) {
      const diff = nextTime - now;
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      return `${mins}m ${secs}s`;
    }
    return 'Overdue';
  }

  return (
    <>
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-box-label">Total Listings</div>
          <div className="stat-box-value">{status?.totalListings || 0}</div>
        </div>

        <div className="stat-box">
          <div className="stat-box-label">Last Run</div>
          <div className="stat-box-value" style={{ fontSize: '1.2em' }}>
            {status?.lastRun
              ? new Date(status.lastRun).toLocaleTimeString()
              : 'Never'}
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-box-label">New This Run</div>
          <div className="stat-box-value">{status?.newListingsLastRun || 0}</div>
        </div>

        <div className="stat-box">
          <div className="stat-box-label">Next Run In</div>
          <div className="stat-box-value" style={{ fontSize: '1.2em' }}>
            {getNextRunTime()}
          </div>
        </div>
      </div>

      {status?.errors && status.errors.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3>Recent Errors</h3>
          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {status.errors.slice(-5).map((error, idx) => (
              <div key={`${error}-${idx}`} className="alert alert-error" style={{ marginBottom: '8px' }}>
                <small>{error}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function FacebookStatus({ status, loading }) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '30px 20px', color: '#a1aec8' }}>
        Loading Facebook status...
      </div>
    );
  }

  const isRunning = status?.running || status?.processStarted;

  return (
    <>
      <div style={{ marginBottom: '16px' }}>
        <div className="status-badge" style={{
          background: isRunning ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: isRunning ? '#86efac' : '#fca5a5',
          borderColor: isRunning ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <i className="fas fa-circle" style={{ fontSize: '0.6em' }}></i>
          {isRunning ? 'Running' : 'Stopped'}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-box-label">Total Listings</div>
          <div className="stat-box-value">{status?.totalListings || 0}</div>
        </div>

        <div className="stat-box">
          <div className="stat-box-label">Last Run</div>
          <div className="stat-box-value" style={{ fontSize: '1.2em' }}>
            {status?.lastRun
              ? new Date(status.lastRun).toLocaleTimeString()
              : 'Never'}
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-box-label">New This Run</div>
          <div className="stat-box-value">{status?.newListingsLastRun || 0}</div>
        </div>

        <div className="stat-box">
          <div className="stat-box-label">Process ID</div>
          <div className="stat-box-value" style={{ fontSize: '1.1em' }}>
            {status?.pid || '—'}
          </div>
        </div>
      </div>

      {status?.mode && (
        <div style={{
          marginTop: '16px',
          padding: '10px 14px',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(216, 180, 254, 0.15)',
          borderRadius: '8px',
          fontSize: '0.88em',
          color: '#a1aec8',
        }}>
          <i className="fas fa-map-location-dot" style={{ marginRight: '8px', color: '#c7d2fe' }}></i>
          Scope: <span style={{ color: '#e2e8f0', fontWeight: '600' }}>{status.mode}</span>
        </div>
      )}

      {status?.errors && status.errors.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3>Recent Errors</h3>
          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {status.errors.slice(-5).map((error, idx) => (
              <div key={`${error}-${idx}`} className="alert alert-error" style={{ marginBottom: '8px' }}>
                <small>{error}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function StatusDashboard({ selectedScraper, status, config }) {
  const [facebookStatus, setFacebookStatus] = useState(null);
  const [fbLoading, setFbLoading] = useState(false);

  // Load Facebook status when that scraper is selected
  useEffect(() => {
    if (selectedScraper === 'facebook' && !facebookStatus) {
      loadFacebookStatus();
    }
  }, [selectedScraper]);

  // Poll Facebook status every 5 s while it is selected
  useEffect(() => {
    if (selectedScraper !== 'facebook') return;
    const interval = setInterval(loadFacebookStatus, 5000);
    return () => clearInterval(interval);
  }, [selectedScraper]);

  async function loadFacebookStatus() {
    setFbLoading(true);
    try {
      const res = await fetch('/api/facebook/status');
      if (res.ok) {
        setFacebookStatus(await res.json());
      }
    } catch (error) {
      console.error('Error loading Facebook status:', error);
    } finally {
      setFbLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ borderBottom: '1px solid rgba(216, 180, 254, 0.2)', paddingBottom: '15px', marginBottom: '20px' }}>
        <i className="fas fa-chart-line"></i> Scraper Status
      </h2>

      {selectedScraper === 'kijiji' ? (
        <KijijiStatus status={status} config={config} />
      ) : (
        <FacebookStatus status={facebookStatus} loading={fbLoading && !facebookStatus} />
      )}
    </div>
  );
}
