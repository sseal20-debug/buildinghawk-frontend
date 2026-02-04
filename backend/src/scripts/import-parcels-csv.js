/**
 * Building Hawk - Import Parcels from CSV
 * Imports property data from Grok CSV exports into PostgreSQL/PostGIS
 *
 * Usage: node src/scripts/import-parcels-csv.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CSV files to import (in order of priority - later files may update earlier ones)
const CSV_FILES = [
  'C:/Users/User/AI_Projects/Grok/BuildingHawk/Parcels.csv',
  'C:/Users/User/AI_Projects/Grok/BuildingHawk/Parcels (1).csv',
  'C:/Users/User/AI_Projects/Grok/BuildingHawk/Parcels (2).csv',
  'C:/Users/User/AI_Projects/Grok/BuildingHawk/Parcels (3).csv',
  'C:/Users/User/AI_Projects/Grok/BuildingHawk/Search Results_ Property Search.csv',
  'C:/Users/User/AI_Projects/Grok/BuildingHawk/Search Results_ Property Search (1).csv',
];

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Stats
let stats = {
  files_processed: 0,
  records_read: 0,
  parcels_created: 0,
  parcels_updated: 0,
  buildings_created: 0,
  units_created: 0,
  entities_created: 0,
  ownerships_created: 0,
  skipped_no_coords: 0,
  errors: 0
};

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

/**
 * Parse a CSV file and return array of objects
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length === 0) return [];

  // Parse header - remove BOM if present
  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xFEFF) {
    headerLine = headerLine.slice(1);
  }
  const headers = parseCSVLine(headerLine);

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record = {};

    headers.forEach((header, idx) => {
      record[header] = values[idx] || '';
    });

    records.push(record);
  }

  return records;
}

/**
 * Normalize field names across different CSV formats
 */
function normalizeRecord(record) {
  return {
    address: record.SITE_ADDR || record.address || '',
    city: record.SITE_CITY || record.city || '',
    zip: record.SITE_ZIP || record.zip || '',
    apn: record.APN || record.apn || '',
    owner_name: record.OWNER_NAME_1 || record.owner || '',
    assessed_value: parseFloat((record.VAL_ASSD || '').replace(/,/g, '')) || null,
    zoning: record.ZONING_CODE || record.zoning || '',
    zoning_category: record.ZONING_CATEGORY || '',
    transfer_date: record.DATE_TRANSFER || '',
    transfer_value: parseFloat((record.VAL_TRANSFER || '').replace(/,/g, '')) || null,
    price_psf: parseFloat((record.PRICE_PER_SQFT || '').replace(/,/g, '')) || null,
    building_sqft: parseInt((record.BUILDING_SQFT || '').replace(/,/g, '')) || null,
    acreage: parseFloat(record.ACREAGE) || null,
    land_sqft: parseInt((record.LAND_SQFT || '').replace(/,/g, '')) || null,
    units: parseInt(record.UNITS_NUMBER) || 1,
    year_built: parseInt(record.YR_BLT) || null,
    use_category: record.USE_CODE_STD_CTGR_DESC || '',
    use_type: record.USE_CODE_STD_DESC || '',
    buyer_name: record.BUYER_NAME || '',
    latitude: parseFloat(record.LATITUDE) || null,
    longitude: parseFloat(record.LONGITUDE) || null,
  };
}

/**
 * Clean zoning code (remove quotes)
 */
