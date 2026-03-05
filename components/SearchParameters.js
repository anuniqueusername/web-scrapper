'use client';

import { useState } from 'react';

export default function SearchParameters({ config, onUpdate }) {
  const [url, setUrl] = useState(config?.url || '');
  const [keywords, setKeywords] = useState((config?.filters?.keywords || []).join(', '));
  const [minPrice, setMinPrice] = useState(config?.filters?.minPrice || '');
  const [maxPrice, setMaxPrice] = useState(config?.filters?.maxPrice || '');
  const [location, setLocation] = useState(config?.filters?.location || '');

  async function handleSave() {
    const updated = {
      url,
      filters: {
        minPrice: minPrice ? parseFloat(minPrice) : null,
        maxPrice: maxPrice ? parseFloat(maxPrice) : null,
        location: location || null,
        keywords: keywords
          .split(',')
          .map(k => k.trim())
          .filter(k => k),
      },
    };

    onUpdate(updated);
  }

  const debouncedUpdate = async () => {
    await handleSave();
  };

  return (
    <div className="card">
      <h2>🔎 Search Parameters</h2>

      <div className="form-group">
        <label htmlFor="url">Target URL</label>
        <input
          id="url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={debouncedUpdate}
        />
      </div>

      <div className="form-group">
        <label htmlFor="keywords">Keywords (comma separated)</label>
        <input
          id="keywords"
          type="text"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          onBlur={debouncedUpdate}
          placeholder="e.g., vending, machine, kiosk"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        <div className="form-group">
          <label htmlFor="minPrice">Minimum Price</label>
          <input
            id="minPrice"
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            onBlur={debouncedUpdate}
            placeholder="e.g., 1000"
          />
        </div>

        <div className="form-group">
          <label htmlFor="maxPrice">Maximum Price</label>
          <input
            id="maxPrice"
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            onBlur={debouncedUpdate}
            placeholder="e.g., 5000"
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="location">Location</label>
        <input
          id="location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onBlur={debouncedUpdate}
          placeholder="e.g., Toronto, ON"
        />
        <small style={{ display: 'block', marginTop: '5px', color: '#a1aec8' }}>
          Changes are saved automatically
        </small>
      </div>
    </div>
  );
}
