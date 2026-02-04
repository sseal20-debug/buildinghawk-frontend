-- ============================================================================
-- LOT/TRACT TO APN LOOKUP TABLE
-- For matching RecorderWorks deeds (which have Lot/Tract but no APN)
-- ============================================================================

-- Table: lot_tract_apn_lookup
-- Maps Lot/Tract/City combinations to APNs
-- Data sources: OC Assessor, LandVision, TitlePro
-- ============================================================================

CREATE TABLE IF NOT EXISTS lot_tract_apn_lookup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Lot/Tract identifiers (from recorded documents)
    lot_number VARCHAR(20) NOT NULL,
    tract_number VARCHAR(20) NOT NULL,

    -- City helps disambiguate when same lot/tract exists in multiple areas
    city VARCHAR(100),

    -- The APN this lot/tract maps to
    apn VARCHAR(20) NOT NULL,
    apn_normalized VARCHAR(20) GENERATED ALWAYS AS (
        REPLACE(REPLACE(apn, '-', ''), ' ', '')
    ) STORED,

    -- Additional context (optional)
    subdivision_name VARCHAR(200),
    phase VARCHAR(50),

    -- Data source tracking
    source VARCHAR(50),  -- 'assessor', 'landvision', 'titlepro', 'manual'
    source_date DATE,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint on lot/tract/city combination
    UNIQUE(lot_number, tract_number, city)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_lot_tract_lookup_lot ON lot_tract_apn_lookup(lot_number);
CREATE INDEX IF NOT EXISTS idx_lot_tract_lookup_tract ON lot_tract_apn_lookup(tract_number);
CREATE INDEX IF NOT EXISTS idx_lot_tract_lookup_lot_tract ON lot_tract_apn_lookup(lot_number, tract_number);
CREATE INDEX IF NOT EXISTS idx_lot_tract_lookup_apn ON lot_tract_apn_lookup(apn);
CREATE INDEX IF NOT EXISTS idx_lot_tract_lookup_apn_normalized ON lot_tract_apn_lookup(apn_normalized);
CREATE INDEX IF NOT EXISTS idx_lot_tract_lookup_city ON lot_tract_apn_lookup(city);


-- ============================================================================
-- Function to look up APN from Lot/Tract
-- ============================================================================

CREATE OR REPLACE FUNCTION lookup_apn_from_lot_tract(
    p_lot_number VARCHAR,
    p_tract_number VARCHAR,
    p_city VARCHAR DEFAULT NULL
)
RETURNS VARCHAR AS $$
DECLARE
    result_apn VARCHAR;
BEGIN
    -- First try exact match with city
    IF p_city IS NOT NULL THEN
        SELECT apn INTO result_apn
        FROM lot_tract_apn_lookup
        WHERE lot_number = p_lot_number
          AND tract_number = p_tract_number
          AND LOWER(city) = LOWER(p_city)
        LIMIT 1;

        IF result_apn IS NOT NULL THEN
            RETURN result_apn;
        END IF;
    END IF;

    -- Fall back to match without city (may return multiple)
    SELECT apn INTO result_apn
    FROM lot_tract_apn_lookup
    WHERE lot_number = p_lot_number
      AND tract_number = p_tract_number
    LIMIT 1;

    RETURN result_apn;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- ADDRESS MATCHING SUPPORT
-- Add normalized address columns and indexes for fuzzy matching
-- ============================================================================

-- Add normalized address column to watchlist if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'apn_watchlist'
        AND column_name = 'address_normalized'
    ) THEN
        ALTER TABLE apn_watchlist ADD COLUMN address_normalized TEXT;
    END IF;
END $$;

-- Function to normalize addresses for matching
CREATE OR REPLACE FUNCTION normalize_address(addr TEXT)
RETURNS TEXT AS $$
BEGIN
    IF addr IS NULL THEN
        RETURN NULL;
    END IF;

    -- Lowercase
    addr := LOWER(addr);

    -- Remove punctuation
    addr := REGEXP_REPLACE(addr, '[.,#]', '', 'g');

    -- Standardize directionals
    addr := REGEXP_REPLACE(addr, '\bnorth\b', 'n', 'g');
    addr := REGEXP_REPLACE(addr, '\bsouth\b', 's', 'g');
    addr := REGEXP_REPLACE(addr, '\beast\b', 'e', 'g');
    addr := REGEXP_REPLACE(addr, '\bwest\b', 'w', 'g');
    addr := REGEXP_REPLACE(addr, '\bnortheast\b', 'ne', 'g');
    addr := REGEXP_REPLACE(addr, '\bnorthwest\b', 'nw', 'g');
    addr := REGEXP_REPLACE(addr, '\bsoutheast\b', 'se', 'g');
    addr := REGEXP_REPLACE(addr, '\bsouthwest\b', 'sw', 'g');

    -- Standardize street types
    addr := REGEXP_REPLACE(addr, '\bstreet\b', 'st', 'g');
    addr := REGEXP_REPLACE(addr, '\bavenue\b', 'ave', 'g');
    addr := REGEXP_REPLACE(addr, '\bboulevard\b', 'blvd', 'g');
    addr := REGEXP_REPLACE(addr, '\bdrive\b', 'dr', 'g');
    addr := REGEXP_REPLACE(addr, '\broad\b', 'rd', 'g');
    addr := REGEXP_REPLACE(addr, '\blane\b', 'ln', 'g');
    addr := REGEXP_REPLACE(addr, '\bcourt\b', 'ct', 'g');
    addr := REGEXP_REPLACE(addr, '\bcircle\b', 'cir', 'g');
    addr := REGEXP_REPLACE(addr, '\bplace\b', 'pl', 'g');
    addr := REGEXP_REPLACE(addr, '\bway\b', 'wy', 'g');
    addr := REGEXP_REPLACE(addr, '\bparkway\b', 'pkwy', 'g');
    addr := REGEXP_REPLACE(addr, '\bhighway\b', 'hwy', 'g');

    -- Remove extra whitespace
    addr := REGEXP_REPLACE(addr, '\s+', ' ', 'g');
    addr := TRIM(addr);

    RETURN addr;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update normalized addresses in watchlist
