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
  const [enabled, setEnabled] = useState(config?.enabled !== false);
  const [interval, setInterval] = useState(config?.interval?.toString() || '60000');
  const [scrapeAllPages, setScrapeAllPages] = useState(config?.scrapeAllPages || false);
  const [alertMode, setAlertMode] = useState(config?.alertMode || 'newOnly');
  const [discordEnabled, setDiscordEnabled] = useState(config?.discord?.enabled || false);
  const [slackEnabled, setSlackEnabled] = useState(config?.slack?.enabled || false);
  const [discordUrl, setDiscordUrl] = useState(config?.discord?.webhookUrl || '');
  const [slackUrl, setSlackUrl] = useState(config?.slack?.webhookUrl || '');
  const [isRunning, setIsRunning] = useState(status?.running || false);

  async function handleChange() {
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
  }

  const debouncedUpdate = async () => {
    await handleChange();
  };

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

      <div className="form-group" style={{ marginTop: '20px' }}>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={async (e) => {
              setEnabled(e.target.checked);
              await onUpdate({ enabled: e.target.checked });
            }}
          />
          {' '}<strong>Scraper Enabled</strong>
        </label>
        <small style={{ display: 'block', marginTop: '5px', color: '#a1aec8' }}>
          When disabled, the scraper won't run on schedule (manual run still allowed)
        </small>
      </div>

      <h3>Scraping Schedule</h3>
      <div className="form-group">
        <label htmlFor="interval">Interval</label>
        <select
          id="interval"
          value={interval}
          onChange={async (e) => {
            setInterval(e.target.value);
            await onUpdate({
              enabled,
              interval: parseInt(e.target.value),
              scrapeAllPages,
              alertMode,
              discord: { enabled: discordEnabled, webhookUrl: discordUrl },
              slack: { enabled: slackEnabled, webhookUrl: slackUrl },
            });
          }}
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
            onChange={async (e) => {
              setScrapeAllPages(e.target.checked);
              await onUpdate({
                enabled,
                interval: parseInt(interval),
                scrapeAllPages: e.target.checked,
                alertMode,
                discord: { enabled: discordEnabled, webhookUrl: discordUrl },
                slack: { enabled: slackEnabled, webhookUrl: slackUrl },
              });
            }}
          />
          {' '}Scrape All Pages
        </label>
        <small style={{ display: 'block', marginTop: '5px', color: '#a1aec8' }}>
          When enabled, scraper will go through all available pages instead of just the first page
        </small>
      </div>

      <div className="form-group">
        <label htmlFor="alertMode">Alert Mode</label>
        <select
          id="alertMode"
          value={alertMode}
          onChange={async (e) => {
            setAlertMode(e.target.value);
            await onUpdate({
              enabled,
              interval: parseInt(interval),
              scrapeAllPages,
              alertMode: e.target.value,
              discord: { enabled: discordEnabled, webhookUrl: discordUrl },
              slack: { enabled: slackEnabled, webhookUrl: slackUrl },
            });
          }}
        >
          <option value="newOnly">🆕 New Listings Only</option>
          <option value="all">📋 All Listings</option>
        </select>
        <small style={{ display: 'block', marginTop: '5px', color: '#a1aec8' }}>
          "New Only": Only notify about listings not seen before | "All": Notify about every listing found
        </small>
      </div>

      <h3>Discord Notifications</h3>
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={discordEnabled}
            onChange={async (e) => {
              setDiscordEnabled(e.target.checked);
              await onUpdate({
                enabled,
                interval: parseInt(interval),
                scrapeAllPages,
                alertMode,
                discord: { enabled: e.target.checked, webhookUrl: discordUrl },
                slack: { enabled: slackEnabled, webhookUrl: slackUrl },
              });
            }}
          />
          {' '}<strong>Enable Discord</strong>
        </label>
      </div>
      {discordEnabled && (
        <div className="form-group">
          <label htmlFor="discordUrl">Webhook URL</label>
          <input
            id="discordUrl"
            type="password"
            value={discordUrl}
            onChange={(e) => setDiscordUrl(e.target.value)}
            onBlur={debouncedUpdate}
            placeholder="https://discord.com/api/webhooks/..."
          />
        </div>
      )}

      <h3>Slack Notifications</h3>
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={slackEnabled}
            onChange={async (e) => {
              setSlackEnabled(e.target.checked);
              await onUpdate({
                enabled,
                interval: parseInt(interval),
                scrapeAllPages,
                alertMode,
                discord: { enabled: discordEnabled, webhookUrl: discordUrl },
                slack: { enabled: e.target.checked, webhookUrl: slackUrl },
              });
            }}
          />
          {' '}<strong>Enable Slack</strong>
        </label>
      </div>
      {slackEnabled && (
        <div className="form-group">
          <label htmlFor="slackUrl">Webhook URL</label>
          <input
            id="slackUrl"
            type="password"
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
            onBlur={debouncedUpdate}
            placeholder="https://hooks.slack.com/services/..."
          />
        </div>
      )}

      <div className="button-group">
        <button
          className="button button-success"
          onClick={handleRunNow}
          disabled={isRunning || !status?.running}
          title={!status?.running ? 'Start scraper in Scraper Controls first' : 'Trigger immediate run'}
        >
          {isRunning ? '⏳ Running...' : '▶️ Run Now'}
        </button>
      </div>

      {!status?.running && (
        <div className="alert alert-warning" style={{ marginTop: '15px' }}>
          ⚠️ Scraper is stopped. Start it using the <strong>Scraper Controls</strong> panel first.
        </div>
      )}

      {status?.lastRun && (
        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(216, 180, 254, 0.1)' }}>
          <h3>Last Run Details</h3>
          <p style={{ fontSize: '0.9em', color: '#a1aec8', margin: '5px 0' }}>
            <strong>Time:</strong> {new Date(status.lastRun).toLocaleString()}
          </p>
          {status.lastRunDuration && (
            <p style={{ fontSize: '0.9em', color: '#a1aec8', margin: '5px 0' }}>
              <strong>Duration:</strong> {(status.lastRunDuration / 1000).toFixed(2)}s
            </p>
          )}
          {status.newListingsLastRun > 0 && (
            <p style={{ fontSize: '0.9em', color: '#86efac', margin: '5px 0' }}>
              <strong>New Listings:</strong> {status.newListingsLastRun}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
