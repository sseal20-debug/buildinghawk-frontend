/**
 * Enlarge parcel geometries for better clickability
 * Changes tiny point buffers to ~100m radius circles
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function enlargeParcels() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Update parcels that have point-like geometries (very small areas)
    // Buffer size of 0.001 degrees ≈ 100 meters
    console.log('Enlarging small parcel geometries...');
    
    const result = await client.query(`
      UPDATE parcel
      SET geometry = ST_Buffer(centroid, 0.0008)
      WHERE centroid IS NOT NULL
        AND ST_Area(geometry::geography) < 5000
      RETURNING apn
    `);
    
    console.log(`✓ Updated ${result.rowCount} parcels with larger clickable areas\n`);

    // Verify
    const sample = await client.query(`
      SELECT apn, 
             ST_Area(geometry::geography) as area_sqm,
             situs_address
      FROM parcel 
      ORDER BY area_sqm DESC
      LIMIT 5
    `);
    
    console.log('Sample parcel areas (sq meters):');
    sample.rows.forEach(r => {
      console.log(`  ${r.apn}: ${Math.round(r.area_sqm)} sqm - ${r.situs_address || 'No address'}`);
    });

    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

enlargeParcels();
