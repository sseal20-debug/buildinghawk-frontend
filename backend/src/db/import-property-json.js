/**
 * Import Property Data from JSON file
 * Run with: node src/db/import-property-json.js <path-to-property_data.json>
 */

import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

// Clean numeric value
function cleanNumber(val) {
  if (val === null || val === undefined || val === '' || val === 'NaN') return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

// Clean integer value
function cleanInt(val) {
  const num = cleanNumber(val);
  return num !== null ? Math.round(num) : null;
}

// Parse date
function parseDate(val) {
  if (!val) return null;
  try {
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

// Clean string
function cleanStr(val) {
  if (!val || val === 'null' || val === 'NaN') return null;
  return String(val).trim() || null;
}

// Normalize APN
function normalizeAPN(apn) {
  if (!apn) return null;
  return String(apn).trim().replace(/\s+/g, '');
}

async function importFromJSON() {
  // Get file path from args or default
  const jsonPath = process.argv[2] || 'C:\\Users\\User\\Downloads\\property_data.json';
  
  if (!fs.existsSync(jsonPath)) {
    console.log(`File not found: ${jsonPath}`);
    console.log('\nUsage: node src/db/import-property-json.js <path-to-property_data.json>');
    console.log('\nDownload the JSON file and place it in your Downloads folder,');
    console.log('or provide the full path as an argument.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read JSON file
    console.log(`📂 Reading ${jsonPath}...`);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`   Found ${data.length} properties\n`);

    // Track stats
    let parcelsCreated = 0;
    let parcelsSkipped = 0;
    let buildingsCreated = 0;
    let ownersCreated = 0;
    let ownershipCreated = 0;
    let errors = 0;

    // Process each record
    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      const apn = normalizeAPN(record.APN);
      
      if (!apn) {
        errors++;
        continue;
      }

      try {
        // Progress indicator
        if ((i + 1) % 250 === 0) {
          console.log(`  Processing ${i + 1}/${data.length}...`);
        }
        
        const lat = cleanNumber(record.LATITUDE);
        const lng = cleanNumber(record.LONGITUDE);
        const address = cleanStr(record.SITE_ADDR);
        const city = cleanStr(record.SITE_CITY);
        const zip = cleanStr(record.SITE_ZIP);
        
        if (!lat || !lng) {
          errors++;
          continue;
        }

        // Check if parcel exists
        const existingParcel = await client.query(
          'SELECT id FROM parcels WHERE apn = $1',
          [apn]
        );

        let parcelId;
        
        if (existingParcel.rows.length > 0) {
          parcelId = existingParcel.rows[0].id;
          parcelsSkipped++;
          
          // Update geometry if missing
          await client.query(`
            UPDATE parcels 
            SET geometry = ST_Buffer(ST_SetSRID(ST_Point($1, $2), 4326)::geography, 40)::geometry
            WHERE id = $3 AND geometry IS NULL
          `, [lng, lat, parcelId]);
          
        } else {
          // Create new parcel with ~80m diameter circle
          const parcelResult = await client.query(`
            INSERT INTO parcels (apn, address, city, state, zip, land_sf, geometry)
            VALUES ($1, $2, $3, 'CA', $4, $5, 
              ST_Buffer(ST_SetSRID(ST_Point($6, $7), 4326)::geography, 40)::geometry
            )
            RETURNING id
          `, [
            apn,
            address,
            city,
            zip ? String(zip).split('.')[0] : null,
            cleanInt(record.LAND_SQFT),
            lng,
            lat
          ]);
          
          parcelId = parcelResult.rows[0].id;
          parcelsCreated++;
        }

        // Create building if we have data
        const buildingSf = cleanInt(record.BUILDING_SQFT);
        const yearBuilt = cleanInt(record.YR_BLT);
        
        if (buildingSf || yearBuilt) {
          // Check if building exists
          const existingBuilding = await client.query(
            'SELECT id FROM buildings WHERE parcel_id = $1',
            [parcelId]
          );
          
          if (existingBuilding.rows.length === 0) {
            await client.query(`
              INSERT INTO buildings (parcel_id, name, building_sf, year_built, property_type)
              VALUES ($1, $2, $3, $4, $5)
            `, [
              parcelId,
              address || `Building at ${apn}`,
              buildingSf,
              yearBuilt,
              'industrial'
            ]);
            buildingsCreated++;
          }
        }

        // Create owner entity
        const ownerName = cleanStr(record.OWNER_NAME_1);
        if (ownerName) {
          let ownerId;
          const existingOwner = await client.query(
            'SELECT id FROM entities WHERE name = $1',
            [ownerName]
          );
          
          if (existingOwner.rows.length > 0) {
            ownerId = existingOwner.rows[0].id;
          } else {
            const ownerResult = await client.query(`
              INSERT INTO entities (name, type)
              VALUES ($1, 'owner')
              RETURNING id
            `, [ownerName]);
            ownerId = ownerResult.rows[0].id;
            ownersCreated++;
          }

          // Create ownership record
          const saleDate = parseDate(record.DATE_TRANSFER);
          const salePrice = cleanNumber(record.VAL_TRANSFER);
          
          const existingOwnership = await client.query(
            'SELECT id FROM ownership WHERE parcel_id = $1 AND entity_id = $2',
            [parcelId, ownerId]
          );
          
          if (existingOwnership.rows.length === 0) {
            await client.query(`
              INSERT INTO ownership (parcel_id, entity_id, ownership_pct, acquisition_date, acquisition_price)
              VALUES ($1, $2, 100, $3, $4)
            `, [parcelId, ownerId, saleDate, salePrice]);
            ownershipCreated++;
          }
        }

        // Create buyer entity if different
        const buyerName = cleanStr(record.BUYER_NAME);
        if (buyerName && buyerName !== ownerName) {
          const existingBuyer = await client.query(
            'SELECT id FROM entities WHERE name = $1',
            [buyerName]
          );
          
          if (existingBuyer.rows.length === 0) {
            await client.query(`
              INSERT INTO entities (name, type)
              VALUES ($1, 'owner')
            `, [buyerName]);
            ownersCreated++;
          }
        }

      } catch (err) {
        errors++;
        if (errors <= 5) {
          console.error(`  Error on APN ${apn}: ${err.message}`);
        }
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('IMPORT COMPLETE');
    console.log('='.repeat(60));
    console.log(`✅ Parcels created: ${parcelsCreated}`);
    console.log(`⏭️  Parcels skipped (existing): ${parcelsSkipped}`);
    console.log(`🏢 Buildings created: ${buildingsCreated}`);
    console.log(`👤 Owners created: ${ownersCreated}`);
    console.log(`📋 Ownership records: ${ownershipCreated}`);
    console.log(`❌ Errors: ${errors}`);

    // Show final counts
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM parcels) as parcels,
        (SELECT COUNT(*) FROM buildings) as buildings,
        (SELECT COUNT(*) FROM entities) as entities,
        (SELECT COUNT(*) FROM ownership) as ownership
    `);
    
    console.log('\n📊 DATABASE TOTALS:');
    console.log(`   Parcels: ${counts.rows[0].parcels}`);
    console.log(`   Buildings: ${counts.rows[0].buildings}`);
    console.log(`   Entities: ${counts.rows[0].entities}`);
    console.log(`   Ownership: ${counts.rows[0].ownership}`);

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

// Run import
importFromJSON().catch(console.error);
