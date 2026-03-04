'use client';

export default function StatusDashboard({ status, config }) {
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
    <div className="card">
      <h2>📊 Scraper Status</h2>

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
              <div key={idx} className="alert alert-error" style={{ marginBottom: '8px' }}>
                <small>{error}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
