/**
 * BuildingHawk - Import Real Parcel Boundaries from Shapefile
 * Reads Orange County parcel polygons and updates the database with real boundaries
 * 
 * Usage: node src/scripts/import-parcel-polygons.cjs
 */

const shapefile = require('shapefile');
const fs = require('fs');
const path = require('path');
const pg = require('pg');

require('dotenv').config();

const { Pool } = pg;

// Paths
const SHAPEFILE_PATH = 'C:/Users/User/BuildingHawk/app/backend/data/parcel_polygons/Parcel_Polygons.shp';
const INDUSTRIAL_CSV = 'C:/Users/User/BuildingHawk/data/Parcels.csv';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Stats
const stats = {
  total_read: 0,
  matched: 0,
  updated: 0,
  inserted: 0,
  errors: 0
};

/**
 * Parse CSV to get industrial APNs
 */
function loadIndustrialAPNs() {
  const content = fs.readFileSync(INDUSTRIAL_CSV, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  const apns = new Map();
  const headers = lines[0].split(',');
  const apnIdx = headers.findIndex(h => h.includes('APN'));
  const addrIdx = headers.findIndex(h => h.includes('SITE_ADDR') || h.includes('address'));
  const cityIdx = headers.findIndex(h => h.includes('SITE_CITY') || h.includes('city'));
  const zipIdx = headers.findIndex(h => h.includes('SITE_ZIP') || h.includes('zip'));
  const zoningIdx = headers.findIndex(h => h.includes('ZONING'));
  const landSfIdx = headers.findIndex(h => h.includes('LAND_SQFT') || h.includes('land_sf'));
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const apn = (values[apnIdx] || '').trim().replace(/"/g, '');
    if (apn) {
      apns.set(apn.replace(/-/g, ''), {
        apn: apn,
        address: (values[addrIdx] || '').trim().replace(/"/g, ''),
        city: (values[cityIdx] || '').trim().replace(/"/g, ''),
        zip: (values[zipIdx] || '').trim().replace(/"/g, ''),
        zoning: (values[zoningIdx] || '').trim().replace(/"/g, '').replace(/'/g, ''),
        land_sf: parseInt((values[landSfIdx] || '0').replace(/[^0-9]/g, '')) || null
      });
    }
  }
  
  return apns;
}

/**
 * Convert shapefile coordinates to WKT polygon
 */
function coordsToWKT(coords) {
  if (!coords || !coords[0]) return null;
  
  const ring = coords[0];
  const points = ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `POLYGON((${points}))`;
}

/**
 * Process a batch of parcels
 */
async function processBatch(client, batch) {
  for (const parcel of batch) {
    try {
      // Try to update existing parcel
      const updateResult = await client.query(`
        UPDATE parcel 
        SET geometry = ST_GeomFromText($1, 4326),
            situs_address = COALESCE($2, situs_address),
            city = COALESCE($3, city),
            zip = COALESCE($4, zip),
            zoning = COALESCE($5, zoning),
            land_sf = COALESCE($6, land_sf),
            updated_at = NOW()
        WHERE apn = $7
        RETURNING apn
      `, [parcel.wkt, parcel.address, parcel.city, parcel.zip, parcel.zoning, parcel.land_sf, parcel.apn]);
      
      if (updateResult.rowCount > 0) {
        stats.updated++;
      } else {
        // Insert new parcel
        await client.query(`
          INSERT INTO parcel (apn, geometry, situs_address, city, zip, zoning, land_sf)
          VALUES ($1, ST_GeomFromText($2, 4326), $3, $4, $5, $6, $7)
          ON CONFLICT (apn) DO UPDATE SET
            geometry = EXCLUDED.geometry,
            situs_address = COALESCE(EXCLUDED.situs_address, parcel.situs_address),
            city = COALESCE(EXCLUDED.city, parcel.city),
            updated_at = NOW()
        `, [parcel.apn, parcel.wkt, parcel.address, parcel.city, parcel.zip, parcel.zoning, parcel.land_sf]);
        stats.inserted++;
      }
    } catch (err) {
      stats.errors++;
      if (stats.errors < 5) {
        console.error(`Error with APN ${parcel.apn}:`, err.message);
      }
    }
  }
}

/**
 * Main import function
 */
async function main() {
  console.log('\n🦅 BuildingHawk - Import Parcel Polygons');
  console.log('='.repeat(50));
  
  // Load industrial APNs
  console.log('\n📋 Loading industrial parcel list...');
  const industrialAPNs = loadIndustrialAPNs();
  console.log(`   Found ${industrialAPNs.size} industrial parcels`);
  
  // Connect to database
  const client = await pool.connect();
  console.log('📊 Connected to database');
  
  try {
    // Read shapefile
    console.log('\n🗺️  Reading shapefile...');
    console.log(`   ${SHAPEFILE_PATH}`);
    
    const source = await shapefile.open(SHAPEFILE_PATH);
    
    let result;
    const batchSize = 100;
    let batch = [];
    
    while ((result = await source.read()) && !result.done) {
      stats.total_read++;
      
      const feature = result.value;
      if (!feature || !feature.properties) continue;
      
      // Get APN from shapefile
      const shpAPN = (feature.properties.AssessmentNo || feature.properties.APN || '').toString().trim();
      const normalizedAPN = shpAPN.replace(/-/g, '');
      
      // Check if this is an industrial parcel
      const industrialData = industrialAPNs.get(normalizedAPN);
      if (!industrialData) continue;
      
      stats.matched++;
      
      // Convert geometry to WKT
      const wkt = coordsToWKT(feature.geometry?.coordinates);
      if (!wkt) continue;
      
      batch.push({
        apn: industrialData.apn,
        wkt: wkt,
        address: industrialData.address,
        city: industrialData.city,
        zip: industrialData.zip,
        zoning: industrialData.zoning,
        land_sf: industrialData.land_sf
      });
      
      // Process in batches
      if (batch.length >= batchSize) {
        await processBatch(client, batch);
        process.stdout.write(`\r   Processed ${stats.total_read} features, ${stats.matched} matched, ${stats.updated + stats.inserted} saved...`);
        batch = [];
      }
      
      // Progress every 10000 features
      if (stats.total_read % 10000 === 0) {
        console.log(`\n   Read ${stats.total_read} features...`);
      }
    }
    
    // Process remaining
    if (batch.length > 0) {
      await processBatch(client, batch);
    }
    
    console.log('\n');
    console.log('='.repeat(50));
    console.log('✅ Import Complete!');
    console.log(`   Total read: ${stats.total_read}`);
    console.log(`   Matched industrial: ${stats.matched}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Inserted: ${stats.inserted}`);
    console.log(`   Errors: ${stats.errors}`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
