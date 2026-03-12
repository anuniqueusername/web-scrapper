'use client';

import { useState } from 'react';

export default function FacebookScraper() {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('all');

  async function handleRun(selectedMode) {
    setIsRunning(true);
    setMessage('Starting...');

    try {
      const response = await fetch('/api/facebook/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selectedMode }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`✅ ${data.message}`);
      } else {
        setMessage(`❌ ${data.message}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    }

    setTimeout(() => {
      setIsRunning(false);
      setMessage('');
    }, 3000);
  }

  const modes = [
    { value: 'single', label: 'Toronto Only', icon: '📍' },
    { value: 'multi', label: 'Top 9 Cities', icon: '🌍' },
    { value: 'all', label: 'All 29 Cities', icon: '🗺️' },
  ];

  return (
    <div className="card">
      <h2>📱 Facebook Marketplace Scraper</h2>

      <div className="status-badge" style={{
        background: isRunning ? 'rgba(250, 204, 21, 0.15)' : 'rgba(59, 130, 246, 0.15)',
        color: isRunning ? '#facc15' : '#93c5fd',
        borderColor: isRunning ? 'rgba(250, 204, 21, 0.3)' : 'rgba(59, 130, 246, 0.3)',
      }}>
        {isRunning ? '⏳ Running...' : '✅ Ready'}
      </div>

      <div style={{ marginTop: '20px' }}>
        <p style={{ marginBottom: '15px', color: '#a1aec8', fontSize: '14px' }}>
          Select scope and start scraping Facebook Marketplace for vending machines
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '10px',
          marginBottom: '15px'
        }}>
          {modes.map((m) => (
            <button
              key={m.value}
              onClick={() => handleRun(m.value)}
              disabled={isRunning}
              style={{
                padding: '12px 16px',
                background: mode === m.value
                  ? 'linear-gradient(135deg, #d8b4fe 0%, #c084fc 100%)'
                  : 'rgba(15, 23, 42, 0.6)',
                color: mode === m.value ? '#0f172a' : '#e2e8f0',
                border: `1px solid ${mode === m.value ? 'rgba(216, 180, 254, 0.4)' : 'rgba(216, 180, 254, 0.15)'}`,
                borderRadius: '8px',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                opacity: isRunning ? 0.6 : 1,
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
            >
              <div>{m.icon}</div>
              <div>{m.label}</div>
            </button>
          ))}
        </div>

        {message && (
          <div style={{
            padding: '12px',
            background: message.includes('✅') ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: message.includes('✅') ? '#86efac' : '#fca5a5',
            borderRadius: '8px',
            border: message.includes('✅') ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
            fontSize: '13px',
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
