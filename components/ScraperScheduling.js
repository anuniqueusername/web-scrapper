'use client';

import { useState } from 'react';

const INTERVALS = [
  { value: 30000, label: '30 seconds' },
  { value: 60000, label: '1 minute' },
  { value: 300000, label: '5 minutes' },
  { value: 600000, label: '10 minutes' },
  { value: 1800000, label: '30 minutes' },
  { value: 3600000, label: '1 hour' },
  { value: 86400000, label: '1 day' },
];

export default function ScraperScheduling({
  config,
  status,
  onUpdate,
  onRun,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [enabled, setEnabled] = useState(config?.enabled !== false);
  const [interval, setInterval] = useState(config?.interval?.toString() || '60000');
  const [scrapeAllPages, setScrapeAllPages] = useState(config?.scrapeAllPages || false);
  const [alertMode, setAlertMode] = useState(config?.alertMode || 'newOnly');
  const [discordEnabled, setDiscordEnabled] = useState(config?.discord?.enabled || false);
  const [slackEnabled, setSlackEnabled] = useState(config?.slack?.enabled || false);
  const [discordUrl, setDiscordUrl] = useState(config?.discord?.webhookUrl || '');
  const [slackUrl, setSlackUrl] = useState(config?.slack?.webhookUrl || '');
  const [isRunning, setIsRunning] = useState(status?.running || false);

  function getIntervalLabel(ms) {
    const found = INTERVALS.find(i => i.value === ms);
    return found ? found.label : `${ms / 1000}s`;
  }

  async function handleToggleEnabled() {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    onUpdate({ enabled: newEnabled });
  }

  async function handleSaveSchedule(e) {
    e.preventDefault();

    const updated = {
      enabled,
      interval: parseInt(interval),
      scrapeAllPages,
      alertMode,
      discord: {
        enabled: discordEnabled,
        webhookUrl: discordUrl,
      },
      slack: {
        enabled: slackEnabled,
        webhookUrl: slackUrl,
      },
    };

    onUpdate(updated);
    setIsEditing(false);
  }

  async function handleRunNow() {
    setIsRunning(true);
    await onRun();
    setTimeout(() => setIsRunning(false), 2000);
  }

  return (
    <div className="card">
      <h2>⏰ Scheduling & Notifications</h2>

      <div className="status-badge" style={{
        background: isRunning ? 'rgba(250, 204, 21, 0.15)' : (enabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
        color: isRunning ? '#facc15' : (enabled ? '#86efac' : '#fca5a5'),
        borderColor: isRunning ? 'rgba(250, 204, 21, 0.3)' : (enabled ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
      }}>
        Status: {isRunning ? '⏳ Running...' : (enabled ? '🟢 Active' : '🔴 Disabled')}
      </div>

      {!isEditing ? (
        <>
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={handleToggleEnabled}
              />
              {' '}<strong>Scraper Enabled</strong>
            </label>
          </div>

          <h3>Current Schedule</h3>
          <div className="form-group">
            <label>Interval</label>
            <div style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', color: '#e2e8f0', border: '1px solid rgba(216, 180, 254, 0.1)' }}>
              {getIntervalLabel(parseInt(interval))}
            </div>
          </div>

          <h3>Scraping Options</h3>
          <div className="form-group">
            <label>Scrape All Pages</label>
            <div style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', color: '#e2e8f0', border: '1px solid rgba(216, 180, 254, 0.1)' }}>
              {config?.scrapeAllPages ? '✅ Yes' : '❌ No'}
            </div>
          </div>

          <div className="form-group">
            <label>Alert Mode</label>
            <div style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', color: '#e2e8f0', border: '1px solid rgba(216, 180, 254, 0.1)' }}>
              {config?.alertMode === 'newOnly' ? '🆕 New Listings Only' : '📋 All Listings'}
            </div>
          </div>

          <h3>Notifications</h3>
          <div className="form-group">
            <label>Discord</label>
            <div style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', color: '#e2e8f0', border: '1px solid rgba(216, 180, 254, 0.1)' }}>
              {config?.discord?.enabled ? '✅ Enabled' : '❌ Disabled'}
            </div>
          </div>

          <div className="form-group">
            <label>Slack</label>
            <div style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', color: '#e2e8f0', border: '1px solid rgba(216, 180, 254, 0.1)' }}>
              {config?.slack?.enabled ? '✅ Enabled' : '❌ Disabled'}
            </div>
          </div>

          <div className="button-group">
            <button
              className="button button-success"
              onClick={handleRunNow}
              disabled={isRunning || !status?.running}
              title={!status?.running ? 'Start scraper in Scraper Controls first' : 'Trigger immediate run'}
            >
              {isRunning ? '⏳ Running...' : '▶️ Run Now'}
            </button>
            <button
              className="button button-primary"
              onClick={() => setIsEditing(true)}
            >
              ⚙️ Configure
            </button>
          </div>

          {!status?.running && (
            <div className="alert alert-warning" style={{ marginTop: '15px' }}>
              ⚠️ Scraper is stopped. Start it using the <strong>Scraper Controls</strong> panel first.
            </div>
          )}

          {status?.lastRun && (
            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(216, 180, 254, 0.1)' }}>
              <p style={{ fontSize: '0.9em', color: '#a1aec8' }}>
                <strong>Last Run:</strong> {new Date(status.lastRun).toLocaleString()}
              </p>
              {status.lastRunDuration && (
                <p style={{ fontSize: '0.9em', color: '#a1aec8' }}>
                  <strong>Duration:</strong> {(status.lastRunDuration / 1000).toFixed(2)}s
                </p>
              )}
              {status.newListingsLastRun > 0 && (
                <p style={{ fontSize: '0.9em', color: '#86efac' }}>
                  <strong>New Listings:</strong> {status.newListingsLastRun}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <form onSubmit={handleSaveSchedule}>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
              />
              {' '}<strong>Enable Scraper</strong>
            </label>
            <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
              When disabled, the scraper won't run on schedule (manual run still allowed)
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="interval">Scraping Interval</label>
            <select
              id="interval"
              value={interval}
              onChange={e => setInterval(e.target.value)}
            >
              {INTERVALS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <h3>Scraping Options</h3>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={scrapeAllPages}
                onChange={e => setScrapeAllPages(e.target.checked)}
              />
              {' '}Scrape All Pages
            </label>
            <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
              When enabled, scraper will go through all available pages instead of just the first page
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="alertMode">Alert Mode</label>
            <select
              id="alertMode"
              value={alertMode}
              onChange={e => setAlertMode(e.target.value)}
            >
              <option value="newOnly">New Listings Only</option>
              <option value="all">All Listings</option>
            </select>
            <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
              "New Only": Only notify about listings not seen before | "All": Notify about every listing found
            </small>
          </div>

          <h3>Discord Webhook</h3>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={discordEnabled}
                onChange={e => setDiscordEnabled(e.target.checked)}
              />
              {' '}Enable Discord Notifications
            </label>
          </div>
          {discordEnabled && (
            <div className="form-group">
              <label htmlFor="discordUrl">Discord Webhook URL</label>
              <input
                id="discordUrl"
                type="password"
                value={discordUrl}
                onChange={e => setDiscordUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                required
              />
            </div>
          )}

          <h3>Slack Webhook</h3>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={slackEnabled}
                onChange={e => setSlackEnabled(e.target.checked)}
              />
              {' '}Enable Slack Notifications
            </label>
          </div>
          {slackEnabled && (
            <div className="form-group">
              <label htmlFor="slackUrl">Slack Webhook URL</label>
              <input
                id="slackUrl"
                type="password"
                value={slackUrl}
                onChange={e => setSlackUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                required
              />
            </div>
          )}

          <div className="button-group">
            <button type="submit" className="button button-success">
              ✅ Save Changes
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
