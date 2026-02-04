-- Comps (Comparables) Schema for Building Hawk
-- Tracks lease and sale comparables for market analysis

-- ============================================================================
-- ENUM TYPES FOR COMPS
-- ============================================================================

CREATE TYPE comp_type AS ENUM ('lease', 'sale');
CREATE TYPE lease_structure AS ENUM ('nnn', 'gross', 'modified_gross', 'fsg', 'industrial_gross');
CREATE TYPE sale_type AS ENUM ('investment', 'owner_user', 'land', 'portfolio', 'distressed');
CREATE TYPE comp_source AS ENUM ('costar', 'loopnet', 'broker', 'public_record', 'client', 'manual');
CREATE TYPE verification_status AS ENUM ('unverified', 'verified', 'disputed');

-- ============================================================================
-- LEASE COMPS TABLE
-- ============================================================================

CREATE TABLE lease_comp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Property identification
    property_address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) DEFAULT 'CA',
    zip VARCHAR(10),
    submarket VARCHAR(100),
    parcel_apn VARCHAR(20) REFERENCES parcel(apn) ON DELETE SET NULL,
    building_id UUID REFERENCES building(id) ON DELETE SET NULL,

    -- Property specs
    building_sf INTEGER,
    leased_sf INTEGER NOT NULL,
    office_sf INTEGER,
    warehouse_sf INTEGER,
    clear_height_ft DECIMAL(5,2),
    dock_doors INTEGER,
    gl_doors INTEGER,
    year_built INTEGER,
    property_type VARCHAR(50) DEFAULT 'Industrial',

    -- Lease terms
    lease_date DATE NOT NULL,
    lease_start DATE,
    lease_expiration DATE,
    lease_term_months INTEGER,
    lease_structure lease_structure,

    -- Financials
    starting_rent_psf DECIMAL(10,2),  -- Per SF per month
    effective_rent_psf DECIMAL(10,2),
    ending_rent_psf DECIMAL(10,2),
    annual_increases DECIMAL(5,2),  -- Percentage
    free_rent_months INTEGER DEFAULT 0,
    ti_allowance_psf DECIMAL(10,2),  -- Tenant improvement allowance
    nnn_expenses_psf DECIMAL(10,2),  -- NNN expense estimate

    -- Parties
    tenant_name VARCHAR(255),
    tenant_industry VARCHAR(100),
    landlord_name VARCHAR(255),
    listing_broker VARCHAR(255),
    tenant_broker VARCHAR(255),

    -- Source & verification
    source comp_source DEFAULT 'manual',
    source_id VARCHAR(100),  -- External ID from CoStar, etc.
    verification_status verification_status DEFAULT 'unverified',
    verified_by VARCHAR(100),
    verified_date DATE,

    -- Notes
    notes TEXT,
    confidential BOOLEAN DEFAULT false,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_lease_comp_address ON lease_comp USING gin(to_tsvector('english', property_address));
CREATE INDEX idx_lease_comp_city ON lease_comp (city);
CREATE INDEX idx_lease_comp_date ON lease_comp (lease_date);
CREATE INDEX idx_lease_comp_sf ON lease_comp (leased_sf);
CREATE INDEX idx_lease_comp_rent ON lease_comp (starting_rent_psf);
CREATE INDEX idx_lease_comp_tenant ON lease_comp USING gin(to_tsvector('english', tenant_name));

-- ============================================================================
-- SALE COMPS TABLE
-- ============================================================================

CREATE TABLE sale_comp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Property identification
    property_address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) DEFAULT 'CA',
    zip VARCHAR(10),
    submarket VARCHAR(100),
    parcel_apn VARCHAR(20) REFERENCES parcel(apn) ON DELETE SET NULL,
    building_id UUID REFERENCES building(id) ON DELETE SET NULL,

    -- Property specs
    building_sf INTEGER NOT NULL,
    land_sf INTEGER,
    land_acres DECIMAL(10,4),
    office_sf INTEGER,
    warehouse_sf INTEGER,
    clear_height_ft DECIMAL(5,2),
    dock_doors INTEGER,
    gl_doors INTEGER,
    year_built INTEGER,
    property_type VARCHAR(50) DEFAULT 'Industrial',
    building_class VARCHAR(1),  -- A, B, C

    -- Sale details
    sale_date DATE NOT NULL,
    sale_type sale_type,
    sale_price DECIMAL(15,2) NOT NULL,
    price_psf DECIMAL(10,2),
    price_per_land_sf DECIMAL(10,2),
    cap_rate DECIMAL(5,2),
    noi DECIMAL(15,2),  -- Net Operating Income

    -- Occupancy at sale
    occupancy_pct DECIMAL(5,2),
    in_place_rent_psf DECIMAL(10,2),

    -- Parties
    buyer_name VARCHAR(255),
    buyer_type VARCHAR(50),  -- REIT, Private, Institution, etc.
    seller_name VARCHAR(255),
    listing_broker VARCHAR(255),
    buyer_broker VARCHAR(255),

    -- Financing
    down_payment_pct DECIMAL(5,2),
    loan_amount DECIMAL(15,2),
    interest_rate DECIMAL(5,3),

    -- Source & verification
    source comp_source DEFAULT 'manual',
    source_id VARCHAR(100),
    verification_status verification_status DEFAULT 'unverified',
    verified_by VARCHAR(100),
    verified_date DATE,

    -- Notes
    notes TEXT,
    confidential BOOLEAN DEFAULT false,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sale_comp_address ON sale_comp USING gin(to_tsvector('english', property_address));
