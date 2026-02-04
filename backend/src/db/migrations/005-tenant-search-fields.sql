-- Migration 005: Add tenant search fields to entity table
-- Supports Layer 5 (Tenants) search panel with SIC codes, employee data, LinkedIn

ALTER TABLE entity ADD COLUMN IF NOT EXISTS sic_code VARCHAR(10);
ALTER TABLE entity ADD COLUMN IF NOT EXISTS sic_description VARCHAR(255);
ALTER TABLE entity ADD COLUMN IF NOT EXISTS naics_code VARCHAR(10);
ALTER TABLE entity ADD COLUMN IF NOT EXISTS industry_sector VARCHAR(100);
ALTER TABLE entity ADD COLUMN IF NOT EXISTS employee_count INTEGER;
ALTER TABLE entity ADD COLUMN IF NOT EXISTS employee_range VARCHAR(30);  -- e.g., '10-49', '50-99'
ALTER TABLE entity ADD COLUMN IF NOT EXISTS headquarters BOOLEAN DEFAULT false;
ALTER TABLE entity ADD COLUMN IF NOT EXISTS multi_location BOOLEAN DEFAULT false;
ALTER TABLE entity ADD COLUMN IF NOT EXISTS data_source VARCHAR(50);  -- 'manual', 'dnb', 'iprousa', 'hoovers', 'inside_prospects'
ALTER TABLE entity ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);

-- Indexes for tenant search performance
CREATE INDEX IF NOT EXISTS idx_entity_sic ON entity (sic_code);
CREATE INDEX IF NOT EXISTS idx_entity_industry ON entity USING gin(to_tsvector('english', COALESCE(industry_sector, '')));
CREATE INDEX IF NOT EXISTS idx_entity_employees ON entity (employee_count);
CREATE INDEX IF NOT EXISTS idx_entity_headquarters ON entity (headquarters) WHERE headquarters = true;
