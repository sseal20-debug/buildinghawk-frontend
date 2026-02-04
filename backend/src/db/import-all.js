/**
 * Comprehensive Data Import Script for BuildingHawk
 * Imports: Buildings, Owners, Tenants, Sales from multiple CSV files
 * Run with: npm run db:import
 *
 * WARNING: This script contains SYNTHETIC parcel generation code:
 * - Lines ~114-115: Creates synthetic APNs (SYN-xxx-xxx)
 * - Lines ~124, ~194: Uses ST_Buffer() to create circular synthetic parcels
 *
 * TODO: These synthetic parcels should be replaced with real boundaries
 * from Parcels_2013_Public2.kml (575MB, ~675K real parcel polygons)
 * Use import_kml_parcels.py instead for real parcel boundaries.
 *
 * KML Location: C:\Users\User\Seal Industrial Dropbox\Scott Seal\
 *               1...EXTERNAL DRIVE_MY PASSPORT\1Google Earth Pro\Parcels_2013_Public2.kml
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

// Parse CSV line handling quoted fields
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

// Parse CSV file
function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = values[i] || '';
    });
    return obj;
  });
  
  return { headers, rows };
}

// Clean numeric value
function cleanNumber(val) {
  if (!val || val === 'null' || val === '') return null;
  const cleaned = String(val).replace(/[,$]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Clean integer value
function cleanInt(val) {
  const num = cleanNumber(val);
  return num !== null ? Math.round(num) : null;
}

// Normalize address
function normalizeAddress(parts) {
  return parts.filter(p => p && p.trim()).join(' ').trim();
}

async function importData() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    const basePath = 'C:\\Users\\User\\Seal Industrial Dropbox\\Scott Seal\\1...EXTERNAL DRIVE_MY PASSPORT';
    
    // =========================================================================
    // 1. IMPORT PROPERTY SPECS (Buildings with lat/long)
    // =========================================================================
    console.log('📦 Importing Property Specs (buildings with coordinates)...');
    
    const propertySpecsPath = path.join(basePath, 'Building Hawk', 'REA', 'Property Specs_2012.csv');
    const propertySpecsContent = fs.readFileSync(propertySpecsPath, 'utf8');
    const propertySpecs = parseCSV(propertySpecsContent);
    
    let buildingsImported = 0;
    let parcelsCreated = 0;
    
    for (const row of propertySpecs.rows) {
      const lat = cleanNumber(row['Latitude']);
      const lng = cleanNumber(row['Longitude']);
      
      if (!lat || !lng) continue;
      
      const streetNum = row['Street Number'] || '';
      const prefix = row['Prefix'] || '';
      const streetName = row['Street Name'] || '';
      const suffix = row['Suffix 1'] || '';
      const address = normalizeAddress([streetNum, prefix, streetName, suffix]);
      const city = row['City'] || 'Unknown';
      const zip = row['Postal Code/Zip'] || '';
      
      if (!address) continue;
      
      // Create a synthetic APN from coordinates
      const syntheticApn = `SYN-${Math.abs(Math.round(lat * 10000))}-${Math.abs(Math.round(lng * 10000))}`;
      
      // Create parcel as point (we don't have polygon data)
      const pointWKT = `POINT(${lng} ${lat})`;
      
      try {
        // Insert parcel
        await client.query(`
          INSERT INTO parcel (apn, geometry, centroid, situs_address, city, zip, land_sf)
          VALUES ($1, ST_Buffer(ST_GeomFromText($2, 4326), 0.0002), ST_GeomFromText($2, 4326), $3, $4, $5, $6)
          ON CONFLICT (apn) DO UPDATE SET
            situs_address = EXCLUDED.situs_address,
            city = EXCLUDED.city,
            zip = EXCLUDED.zip,
            land_sf = EXCLUDED.land_sf,
            updated_at = NOW()
        `, [
          syntheticApn,
          pointWKT,
          address,
          city,
          zip,
          cleanInt(cleanNumber(row['Lot Size Acres']) * 43560) // Convert acres to SF
        ]);
        parcelsCreated++;
        
        // Insert building
        await client.query(`
          INSERT INTO building (parcel_apn, building_name, building_sf, year_built, construction_type, sprinklers, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT DO NOTHING
        `, [
          syntheticApn,
          row['Property Name'] || address,
          cleanInt(row['Bldg Size']),
          cleanInt(row['Year Built']),
          null,
          row['Sprinkler'] === 'Yes',
          `Clear Height: ${row['Clear Height'] || 'N/A'}ft, Dock Doors: ${row['# Dock Doors'] || 0}, GL Doors: ${row['# Drive in Doors'] || 0}`
        ]);
        buildingsImported++;
        
      } catch (err) {
        // Skip duplicates
      }
    }
    
    console.log(`   ✓ Created ${parcelsCreated} parcels, ${buildingsImported} buildings\n`);
    
    // =========================================================================
    // 2. IMPORT SOLD NOC 2018 (Sales with lat/long)
    // =========================================================================
    console.log('💰 Importing Sold NOC 2018 (sales transactions)...');
    
    const soldPath = path.join(basePath, '1Google Earth Pro', 'Sold NOC_2018.csv');
    const soldContent = fs.readFileSync(soldPath, 'utf8');
    const soldData = parseCSV(soldContent);
    
    let salesImported = 0;
    let entitiesCreated = 0;
    
    for (const row of soldData.rows) {
      const lat = cleanNumber(row['LATITUDE']);
      const lng = cleanNumber(row['LONGITUDE']);
      const apn = row['APN'];
      
      if (!apn || !lat || !lng) continue;
      
      const address = row['SITE_ADDR'] || '';
      const city = row['SITE_CITY'] || '';
      const zip = row['SITE_ZIP'] || '';
      const ownerName = row['OWNER_NAME_1'] || '';
      
      const pointWKT = `POINT(${lng} ${lat})`;
      
      try {
        // Insert or update parcel
        await client.query(`
          INSERT INTO parcel (apn, geometry, centroid, situs_address, city, zip, land_sf, assessor_owner_name)
          VALUES ($1, ST_Buffer(ST_GeomFromText($2, 4326), 0.0002), ST_GeomFromText($2, 4326), $3, $4, $5, $6, $7)
          ON CONFLICT (apn) DO UPDATE SET
            situs_address = COALESCE(NULLIF(EXCLUDED.situs_address, ''), parcel.situs_address),
            city = COALESCE(NULLIF(EXCLUDED.city, ''), parcel.city),
            assessor_owner_name = EXCLUDED.assessor_owner_name,
            updated_at = NOW()
        `, [
          apn,
          pointWKT,
          address,
          city,
          zip,
          cleanInt(cleanNumber(row['CAL_ACREAGE']) * 43560),
          ownerName
        ]);
        
        // Create building if we have SF
        const buildingSF = cleanInt(row['BUILDING_SQFT']);
        if (buildingSF) {
          const buildingResult = await client.query(`
            INSERT INTO building (parcel_apn, building_sf, year_built, notes)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
            RETURNING id
          `, [
            apn,
            buildingSF,
            cleanInt(row['YR_BLT']),
            `Land Use: ${row['LANDUSE_DESC'] || 'N/A'}, Zoning: ${row['ZONING'] || 'N/A'}`
          ]);
          
          // Create owner entity and ownership record
          if (ownerName && buildingResult.rows.length > 0) {
            const buildingId = buildingResult.rows[0].id;
            
            // Create entity
            const entityResult = await client.query(`
              INSERT INTO entity (entity_name, entity_type, notes)
              VALUES ($1, $2, $3)
              ON CONFLICT DO NOTHING
              RETURNING id
            `, [
              ownerName,
              ownerName.includes('LLC') ? 'llc' : ownerName.includes('TRUST') ? 'trust' : 'company',
              `Owner Address: ${row['OWNER_ADDRESS'] || ''}, ${row['OWNER_CITY'] || ''}, ${row['OWNER_STATE'] || ''} ${row['OWNER_ZIP'] || ''}`
            ]);
            
            if (entityResult.rows.length > 0) {
              entitiesCreated++;
              
              // Create ownership with sale data
              const saleDate = row['DATE_TRANSFER'];
              const salePrice = cleanNumber(row['VAL_TRANSFER']);
              
              await client.query(`
                INSERT INTO ownership (building_id, entity_id, purchase_date, purchase_price, purchase_price_psf, is_current)
                VALUES ($1, $2, $3, $4, $5, true)
                ON CONFLICT DO NOTHING
              `, [
                buildingId,
                entityResult.rows[0].id,
                saleDate ? new Date(saleDate) : null,
                salePrice,
                cleanNumber(row['PRICE_PER_SQFT'])
              ]);
            }
          }
        }
        
        salesImported++;
      } catch (err) {
        // Skip errors
      }
    }
    
    console.log(`   ✓ Imported ${salesImported} sales, created ${entitiesCreated} owner entities\n`);
    
    // =========================================================================
    // 3. IMPORT EAST ANAHEIM OWNERS
    // =========================================================================
    console.log('🏢 Importing East Anaheim Owners...');
    
    const ownersPath = path.join(basePath, 'Building Hawk', 'Owners', 'East Anaheim Owners1.csv');
    const ownersContent = fs.readFileSync(ownersPath, 'utf8');
    const ownersData = parseCSV(ownersContent);
    
    let ownersImported = 0;
    
    for (const row of ownersData.rows) {
      const ownerName = row['OWNER_NAME_1'];
      const address = row['PROP_ADDRESS'];
      const city = row['PROP_CITY'] || 'ANAHEIM';
      const zip = row['PROP_ZIP'] || '';
      
      if (!ownerName || !address) continue;
      
      try {
        // Create entity for owner
        const entityResult = await client.query(`
          INSERT INTO entity (entity_name, entity_type, notes)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [
          ownerName,
          ownerName.includes('LLC') ? 'llc' : ownerName.includes('TRUST') ? 'trust' : 'company',
          `Mailing: ${row['OWNER_ADDRESS'] || ''}, ${row['OWNER_CITY'] || ''}, ${row['OWNER_STATE'] || ''} ${row['OWNER_ZIP'] || ''}`
        ]);
        
        if (entityResult.rows.length > 0) {
          ownersImported++;
        }
      } catch (err) {
        // Skip
      }
    }
    
    console.log(`   ✓ Imported ${ownersImported} owner entities\n`);
    
    // =========================================================================
    // 4. IMPORT REA TENANTS/CONTACTS
    // =========================================================================
    console.log('👥 Importing REA Tenants and Contacts...');
    
    const tenantsPath = path.join(basePath, 'Building Hawk', 'REA', 'REA import.csv');
    const tenantsContent = fs.readFileSync(tenantsPath, 'utf8');
    const tenantsData = parseCSV(tenantsContent);
    
    let tenantsImported = 0;
    let contactsCreated = 0;
    
    for (const row of tenantsData.rows) {
      const companyName = row['Company'];
      const contactName = row['Name'];
      const position = row['Position'];
      const address = row['address'];
      const city = row['city'] || '';
      const zip = row['zip'] || '';
      const phone = row['phone'] || '';
      
      if (!companyName) continue;
      
      try {
        // Create entity for tenant company
        const entityResult = await client.query(`
          INSERT INTO entity (entity_name, entity_type, notes)
          VALUES ($1, 'company', $2)
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [
          companyName,
          `Location: ${address}, ${city}, CA ${zip}`
        ]);
        
        let entityId;
        if (entityResult.rows.length > 0) {
          entityId = entityResult.rows[0].id;
          tenantsImported++;
        } else {
          // Get existing entity
          const existing = await client.query(
            'SELECT id FROM entity WHERE entity_name = $1',
            [companyName]
          );
          if (existing.rows.length > 0) {
            entityId = existing.rows[0].id;
          }
        }
        
        // Create contact if we have name
        if (entityId && contactName) {
          await client.query(`
            INSERT INTO contact (entity_id, name, title, phone, is_primary)
            VALUES ($1, $2, $3, $4, true)
            ON CONFLICT DO NOTHING
          `, [
            entityId,
            contactName.replace(/^(Mr|Ms|Mrs|Dr)\s+/i, ''),
            position,
            phone
          ]);
          contactsCreated++;
        }
      } catch (err) {
        // Skip
      }
    }
    
    console.log(`   ✓ Imported ${tenantsImported} tenant companies, ${contactsCreated} contacts\n`);
    
    // =========================================================================
    // 5. SUMMARY
    // =========================================================================
    console.log('📊 Final counts:');
    
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM parcel) as parcels,
        (SELECT COUNT(*) FROM building) as buildings,
        (SELECT COUNT(*) FROM entity) as entities,
        (SELECT COUNT(*) FROM contact) as contacts,
        (SELECT COUNT(*) FROM ownership) as ownerships
    `);
    
    const c = counts.rows[0];
    console.log(`   Parcels:    ${c.parcels}`);
    console.log(`   Buildings:  ${c.buildings}`);
    console.log(`   Entities:   ${c.entities}`);
    console.log(`   Contacts:   ${c.contacts}`);
    console.log(`   Ownerships: ${c.ownerships}`);
    
    console.log('\n✅ Import complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

importData().catch(console.error);