function cleanZoning(zoning) {
  if (!zoning) return null;
  return zoning.replace(/'/g, '').trim().substring(0, 50);
}

/**
 * Parse date from various formats
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Handle "11/17/2016 12:00:00 AM" format
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

/**
 * Create a simple polygon around a point (since we don't have parcel geometry)
 */
function createPointPolygon(lat, lng, sizeFt = 100) {
  // Approximate degrees for the given size
  const latDelta = sizeFt / 364000; // ~364,000 ft per degree latitude
  const lngDelta = sizeFt / (364000 * Math.cos(lat * Math.PI / 180));

  return `POLYGON((
    ${lng - lngDelta} ${lat - latDelta},
    ${lng + lngDelta} ${lat - latDelta},
    ${lng + lngDelta} ${lat + latDelta},
    ${lng - lngDelta} ${lat + latDelta},
    ${lng - lngDelta} ${lat - latDelta}
  ))`.replace(/\s+/g, ' ');
}

/**
 * Insert or update a parcel
 */
async function upsertParcel(client, record) {
  const apn = record.apn;
  if (!apn) return null;

  // Check if we have coordinates
  if (!record.latitude || !record.longitude) {
    stats.skipped_no_coords++;
    return null;
  }

  const polygon = createPointPolygon(record.latitude, record.longitude,
    record.land_sqft ? Math.sqrt(record.land_sqft) : 100);

  try {
    // Try to insert, on conflict update
    const result = await client.query(`
      INSERT INTO parcel (
        apn, geometry, situs_address, city, zip, land_sf, zoning,
        assessor_owner_name, assessor_land_value, assessor_improvement_value
      ) VALUES (
        $1, ST_GeomFromText($2, 4326), $3, $4, $5, $6, $7, $8, $9, $10
      )
      ON CONFLICT (apn) DO UPDATE SET
        situs_address = COALESCE(EXCLUDED.situs_address, parcel.situs_address),
        city = COALESCE(EXCLUDED.city, parcel.city),
        zip = COALESCE(EXCLUDED.zip, parcel.zip),
        land_sf = COALESCE(EXCLUDED.land_sf, parcel.land_sf),
        zoning = COALESCE(EXCLUDED.zoning, parcel.zoning),
        assessor_owner_name = COALESCE(EXCLUDED.assessor_owner_name, parcel.assessor_owner_name),
        geometry = CASE
          WHEN parcel.geometry IS NULL OR ST_Area(parcel.geometry) < 0.0000001
          THEN EXCLUDED.geometry
          ELSE parcel.geometry
        END,
        updated_at = NOW()
      RETURNING apn, (xmax = 0) as is_new
    `, [
      apn,
      polygon,
      record.address || null,
      record.city || null,
      record.zip || null,
      record.land_sqft,
      cleanZoning(record.zoning),
      record.owner_name || null,
      record.assessed_value,
      null // improvement value not in CSV
    ]);

    if (result.rows[0]?.is_new) {
      stats.parcels_created++;
    } else {
      stats.parcels_updated++;
    }

    return apn;
  } catch (err) {
    console.error(`Error upserting parcel ${apn}:`, err.message);
    stats.errors++;
    return null;
  }
}

/**
 * Insert a building for a parcel
 */
async function insertBuilding(client, apn, record) {
  if (!record.building_sqft && !record.year_built) return null;

  try {
    const result = await client.query(`
      INSERT INTO building (parcel_apn, building_sf, year_built, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [
      apn,
      record.building_sqft,
      record.year_built,
      record.use_type || null
    ]);

    if (result.rows[0]) {
      stats.buildings_created++;
      return result.rows[0].id;
    }

    // Get existing building
    const existing = await client.query(
      'SELECT id FROM building WHERE parcel_apn = $1 LIMIT 1',
      [apn]
    );
    return existing.rows[0]?.id || null;
  } catch (err) {
    console.error(`Error inserting building for ${apn}:`, err.message);
    stats.errors++;
    return null;
  }
}

/**
 * Insert a unit for a building
 */
async function insertUnit(client, buildingId, record) {
  if (!buildingId) return null;

  try {
    const result = await client.query(`
      INSERT INTO unit (
        building_id, street_address, unit_sf, warehouse_sf,
        unit_status, for_sale, for_lease
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [
      buildingId,
      `${record.address}, ${record.city}, CA ${record.zip}`,
      record.building_sqft,
      record.building_sqft, // Assume all warehouse for industrial
      'occupied', // Default
      false,
      false
    ]);

    if (result.rows[0]) {
      stats.units_created++;
      return result.rows[0].id;
    }
    return null;
  } catch (err) {
    // Likely duplicate, ignore
    return null;
  }
}

/**
 * Insert owner entity
 */
async function insertOwnerEntity(client, ownerName) {
  if (!ownerName || ownerName.trim() === '') return null;

  const cleanName = ownerName.replace(/,\s*$/, '').trim();
  if (!cleanName) return null;

  try {
    // Check if exists
    const existing = await client.query(
      'SELECT id FROM entity WHERE entity_name = $1',
      [cleanName]
    );

    if (existing.rows[0]) {
      return existing.rows[0].id;
    }

    // Determine entity type
    let entityType = 'company';
    if (cleanName.includes(' TR') || cleanName.includes('TRUST')) {
      entityType = 'trust';
    } else if (cleanName.includes(' LLC')) {
      entityType = 'llc';
    } else if (cleanName.includes(' LP') || cleanName.includes('PARTNERS')) {
      entityType = 'partnership';
    } else if (cleanName.match(/^[A-Z]+,\s*[A-Z]+/)) {
      entityType = 'individual';
    }

    const result = await client.query(`
      INSERT INTO entity (entity_name, entity_type)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [cleanName, entityType]);

    if (result.rows[0]) {
      stats.entities_created++;
      return result.rows[0].id;
    }

    return null;
  } catch (err) {
    console.error(`Error inserting entity ${cleanName}:`, err.message);
    return null;
  }
}

/**
 * Insert ownership record
 */
async function insertOwnership(client, buildingId, entityId, record) {
  if (!buildingId || !entityId) return;

  try {
    const purchaseDate = parseDate(record.transfer_date);

    await client.query(`
      INSERT INTO ownership (
        building_id, entity_id, purchase_date, purchase_price,
        purchase_price_psf, is_current
      ) VALUES ($1, $2, $3, $4, $5, true)
      ON CONFLICT DO NOTHING
    `, [
      buildingId,
      entityId,
      purchaseDate,
      record.transfer_value,
      record.price_psf
    ]);

    stats.ownerships_created++;
  } catch (err) {
    // Likely duplicate, ignore
  }
}

/**
 * Process a single record
 */
async function processRecord(client, record) {
  const normalized = normalizeRecord(record);

  // Skip if no APN
  if (!normalized.apn) return;

  // Upsert parcel
  const apn = await upsertParcel(client, normalized);
  if (!apn) return;

  // Insert building
  const buildingId = await insertBuilding(client, apn, normalized);

  // Insert unit
  if (buildingId) {
    await insertUnit(client, buildingId, normalized);
  }

  // Insert owner entity and ownership
  if (normalized.owner_name && buildingId) {
    const entityId = await insertOwnerEntity(client, normalized.owner_name);
    if (entityId) {
      await insertOwnership(client, buildingId, entityId, normalized);
    }
  }
}

/**
 * Main import function
 */
async function main() {
  console.log('Building Hawk - CSV Import');
  console.log('==========================\n');

  const client = await pool.connect();

  try {
    // Process each CSV file
    for (const csvPath of CSV_FILES) {
      if (!fs.existsSync(csvPath)) {
        console.log(`Skipping (not found): ${path.basename(csvPath)}`);
        continue;
      }

      console.log(`Processing: ${path.basename(csvPath)}`);

      const records = parseCSV(csvPath);
      console.log(`  Found ${records.length} records`);

      for (const record of records) {
        stats.records_read++;
        await processRecord(client, record);

        // Progress indicator
        if (stats.records_read % 500 === 0) {
          process.stdout.write(`  Processed ${stats.records_read} records...\r`);
        }
      }

      stats.files_processed++;
      console.log(`  Done processing ${path.basename(csvPath)}\n`);
    }

    console.log('\n==========================');
    console.log('Import Complete!');
    console.log('==========================');
    console.log(`Files processed:     ${stats.files_processed}`);
    console.log(`Records read:        ${stats.records_read}`);
    console.log(`Parcels created:     ${stats.parcels_created}`);
    console.log(`Parcels updated:     ${stats.parcels_updated}`);
    console.log(`Buildings created:   ${stats.buildings_created}`);
    console.log(`Units created:       ${stats.units_created}`);
    console.log(`Entities created:    ${stats.entities_created}`);
    console.log(`Ownerships created:  ${stats.ownerships_created}`);
    console.log(`Skipped (no coords): ${stats.skipped_no_coords}`);
    console.log(`Errors:              ${stats.errors}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
