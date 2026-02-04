-- ============================================================================
-- BuildingHawk CRM Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/mcslwdnlpyxnugojmvjk/sql
-- ============================================================================

-- ============================================================================
-- Table: contact
-- People extracted from your email archive
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    full_name TEXT,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    
    -- Contact info
    emails TEXT[] DEFAULT '{}',
    phones TEXT[] DEFAULT '{}',
    primary_email VARCHAR(255) UNIQUE,
    primary_phone VARCHAR(50),
    
    -- Professional info
    title VARCHAR(200),
    company_name TEXT,
    
    -- Classification
    contact_type VARCHAR(50),  -- 'broker', 'owner', 'tenant', 'vendor', 'investor'
    is_broker BOOLEAN DEFAULT FALSE,
    broker_company VARCHAR(200),
    
    -- Relationship tracking
    relationship_strength INTEGER DEFAULT 0,
    last_contact_date TIMESTAMPTZ,
    first_contact_date TIMESTAMPTZ,
    total_emails INTEGER DEFAULT 0,
    
    -- Source
    source VARCHAR(50) DEFAULT 'email_extraction',
    confidence_score NUMERIC(3,2),
    
    -- Metadata
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_email ON contact USING GIN (emails);
CREATE INDEX IF NOT EXISTS idx_contact_name ON contact(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_contact_type ON contact(contact_type);
CREATE INDEX IF NOT EXISTS idx_contact_company ON contact(company_name);

-- ============================================================================
-- Table: contact_property_link
-- Links contacts to properties (your existing 9,257 properties)
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_property_link (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    contact_id UUID NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    
    -- Relationship type
    role VARCHAR(50),  -- 'listing_broker', 'buyer_broker', 'owner', 'tenant', 'prospect'
    
    -- Context
    context TEXT,
    email_thread_count INTEGER DEFAULT 1,
    
    -- Timeline
    first_mentioned TIMESTAMPTZ,
    last_mentioned TIMESTAMPTZ,
    
    -- Source emails
    source_email_ids TEXT[] DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpl_contact ON contact_property_link(contact_id);
CREATE INDEX IF NOT EXISTS idx_cpl_property ON contact_property_link(property_id);
CREATE INDEX IF NOT EXISTS idx_cpl_role ON contact_property_link(role);

-- ============================================================================
-- Table: email_record
-- Tracks processed emails (metadata only, not full content)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_record (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Email identification
    source_path TEXT UNIQUE,
    subject TEXT,
    email_date TIMESTAMPTZ,
    
    -- Participants
    from_email VARCHAR(255),
    from_contact_id UUID REFERENCES contact(id),
    to_emails TEXT[],
    cc_emails TEXT[],
    
    -- Extracted entities
    mentioned_addresses TEXT[] DEFAULT '{}',
    mentioned_apns TEXT[] DEFAULT '{}',
    
    -- Classification
    email_type VARCHAR(50),  -- 'listing', 'offer', 'tour_request', 'lease_inquiry', 'closing'
    
    -- Links
    linked_property_ids INTEGER[] DEFAULT '{}',
    linked_contact_ids UUID[] DEFAULT '{}',
    
    -- Processing
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_date ON email_record(email_date DESC);
CREATE INDEX IF NOT EXISTS idx_email_from ON email_record(from_contact_id);
CREATE INDEX IF NOT EXISTS idx_email_type ON email_record(email_type);

-- ============================================================================
-- Views for easy querying
-- ============================================================================

-- Contacts with their property involvement count
CREATE OR REPLACE VIEW v_contact_summary AS
SELECT 
    c.id,
    c.full_name,
    c.primary_email,
    c.company_name,
    c.contact_type,
    c.total_emails,
    c.relationship_strength,
    COUNT(DISTINCT cpl.property_id) AS properties_involved,
    array_agg(DISTINCT cpl.role) FILTER (WHERE cpl.role IS NOT NULL) AS roles
FROM contact c
LEFT JOIN contact_property_link cpl ON c.id = cpl.contact_id
GROUP BY c.id;

-- Properties with their contact history
CREATE OR REPLACE VIEW v_property_contacts AS
SELECT 
    p.id AS property_id,
    p.address,
    p.city,
    p.owner_name,
    c.id AS contact_id,
    c.full_name,
    c.primary_email,
    c.contact_type,
    cpl.role,
    cpl.email_thread_count,
    cpl.last_mentioned
FROM properties p
LEFT JOIN contact_property_link cpl ON p.id = cpl.property_id
LEFT JOIN contact c ON cpl.contact_id = c.id;

-- ============================================================================
-- Enable Row Level Security (public read access)
-- ============================================================================

ALTER TABLE contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_property_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_record ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Allow public read contact" ON contact FOR SELECT USING (true);
CREATE POLICY "Allow public read cpl" ON contact_property_link FOR SELECT USING (true);
CREATE POLICY "Allow public read email" ON email_record FOR SELECT USING (true);

-- Allow service role full access
CREATE POLICY "Allow service insert contact" ON contact FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update contact" ON contact FOR UPDATE USING (true);
CREATE POLICY "Allow service insert cpl" ON contact_property_link FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service insert email" ON email_record FOR INSERT WITH CHECK (true);

-- ============================================================================
-- Done! You should see: "Success. No rows returned"
-- ============================================================================
