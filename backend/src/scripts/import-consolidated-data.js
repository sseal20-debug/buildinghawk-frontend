/**
 * Building Hawk - Database Import Script
 * Imports consolidated property data into PostgreSQL/PostGIS
 * 
 * Usage: node src/scripts/import-consolidated-data.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Configuration
const DATA_DIR = path.join(__dirname, '../../data');
const INPUT_FILE = path.join(DATA_DIR, 'building_hawk_geocoded.json');
const FALLBACK_FILE = path.join(DATA_DIR, 'building_hawk_all.json');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Stats
let stats = {
  parcels_created: 0,
  parcels_updated: 0,
  buildings_created: 0,
  units_created: 0,
  entities_created: 0,
  contacts_created: 0,
  occupancies_created: 0,
  errors: 0
};

/**
 * Generate a synthetic APN from address
 */
function generateSyntheticApn(record) {
  const addr = (record.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const city = (record.city || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 3);
  const hash = addr.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  return `SYN-${city}-${Math.abs(hash).toString(36).toUpperCase().padStart(8, '0')}`;
}

/**
 * Parse square footage from various formats
 */
function parseSqft(value) {
  if (!value) return null;
  if (typeof value === 'number') return Math.round(value);
  
  const str = String(value).toLowerCase().replace(/,/g, '');
  
  // Handle "13K" format
  if (str.includes('k')) {
    const num = parseFloat(str.replace('k', ''));
    return Math.round(num * 1000);
  }
  
  // Handle ranges like "5000-10000"
  if (str.includes('-')) {
    const parts = str.split('-').map(p => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return Math.round((parts[0] + parts[1]) / 2);
    }
  }
  
  const parsed = parseFloat(str);
  return isNaN(parsed) ? null : Math.round(parsed);
}

/**
 * Normalize city name
 */
function normalizeCity(city) {
  if (!city) return null;
  
  const cityMap = {
    'ana': 'Anaheim',
    'anaheim': 'Anaheim',
    'orange': 'Orange',
    'fullerton': 'Fullerton',
    'brea': 'Brea',
    'placentia': 'Placentia',
    'yorba linda': 'Yorba Linda',
    'yl': 'Yorba Linda',
    'la habra': 'La Habra',
    'buena park': 'Buena Park',
    'garden grove': 'Garden Grove',
    'santa ana': 'Santa Ana',
    'tustin': 'Tustin',
    'irvine': 'Irvine',
    'costa mesa': 'Costa Mesa'
  };
  
  const normalized = city.toLowerCase().trim();
  return cityMap[normalized] || city.trim();
}

/**
 * Create or update a parcel
 */
async function upsertParcel(client, record) {
  const apn = record.apn || generateSyntheticApn(record);
  const lat = record.latitude;
  const lng = record.longitude;
  
  if (!lat || !lng) {
    // Create parcel without geometry (will need geocoding later)
    const result = await client.query(`
      INSERT INTO parcel (apn, situs_address, city, zip, land_sf, zoning, assessor_owner_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (apn) DO UPDATE SET
        situs_address = COALESCE(EXCLUDED.situs_address, parcel.situs_address),
        city = COALESCE(EXCLUDED.city, parcel.city),
        zip = COALESCE(EXCLUDED.zip, parcel.zip),
        land_sf = COALESCE(EXCLUDED.land_sf, parcel.land_sf),
        zoning = COALESCE(EXCLUDED.zoning, parcel.zoning),
        assessor_owner_name = COALESCE(EXCLUDED.assessor_owner_name, parcel.assessor_owner_name),
        updated_at = NOW()
      RETURNING apn, (xmax = 0) AS inserted
    `, [
      apn,
      record.address,
      normalizeCity(record.city),
      record.zip,
      parseSqft(record.land_sf),
      record.zoning || record.landuse_code,
      record.owner_name
    ]);
    
    return { apn, inserted: result.rows[0]?.inserted };
  }
  
  // Create point geometry and synthetic polygon (50m radius)
  const result = await client.query(`
    INSERT INTO parcel (apn, geometry, situs_address, city, zip, land_sf, zoning, assessor_owner_name)
    VALUES (
      $1,
      ST_Buffer(ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 25)::geometry,
      $4, $5, $6, $7, $8, $9
    )
    ON CONFLICT (apn) DO UPDATE SET
      geometry = COALESCE(
        CASE WHEN parcel.geometry IS NULL 
          THEN ST_Buffer(ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 25)::geometry
          ELSE parcel.geometry 
        END,
        parcel.geometry
      ),
      situs_address = COALESCE(EXCLUDED.situs_address, parcel.situs_address),
      city = COALESCE(EXCLUDED.city, parcel.city),
      zip = COALESCE(EXCLUDED.zip, parcel.zip),
      land_sf = COALESCE(EXCLUDED.land_sf, parcel.land_sf),
      zoning = COALESCE(EXCLUDED.zoning, parcel.zoning),
      assessor_owner_name = COALESCE(EXCLUDED.assessor_owner_name, parcel.assessor_owner_name),
      updated_at = NOW()
    RETURNING apn, (xmax = 0) AS inserted
  `, [
    apn,
    lng, lat,
    record.address,
    normalizeCity(record.city),
    record.zip,
    parseSqft(record.land_sf),
    record.zoning || record.landuse_code,
    record.owner_name
  ]);
  
  return { apn, inserted: result.rows[0]?.inserted };
}

/**
 * Create a building for a parcel
 */
async function createBuilding(client, apn, record) {
  const result = await client.query(`
    INSERT INTO building (parcel_apn, building_name, building_sf, year_built, notes)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT DO NOTHING
    RETURNING id
  `, [
    apn,
    record.company ? `${record.company} Building` : null,
    parseSqft(record.sqft) || parseSqft(record.building_sqft),
    record.year_built ? parseInt(record.year_built) : null,
    `Imported from Building Hawk consolidation. Source: ${record.source_type || 'unknown'}`
  ]);
  
  if (result.rows[0]) {
    return result.rows[0].id;
  }
  
  // If conflict, get existing building
  const existing = await client.query(`
    SELECT id FROM building WHERE parcel_apn = $1 LIMIT 1
  `, [apn]);
  
  return existing.rows[0]?.id;
}

/**
 * Create a unit for a building
 */
async function createUnit(client, buildingId, record) {
  const sqft = parseSqft(record.sqft) || parseSqft(record.building_sqft);
  
  const result = await client.query(`
    INSERT INTO unit (
      building_id, street_address, unit_sf, warehouse_sf, office_sf,
      unit_status, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [
    buildingId,
    record.address,
    sqft,
    sqft ? Math.round(sqft * 0.85) : null, // Estimate 85% warehouse
    sqft ? Math.round(sqft * 0.15) : null, // Estimate 15% office
    record.vacancy_status === 'vacant' ? 'vacant' : 'occupied',
    `Landuse: ${record.landuse_desc || record.landuse_category || 'N/A'}`
  ]);
  
  return result.rows[0]?.id;
}

/**
 * Create or find an entity (company/owner)
 */
async function upsertEntity(client, name, type = 'company') {
  if (!name) return null;
  
  // Check if exists
  const existing = await client.query(`
    SELECT id FROM entity 
    WHERE LOWER(entity_name) = LOWER($1)
    LIMIT 1
  `, [name.trim()]);
  
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }
  
  // Create new
  const result = await client.query(`
    INSERT INTO entity (entity_name, entity_type)
    VALUES ($1, $2)
    RETURNING id
  `, [name.trim(), type]);
  
  stats.entities_created++;
  return result.rows[0].id;
}

/**
 * Create a contact for an entity
 */
async function createContact(client, entityId, record) {
  if (!record.contact_name) return null;
  
  // Check if exists
  const existing = await client.query(`
    SELECT id FROM contact 
    WHERE entity_id = $1 AND LOWER(name) = LOWER($2)
    LIMIT 1
  `, [entityId, record.contact_name.trim()]);
  
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }
  
  const result = await client.query(`
    INSERT INTO contact (entity_id, name, phone, is_primary)
    VALUES ($1, $2, $3, true)
    RETURNING id
  `, [
    entityId,
    record.contact_name.trim(),
    record.phone || null
  ]);
  
  stats.contacts_created++;
  return result.rows[0]?.id;
}

/**
 * Create an occupancy record
 */
async function createOccupancy(client, unitId, entityId, record) {
  if (!unitId || !entityId) return null;
  
  // Parse lease expiration if available
  let leaseExp = null;
  if (record.lease_exp) {
    try {
      leaseExp = new Date(record.lease_exp);
      if (isNaN(leaseExp.getTime())) leaseExp = null;
    } catch (e) {
      leaseExp = null;
    }
  }
  
  const result = await client.query(`
    INSERT INTO occupancy (
      unit_id, entity_id, occupant_type, lease_expiration, is_current
    )
    VALUES ($1, $2, $3, $4, true)
    ON CONFLICT DO NOTHING
    RETURNING id
  `, [
    unitId,
    entityId,
    record.lease_or_own === 'own' ? 'owner_user' : 'tenant',
    leaseExp
  ]);
  
  if (result.rows[0]) {
    stats.occupancies_created++;
    return result.rows[0].id;
  }
  
  return null;
}

/**
 * Process a single record
 */
async function processRecord(client, record, index) {
  try {
    // 1. Create/update parcel
    const { apn, inserted } = await upsertParcel(client, record);
    if (inserted) stats.parcels_created++;
    else stats.parcels_updated++;
    
    // 2. Create building
    const buildingId = await createBuilding(client, apn, record);
    if (buildingId) stats.buildings_created++;
    
    // 3. Create unit
    const unitId = buildingId ? await createUnit(client, buildingId, record) : null;
    if (unitId) stats.units_created++;
    
    // 4. Create entity (company/tenant)
    if (record.company) {
      const entityId = await upsertEntity(client, record.company, 'company');
      
      // 5. Create contact
      if (entityId && record.contact_name) {
        await createContact(client, entityId, record);
      }
      
      // 6. Create occupancy
      if (unitId && entityId) {
        await createOccupancy(client, unitId, entityId, record);
      }
    }
    
    // 7. Create owner entity if different from tenant
    if (record.owner_name && record.owner_name !== record.company) {
      await upsertEntity(client, record.owner_name, 'company');
    }
    
    return true;
  } catch (error) {
    console.error(`\n❌ Error processing record ${index}:`, error.message);
    if (record.address) console.error(`   Address: ${record.address}`);
    stats.errors++;
    return false;
  }
}

/**
 * Main import function
 */
async function main() {
  console.log('\n🦅 Building Hawk - Database Import\n');
  console.log('='.repeat(50));
  
  // Determine input file
  let inputFile = INPUT_FILE;
  if (!fs.existsSync(INPUT_FILE)) {
    console.log(`⚠️  Geocoded file not found, using original: ${FALLBACK_FILE}`);
    inputFile = FALLBACK_FILE;
  }
  
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input file not found: ${inputFile}`);
    process.exit(1);
  }
  
  // Load data
  console.log(`📂 Loading data from ${path.basename(inputFile)}...`);
  const rawData = fs.readFileSync(inputFile, 'utf8');
  const records = JSON.parse(rawData);
  console.log(`   Found ${records.length} records\n`);
  
  // Test database connection
  console.log('🔌 Connecting to database...');
  const client = await pool.connect();
  
  try {
    // Check if tables exist
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'parcel'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.error('❌ Database tables not found. Please run schema.sql first.');
      console.log('\n   psql -d your_database -f src/db/schema.sql\n');
      process.exit(1);
    }
    
    console.log('✅ Database connected\n');
    console.log('📥 Importing records...\n');
    
    // Process in batches with transactions
    const BATCH_SIZE = 100;
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);
    
    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, records.length);
      const batchRecords = records.slice(start, end);
      
      process.stdout.write(`\rProcessing batch ${batch + 1}/${totalBatches} (records ${start + 1}-${end})...`);
      
      await client.query('BEGIN');
      
      for (let i = 0; i < batchRecords.length; i++) {
        await processRecord(client, batchRecords[i], start + i);
      }
      
      await client.query('COMMIT');
    }
    
    console.log('\n\n' + '='.repeat(50));
    console.log('📊 Import Complete!\n');
    console.log(`   Parcels created: ${stats.parcels_created}`);
    console.log(`   Parcels updated: ${stats.parcels_updated}`);
    console.log(`   Buildings created: ${stats.buildings_created}`);
    console.log(`   Units created: ${stats.units_created}`);
    console.log(`   Entities created: ${stats.entities_created}`);
    console.log(`   Contacts created: ${stats.contacts_created}`);
    console.log(`   Occupancies created: ${stats.occupancies_created}`);
    console.log(`   Errors: ${stats.errors}`);
    
    // Get final counts
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM parcel) as parcels,
        (SELECT COUNT(*) FROM building) as buildings,
        (SELECT COUNT(*) FROM unit) as units,
        (SELECT COUNT(*) FROM entity) as entities,
        (SELECT COUNT(*) FROM contact) as contacts,
        (SELECT COUNT(*) FROM occupancy WHERE is_current = true) as occupancies
    `);
    
    console.log('\n📈 Database Totals:');
    console.log(`   Parcels: ${counts.rows[0].parcels}`);
    console.log(`   Buildings: ${counts.rows[0].buildings}`);
    console.log(`   Units: ${counts.rows[0].units}`);
    console.log(`   Entities: ${counts.rows[0].entities}`);
    console.log(`   Contacts: ${counts.rows[0].contacts}`);
    console.log(`   Active Occupancies: ${counts.rows[0].occupancies}\n`);
    
    console.log('✅ Done!\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Import failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run
main().catch(error => {
  console.error(error);
  process.exit(1);
});
