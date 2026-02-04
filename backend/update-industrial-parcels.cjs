/**
 * BuildingHawk - Update Industrial Parcels with CSV Data
 * Matches CSV APNs to database and updates all property info
 * Also generates proper rectangular boundaries based on lot size
 * 
 * Usage: node update-industrial-parcels.cjs
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
  csvRows: 0,
  matched: 0,
  inserted: 0,
  updated: 0,
  errors: 0
};

/**
 * Parse CSV file handling quoted fields
 */
function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] || '';
    });
    records.push(record);
  }
  
  return records;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
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
  return values;
}

/**
 * Normalize APN - remove dashes and leading zeros inconsistencies
 */
function normalizeAPN(apn) {
  if (!apn) return null;
  // Remove dashes and quotes
  return apn.replace(/[-'"\s]/g, '');
}

/**
 * Create a rectangular polygon from centroid and land area
 */
function createPolygonWKT(lng, lat, landSqFt) {
  // Default to ~0.25 acre if no land_sf
  const area = landSqFt || 10890;
  
  // Calculate side length assuming square parcel
  const sideLength = Math.sqrt(area);
  
  // Convert feet to degrees (at ~33.8° latitude)
  const latDegPerFoot = 1 / 364000;
  const lngDegPerFoot = 1 / 288000;
  
  const halfSide = sideLength / 2;
  const latOffset = halfSide * latDegPerFoot;
  const lngOffset = halfSide * lngDegPerFoot;
  
  // Rectangle corners (SW, SE, NE, NW, SW to close)
  const sw = [lng - lngOffset, lat - latOffset];
  const se = [lng + lngOffset, lat - latOffset];
  const ne = [lng + lngOffset, lat + latOffset];
  const nw = [lng - lngOffset, lat + latOffset];
  
  return `POLYGON((${sw[0]} ${sw[1]}, ${se[0]} ${se[1]}, ${ne[0]} ${ne[1]}, ${nw[0]} ${nw[1]}, ${sw[0]} ${sw[1]}))`;
}

/**
 * Process a single parcel from CSV
 */
async function processParcel(client, row) {
  const apn = normalizeAPN(row.APN);
  const lat = parseFloat(row.LATITUDE);
  const lng = parseFloat(row.LONGITUDE);
  
  if (!apn || isNaN(lat) || isNaN(lng)) {
    return;
  }
  
  const landSf = parseInt(row.LAND_SQFT) || null;
  const buildingSf = parseInt(row.BUILDING_SQFT) || null;
  const yearBuilt = parseInt(row.YR_BLT) || null;
  const address = row.SITE_ADDR || null;
  const city = row.SITE_CITY || null;
  const zip = row.SITE_ZIP || null;
  const zoning = (row.ZONING_CODE || '').replace(/'/g, '') || null;
  const owner = row.OWNER_NAME_1 || null;
  const acres = parseFloat(row.ACREAGE) || null;
  
  // Create polygon WKT
  const wkt = createPolygonWKT(lng, lat, landSf);
  
  try {
    // Check if parcel exists
    const existing = await client.query(
      'SELECT apn, ST_NPoints(geometry) as points FROM parcel WHERE apn = $1',
      [apn]
    );
    
    if (existing.rows.length > 0) {
      // Update existing parcel
      const hasRealPolygon = existing.rows[0].points > 5;
      
      await client.query(`
        UPDATE parcel SET
          geometry = CASE WHEN $1 THEN geometry ELSE ST_GeomFromText($2, 4326) END,
          situs_address = COALESCE($3, situs_address),
          city = COALESCE($4, city),
          zip = COALESCE($5, zip),
          zoning = COALESCE($6, zoning),
          land_sf = COALESCE($7, land_sf),
          building_sf = COALESCE($8, building_sf),
          year_built = COALESCE($9, year_built),
          owner_name = COALESCE($10, owner_name),
          acres = COALESCE($11, acres),
          updated_at = NOW()
        WHERE apn = $12
      `, [
        hasRealPolygon, wkt, address, city, zip, zoning, 
        landSf, buildingSf, yearBuilt, owner, acres, apn
      ]);
      
      stats.updated++;
    } else {
      // Insert new parcel
      await client.query(`
        INSERT INTO parcel (
          apn, geometry, situs_address, city, zip, zoning,
          land_sf, building_sf, year_built, owner_name, acres, building_count
        ) VALUES (
          $1, ST_GeomFromText($2, 4326), $3, $4, $5, $6,
          $7, $8, $9, $10, $11, 1
        )
      `, [apn, wkt, address, city, zip, zoning, landSf, buildingSf, yearBuilt, owner, acres]);
      
      stats.inserted++;
    }
    
    stats.matched++;
  } catch (err) {
    stats.errors++;
    if (stats.errors <= 3) {
      console.error(`Error with APN ${apn}:`, err.message);
    }
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n🦅 BuildingHawk - Update Industrial Parcels');
  console.log('='.repeat(50));
  
  // Load CSV
  console.log('\n📋 Loading industrial parcels from CSV...');
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const parcels = parseCSV(content);
  stats.csvRows = parcels.length;
  console.log(`   Found ${parcels.length} parcels in CSV`);
  
  // Show sample APNs
  console.log('\n   Sample APNs:');
  parcels.slice(0, 3).forEach(p => {
    console.log(`   - ${p.APN} -> ${normalizeAPN(p.APN)} (${p.SITE_ADDR})`);
  });
  
  // Connect to database
  const client = await pool.connect();
  console.log('\n📊 Connected to database');
  
  // Get current count
  const beforeCount = await client.query('SELECT COUNT(*) as total FROM parcel');
  console.log(`   Current parcels in DB: ${beforeCount.rows[0].total}`);
  
  try {
    console.log('\n🔧 Processing parcels...\n');
    
    for (let i = 0; i < parcels.length; i++) {
      await processParcel(client, parcels[i]);
      
      if ((i + 1) % 100 === 0) {
        process.stdout.write(`   Processed ${i + 1}/${parcels.length}...\r`);
      }
    }
    
    console.log('\n\n' + '='.repeat(50));
    console.log('✅ Update Complete!');
    console.log(`   CSV rows: ${stats.csvRows}`);
    console.log(`   Matched: ${stats.matched}`);
    console.log(`   Inserted (new): ${stats.inserted}`);
    console.log(`   Updated (existing): ${stats.updated}`);
    console.log(`   Errors: ${stats.errors}`);
    
    // Verify results
    const afterCount = await client.query('SELECT COUNT(*) as total FROM parcel');
    console.log(`\n📍 Total parcels in database: ${afterCount.rows[0].total}`);
    
    // Check address coverage
    const withAddress = await client.query(
      "SELECT COUNT(*) as total FROM parcel WHERE situs_address IS NOT NULL AND situs_address != ''"
    );
    console.log(`   Parcels with address: ${withAddress.rows[0].total}`);
    
    // Sample updated parcels
    console.log('\n📝 Sample updated parcels:');
    const samples = await client.query(`
      SELECT apn, situs_address, city, zoning, land_sf 
      FROM parcel 
      WHERE situs_address IS NOT NULL AND situs_address != ''
      LIMIT 5
    `);
    samples.rows.forEach(r => {
      console.log(`   ${r.apn}: ${r.situs_address}, ${r.city} (${r.zoning}) - ${r.land_sf} SF`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
