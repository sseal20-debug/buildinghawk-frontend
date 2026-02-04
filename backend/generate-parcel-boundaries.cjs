/**
 * @deprecated This script generates SYNTHETIC rectangular parcels (boxes).
 * These synthetic parcels are NOT tied to actual parcel lines.
 *
 * TODO: Use import_kml_parcels.py instead for real parcel boundaries
 * from Parcels_2013_Public2.kml (575MB, ~675K real parcel polygons)
 *
 * KML Location: C:\Users\User\Seal Industrial Dropbox\Scott Seal\
 *               1...EXTERNAL DRIVE_MY PASSPORT\1Google Earth Pro\Parcels_2013_Public2.kml
 *
 * BuildingHawk - Generate Parcel Boundaries from CSV
 * Creates approximate rectangular polygons based on centroid + land area
 * This makes ALL industrial parcels clickable on the map
 *
 * Usage: node generate-parcel-boundaries.cjs
 */

const fs = require('fs');
const pg = require('pg');
require('dotenv').config();

const { Pool } = pg;

const CSV_PATH = 'C:/Users/User/BuildingHawk/data/Parcels.csv';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const stats = {
  processed: 0,
  updated: 0,
  inserted: 0,
  skipped: 0,
  errors: 0
};

/**
 * Parse CSV file
 */
function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;
    const line = lines[i];
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = (values[idx] || '').replace(/"/g, '').trim();
    });
    records.push(record);
  }
  
  return records;
}

/**
 * Create a rectangular polygon from centroid and area
 * Uses land_sf to determine approximate size
 */
function createPolygonFromCentroid(lng, lat, landSqFt) {
  // Default to ~0.5 acre if no land_sf
  const area = landSqFt || 21780; // 0.5 acre in sq ft
  
  // Assume roughly square parcel, calculate side length
  const sideLength = Math.sqrt(area);
  
  // Convert feet to degrees (approximate)
  // 1 degree latitude ≈ 364,000 feet
  // 1 degree longitude ≈ 288,000 feet at 33.8° latitude
  const latDegPerFoot = 1 / 364000;
  const lngDegPerFoot = 1 / 288000;
  
  // Half the side length for offset from center
  const halfSide = sideLength / 2;
  const latOffset = halfSide * latDegPerFoot;
  const lngOffset = halfSide * lngDegPerFoot;
  
  // Create rectangle corners (clockwise from SW)
  const sw = [lng - lngOffset, lat - latOffset];
  const se = [lng + lngOffset, lat - latOffset];
  const ne = [lng + lngOffset, lat + latOffset];
  const nw = [lng - lngOffset, lat + latOffset];
  
  // WKT polygon (must close the ring)
  return `POLYGON((${sw[0]} ${sw[1]}, ${se[0]} ${se[1]}, ${ne[0]} ${ne[1]}, ${nw[0]} ${nw[1]}, ${sw[0]} ${sw[1]}))`;
}

/**
 * Process and insert/update parcels
 */
async function processParcel(client, parcel) {
  const apn = parcel.APN;
  const lat = parseFloat(parcel.LATITUDE);
  const lng = parseFloat(parcel.LONGITUDE);
  const landSf = parseInt(parcel.LAND_SQFT) || null;
  
  if (!apn || isNaN(lat) || isNaN(lng)) {
    stats.skipped++;
    return;
  }
  
  const wkt = createPolygonFromCentroid(lng, lat, landSf);
  
  try {
    // Upsert parcel
    await client.query(`
      INSERT INTO parcel (
        apn, geometry, situs_address, city, zip, zoning, land_sf,
        owner_name, building_sf, year_built, building_count
      ) VALUES (
        $1, ST_GeomFromText($2, 4326), $3, $4, $5, $6, $7, $8, $9, $10, 1
      )
      ON CONFLICT (apn) DO UPDATE SET
        geometry = CASE 
          WHEN ST_NPoints(parcel.geometry) <= 5 THEN ST_GeomFromText($2, 4326)
          ELSE parcel.geometry 
        END,
        situs_address = COALESCE(EXCLUDED.situs_address, parcel.situs_address),
        city = COALESCE(EXCLUDED.city, parcel.city),
        zip = COALESCE(EXCLUDED.zip, parcel.zip),
        zoning = COALESCE(EXCLUDED.zoning, parcel.zoning),
        land_sf = COALESCE(EXCLUDED.land_sf, parcel.land_sf),
        owner_name = COALESCE(EXCLUDED.owner_name, parcel.owner_name),
        building_sf = COALESCE(EXCLUDED.building_sf, parcel.building_sf),
        year_built = COALESCE(EXCLUDED.year_built, parcel.year_built),
        updated_at = NOW()
    `, [
      apn,
      wkt,
      parcel.SITE_ADDR || null,
      parcel.SITE_CITY || null,
      parcel.SITE_ZIP || null,
      (parcel.ZONING_CODE || '').replace(/'/g, '') || null,
      landSf,
      parcel.OWNER_NAME_1 || null,
      parseInt(parcel.BUILDING_SQFT) || null,
      parseInt(parcel.YR_BLT) || null
    ]);
    
    stats.updated++;
  } catch (err) {
    stats.errors++;
    if (stats.errors < 5) {
      console.error(`Error with APN ${apn}:`, err.message);
    }
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n🦅 BuildingHawk - Generate Parcel Boundaries from CSV');
  console.log('='.repeat(55));
  
  // Load CSV
  console.log('\n📋 Loading industrial parcels from CSV...');
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const parcels = parseCSV(content);
  console.log(`   Found ${parcels.length} parcels`);
  
  // Connect to database
  const client = await pool.connect();
  console.log('📊 Connected to database');
  
  try {
    console.log('\n🔧 Processing parcels...');
    
    for (let i = 0; i < parcels.length; i++) {
      await processParcel(client, parcels[i]);
      stats.processed++;
      
      if (stats.processed % 100 === 0) {
        process.stdout.write(`\r   Processed ${stats.processed}/${parcels.length}...`);
      }
    }
    
    console.log('\n');
    console.log('='.repeat(55));
    console.log('✅ Import Complete!');
    console.log(`   Total processed: ${stats.processed}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Skipped (no coords): ${stats.skipped}`);
    console.log(`   Errors: ${stats.errors}`);
    
    // Get final count
    const result = await client.query('SELECT COUNT(*) as total FROM parcel');
    console.log(`\n📍 Total parcels in database: ${result.rows[0].total}`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
