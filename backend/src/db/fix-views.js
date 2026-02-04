/**
 * Fix missing view and test parcel retrieval
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function fixViews() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Create the building coverage view if it doesn't exist
    console.log('Creating v_building_coverage view...');
    await client.query(`
      CREATE OR REPLACE VIEW v_building_coverage AS
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
      JOIN parcel p ON b.parcel_apn = p.apn
    `);
    console.log('✓ View created');

    // Test: get a sample parcel
    const sample = await client.query(`
      SELECT apn, situs_address, city FROM parcel LIMIT 5
    `);
    console.log('\nSample parcels:');
    sample.rows.forEach(r => console.log(`  ${r.apn} - ${r.situs_address}, ${r.city}`));

    // Test: check buildings
    const buildings = await client.query(`
      SELECT COUNT(*) as count FROM building
    `);
    console.log(`\nTotal buildings: ${buildings.rows[0].count}`);

    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

fixViews();
