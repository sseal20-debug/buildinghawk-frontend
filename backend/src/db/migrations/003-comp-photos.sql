-- Add photo fields to comp tables
-- Migration: 003-comp-photos.sql

-- Add photo fields to lease_comp
ALTER TABLE lease_comp
ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS photo_type VARCHAR(20) DEFAULT 'none'; -- 'none', 'uploaded', 'streetview', 'aerial'

-- Add photo fields to sale_comp
ALTER TABLE sale_comp
ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS photo_type VARCHAR(20) DEFAULT 'none'; -- 'none', 'uploaded', 'streetview', 'aerial'

-- Create indexes for faster photo queries
CREATE INDEX IF NOT EXISTS idx_lease_comp_photo ON lease_comp (photo_url) WHERE photo_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sale_comp_photo ON sale_comp (photo_url) WHERE photo_url IS NOT NULL;

COMMENT ON COLUMN lease_comp.photo_url IS 'URL to property photo (stored or external)';
COMMENT ON COLUMN lease_comp.photo_type IS 'Source of photo: none, uploaded, streetview, aerial';
COMMENT ON COLUMN sale_comp.photo_url IS 'URL to property photo (stored or external)';
COMMENT ON COLUMN sale_comp.photo_type IS 'Source of photo: none, uploaded, streetview, aerial';
