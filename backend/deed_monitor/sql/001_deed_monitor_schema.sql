-- ============================================================================
-- DEED MONITOR SCHEMA
-- BuildingHawk Extension for Real-Time Sale Detection
-- ============================================================================

-- Table: apn_watchlist
-- Your master list of industrial parcels to monitor
-- This is the list you've already built (9,000+ OC industrial parcels)
-- ============================================================================

CREATE TABLE IF NOT EXISTS apn_watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apn VARCHAR(20) NOT NULL UNIQUE,              -- Assessor Parcel Number (e.g., '360-384-05')
    apn_normalized VARCHAR(20) GENERATED ALWAYS AS (
        REPLACE(REPLACE(apn, '-', ''), ' ', '')   -- Normalized for matching (e.g., '36038405')
    ) STORED,
    
    -- Property info (from your existing BuildingHawk data)
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(2) DEFAULT 'CA',
    zip VARCHAR(10),
    county VARCHAR(100) DEFAULT 'Orange',
    
    -- Property characteristics
    property_type VARCHAR(50) DEFAULT 'industrial',
    building_sf INTEGER,
    lot_sf INTEGER,
    year_built INTEGER,
    zoning VARCHAR(50),
    
    -- Current assessment (from assessor)
    assessed_land NUMERIC(15,2),
    assessed_improvements NUMERIC(15,2),
    assessed_total NUMERIC(15,2),
    assessment_year INTEGER,
    
    -- Last known sale (if any)
    last_sale_date DATE,
    last_sale_price NUMERIC(15,2),
    last_sale_doc_number VARCHAR(50),
    
    -- Current listing status
    is_listed_for_sale BOOLEAN DEFAULT FALSE,
    listing_price NUMERIC(15,2),
    listing_broker VARCHAR(200),
    listing_url TEXT,
    
    -- Geometry (PostGIS)
    geom GEOMETRY(Point, 4326),
    parcel_geom GEOMETRY(MultiPolygon, 4326),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for fast matching
    CONSTRAINT apn_format CHECK (apn ~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}$' OR apn ~ '^[0-9]{8,9}$')
);

-- Create indexes for fast APN matching
CREATE INDEX IF NOT EXISTS idx_watchlist_apn ON apn_watchlist(apn);
CREATE INDEX IF NOT EXISTS idx_watchlist_apn_normalized ON apn_watchlist(apn_normalized);
CREATE INDEX IF NOT EXISTS idx_watchlist_city ON apn_watchlist(city);
CREATE INDEX IF NOT EXISTS idx_watchlist_geom ON apn_watchlist USING GIST(geom);


-- ============================================================================
-- Table: deed_recordings
-- Raw deed recordings from county recorder (populated by monitor script)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deed_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Recording info
    doc_number VARCHAR(50) NOT NULL,              -- County document number (e.g., '2025000123456')
    recording_date DATE NOT NULL,
    doc_type VARCHAR(100),                        -- 'Grant Deed', 'Trust Deed', 'Quitclaim', etc.
    
    -- Parcel info
    apn VARCHAR(20),
    apn_normalized VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    
    -- Parties
    grantor TEXT,                                 -- Seller
    grantee TEXT,                                 -- Buyer
    
    -- Financial (calculated from Documentary Transfer Tax)
    documentary_transfer_tax NUMERIC(10,2),       -- DTT amount on deed
    calculated_sale_price NUMERIC(15,2),          -- Calculated: DTT / 0.0011
    is_exempt BOOLEAN DEFAULT FALSE,              -- Some transfers are DTT-exempt
    
    -- Match status
    matched_watchlist_id UUID REFERENCES apn_watchlist(id),
    match_confidence NUMERIC(3,2),                -- 0.00 to 1.00
    
    -- Raw data
    raw_data JSONB,                               -- Full record from source
    source VARCHAR(50),                           -- 'propertyradar', 'recorderworks', 'attom', etc.
    
    -- Metadata
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    
    UNIQUE(doc_number, recording_date)
);

CREATE INDEX IF NOT EXISTS idx_deeds_apn ON deed_recordings(apn);
CREATE INDEX IF NOT EXISTS idx_deeds_apn_normalized ON deed_recordings(apn_normalized);
CREATE INDEX IF NOT EXISTS idx_deeds_recording_date ON deed_recordings(recording_date DESC);
CREATE INDEX IF NOT EXISTS idx_deeds_doc_type ON deed_recordings(doc_type);
CREATE INDEX IF NOT EXISTS idx_deeds_matched ON deed_recordings(matched_watchlist_id) WHERE matched_watchlist_id IS NOT NULL;


