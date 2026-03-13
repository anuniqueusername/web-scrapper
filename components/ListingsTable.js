'use client';

/**
 * Cleans up Facebook Marketplace titles which often contain the price and city
 * concatenated at the start or end, e.g. "CA$275Vending MachinesBrampton, ON".
 * We strip leading price tokens (CA$NNN / $NNN) and trailing city/province
 * patterns so the core product name is shown cleanly.
 */
function cleanFacebookTitle(title) {
  if (!title) return title;
  // Remove leading price variants: CA$275, $275, CA$550CA$800 etc.
  let cleaned = title.replace(/^(CA\$[\d,]+)+(\$[\d,]+)?/i, '').trim();
  // Remove trailing city, Province pattern e.g. "Brampton, ON" or "Mono, ON"
  cleaned = cleaned.replace(/[,\s]+[A-Za-z\s]+,\s*ON\s*$/, '').trim();
  cleaned = cleaned.replace(/[,\s]+[A-Za-z\s]+,\s*[A-Z]{2}\s*$/, '').trim();
  return cleaned || title; // fall back to original if we stripped too much
}

const SOURCE_BADGE = {
  facebook: {
    label: 'Facebook',
    icon: 'fab fa-facebook-f',
    bg: 'rgba(24, 119, 242, 0.15)',
    border: 'rgba(24, 119, 242, 0.4)',
    color: '#60a5fa',
  },
  kijiji: {
    label: 'Kijiji',
    icon: 'fas fa-tag',
    bg: 'rgba(192, 132, 252, 0.15)',
    border: 'rgba(192, 132, 252, 0.4)',
    color: '#c084fc',
  },
};

function SourceBadge({ source }) {
  const cfg = SOURCE_BADGE[source] || SOURCE_BADGE.kijiji;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 8px',
        borderRadius: '4px',
        fontSize: '0.75em',
        fontWeight: 600,
        letterSpacing: '0.3px',
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
        whiteSpace: 'nowrap',
      }}
    >
      <i className={cfg.icon} style={{ fontSize: '0.85em' }} />
      {cfg.label}
    </span>
  );
}

export default function ListingsTable({ listings, showSource = false }) {
  if (!listings || listings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <i className="fas fa-inbox" style={{ fontSize: '2em', color: '#a1aec8' }} />
        </div>
        <p>No listings found. Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th style={{ width: '50px' }}>#</th>
            {showSource && <th style={{ width: '110px' }}>Source</th>}
            <th>Title</th>
            <th style={{ width: '110px' }}>Price</th>
            <th style={{ width: '140px' }}>Location</th>
            <th style={{ width: '120px' }}>Date Posted</th>
            <th style={{ width: '80px' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing, index) => {
            const isFacebook = listing.source === 'facebook';
            const displayTitle = isFacebook
              ? cleanFacebookTitle(listing.title)
              : listing.title;
            const displayLocation =
              listing.location && listing.location !== 'N/A'
                ? listing.location
                : listing.city || '—';

            return (
              <tr key={`${listing.source || 'kijiji'}-${listing.id}-${index}`}>
                <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#d8b4fe' }}>
                  {listing.order || '—'}
                </td>

                {showSource && (
                  <td>
                    <SourceBadge source={listing.source || 'kijiji'} />
                  </td>
                )}

                <td>
                  <strong>{displayTitle}</strong>
                  {listing.description && (
                    <p style={{ fontSize: '0.85em', color: '#a1aec8', marginTop: '4px' }}>
                      {listing.description.substring(0, 100)}
                      {listing.description.length > 100 ? '...' : ''}
                    </p>
                  )}
                </td>

                <td>
                  <strong>{listing.price}</strong>
                </td>

                <td>{displayLocation}</td>

                <td style={{ fontSize: '0.9em' }}>
                  {listing.date
                    ? isFacebook
                      ? new Date(listing.date).toLocaleDateString()
                      : listing.date
                    : listing.scrapedAt
                    ? new Date(listing.scrapedAt).toLocaleDateString()
                    : '—'}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
