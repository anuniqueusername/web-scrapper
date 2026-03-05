'use client';

import { useState } from 'react';

export default function SearchParameters({ config, onUpdate }) {
  const [formData, setFormData] = useState({
    url: config?.url || '',
    keywords: (config?.filters?.keywords || []).join(', '),
    minPrice: config?.filters?.minPrice || '',
    maxPrice: config?.filters?.maxPrice || '',
    location: config?.filters?.location || '',
  });

  const [isEditing, setIsEditing] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const updated = {
      url: formData.url,
      filters: {
        minPrice: formData.minPrice ? parseFloat(formData.minPrice) : null,
        maxPrice: formData.maxPrice ? parseFloat(formData.maxPrice) : null,
        location: formData.location || null,
        keywords: formData.keywords
          .split(',')
          .map(k => k.trim())
          .filter(k => k),
      },
    };

    onUpdate(updated);
    setIsEditing(false);
  }

  function handleCancel() {
    setFormData({
      url: config?.url || '',
      keywords: (config?.filters?.keywords || []).join(', '),
      minPrice: config?.filters?.minPrice || '',
      maxPrice: config?.filters?.maxPrice || '',
      location: config?.filters?.location || '',
    });
    setIsEditing(false);
  }

  return (
    <div className="card">
      <h2>🔎 Search Parameters</h2>

      {!isEditing ? (
        <>
          <div className="form-group">
            <label>Target URL</label>
            <div style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', wordBreak: 'break-all', color: '#e2e8f0', border: '1px solid rgba(216, 180, 254, 0.1)' }}>
              {config?.url}
            </div>
          </div>

          <div className="form-group">
            <label>Keywords to Monitor</label>
            <div style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', color: '#e2e8f0', border: '1px solid rgba(216, 180, 254, 0.1)' }}>
              {config?.filters?.keywords?.length > 0
                ? config.filters.keywords.join(', ')
                : 'No keywords set'}
            </div>
          </div>

          <div className="form-group">
            <label>Price Range</label>
            <div style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', color: '#e2e8f0', border: '1px solid rgba(216, 180, 254, 0.1)' }}>
              {config?.filters?.minPrice || 'Any'} - {config?.filters?.maxPrice || 'Any'}
            </div>
          </div>

          <div className="form-group">
            <label>Location Filter</label>
            <div style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', color: '#e2e8f0', border: '1px solid rgba(216, 180, 254, 0.1)' }}>
              {config?.filters?.location || 'All locations'}
            </div>
          </div>

          <button
            className="button button-primary"
            onClick={() => setIsEditing(true)}
          >
            ✏️ Edit Parameters
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="url">Target URL</label>
            <input
              id="url"
              type="url"
              name="url"
              value={formData.url}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="keywords">Keywords (comma separated)</label>
            <input
              id="keywords"
              type="text"
              name="keywords"
              value={formData.keywords}
              onChange={handleChange}
              placeholder="e.g., vending, machine, kiosk"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="form-group">
              <label htmlFor="minPrice">Minimum Price</label>
              <input
                id="minPrice"
                type="number"
                name="minPrice"
                value={formData.minPrice}
                onChange={handleChange}
                placeholder="e.g., 1000"
              />
            </div>

            <div className="form-group">
              <label htmlFor="maxPrice">Maximum Price</label>
              <input
                id="maxPrice"
                type="number"
                name="maxPrice"
                value={formData.maxPrice}
                onChange={handleChange}
                placeholder="e.g., 5000"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="location">Location</label>
            <input
              id="location"
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="e.g., Toronto, ON"
            />
          </div>

          <div className="button-group">
            <button type="submit" className="button button-success">
              ✅ Save Parameters
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
