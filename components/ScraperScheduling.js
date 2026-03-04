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
  const [interval, setInterval] = useState(config?.interval?.toString() || '60000');
  const [discordEnabled, setDiscordEnabled] = useState(config?.discord?.enabled || false);
  const [slackEnabled, setSlackEnabled] = useState(config?.slack?.enabled || false);
  const [discordUrl, setDiscordUrl] = useState(config?.discord?.webhookUrl || '');
  const [slackUrl, setSlackUrl] = useState(config?.slack?.webhookUrl || '');

  function getIntervalLabel(ms) {
    const found = INTERVALS.find(i => i.value === ms);
    return found ? found.label : `${ms / 1000}s`;
  }

  async function handleSaveSchedule(e) {
    e.preventDefault();

    const updated = {
      interval: parseInt(interval),
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

  return (
    <div className="card">
      <h2>⏰ Scheduling & Notifications</h2>

      <div className="status-badge" style={{
        background: status?.running ? '#d4edda' : '#f8d7da',
        color: status?.running ? '#155724' : '#721c24',
      }}>
        Status: {status?.running ? '🟢 Running' : '🔴 Stopped'}
      </div>

      {!isEditing ? (
        <>
          <h3>Current Schedule</h3>
          <div className="form-group">
            <label>Interval</label>
            <div style={{ padding: '10px', background: '#f9f9f9', borderRadius: '6px' }}>
              {getIntervalLabel(config?.interval || 60000)}
            </div>
          </div>

          <h3>Notifications</h3>
          <div className="form-group">
            <label>Discord</label>
            <div style={{ padding: '10px', background: '#f9f9f9', borderRadius: '6px' }}>
              {config?.discord?.enabled ? '✅ Enabled' : '❌ Disabled'}
            </div>
          </div>

          <div className="form-group">
            <label>Slack</label>
            <div style={{ padding: '10px', background: '#f9f9f9', borderRadius: '6px' }}>
              {config?.slack?.enabled ? '✅ Enabled' : '❌ Disabled'}
            </div>
          </div>

          <div className="button-group">
            <button
              className="button button-success"
              onClick={onRun}
              disabled={status?.running}
            >
              ▶️ Run Now
            </button>
            <button
              className="button button-primary"
              onClick={() => setIsEditing(true)}
            >
              ⚙️ Configure
            </button>
          </div>

          {status?.lastRun && (
            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #ddd' }}>
              <p style={{ fontSize: '0.9em', color: '#666' }}>
                <strong>Last Run:</strong> {new Date(status.lastRun).toLocaleString()}
              </p>
              {status.lastRunDuration && (
                <p style={{ fontSize: '0.9em', color: '#666' }}>
                  <strong>Duration:</strong> {(status.lastRunDuration / 1000).toFixed(2)}s
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <form onSubmit={handleSaveSchedule}>
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
              />
            </div>
          )}

          <div className="button-group">
            <button type="submit" className="button button-success">
              ✅ Save Schedule
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
