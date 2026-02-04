/**
 * Seed database with parcel data from GeoJSON
 * Run with: npm run db:seed
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function seedDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Supabase database');

    // Load GeoJSON file - check multiple possible locations
    const possiblePaths = [
      path.join(process.cwd(), 'data', 'oc_parcels.geojson'),
      path.join(process.cwd(), 'oc_parcels.geojson'),
      'C:\\Users\\User\\Downloads\\oc_parcels.geojson',
    ];

    let geojsonData = null;
    let loadedPath = null;

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        geojsonData = JSON.parse(fs.readFileSync(p, 'utf8'));
        loadedPath = p;
        break;
      }
    }

    if (!geojsonData) {
      console.error('❌ Could not find oc_parcels.geojson');
      console.log('Please place the file in one of these locations:');
      possiblePaths.forEach(p => console.log(`  - ${p}`));
      return;
    }

    console.log(`Loading parcels from: ${loadedPath}`);
    console.log(`Found ${geojsonData.features.length} features`);

    // Insert parcels
    let inserted = 0;
    let skipped = 0;

    for (const feature of geojsonData.features) {
      const props = feature.properties || {};
      const geom = feature.geometry;

      // Extract APN - try multiple field names
      const apn = props.APN || props.apn || props.PARCEL_ID || props.parcel_id || `PARCEL-${inserted + 1}`;
      
      // Extract address
      const address = props.PROP_ADDRESS || props.Address || props.address || props.situs_address || '';
      const city = props.PROP_CITY || props.city || props.CITY_NAME || '';
      const zip = props.PROP_ZIP || props.zip || '';
      const landSf = props.LAND_SF || props.land_sf || props.LOT_SIZE || null;
      const zoning = props.ZONING || props.zoning || props.LAND_USE || '';
      const ownerName = props.OWNER_NAME || props.owner_name || '';

      // Skip if no geometry
      if (!geom || geom.type !== 'Polygon') {
        skipped++;
        continue;
      }

      try {
        // Convert geometry to WKT format for PostGIS
        const coordinates = geom.coordinates[0];
        const wktCoords = coordinates.map(c => `${c[0]} ${c[1]}`).join(', ');
        const wkt = `POLYGON((${wktCoords}))`;

        await client.query(`
          INSERT INTO parcel (apn, geometry, centroid, situs_address, city, zip, land_sf, zoning, assessor_owner_name)
          VALUES ($1, ST_GeomFromText($2, 4326), ST_Centroid(ST_GeomFromText($2, 4326)), $3, $4, $5, $6, $7, $8)
          ON CONFLICT (apn) DO UPDATE SET
            geometry = EXCLUDED.geometry,
            centroid = EXCLUDED.centroid,
            situs_address = EXCLUDED.situs_address,
            city = EXCLUDED.city,
            zip = EXCLUDED.zip,
            land_sf = EXCLUDED.land_sf,
            zoning = EXCLUDED.zoning,
            assessor_owner_name = EXCLUDED.assessor_owner_name,
            updated_at = NOW()
        `, [apn, wkt, address.trim(), city.trim(), zip.trim(), landSf, zoning.trim(), ownerName.trim()]);

        inserted++;
        process.stdout.write(`\rInserted: ${inserted} parcels`);
      } catch (err) {
        console.error(`\nError inserting parcel ${apn}:`, err.message);
        skipped++;
      }
    }

    console.log(`\n\n✅ Seeding complete!`);
    console.log(`   Inserted: ${inserted} parcels`);
    console.log(`   Skipped: ${skipped} (no geometry or errors)`);

    // Show sample data
    const sample = await client.query(`
      SELECT apn, situs_address, city, zip 
      FROM parcel 
      LIMIT 5
    `);
    
    console.log('\nSample parcels:');
    sample.rows.forEach(row => {
      console.log(`   ${row.apn}: ${row.situs_address}, ${row.city} ${row.zip}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

seedDatabase().catch(console.error);
