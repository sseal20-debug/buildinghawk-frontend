/**
 * Import Property Search Data from Excel files
 * Sources: Search_Results__Property_Search__1__csv.xlsx and Parcels2_csv.xlsx
 * Run with: node src/db/import-property-search.js
 */

import pg from 'pg';
import XLSX from 'xlsx';
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
  if (!val || val === 'NaT') return null;
  try {
    // Handle Excel date serial numbers
    if (typeof val === 'number') {
      const date = new Date((val - 25569) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }
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

async function importPropertySearch() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read both Excel files
    console.log('📂 Reading Excel files...');
    
    // Look for files in common locations
    const possiblePaths = [
      'C:\\Users\\User\\Downloads',
      'C:\\Users\\User\\industrial-tracker\\backend\\data',
      'C:\\Users\\User\\Seal Industrial Dropbox\\Scott Seal\\1...EXTERNAL DRIVE_MY PASSPORT\\Building Hawk'
    ];
    
    let file1Path, file2Path;
    
    // Check command line args first
    if (process.argv[2] && process.argv[3]) {
      file1Path = process.argv[2];
      file2Path = process.argv[3];
    } else {
      // Search in possible locations
      for (const dir of possiblePaths) {
        const searchPath = `${dir}\\Search_Results__Property_Search__1__csv.xlsx`;
        const parcelPath = `${dir}\\Parcels2_csv.xlsx`;
        try {
          if (fs.existsSync(searchPath)) file1Path = searchPath;
          if (fs.existsSync(parcelPath)) file2Path = parcelPath;
        } catch {}
      }
    }
    
    if (!file1Path && !file2Path) {
      console.log('\nFiles not found in default locations.');
      console.log('Usage: node src/db/import-property-search.js <file1.xlsx> <file2.xlsx>');
      console.log('\nOr place files in: C:\\Users\\User\\Downloads\\');
      process.exit(1);
    }
    
    const file1 = file1Path ? XLSX.readFile(file1Path) : null;
    const file2 = file2Path ? XLSX.readFile(file2Path) : null;
    
    const data1 = file1 ? XLSX.utils.sheet_to_json(file1.Sheets[file1.SheetNames[0]]) : [];
    const data2 = file2 ? XLSX.utils.sheet_to_json(file2.Sheets[file2.SheetNames[0]]) : [];
    
    if (file1Path) console.log(`  File 1: ${data1.length} records (${file1Path})`);
    if (file2Path) console.log(`  File 2: ${data2.length} records (${file2Path})`);
    
    // Combine and deduplicate by APN
    const allRecords = [...data1, ...data2];
    const byAPN = new Map();
    
    for (const record of allRecords) {
      const apn = normalizeAPN(record.APN);
      if (!apn) continue;
      
      // Keep the record with more complete data
      if (!byAPN.has(apn)) {
        byAPN.set(apn, record);
      } else {
        const existing = byAPN.get(apn);
        // Prefer record with building SF
        if (!existing.BUILDING_SQFT && record.BUILDING_SQFT) {
          byAPN.set(apn, record);
        }
        // Prefer record with sale price
        else if (!existing.VAL_TRANSFER && record.VAL_TRANSFER) {
          byAPN.set(apn, record);
        }
      }
    }
    
    const uniqueRecords = Array.from(byAPN.values());
    console.log(`\n📊 Unique properties to import: ${uniqueRecords.length}\n`);

    // Track stats
    let parcelsCreated = 0;
    let parcelsSkipped = 0;
    let buildingsCreated = 0;
    let ownersCreated = 0;
    let ownershipCreated = 0;
    let errors = 0;

    // Process each record
    for (let i = 0; i < uniqueRecords.length; i++) {
      const record = uniqueRecords[i];
      const apn = normalizeAPN(record.APN);
      
      try {
        // Progress indicator
        if ((i + 1) % 100 === 0) {
          console.log(`  Processing ${i + 1}/${uniqueRecords.length}...`);
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
          
          // Update geometry if needed
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
          // Check if building exists for this parcel
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
          // Check if owner exists
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
          
          // Check if ownership record exists
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

        // Create buyer entity if different from owner (for sales tracking)
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
        if (errors < 10) {
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
importPropertySearch().catch(console.error);
