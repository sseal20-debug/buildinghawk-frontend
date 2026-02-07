import React, { useEffect, useRef } from 'react';
import type { ListingMarker } from '../../api/client';

interface ListingDetailDrawerProps {
  listing: ListingMarker | null;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function fmtNumber(n: number | null | undefined): string {
  if (n == null) return '--';
  return n.toLocaleString('en-US');
}

function fmtDollars(n: number | null | undefined): string {
  if (n == null) return '--';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtRate(n: number | null | undefined): string {
  if (n == null) return '--';
  return '$' + n.toFixed(2);
}

function fmtPercent(n: number | null | undefined): string {
  if (n == null) return '--';
  return n.toFixed(2) + '%';
}

function statusColor(status: string): React.CSSProperties {
  const s = status?.toLowerCase() ?? '';
  if (s === 'active') return { background: '#16a34a', color: '#fff' };
  if (s === 'pending') return { background: '#ca8a04', color: '#fff' };
  if (s === 'sold' || s === 'leased') return { background: '#6b7280', color: '#fff' };
  return { background: '#374151', color: '#d1d5db' };
}

function typeColor(type: string): React.CSSProperties {
  const t = type?.toLowerCase() ?? '';
  if (t === 'sale') return { background: '#dc2626', color: '#fff' };
  if (t === 'lease') return { background: '#16a34a', color: '#fff' };
  return { background: '#374151', color: '#d1d5db' };
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1100,
  pointerEvents: 'none',
};

const drawerDesktop: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: 380,
  height: '100%',
  background: '#1a1f2e',
  color: '#e5e7eb',
  boxShadow: '-4px 0 24px rgba(0,0,0,0.45)',
  overflowY: 'auto',
  pointerEvents: 'auto',
  transition: 'transform 200ms ease',
  display: 'flex',
  flexDirection: 'column',
};

const drawerMobile: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: '62vh',
  borderTopLeftRadius: 14,
  borderTopRightRadius: 14,
  background: '#1a1f2e',
  color: '#e5e7eb',
  boxShadow: '0 -4px 24px rgba(0,0,0,0.45)',
  overflowY: 'auto',
  pointerEvents: 'auto',
  transition: 'transform 200ms ease',
  display: 'flex',
  flexDirection: 'column',
};

const closeBtn: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  zIndex: 10,
  width: 32,
  height: 32,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(0,0,0,0.55)',
  color: '#e5e7eb',
  fontSize: 18,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
};

const photoStyle: React.CSSProperties = {
  width: '100%',
  height: 200,
  objectFit: 'cover',
  display: 'block',
};

const placeholderPhoto: React.CSSProperties = {
  width: '100%',
  height: 200,
  background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#475569',
  fontSize: 40,
};

const badge: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.3,
  textTransform: 'uppercase',
  marginRight: 6,
  marginBottom: 4,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 1,
  color: '#94a3b8',
  marginBottom: 8,
  paddingBottom: 4,
  borderBottom: '1px solid #334155',
};

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '3px 0',
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: 12,
};

const valueStyle: React.CSSProperties = {
  color: '#e5e7eb',
  fontWeight: 500,
  fontSize: 13,
  textAlign: 'right' as const,
};

const section: React.CSSProperties = {
  padding: '0 16px',
  marginBottom: 14,
};