CREATE INDEX idx_sale_comp_city ON sale_comp (city);
CREATE INDEX idx_sale_comp_date ON sale_comp (sale_date);
CREATE INDEX idx_sale_comp_sf ON sale_comp (building_sf);
CREATE INDEX idx_sale_comp_price ON sale_comp (sale_price);
CREATE INDEX idx_sale_comp_psf ON sale_comp (price_psf);

-- ============================================================================
-- COMP SETS (saved groupings for reports)
-- ============================================================================

CREATE TABLE comp_set (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    comp_type comp_type NOT NULL,
    created_by VARCHAR(100),

    -- Search criteria used to create set
    criteria JSONB,

    -- Subject property (what we're comparing to)
    subject_address VARCHAR(255),
    subject_sf INTEGER,
    subject_asking_rent DECIMAL(10,2),
    subject_asking_price DECIMAL(15,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Junction table for comp set members
CREATE TABLE comp_set_lease (
    comp_set_id UUID NOT NULL REFERENCES comp_set(id) ON DELETE CASCADE,
    lease_comp_id UUID NOT NULL REFERENCES lease_comp(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (comp_set_id, lease_comp_id)
);

CREATE TABLE comp_set_sale (
    comp_set_id UUID NOT NULL REFERENCES comp_set(id) ON DELETE CASCADE,
    sale_comp_id UUID NOT NULL REFERENCES sale_comp(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (comp_set_id, sale_comp_id)
);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER trg_lease_comp_updated_at BEFORE UPDATE ON lease_comp
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sale_comp_updated_at BEFORE UPDATE ON sale_comp
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_comp_set_updated_at BEFORE UPDATE ON comp_set
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Lease comp summary with calculated fields
CREATE VIEW v_lease_comps AS
SELECT
    lc.*,
    lc.starting_rent_psf * 12 AS annual_rent_psf,
    CASE WHEN lc.leased_sf > 0 THEN lc.starting_rent_psf * lc.leased_sf ELSE NULL END AS monthly_rent_total,
    CASE WHEN lc.lease_term_months > 0 THEN
        lc.starting_rent_psf - (lc.free_rent_months::decimal / lc.lease_term_months * lc.starting_rent_psf)
    ELSE lc.starting_rent_psf END AS effective_starting_rent
FROM lease_comp lc;

-- View: Sale comp summary with calculated fields
CREATE VIEW v_sale_comps AS
SELECT
    sc.*,
    CASE WHEN sc.building_sf > 0 THEN sc.sale_price / sc.building_sf ELSE NULL END AS calc_price_psf,
    CASE WHEN sc.land_sf > 0 THEN sc.sale_price / sc.land_sf ELSE NULL END AS calc_price_per_land_sf,
    CASE WHEN sc.land_sf > 0 AND sc.building_sf > 0 THEN
        ROUND((sc.building_sf::decimal / sc.land_sf) * 100, 2)
    ELSE NULL END AS building_coverage_pct
FROM sale_comp sc;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Search lease comps
CREATE OR REPLACE FUNCTION search_lease_comps(
    p_min_sf INTEGER DEFAULT NULL,
    p_max_sf INTEGER DEFAULT NULL,
    p_min_rent DECIMAL DEFAULT NULL,
    p_max_rent DECIMAL DEFAULT NULL,
    p_city VARCHAR DEFAULT NULL,
    p_submarket VARCHAR DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_lease_structure lease_structure DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    property_address VARCHAR,
    city VARCHAR,
    leased_sf INTEGER,
    lease_date DATE,
    starting_rent_psf DECIMAL,
    lease_structure lease_structure,
    tenant_name VARCHAR,
    source comp_source
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        lc.id,
        lc.property_address,
        lc.city,
        lc.leased_sf,
        lc.lease_date,
        lc.starting_rent_psf,
        lc.lease_structure,
        lc.tenant_name,
        lc.source
    FROM lease_comp lc
    WHERE
        (p_min_sf IS NULL OR lc.leased_sf >= p_min_sf)
        AND (p_max_sf IS NULL OR lc.leased_sf <= p_max_sf)
        AND (p_min_rent IS NULL OR lc.starting_rent_psf >= p_min_rent)
        AND (p_max_rent IS NULL OR lc.starting_rent_psf <= p_max_rent)
        AND (p_city IS NULL OR lc.city ILIKE p_city)
        AND (p_submarket IS NULL OR lc.submarket ILIKE p_submarket)
        AND (p_start_date IS NULL OR lc.lease_date >= p_start_date)
        AND (p_end_date IS NULL OR lc.lease_date <= p_end_date)
        AND (p_lease_structure IS NULL OR lc.lease_structure = p_lease_structure)
        AND lc.confidential = false
    ORDER BY lc.lease_date DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Search sale comps
CREATE OR REPLACE FUNCTION search_sale_comps(
    p_min_sf INTEGER DEFAULT NULL,
    p_max_sf INTEGER DEFAULT NULL,
    p_min_price DECIMAL DEFAULT NULL,
    p_max_price DECIMAL DEFAULT NULL,
    p_min_psf DECIMAL DEFAULT NULL,
    p_max_psf DECIMAL DEFAULT NULL,
    p_city VARCHAR DEFAULT NULL,
    p_submarket VARCHAR DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_sale_type sale_type DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    property_address VARCHAR,
    city VARCHAR,
    building_sf INTEGER,
    sale_date DATE,
    sale_price DECIMAL,
    price_psf DECIMAL,
    cap_rate DECIMAL,
    buyer_name VARCHAR,
    source comp_source
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sc.id,
        sc.property_address,
        sc.city,
        sc.building_sf,
        sc.sale_date,
        sc.sale_price,
        sc.price_psf,
        sc.cap_rate,
        sc.buyer_name,
        sc.source
    FROM sale_comp sc
    WHERE
        (p_min_sf IS NULL OR sc.building_sf >= p_min_sf)
        AND (p_max_sf IS NULL OR sc.building_sf <= p_max_sf)
        AND (p_min_price IS NULL OR sc.sale_price >= p_min_price)
        AND (p_max_price IS NULL OR sc.sale_price <= p_max_price)
        AND (p_min_psf IS NULL OR sc.price_psf >= p_min_psf)
        AND (p_max_psf IS NULL OR sc.price_psf <= p_max_psf)
        AND (p_city IS NULL OR sc.city ILIKE p_city)
        AND (p_submarket IS NULL OR sc.submarket ILIKE p_submarket)
        AND (p_start_date IS NULL OR sc.sale_date >= p_start_date)
        AND (p_end_date IS NULL OR sc.sale_date <= p_end_date)
        AND (p_sale_type IS NULL OR sc.sale_type = p_sale_type)
        AND sc.confidential = false
    ORDER BY sc.sale_date DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Get comp statistics for a set
CREATE OR REPLACE FUNCTION get_lease_comp_stats(p_comp_ids UUID[])
RETURNS TABLE (
    count INTEGER,
    avg_rent_psf DECIMAL,
    min_rent_psf DECIMAL,
    max_rent_psf DECIMAL,
    avg_sf INTEGER,
    total_sf BIGINT,
    avg_term_months DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER,
        ROUND(AVG(starting_rent_psf), 2),
        MIN(starting_rent_psf),
        MAX(starting_rent_psf),
        ROUND(AVG(leased_sf))::INTEGER,
        SUM(leased_sf)::BIGINT,
        ROUND(AVG(lease_term_months), 1)
    FROM lease_comp
    WHERE id = ANY(p_comp_ids);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_sale_comp_stats(p_comp_ids UUID[])
RETURNS TABLE (
    count INTEGER,
    avg_price_psf DECIMAL,
    min_price_psf DECIMAL,
    max_price_psf DECIMAL,
    avg_cap_rate DECIMAL,
    total_volume DECIMAL,
    avg_sf INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER,
        ROUND(AVG(price_psf), 2),
        MIN(price_psf),
        MAX(price_psf),
        ROUND(AVG(cap_rate), 2),
        SUM(sale_price),
        ROUND(AVG(building_sf))::INTEGER
    FROM sale_comp
    WHERE id = ANY(p_comp_ids);
END;
$$ LANGUAGE plpgsql;