-- ============================================================================
-- Table: sale_alerts
-- Alerts generated when a watched parcel sells
-- ============================================================================

CREATE TABLE IF NOT EXISTS sale_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    watchlist_id UUID NOT NULL REFERENCES apn_watchlist(id),
    deed_id UUID NOT NULL REFERENCES deed_recordings(id),
    
    -- Alert details
    alert_type VARCHAR(50) DEFAULT 'sale_detected',
    priority VARCHAR(20) DEFAULT 'normal',        -- 'high', 'normal', 'low'
    
    -- Sale summary (denormalized for easy access)
    apn VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    sale_price NUMERIC(15,2),
    sale_date DATE,
    buyer TEXT,
    seller TEXT,
    
    -- Comparison to listing (if was listed)
    was_listed BOOLEAN,
    listing_price NUMERIC(15,2),
    price_vs_listing NUMERIC(5,2),                -- % difference from list price
    
    -- Comparison to assessment
    assessed_value NUMERIC(15,2),
    price_vs_assessed NUMERIC(5,2),               -- Sale price / Assessed value ratio
    
    -- Notification status
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_sent_at TIMESTAMPTZ,
    notification_channel VARCHAR(50),             -- 'email', 'slack', 'sms'
    
    -- User interaction
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(watchlist_id, deed_id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_created ON sale_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unacknowledged ON sale_alerts(acknowledged) WHERE NOT acknowledged;
CREATE INDEX IF NOT EXISTS idx_alerts_priority ON sale_alerts(priority, created_at DESC);


-- ============================================================================
-- Table: monitor_runs
-- Track each time the deed monitor runs (for debugging/auditing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS monitor_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Stats
    county VARCHAR(100),
    date_range_start DATE,
    date_range_end DATE,
    records_fetched INTEGER DEFAULT 0,
    records_matched INTEGER DEFAULT 0,
    alerts_created INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(50) DEFAULT 'running',         -- 'running', 'completed', 'failed'
    error_message TEXT,
    
    -- Performance
    duration_seconds NUMERIC(10,2)
);


-- ============================================================================
-- Functions
-- ============================================================================

-- Normalize APN for matching (remove dashes, spaces)
CREATE OR REPLACE FUNCTION normalize_apn(apn TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN REPLACE(REPLACE(COALESCE(apn, ''), '-', ''), ' ', '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- Calculate sale price from Documentary Transfer Tax
-- Orange County rate: $1.10 per $1,000 of sale price
CREATE OR REPLACE FUNCTION calculate_sale_price_from_dtt(
    dtt_amount NUMERIC,
    county VARCHAR DEFAULT 'Orange'
)
RETURNS NUMERIC AS $$
DECLARE
    rate_per_thousand NUMERIC;
BEGIN
    -- Different counties have different rates
    -- Orange County: $1.10 per $1,000
    -- LA County: $1.10 per $1,000 (but cities may add)
    rate_per_thousand := CASE county
        WHEN 'Orange' THEN 1.10
        WHEN 'Los Angeles' THEN 1.10
        WHEN 'San Diego' THEN 1.10
        WHEN 'Riverside' THEN 1.10
        WHEN 'San Bernardino' THEN 1.10
        ELSE 1.10  -- Default CA rate
    END;
    
    IF dtt_amount IS NULL OR dtt_amount = 0 THEN
        RETURN NULL;
    END IF;
    
    RETURN ROUND((dtt_amount / rate_per_thousand) * 1000, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- Match a deed recording to watchlist and create alert
CREATE OR REPLACE FUNCTION process_deed_match(deed_record_id UUID)
RETURNS UUID AS $$
DECLARE
    deed_rec RECORD;
    watchlist_rec RECORD;
    new_alert_id UUID;
    price_vs_assessed NUMERIC;
    price_vs_listing NUMERIC;
    alert_priority VARCHAR(20);
BEGIN
    -- Get deed record
    SELECT * INTO deed_rec FROM deed_recordings WHERE id = deed_record_id;
    
    IF deed_rec.matched_watchlist_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Get watchlist record
    SELECT * INTO watchlist_rec FROM apn_watchlist WHERE id = deed_rec.matched_watchlist_id;
    
    -- Calculate price ratios
    IF watchlist_rec.assessed_total > 0 THEN
        price_vs_assessed := deed_rec.calculated_sale_price / watchlist_rec.assessed_total;
    END IF;
    
    IF watchlist_rec.listing_price > 0 THEN
        price_vs_listing := ((deed_rec.calculated_sale_price - watchlist_rec.listing_price) / watchlist_rec.listing_price) * 100;
    END IF;
    
    -- Determine priority
    alert_priority := CASE
        WHEN deed_rec.calculated_sale_price > 5000000 THEN 'high'
        WHEN watchlist_rec.is_listed_for_sale THEN 'high'
        ELSE 'normal'
    END;
    
    -- Create alert
    INSERT INTO sale_alerts (
        watchlist_id,
        deed_id,
        priority,
        apn,
        address,
        city,
        sale_price,
        sale_date,
        buyer,
        seller,
        was_listed,
        listing_price,
        price_vs_listing,
        assessed_value,
        price_vs_assessed
    ) VALUES (
        watchlist_rec.id,
        deed_rec.id,
        alert_priority,
        watchlist_rec.apn,
        watchlist_rec.address,
        watchlist_rec.city,
        deed_rec.calculated_sale_price,
        deed_rec.recording_date,
        deed_rec.grantee,
        deed_rec.grantor,
        watchlist_rec.is_listed_for_sale,
        watchlist_rec.listing_price,
        price_vs_listing,
        watchlist_rec.assessed_total,
        price_vs_assessed
    )
    ON CONFLICT (watchlist_id, deed_id) DO NOTHING
    RETURNING id INTO new_alert_id;
    
    -- Update watchlist with new sale info
    UPDATE apn_watchlist SET
        last_sale_date = deed_rec.recording_date,
        last_sale_price = deed_rec.calculated_sale_price,
        last_sale_doc_number = deed_rec.doc_number,
        is_listed_for_sale = FALSE,  -- No longer listed if it sold
        updated_at = NOW()
    WHERE id = watchlist_rec.id;
    
    RETURN new_alert_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- Views
-- ============================================================================

-- Recent sales on watched properties
CREATE OR REPLACE VIEW recent_industrial_sales AS
SELECT 
    sa.created_at AS alert_date,
    sa.apn,
    sa.address,
    sa.city,
    sa.sale_price,
    sa.sale_date,
    sa.buyer,
    sa.seller,
    sa.was_listed,
    sa.listing_price,
    sa.price_vs_listing,
    sa.price_vs_assessed,
    w.building_sf,
    w.lot_sf,
    CASE WHEN w.building_sf > 0 
         THEN ROUND(sa.sale_price / w.building_sf, 2) 
         ELSE NULL 
    END AS price_per_sf,
    sa.priority,
    sa.acknowledged
FROM sale_alerts sa
JOIN apn_watchlist w ON sa.watchlist_id = w.id
ORDER BY sa.sale_date DESC;


-- Dashboard summary
CREATE OR REPLACE VIEW monitor_dashboard AS
SELECT
    (SELECT COUNT(*) FROM apn_watchlist) AS total_watched_parcels,
    (SELECT COUNT(*) FROM apn_watchlist WHERE is_listed_for_sale) AS currently_listed,
    (SELECT COUNT(*) FROM sale_alerts WHERE created_at > NOW() - INTERVAL '7 days') AS sales_last_7_days,
    (SELECT COUNT(*) FROM sale_alerts WHERE created_at > NOW() - INTERVAL '30 days') AS sales_last_30_days,
    (SELECT COUNT(*) FROM sale_alerts WHERE NOT acknowledged) AS unacknowledged_alerts,
    (SELECT MAX(completed_at) FROM monitor_runs WHERE status = 'completed') AS last_successful_run,
    (SELECT SUM(calculated_sale_price) FROM deed_recordings dr
     JOIN sale_alerts sa ON dr.id = sa.deed_id 
     WHERE sa.created_at > NOW() - INTERVAL '30 days') AS total_volume_30_days;


-- ============================================================================
-- Row Level Security (if using Supabase auth)
-- ============================================================================

-- ALTER TABLE apn_watchlist ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE deed_recordings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sale_alerts ENABLE ROW LEVEL SECURITY;

-- Policies would go here if multi-tenant


-- ============================================================================
-- Initial Data Load Helper
-- Run this to import your existing APN list from BuildingHawk
-- ============================================================================

-- Example: Import from existing properties table
-- INSERT INTO apn_watchlist (apn, address, city, building_sf, lot_sf, geom)
-- SELECT 
--     parcel_apn,
--     address,
--     city,
--     building_sf,
--     lot_sf,
--     geom
-- FROM properties
-- WHERE property_type = 'industrial'
--   AND parcel_apn IS NOT NULL
-- ON CONFLICT (apn) DO NOTHING;