UPDATE apn_watchlist
SET address_normalized = normalize_address(address)
WHERE address IS NOT NULL
  AND address_normalized IS NULL;

-- Create trigger to auto-normalize addresses
CREATE OR REPLACE FUNCTION update_address_normalized()
RETURNS TRIGGER AS $$
BEGIN
    NEW.address_normalized := normalize_address(NEW.address);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_address ON apn_watchlist;
CREATE TRIGGER trg_normalize_address
    BEFORE INSERT OR UPDATE OF address ON apn_watchlist
    FOR EACH ROW
    EXECUTE FUNCTION update_address_normalized();

-- Indexes for address matching
CREATE INDEX IF NOT EXISTS idx_watchlist_address_normalized ON apn_watchlist(address_normalized);
CREATE INDEX IF NOT EXISTS idx_watchlist_city_lower ON apn_watchlist(LOWER(city));

-- Partial index for faster lookup by street number prefix
CREATE INDEX IF NOT EXISTS idx_watchlist_street_num ON apn_watchlist(
    SUBSTRING(address_normalized FROM '^\d+')
) WHERE address_normalized IS NOT NULL;


-- ============================================================================
-- Function to find watchlist entries by address similarity
-- ============================================================================

CREATE OR REPLACE FUNCTION find_by_address(
    p_address TEXT,
    p_city TEXT,
    p_min_similarity FLOAT DEFAULT 0.85
)
RETURNS TABLE (
    watchlist_id UUID,
    apn VARCHAR,
    address TEXT,
    city VARCHAR,
    similarity FLOAT
) AS $$
DECLARE
    normalized_input TEXT;
    street_number TEXT;
BEGIN
    normalized_input := normalize_address(p_address);

    -- Extract street number for quick filtering
    street_number := SUBSTRING(normalized_input FROM '^\d+');

    RETURN QUERY
    SELECT
        w.id AS watchlist_id,
        w.apn,
        w.address,
        w.city,
        similarity(w.address_normalized, normalized_input) AS similarity
    FROM apn_watchlist w
    WHERE
        -- Quick filter by street number
        SUBSTRING(w.address_normalized FROM '^\d+') = street_number
        -- And city match
        AND LOWER(w.city) = LOWER(p_city)
        -- And minimum similarity
        AND similarity(w.address_normalized, normalized_input) >= p_min_similarity
    ORDER BY similarity DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Note: The similarity() function requires pg_trgm extension
-- Enable it if not already:
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index for trigram similarity searches
CREATE INDEX IF NOT EXISTS idx_watchlist_address_trgm ON apn_watchlist
USING GIN (address_normalized gin_trgm_ops)
WHERE address_normalized IS NOT NULL;


-- ============================================================================
-- View: Deed recordings needing manual APN lookup
-- ============================================================================

CREATE OR REPLACE VIEW deed_recordings_need_apn AS
SELECT
    dr.id,
    dr.doc_number,
    dr.recording_date,
    dr.doc_type,
    dr.city,
    dr.documentary_transfer_tax,
    dr.calculated_sale_price,
    dr.grantor,
    dr.grantee,
    dr.raw_data->>'lot_number' AS lot_number,
    dr.raw_data->>'tract_number' AS tract_number,
    dr.fetched_at
FROM deed_recordings dr
WHERE dr.apn IS NULL
  AND dr.matched_watchlist_id IS NULL
  AND dr.documentary_transfer_tax > 0
ORDER BY dr.recording_date DESC, dr.calculated_sale_price DESC;


-- ============================================================================
-- Sample data (for testing - delete in production)
-- ============================================================================

-- Example: Insert some test Lot/Tract mappings
-- These would normally come from assessor data or LandVision exports
/*
INSERT INTO lot_tract_apn_lookup (lot_number, tract_number, city, apn, source)
VALUES
    ('87', '13141', 'Rancho Santa Margarita', '754-012-03', 'manual'),
    ('1', '5000', 'Anaheim', '082-261-15', 'manual'),
    ('23', '4500', 'Orange', '360-384-05', 'manual')
ON CONFLICT (lot_number, tract_number, city) DO NOTHING;
*/
