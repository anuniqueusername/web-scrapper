'use client';

export default function ListingsTable({ listings }) {
  if (!listings || listings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📭</div>
        <p>No listings found. Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Price</th>
            <th>Location</th>
            <th>Date Posted</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {listings.map(listing => (
            <tr key={listing.id}>
              <td>
                <strong>{listing.title}</strong>
                {listing.description && (
                  <p style={{ fontSize: '0.85em', color: '#666', marginTop: '4px' }}>
                    {listing.description.substring(0, 100)}...
                  </p>
                )}
              </td>
              <td>
                <strong>{listing.price}</strong>
              </td>
              <td>{listing.location}</td>
              <td style={{ fontSize: '0.9em' }}>
                {listing.date || (new Date(listing.scrapedAt).toLocaleDateString())}
              </td>
              <td>
                {listing.url && (
                  <a
                    href={listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button button-primary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.85em',
                      textDecoration: 'none',
                    }}
                  >
                    View
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
