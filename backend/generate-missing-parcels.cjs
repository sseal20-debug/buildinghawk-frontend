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
 * BuildingHawk - Generate Missing Parcel Boundaries
 * Creates parcel geometries from building_hawk_properties.json for parcels
 * that don't exist in the database yet (e.g., West Fullerton near airport)
 *
 * This makes ALL industrial properties clickable on the map, even if they
 * don't have official parcel data from the county.
 *
 * Usage: node generate-missing-parcels.cjs
 */

const fs = require('fs');
const path = require('path');
const pg = require('pg');
require('dotenv').config();

const { Pool } = pg;

// Path to CRM property data (6,447 properties with Google-geocoded coords)
const PROPERTIES_PATH = path.join(__dirname, 'data/building_hawk_all.json');
const FALLBACK_PATH = 'C:/Users/User/BuildingHawk/data/building_hawk_properties.json';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const stats = {
  total: 0,
  inserted: 0,
  updated: 0,
  skipped_no_coords: 0,
  skipped_exists: 0,
  errors: 0
};

/**
 * Generate a synthetic APN from property data
 */
function generateSyntheticApn(property) {
  // Use real APN if available
  if (property.apn && property.apn.trim()) {
    return property.apn.trim();
  }

  // Generate synthetic APN from coordinates
  const lat = property.latitude;
  const lng = property.longitude;
  if (lat && lng) {
    return `SYN-${Math.abs(Math.round(lat * 10000))}-${Math.abs(Math.round(lng * 10000))}`;
  }

  // Last resort: hash of address
  const addr = (property.full_address || property.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const city = (property.city || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 3);
  const hash = addr.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  return `SYN-${city}-${Math.abs(hash).toString(36).toUpperCase().padStart(8, '0')}`;
}

/**
 * Create a rectangular polygon from centroid and land area
 * Uses land_sf or acreage to determine approximate size
 * Industrial buildings typically have larger land footprints than building area
 */
function createPolygonWKT(lng, lat, landSqFt, acreage) {
  // Calculate area in square feet
  let area;
  if (landSqFt && landSqFt > 0) {
    area = landSqFt;
  } else if (acreage && acreage > 0) {
    area = acreage * 43560; // Convert acres to sq ft
  } else {
    // Default to ~1.5 acres for industrial (previously 0.5 acre was too small)
    // Most small industrial buildings sit on at least 1-2 acres
    area = 65340; // 1.5 acres
  }

  // Assume roughly square parcel, calculate side length
  const sideLength = Math.sqrt(area);

  // Convert feet to degrees (approximate at 33.8° latitude)
  // 1 degree latitude ≈ 364,000 feet
  // 1 degree longitude ≈ 288,000 feet at this latitude
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
 * Process a single property
 */
async function processProperty(client, property) {
  const lat = property.latitude;
  const lng = property.longitude;

  // Skip if no coordinates
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    stats.skipped_no_coords++;
    return;
  }

  const apn = generateSyntheticApn(property);

  // Calculate land area
  // Industrial properties typically have land = 4x building SF (parking, truck yards, setbacks)
  const landSqFt = property.sqft ? property.sqft * 4 : null;
  const acreage = property.acreage;

  const wkt = createPolygonWKT(lng, lat, landSqFt, acreage);

  try {
    // Upsert parcel - only update if it doesn't have geometry or has simple geometry
    const result = await client.query(`
      INSERT INTO parcel (
        apn, geometry, situs_address, city, zip, land_sf, assessor_owner_name
      ) VALUES (
        $1, ST_GeomFromText($2, 4326), $3, $4, $5, $6, $7
      )
      ON CONFLICT (apn) DO UPDATE SET
        geometry = CASE
          WHEN parcel.geometry IS NULL OR ST_NPoints(parcel.geometry) <= 5
          THEN ST_GeomFromText($2, 4326)
          ELSE parcel.geometry
        END,
        situs_address = COALESCE(parcel.situs_address, EXCLUDED.situs_address),
        city = COALESCE(parcel.city, EXCLUDED.city),
        zip = COALESCE(parcel.zip, EXCLUDED.zip),
        land_sf = COALESCE(parcel.land_sf, EXCLUDED.land_sf),
        assessor_owner_name = COALESCE(parcel.assessor_owner_name, EXCLUDED.assessor_owner_name),
        updated_at = NOW()
      RETURNING apn, (xmax = 0) AS inserted
    `, [
      apn,
      wkt,
      property.full_address || property.address || null,
      property.city || null,
      property.zip || null,
      landSqFt ? Math.round(landSqFt) : (acreage ? Math.round(acreage * 43560) : null),
      property.owner_name || null
    ]);

    if (result.rows[0]?.inserted) {
      stats.inserted++;
    } else {
      stats.updated++;
    }
  } catch (err) {
    stats.errors++;
    if (stats.errors <= 5) {
      console.error(`Error with ${apn}:`, err.message);
    }
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n🦅 BuildingHawk - Generate Missing Parcel Boundaries');
  console.log('='.repeat(55));
  console.log('This creates clickable parcel layers for ALL CRM properties.\n');

  // Load properties JSON
  let propertiesPath = PROPERTIES_PATH;
  if (!fs.existsSync(propertiesPath)) {
    propertiesPath = FALLBACK_PATH;
  }

  console.log(`📋 Loading properties from ${path.basename(propertiesPath)}...`);

  const rawData = fs.readFileSync(propertiesPath, 'utf8');
  let data = JSON.parse(rawData);

  // Handle different JSON formats
  let properties;
  if (data.properties && Array.isArray(data.properties)) {
    properties = data.properties;
  } else if (Array.isArray(data)) {
    properties = data;
  } else {
    console.error('❌ Unknown data format');
    process.exit(1);
  }

  console.log(`   Found ${properties.length} properties`);
  stats.total = properties.length;

  // Show breakdown by city
  const byCityCount = {};
  properties.forEach(p => {
    const city = p.city || 'Unknown';
    byCityCount[city] = (byCityCount[city] || 0) + 1;
  });
  console.log('\n   Properties by city:');
  Object.entries(byCityCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([city, count]) => {
      console.log(`   - ${city}: ${count}`);
    });

  // Connect to database
  const client = await pool.connect();
  console.log('\n📊 Connected to database');

  try {
    // Get current parcel count
    const beforeCount = await client.query('SELECT COUNT(*) as total FROM parcel WHERE geometry IS NOT NULL');
    console.log(`   Current parcels with geometry: ${beforeCount.rows[0].total}`);

    console.log('\n🔧 Processing properties...\n');

    for (let i = 0; i < properties.length; i++) {
      await processProperty(client, properties[i]);

      if ((i + 1) % 500 === 0) {
        process.stdout.write(`\r   Processed ${i + 1}/${properties.length}...`);
      }
    }

    console.log('\n\n' + '='.repeat(55));
    console.log('✅ Complete!\n');
    console.log(`   Total processed: ${stats.total}`);
    console.log(`   New parcels inserted: ${stats.inserted}`);
    console.log(`   Existing parcels updated: ${stats.updated}`);
    console.log(`   Skipped (no coords): ${stats.skipped_no_coords}`);
    console.log(`   Errors: ${stats.errors}`);

    // Get final count
    const afterCount = await client.query('SELECT COUNT(*) as total FROM parcel WHERE geometry IS NOT NULL');
    console.log(`\n📍 Total parcels with geometry: ${afterCount.rows[0].total}`);
    console.log(`   Net increase: ${afterCount.rows[0].total - beforeCount.rows[0].total}`);

    // Show by city
    const cityGeom = await client.query(`
      SELECT city, COUNT(*) as count
      FROM parcel
      WHERE geometry IS NOT NULL AND city IS NOT NULL
      GROUP BY city
      ORDER BY count DESC
      LIMIT 10
    `);
    console.log('\n📍 Parcels by city (top 10):');
    cityGeom.rows.forEach(row => {
      console.log(`   - ${row.city}: ${row.count}`);
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
