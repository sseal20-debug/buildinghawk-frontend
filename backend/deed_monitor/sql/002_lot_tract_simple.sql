-- Simple Lot/Tract to APN Lookup Table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/mcslwdnlpyxnugojmvjk/sql

CREATE TABLE IF NOT EXISTS lot_tract_apn_lookup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_number VARCHAR(20) NOT NULL,
    tract_number VARCHAR(20) NOT NULL,
    city VARCHAR(100),
    apn VARCHAR(20) NOT NULL,
    source VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(lot_number, tract_number, city)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lot_tract_lookup ON lot_tract_apn_lookup(lot_number, tract_number);
CREATE INDEX IF NOT EXISTS idx_lot_tract_apn ON lot_tract_apn_lookup(apn);