const linkStyle: React.CSSProperties = {
  color: '#38bdf8',
  textDecoration: 'none',
  fontSize: 13,
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

const ListingDetailDrawer: React.FC<ListingDetailDrawerProps> = ({ listing, onClose }) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  // Respond to resize
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (listing) {
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [listing, onClose]);

  // Scroll to top when listing changes
  useEffect(() => {
    if (listing && drawerRef.current) {
      drawerRef.current.scrollTop = 0;
    }
  }, [listing]);

  const isOpen = listing !== null;
  const isLease = listing?.listing_type?.toLowerCase() === 'lease';
  const isSale = listing?.listing_type?.toLowerCase() === 'sale';
  const isSold = listing?.status?.toLowerCase() === 'sold' || listing?.status?.toLowerCase() === 'leased';

  const hiddenTransform = isMobile ? 'translateY(100%)' : 'translateX(100%)';
  const visibleTransform = isMobile ? 'translateY(0)' : 'translateX(0)';

  const baseStyle = isMobile ? drawerMobile : drawerDesktop;

  const googleMapsUrl = listing
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing.address + ', ' + listing.city)}`
    : '#';

  return (
    <div style={{ ...overlay, pointerEvents: isOpen ? 'auto' : 'none' }}>
      {/* Backdrop (mobile only) */}
      {isMobile && isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            pointerEvents: 'auto',
          }}
        />
      )}

      <div
        ref={drawerRef}
        style={{
          ...baseStyle,
          transform: isOpen ? visibleTransform : hiddenTransform,
        }}
      >
        {listing && (
          <>
            {/* Close button */}
            <button style={closeBtn} onClick={onClose} aria-label="Close" title="Close">
              &#x2715;
            </button>

            {/* Photo / Placeholder */}
            {listing.photo_url ? (
              <img src={listing.photo_url} alt={listing.address} style={photoStyle} />
            ) : (
              <div style={placeholderPhoto}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 16l5-5 4 4 4-4 5 5" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                </svg>
              </div>
            )}

            {/* Address */}
            <div style={{ padding: '12px 16px 4px' }}>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#f1f5f9', textDecoration: 'none' }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 17,
                    fontWeight: 700,
                    lineHeight: 1.3,
                  }}
                >
                  {listing.address}
                  {listing.city ? `, ${listing.city}` : ''}
                </h3>
              </a>
            </div>

            {/* Badge row */}
            <div style={{ padding: '6px 16px 10px', display: 'flex', flexWrap: 'wrap', gap: 0 }}>
              <span style={{ ...badge, ...typeColor(listing.listing_type) }}>
                {listing.listing_type}
              </span>
              {listing.property_type && (
                <span style={{ ...badge, background: '#334155', color: '#cbd5e1' }}>
                  {listing.property_type}
                </span>
              )}
              {listing.sf != null && (
                <span style={{ ...badge, background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
                  {fmtNumber(listing.sf)} SF
                </span>
              )}
              {listing.dom != null && (
                <span style={{ ...badge, background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
                  {listing.dom} DOM
                </span>
              )}
              <span style={{ ...badge, ...statusColor(listing.status) }}>
                {listing.status}
              </span>
              {listing.is_new && (
                <span style={{ ...badge, background: '#7c3aed', color: '#fff' }}>NEW</span>
              )}
              {listing.is_price_reduced && (
                <span style={{ ...badge, background: '#ea580c', color: '#fff' }}>REDUCED</span>
              )}
            </div>

            {/* Lease Pricing */}
            {isLease && (
              <div style={section}>
                <div style={sectionTitle}>Lease Pricing</div>
                <div style={row}>
                  <span style={labelStyle}>Base Rent</span>
                  <span style={valueStyle}>
                    {listing.rate_display
                      ? listing.rate_display
                      : listing.rate_monthly != null
                        ? fmtRate(listing.rate_monthly) + ' /SF/Mo'
                        : '--'}
                  </span>
                </div>
                {listing.lease_structure && (
                  <div style={row}>
                    <span style={labelStyle}>Structure</span>
                    <span style={valueStyle}>{listing.lease_structure}</span>
                  </div>
                )}
                {listing.nnn_psf_monthly != null && (
                  <div style={row}>
                    <span style={labelStyle}>NNN / CAM</span>
                    <span style={valueStyle}>{fmtRate(listing.nnn_psf_monthly)} /SF/Mo</span>
                  </div>
                )}
                {listing.nnn_to_gross_total != null && (
                  <div style={row}>
                    <span style={labelStyle}>Gross Total</span>
                    <span style={{ ...valueStyle, color: '#38bdf8', fontWeight: 700 }}>
                      {fmtRate(listing.nnn_to_gross_total)} /SF/Mo
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Sale Pricing */}
            {isSale && (
              <div style={section}>
                <div style={sectionTitle}>Sale Pricing</div>
                <div style={row}>
                  <span style={labelStyle}>Sale Price</span>
                  <span style={{ ...valueStyle, color: '#38bdf8', fontWeight: 700 }}>
                    {fmtDollars(listing.sale_price)}
                  </span>
                </div>
                {listing.price_psf != null && (
                  <div style={row}>
                    <span style={labelStyle}>Price / SF</span>
                    <span style={valueStyle}>{fmtRate(listing.price_psf)} /SF</span>
                  </div>
                )}
                {listing.cap_rate != null && (
                  <div style={row}>
                    <span style={labelStyle}>Cap Rate</span>
                    <span style={valueStyle}>{fmtPercent(listing.cap_rate)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Building Specs */}
            {(listing.clear_height || listing.dock_doors != null || listing.grade_doors != null || listing.power || listing.year_built != null) && (
              <div style={section}>
                <div style={sectionTitle}>Building Specs</div>
                {listing.clear_height && (
                  <div style={row}>
                    <span style={labelStyle}>Clear Height</span>
                    <span style={valueStyle}>{listing.clear_height}</span>
                  </div>
                )}
                {listing.dock_doors != null && (
                  <div style={row}>
                    <span style={labelStyle}>Dock Doors</span>
                    <span style={valueStyle}>{listing.dock_doors}</span>
                  </div>
                )}
                {listing.grade_doors != null && (
                  <div style={row}>
                    <span style={labelStyle}>GL Doors</span>
                    <span style={valueStyle}>{listing.grade_doors}</span>
                  </div>
                )}
                {listing.power && (
                  <div style={row}>
                    <span style={labelStyle}>Power</span>
                    <span style={valueStyle}>{listing.power}</span>
                  </div>
                )}
                {listing.year_built != null && (
                  <div style={row}>
                    <span style={labelStyle}>Year Built</span>
                    <span style={valueStyle}>{listing.year_built}</span>
                  </div>
                )}
                {listing.has_yard && (
                  <div style={row}>
                    <span style={labelStyle}>Yard</span>
                    <span style={valueStyle}>Yes</span>
                  </div>
                )}
              </div>
            )}

            {/* Broker */}
            {(listing.listing_broker || listing.listing_company) && (
              <div style={section}>
                <div style={sectionTitle}>Broker</div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  {listing.listing_broker && (
                    <span style={{ color: '#e5e7eb', fontWeight: 500 }}>{listing.listing_broker}</span>
                  )}
                  {listing.listing_broker && listing.listing_company && (
                    <span style={{ color: '#64748b' }}> at </span>
                  )}
                  {listing.listing_company && (
                    <span style={{ color: '#94a3b8' }}>{listing.listing_company}</span>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {listing.notes && (
              <div style={section}>
                <div style={sectionTitle}>Notes</div>
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                  {truncate(listing.notes, 300)}
                </p>
              </div>
            )}

            {/* Sold / Leased details */}
            {isSold && (listing.buyer_company || listing.seller_company || listing.sale_date) && (
              <div style={section}>
                <div style={sectionTitle}>Transaction</div>
                {listing.buyer_company && (
                  <div style={row}>
                    <span style={labelStyle}>Buyer</span>
                    <span style={valueStyle}>{listing.buyer_company}</span>
                  </div>
                )}
                {listing.seller_company && (
                  <div style={row}>
                    <span style={labelStyle}>Seller</span>
                    <span style={valueStyle}>{listing.seller_company}</span>
                  </div>
                )}
                {listing.sale_date && (
                  <div style={row}>
                    <span style={labelStyle}>Sale Date</span>
                    <span style={valueStyle}>{listing.sale_date}</span>
                  </div>
                )}
              </div>
            )}

            {/* Links */}
            {(listing.listing_page_url || listing.listed_app) && (
              <div style={{ ...section, paddingBottom: 20 }}>
                <div style={sectionTitle}>Links</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {listing.listing_page_url && (
                    <a
                      href={listing.listing_page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        ...linkStyle,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        borderRadius: 4,
                        background: '#1e293b',
                        border: '1px solid #334155',
                      }}
                    >
                      View Listing &#x2197;
                    </a>
                  )}
                  {listing.listed_app && (
                    <span
                      style={{
                        ...badge,
                        background: '#1e293b',
                        color: '#64748b',
                        border: '1px solid #334155',
                        fontSize: 11,
                        marginRight: 0,
                      }}
                    >
                      {listing.listed_app}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Bottom spacer for mobile scroll */}
            <div style={{ minHeight: 20, flexShrink: 0 }} />
          </>
        )}
      </div>
    </div>
  );
};

export default ListingDetailDrawer;
