'use client';

import { useState } from 'react';

export default function ResultsFilter({ filters, onFilterChange }) {
  const [localFilters, setLocalFilters] = useState(filters);

  function handleChange(e) {
    const { name, value } = e.target;
    const updated = { ...localFilters, [name]: value };
    setLocalFilters(updated);
    onFilterChange(updated);
  }

  function handleReset() {
    const reset = {
      search: '',
      minPrice: '',
      maxPrice: '',
      sortBy: 'newest',
    };
    setLocalFilters(reset);
    onFilterChange(reset);
  }

  return (
    <>
      <h2>🎯 Filter Results</h2>

      <div className="filters">
        <div className="filter-group">
          <label htmlFor="search">Search</label>
          <input
            id="search"
            type="text"
            name="search"
            value={localFilters.search}
            onChange={handleChange}
            placeholder="Title, location, description..."
          />
        </div>

        <div className="filter-group">
          <label htmlFor="minPrice">Min Price</label>
          <input
            id="minPrice"
            type="number"
            name="minPrice"
            value={localFilters.minPrice}
            onChange={handleChange}
            placeholder="e.g., 1000"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="maxPrice">Max Price</label>
          <input
            id="maxPrice"
            type="number"
            name="maxPrice"
            value={localFilters.maxPrice}
            onChange={handleChange}
            placeholder="e.g., 5000"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="sortBy">Sort By</label>
          <select
            id="sortBy"
            name="sortBy"
            value={localFilters.sortBy}
            onChange={handleChange}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>
        </div>
      </div>

      <button
        className="button button-secondary"
        onClick={handleReset}
        style={{ marginTop: '10px' }}
      >
        🔄 Reset Filters
      </button>
    </>
  );
}
