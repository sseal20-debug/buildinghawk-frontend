/**
 * Run the comps schema migration
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { query } from './connection.js';
import pool from './connection.js';

async function runMigration() {
  console.log('Running comps schema migration...\n');

  // First, ensure the update_updated_at function exists
  await query(`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('Created/verified update_updated_at function');

  // Create enum types (ignore if exist)
  const enums = [
    "CREATE TYPE comp_type AS ENUM ('lease', 'sale')",
    "CREATE TYPE lease_structure AS ENUM ('nnn', 'gross', 'modified_gross', 'fsg', 'industrial_gross')",
    "CREATE TYPE sale_type AS ENUM ('investment', 'owner_user', 'land', 'portfolio', 'distressed')",
    "CREATE TYPE comp_source AS ENUM ('costar', 'loopnet', 'broker', 'public_record', 'client', 'manual')",
    "CREATE TYPE verification_status AS ENUM ('unverified', 'verified', 'disputed')",
  ];

  for (const sql of enums) {
    try {
      await query(sql);
      console.log('Created enum:', sql.match(/TYPE (\w+)/)[1]);
    } catch (e) {
      if (e.code === '42710') {
        console.log('Enum already exists:', sql.match(/TYPE (\w+)/)[1]);
      } else {
        throw e;
      }
    }
  }

  // Create lease_comp table
  await query(`
    CREATE TABLE IF NOT EXISTS lease_comp (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        property_address VARCHAR(255) NOT NULL,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(2) DEFAULT 'CA',
        zip VARCHAR(10),
        submarket VARCHAR(100),
        parcel_apn VARCHAR(20) REFERENCES parcel(apn) ON DELETE SET NULL,
        building_id UUID REFERENCES building(id) ON DELETE SET NULL,
        building_sf INTEGER,
        leased_sf INTEGER NOT NULL,
        office_sf INTEGER,
        warehouse_sf INTEGER,
        clear_height_ft DECIMAL(5,2),
        dock_doors INTEGER,
        gl_doors INTEGER,
        year_built INTEGER,
        property_type VARCHAR(50) DEFAULT 'Industrial',
        lease_date DATE NOT NULL,
        lease_start DATE,
        lease_expiration DATE,
        lease_term_months INTEGER,
        lease_structure lease_structure,
        starting_rent_psf DECIMAL(10,2),
        effective_rent_psf DECIMAL(10,2),
        ending_rent_psf DECIMAL(10,2),
        annual_increases DECIMAL(5,2),
        free_rent_months INTEGER DEFAULT 0,
        ti_allowance_psf DECIMAL(10,2),
        nnn_expenses_psf DECIMAL(10,2),
        tenant_name VARCHAR(255),
        tenant_industry VARCHAR(100),
        landlord_name VARCHAR(255),
        listing_broker VARCHAR(255),
        tenant_broker VARCHAR(255),
        source comp_source DEFAULT 'manual',
        source_id VARCHAR(100),
        verification_status verification_status DEFAULT 'unverified',
        verified_by VARCHAR(100),
        verified_date DATE,
        notes TEXT,
        confidential BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created lease_comp table');

  // Create sale_comp table
  await query(`
    CREATE TABLE IF NOT EXISTS sale_comp (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        property_address VARCHAR(255) NOT NULL,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(2) DEFAULT 'CA',
        zip VARCHAR(10),
        submarket VARCHAR(100),
        parcel_apn VARCHAR(20) REFERENCES parcel(apn) ON DELETE SET NULL,
        building_id UUID REFERENCES building(id) ON DELETE SET NULL,
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
        building_class VARCHAR(1),
        sale_date DATE NOT NULL,
        sale_type sale_type,
        sale_price DECIMAL(15,2) NOT NULL,
        price_psf DECIMAL(10,2),
        price_per_land_sf DECIMAL(10,2),
        cap_rate DECIMAL(5,2),
        noi DECIMAL(15,2),
        occupancy_pct DECIMAL(5,2),
        in_place_rent_psf DECIMAL(10,2),
        buyer_name VARCHAR(255),
        buyer_type VARCHAR(50),
        seller_name VARCHAR(255),
        listing_broker VARCHAR(255),
        buyer_broker VARCHAR(255),
        down_payment_pct DECIMAL(5,2),
        loan_amount DECIMAL(15,2),
        interest_rate DECIMAL(5,3),
        source comp_source DEFAULT 'manual',
        source_id VARCHAR(100),
        verification_status verification_status DEFAULT 'unverified',
        verified_by VARCHAR(100),
        verified_date DATE,
        notes TEXT,
        confidential BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created sale_comp table');

  // Create comp_set table
  await query(`
    CREATE TABLE IF NOT EXISTS comp_set (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        comp_type comp_type NOT NULL,
        created_by VARCHAR(100),
        criteria JSONB,
        subject_address VARCHAR(255),
        subject_sf INTEGER,
        subject_asking_rent DECIMAL(10,2),
        subject_asking_price DECIMAL(15,2),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created comp_set table');

  // Create junction tables
  await query(`
    CREATE TABLE IF NOT EXISTS comp_set_lease (
        comp_set_id UUID NOT NULL REFERENCES comp_set(id) ON DELETE CASCADE,
        lease_comp_id UUID NOT NULL REFERENCES lease_comp(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (comp_set_id, lease_comp_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS comp_set_sale (
        comp_set_id UUID NOT NULL REFERENCES comp_set(id) ON DELETE CASCADE,
        sale_comp_id UUID NOT NULL REFERENCES sale_comp(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (comp_set_id, sale_comp_id)
    )
  `);
  console.log('Created junction tables');

  // Create indexes
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_lease_comp_city ON lease_comp (city)",
    "CREATE INDEX IF NOT EXISTS idx_lease_comp_date ON lease_comp (lease_date)",
    "CREATE INDEX IF NOT EXISTS idx_lease_comp_sf ON lease_comp (leased_sf)",
    "CREATE INDEX IF NOT EXISTS idx_lease_comp_rent ON lease_comp (starting_rent_psf)",
    "CREATE INDEX IF NOT EXISTS idx_sale_comp_city ON sale_comp (city)",
    "CREATE INDEX IF NOT EXISTS idx_sale_comp_date ON sale_comp (sale_date)",
    "CREATE INDEX IF NOT EXISTS idx_sale_comp_sf ON sale_comp (building_sf)",
    "CREATE INDEX IF NOT EXISTS idx_sale_comp_price ON sale_comp (sale_price)",
    "CREATE INDEX IF NOT EXISTS idx_sale_comp_psf ON sale_comp (price_psf)",
  ];

  for (const sql of indexes) {
    await query(sql);
  }
  console.log('Created indexes');

  // Create triggers (drop first if exist)
  try {
    await query('DROP TRIGGER IF EXISTS trg_lease_comp_updated_at ON lease_comp');
    await query('DROP TRIGGER IF EXISTS trg_sale_comp_updated_at ON sale_comp');
    await query('DROP TRIGGER IF EXISTS trg_comp_set_updated_at ON comp_set');

    await query(`
      CREATE TRIGGER trg_lease_comp_updated_at BEFORE UPDATE ON lease_comp
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()
    `);
    await query(`
      CREATE TRIGGER trg_sale_comp_updated_at BEFORE UPDATE ON sale_comp
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()
    `);
    await query(`
      CREATE TRIGGER trg_comp_set_updated_at BEFORE UPDATE ON comp_set
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()
    `);
    console.log('Created triggers');
  } catch (e) {
    console.log('Trigger creation error (may already exist):', e.message);
  }

  // Verify
  const tables = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE '%comp%'
  `);
  console.log('\nComps tables created:', tables.rows.map(r => r.table_name).join(', '));

  console.log('\nMigration complete!');
  await pool.end();
}

runMigration().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
