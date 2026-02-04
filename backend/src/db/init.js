/**
 * Database initialization script for Supabase
 * Run with: npm run db:init
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function initDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Supabase database');

    // Create remaining tables that failed
    console.log('Creating remaining tables...');

    // GEO_AREA table (renamed from geography to avoid PostGIS conflict)
    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_area (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        geometry GEOMETRY(Polygon, 4326) NOT NULL,
        geo_type geo_type NOT NULL,
        parent_id UUID REFERENCES geo_area(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('  Created: geo_area');

    // AUDIT_LOG table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        table_name VARCHAR(50) NOT NULL,
        record_id UUID NOT NULL,
        action audit_action NOT NULL,
        field_name VARCHAR(100),
        old_value TEXT,
        new_value TEXT,
        user_id UUID
      )
    `);
    console.log('  Created: audit_log');

    // Create remaining indexes
    console.log('Creating indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_geo_area_geometry ON geo_area USING GIST (geometry)');
    console.log('Indexes: OK');

    // Verify all tables
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('\n✅ Database initialized! Tables:');
    tables.rows.forEach(row => console.log(`   - ${row.table_name}`));

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

initDatabase().catch(console.error);
