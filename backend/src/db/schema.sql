-- Industrial Property Tracker Database Schema
-- PostgreSQL 16 + PostGIS 3.4

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE unit_status AS ENUM ('occupied', 'vacant', 'under_construction');
CREATE TYPE occupant_type AS ENUM ('owner_user', 'tenant', 'investor');
CREATE TYPE lease_type AS ENUM ('nnn', 'gross', 'modified_gross');
CREATE TYPE market_status AS ENUM ('stable', 'relocation', 'growth', 'expansion', 'contraction');
CREATE TYPE entity_type AS ENUM ('company', 'individual', 'trust', 'llc', 'partnership');
CREATE TYPE alert_type AS ENUM ('call', 'email', 'follow_up', 'lease_expiration', 'search_match');
CREATE TYPE audit_action AS ENUM ('insert', 'update', 'delete');
CREATE TYPE geo_type AS ENUM ('submarket', 'city', 'custom', 'zip');
CREATE TYPE power_volts AS ENUM ('120/240', '277/480', 'both', 'unknown');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- PARCEL: Land parcels from OC Assessor
CREATE TABLE parcel (
    apn VARCHAR(20) PRIMARY KEY,
    geometry GEOMETRY(Polygon, 4326) NOT NULL,
    centroid GEOMETRY(Point, 4326) GENERATED ALWAYS AS (ST_Centroid(geometry)) STORED,
    situs_address VARCHAR(255),
    city VARCHAR(100),
    zip VARCHAR(10),
    land_sf INTEGER,
    zoning VARCHAR(50),
    assessor_owner_name VARCHAR(255),
    assessor_land_value DECIMAL(15,2),
    assessor_improvement_value DECIMAL(15,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_parcel_geometry ON parcel USING GIST (geometry);
CREATE INDEX idx_parcel_centroid ON parcel USING GIST (centroid);
CREATE INDEX idx_parcel_city ON parcel (city);
CREATE INDEX idx_parcel_zip ON parcel (zip);
CREATE INDEX idx_parcel_address ON parcel USING gin(to_tsvector('english', situs_address));

-- BUILDING: Buildings on parcels
CREATE TABLE building (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_apn VARCHAR(20) NOT NULL REFERENCES parcel(apn) ON DELETE CASCADE,
    building_name VARCHAR(100),
    building_sf INTEGER,
    year_built INTEGER,
    construction_type VARCHAR(50),
    office_stories INTEGER DEFAULT 1 CHECK (office_stories IN (1, 2)),
    sprinklers BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_building_parcel ON building (parcel_apn);

-- Computed column for building coverage (via trigger since we need parcel data)
-- See trigger below

-- UNIT: Individual units within buildings
CREATE TABLE unit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID NOT NULL REFERENCES building(id) ON DELETE CASCADE,
    unit_number VARCHAR(50),
    street_address VARCHAR(255) NOT NULL,
    unit_sf INTEGER,
    warehouse_sf INTEGER,
    office_sf INTEGER,
    clear_height_ft DECIMAL(5,2),
    dock_doors INTEGER DEFAULT 0,
    gl_doors INTEGER DEFAULT 0,
    power_amps INTEGER,
    power_volts power_volts DEFAULT 'unknown',
    fenced_yard BOOLEAN DEFAULT false,
    yard_sf INTEGER,
    unit_status unit_status DEFAULT 'vacant',
    for_sale BOOLEAN DEFAULT false,
    for_lease BOOLEAN DEFAULT false,
    asking_sale_price DECIMAL(15,2),
    asking_sale_price_psf DECIMAL(10,2),
    asking_lease_rate DECIMAL(10,2),  -- per SF per month
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_unit_building ON unit (building_id);
CREATE INDEX idx_unit_status ON unit (unit_status);
CREATE INDEX idx_unit_for_sale ON unit (for_sale) WHERE for_sale = true;
CREATE INDEX idx_unit_for_lease ON unit (for_lease) WHERE for_lease = true;
CREATE INDEX idx_unit_address ON unit USING gin(to_tsvector('english', street_address));

-- ============================================================================
-- ENTITY & CONTACT TABLES
-- ============================================================================

-- ENTITY: Companies, individuals, trusts that own or occupy properties
CREATE TABLE entity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_name VARCHAR(255) NOT NULL,
    entity_type entity_type DEFAULT 'company',
    website VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_entity_name ON entity USING gin(to_tsvector('english', entity_name));

-- CONTACT: People associated with entities
CREATE TABLE contact (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(100),
    email VARCHAR(255),
    mobile VARCHAR(50),
    phone VARCHAR(50),
    is_primary BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contact_entity ON contact (entity_id);
CREATE INDEX idx_contact_name ON contact USING gin(to_tsvector('english', name));

-- ============================================================================
-- RELATIONSHIP TABLES
-- ============================================================================

-- OWNERSHIP: Who owns buildings (historical records preserved)
CREATE TABLE ownership (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID NOT NULL REFERENCES building(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
    purchase_date DATE,
    purchase_price DECIMAL(15,2),
    purchase_price_psf DECIMAL(10,2),
    land_price_psf DECIMAL(10,2),  -- Show when building coverage < 45%
    is_current BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ownership_building ON ownership (building_id);
CREATE INDEX idx_ownership_entity ON ownership (entity_id);
CREATE INDEX idx_ownership_current ON ownership (is_current) WHERE is_current = true;

-- OCCUPANCY: Who occupies units (tenants, owner-users)
CREATE TABLE occupancy (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES unit(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
    occupant_type occupant_type NOT NULL,
    lease_start DATE,
    lease_expiration DATE,
    rent_psf_month DECIMAL(10,2),
    rent_total_month DECIMAL(15,2),
    lease_type lease_type,
    nnn_fees_month DECIMAL(10,2),
    market_status market_status DEFAULT 'stable',
    is_current BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_occupancy_unit ON occupancy (unit_id);
CREATE INDEX idx_occupancy_entity ON occupancy (entity_id);
CREATE INDEX idx_occupancy_current ON occupancy (is_current) WHERE is_current = true;
CREATE INDEX idx_occupancy_lease_exp ON occupancy (lease_expiration) WHERE is_current = true;
CREATE INDEX idx_occupancy_market_status ON occupancy (market_status) WHERE is_current = true;

-- ============================================================================
-- ALERTS & SAVED SEARCHES
-- ============================================================================

-- ALERT: Reminders for follow-ups
CREATE TABLE alert (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type alert_type NOT NULL,
    alert_date TIMESTAMP WITH TIME ZONE NOT NULL,
    entity_id UUID REFERENCES entity(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contact(id) ON DELETE SET NULL,
    unit_id UUID REFERENCES unit(id) ON DELETE SET NULL,
    saved_search_id UUID,  -- FK added after saved_search table
    note TEXT,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_alert_date ON alert (alert_date) WHERE is_completed = false;
CREATE INDEX idx_alert_entity ON alert (entity_id);

-- SAVED_SEARCH: Client requirements for property matching
CREATE TABLE saved_search (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    client_name VARCHAR(255),
    client_email VARCHAR(255),
    client_phone VARCHAR(50),
    criteria JSONB NOT NULL,  -- Stores all filter parameters
    alert_enabled BOOLEAN DEFAULT false,
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    match_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_saved_search_active ON saved_search (is_active) WHERE is_active = true;
CREATE INDEX idx_saved_search_criteria ON saved_search USING gin(criteria);

-- Add FK for alert -> saved_search
ALTER TABLE alert ADD CONSTRAINT fk_alert_saved_search
    FOREIGN KEY (saved_search_id) REFERENCES saved_search(id) ON DELETE SET NULL;

-- ============================================================================
-- GEOGRAPHY: Submarkets and custom areas
-- ============================================================================

CREATE TABLE geography (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    geometry GEOMETRY(Polygon, 4326) NOT NULL,
    geo_type geo_type NOT NULL,
    parent_id UUID REFERENCES geography(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_geography_geometry ON geography USING GIST (geometry);
CREATE INDEX idx_geography_type ON geography (geo_type);

-- ============================================================================
-- AUDIT LOG: Change history
-- ============================================================================

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    table_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action audit_action NOT NULL,
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    user_id UUID  -- For future multi-user support
);

CREATE INDEX idx_audit_log_record ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log (timestamp);

-- ============================================================================
-- TRIGGERS: Auto-update timestamps and audit logging
-- ============================================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with that column
CREATE TRIGGER trg_parcel_updated_at BEFORE UPDATE ON parcel
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_building_updated_at BEFORE UPDATE ON building
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_unit_updated_at BEFORE UPDATE ON unit
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_entity_updated_at BEFORE UPDATE ON entity
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contact_updated_at BEFORE UPDATE ON contact
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ownership_updated_at BEFORE UPDATE ON ownership
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_occupancy_updated_at BEFORE UPDATE ON occupancy
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_saved_search_updated_at BEFORE UPDATE ON saved_search
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- AUDIT LOGGING TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    old_row JSONB;
    new_row JSONB;
    key TEXT;
    old_val TEXT;
    new_val TEXT;
    record_uuid UUID;
BEGIN
    -- Get the record ID
    IF TG_OP = 'DELETE' THEN
        record_uuid := OLD.id;
        old_row := to_jsonb(OLD);

        INSERT INTO audit_log (table_name, record_id, action, field_name, old_value, new_value)
        VALUES (TG_TABLE_NAME, record_uuid, 'delete', NULL, old_row::text, NULL);

        RETURN OLD;
    ELSIF TG_OP = 'INSERT' THEN
        record_uuid := NEW.id;
        new_row := to_jsonb(NEW);

        INSERT INTO audit_log (table_name, record_id, action, field_name, old_value, new_value)
        VALUES (TG_TABLE_NAME, record_uuid, 'insert', NULL, NULL, new_row::text);

        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        record_uuid := NEW.id;
        old_row := to_jsonb(OLD);
        new_row := to_jsonb(NEW);

        -- Log each changed field separately
        FOR key IN SELECT jsonb_object_keys(new_row)
        LOOP
            -- Skip timestamp fields
            IF key IN ('created_at', 'updated_at') THEN
                CONTINUE;
            END IF;

            old_val := old_row ->> key;
            new_val := new_row ->> key;

            IF old_val IS DISTINCT FROM new_val THEN
                INSERT INTO audit_log (table_name, record_id, action, field_name, old_value, new_value)
                VALUES (TG_TABLE_NAME, record_uuid, 'update', key, old_val, new_val);
            END IF;
        END LOOP;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to key tables
CREATE TRIGGER trg_unit_audit AFTER INSERT OR UPDATE OR DELETE ON unit
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER trg_occupancy_audit AFTER INSERT OR UPDATE OR DELETE ON occupancy
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER trg_ownership_audit AFTER INSERT OR UPDATE OR DELETE ON ownership
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER trg_entity_audit AFTER INSERT OR UPDATE OR DELETE ON entity
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER trg_contact_audit AFTER INSERT OR UPDATE OR DELETE ON contact
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================================================
-- VIEWS: Convenient queries
-- ============================================================================

-- View: Current occupancy with full details
CREATE VIEW v_current_occupancy AS
SELECT
    o.*,
    u.street_address,
    u.unit_sf,
    u.warehouse_sf,
    u.office_sf,
    u.dock_doors,
    u.power_amps,
    u.power_volts,
    e.entity_name,
    e.entity_type,
    b.building_name,
    b.year_built,
    p.apn,
    p.city,
    p.land_sf
FROM occupancy o
JOIN unit u ON o.unit_id = u.id
JOIN entity e ON o.entity_id = e.id
JOIN building b ON u.building_id = b.id
JOIN parcel p ON b.parcel_apn = p.apn
WHERE o.is_current = true;

-- View: Building coverage calculation
CREATE VIEW v_building_coverage AS
SELECT
    b.id AS building_id,
    b.parcel_apn,
    b.building_sf,
    p.land_sf,
    CASE
        WHEN p.land_sf > 0 THEN ROUND((b.building_sf::numeric / p.land_sf::numeric) * 100, 2)
        ELSE NULL
    END AS coverage_pct
FROM building b
JOIN parcel p ON b.parcel_apn = p.apn;

-- View: Upcoming lease expirations
CREATE VIEW v_lease_expirations AS
SELECT
    o.id AS occupancy_id,
    o.lease_expiration,
    o.rent_psf_month,
    o.rent_total_month,
    u.street_address,
    u.unit_sf,
    e.entity_name,
    e.id AS entity_id,
    c.name AS primary_contact,
    c.mobile AS contact_mobile,
    c.email AS contact_email,
    p.city,
    o.lease_expiration - CURRENT_DATE AS days_until_expiration
FROM occupancy o
JOIN unit u ON o.unit_id = u.id
JOIN entity e ON o.entity_id = e.id
JOIN building b ON u.building_id = b.id
JOIN parcel p ON b.parcel_apn = p.apn
LEFT JOIN contact c ON c.entity_id = e.id AND c.is_primary = true
WHERE o.is_current = true
  AND o.lease_expiration IS NOT NULL
ORDER BY o.lease_expiration;

-- View: Entity portfolio (all locations owned or occupied)
CREATE VIEW v_entity_portfolio AS
SELECT
    e.id AS entity_id,
    e.entity_name,
    'ownership' AS relationship_type,
    b.id AS building_id,
    NULL::uuid AS unit_id,
    p.situs_address AS address,
    p.city,
    b.building_sf AS sf,
    own.purchase_date,
    own.purchase_price,
    own.is_current
FROM entity e
JOIN ownership own ON e.id = own.entity_id
JOIN building b ON own.building_id = b.id
JOIN parcel p ON b.parcel_apn = p.apn

UNION ALL

SELECT
    e.id AS entity_id,
    e.entity_name,
    'occupancy' AS relationship_type,
    u.building_id,
    u.id AS unit_id,
    u.street_address AS address,
    p.city,
    u.unit_sf AS sf,
    occ.lease_start AS purchase_date,
    NULL::decimal AS purchase_price,
    occ.is_current
FROM entity e
JOIN occupancy occ ON e.id = occ.entity_id
JOIN unit u ON occ.unit_id = u.id
JOIN building b ON u.building_id = b.id
JOIN parcel p ON b.parcel_apn = p.apn;

-- ============================================================================
-- SAMPLE DATA: Orange County Submarkets
-- ============================================================================

INSERT INTO geography (name, geo_type, geometry) VALUES
('North Orange County', 'submarket', ST_GeomFromText('POLYGON((-118.1 33.95, -117.7 33.95, -117.7 33.82, -118.1 33.82, -118.1 33.95))', 4326)),
('Central Orange County', 'submarket', ST_GeomFromText('POLYGON((-118.0 33.82, -117.7 33.82, -117.7 33.68, -118.0 33.68, -118.0 33.82))', 4326)),
('South Orange County', 'submarket', ST_GeomFromText('POLYGON((-117.9 33.68, -117.6 33.68, -117.6 33.45, -117.9 33.45, -117.9 33.68))', 4326)),
('Airport Area', 'submarket', ST_GeomFromText('POLYGON((-117.92 33.72, -117.82 33.72, -117.82 33.66, -117.92 33.66, -117.92 33.72))', 4326));

-- ============================================================================
-- FUNCTIONS: Utility functions
-- ============================================================================

-- Function: Search for properties matching criteria
CREATE OR REPLACE FUNCTION search_properties(
    p_min_sf INTEGER DEFAULT NULL,
    p_max_sf INTEGER DEFAULT NULL,
    p_min_amps INTEGER DEFAULT NULL,
    p_volts power_volts DEFAULT NULL,
    p_min_docks INTEGER DEFAULT NULL,
    p_fenced_yard BOOLEAN DEFAULT NULL,
    p_city VARCHAR DEFAULT NULL,
    p_geography_id UUID DEFAULT NULL,
    p_for_sale BOOLEAN DEFAULT NULL,
    p_for_lease BOOLEAN DEFAULT NULL,
    p_vacant_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
    unit_id UUID,
    street_address VARCHAR,
    city VARCHAR,
    unit_sf INTEGER,
    warehouse_sf INTEGER,
    office_sf INTEGER,
    clear_height_ft DECIMAL,
    dock_doors INTEGER,
    gl_doors INTEGER,
    power_amps INTEGER,
    power_volts power_volts,
    fenced_yard BOOLEAN,
    unit_status unit_status,
    for_sale BOOLEAN,
    for_lease BOOLEAN,
    asking_sale_price DECIMAL,
    asking_lease_rate DECIMAL,
    year_built INTEGER,
    current_tenant VARCHAR,
    market_status market_status,
    lease_expiration DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id AS unit_id,
        u.street_address,
        p.city,
        u.unit_sf,
        u.warehouse_sf,
        u.office_sf,
        u.clear_height_ft,
        u.dock_doors,
        u.gl_doors,
        u.power_amps,
        u.power_volts,
        u.fenced_yard,
        u.unit_status,
        u.for_sale,
        u.for_lease,
        u.asking_sale_price,
        u.asking_lease_rate,
        b.year_built,
        e.entity_name AS current_tenant,
        o.market_status,
        o.lease_expiration
    FROM unit u
    JOIN building b ON u.building_id = b.id
    JOIN parcel p ON b.parcel_apn = p.apn
    LEFT JOIN occupancy o ON u.id = o.unit_id AND o.is_current = true
    LEFT JOIN entity e ON o.entity_id = e.id
    LEFT JOIN geography g ON p_geography_id IS NOT NULL
        AND g.id = p_geography_id
        AND ST_Within(p.centroid, g.geometry)
    WHERE
        (p_min_sf IS NULL OR u.unit_sf >= p_min_sf)
        AND (p_max_sf IS NULL OR u.unit_sf <= p_max_sf)
        AND (p_min_amps IS NULL OR u.power_amps >= p_min_amps)
        AND (p_volts IS NULL OR u.power_volts = p_volts)
        AND (p_min_docks IS NULL OR u.dock_doors >= p_min_docks)
        AND (p_fenced_yard IS NULL OR u.fenced_yard = p_fenced_yard)
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_geography_id IS NULL OR g.id IS NOT NULL)
        AND (p_for_sale IS NULL OR u.for_sale = p_for_sale)
        AND (p_for_lease IS NULL OR u.for_lease = p_for_lease)
        AND (p_vacant_only = false OR u.unit_status = 'vacant')
    ORDER BY u.unit_sf;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANTS (adjust for your user)
-- ============================================================================

-- Example: GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- Example: GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_user;
