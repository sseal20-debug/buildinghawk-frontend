/**
 * Import Parcels from Excel data (Search_Results + Parcels2)
 * Run with: npm run db:import-parcels
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';

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

// Clean numeric value
function cleanNumber(val) {
  if (!val || val === 'null' || val === '' || val === 'NaN') return null;
  const cleaned = String(val).replace(/[,$'"]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Clean integer
function cleanInt(val) {
  const num = cleanNumber(val);
  return num !== null ? Math.round(num) : null;
}

// Parse date
function parseDate(val) {
  if (!val || val === 'NaT' || val === '') return null;
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

async function importParcels() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Read the combined CSV file
    const csvPath = path.join(process.cwd(), 'data', 'combined_parcels.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error(`File not found: ${csvPath}`);
      console.log('Please ensure combined_parcels.csv is in the backend/data/ directory');
      return;
    }

    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const headers = parseCSVLine(lines[0]);
    
    console.log(`Found ${lines.length - 1} rows to import\n`);
    
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      
      const apn = row['APN'];
      const lat = cleanNumber(row['LATITUDE']);
      const lng = cleanNumber(row['LONGITUDE']);
      
      if (!apn || !lat || !lng) {
        skipped++;
        continue;
      }
      
      try {
        // Create point geometry with buffer for clickability
        const pointWKT = `POINT(${lng} ${lat})`;
        
        // Upsert parcel
        await client.query(`
          INSERT INTO parcel (
            apn, geometry, centroid, situs_address, city, zip, 
            land_sf, zoning, assessor_owner_name
          )
          VALUES (
            $1, 
            ST_Buffer(ST_GeomFromText($2, 4326), 0.0008),
            ST_GeomFromText($2, 4326),
            $3, $4, $5, $6, $7, $8
          )
          ON CONFLICT (apn) DO UPDATE SET
            situs_address = COALESCE(NULLIF(EXCLUDED.situs_address, ''), parcel.situs_address),
            city = COALESCE(NULLIF(EXCLUDED.city, ''), parcel.city),
            zip = COALESCE(NULLIF(EXCLUDED.zip, ''), parcel.zip),
            land_sf = COALESCE(EXCLUDED.land_sf, parcel.land_sf),
            zoning = COALESCE(NULLIF(EXCLUDED.zoning, ''), parcel.zoning),
            assessor_owner_name = COALESCE(NULLIF(EXCLUDED.assessor_owner_name, ''), parcel.assessor_owner_name),
            updated_at = NOW()
        `, [
          apn,
          pointWKT,
          row['SITE_ADDR'] || '',
          row['SITE_CITY'] || '',
          String(row['SITE_ZIP'] || '').replace('.0', ''),
          cleanInt(row['LAND_SQFT']),
          (row['ZONING_CODE'] || '').replace(/'/g, ''),
          row['OWNER_NAME_1'] || ''
        ]);
        
        // Create building if we have building SF
        const buildingSF = cleanInt(row['BUILDING_SQFT']);
        const yearBuilt = cleanInt(row['YR_BLT']);
        
        if (buildingSF && buildingSF > 0) {
          await client.query(`
            INSERT INTO building (parcel_apn, building_sf, year_built, notes)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
          `, [
            apn,
            buildingSF,
            yearBuilt,
            `Use: ${row['USE_CODE_STD_DESC'] || 'N/A'}`
          ]);
        }
        
        // Create owner entity if we have owner name
        const ownerName = row['OWNER_NAME_1'];
        if (ownerName && ownerName.trim()) {
          await client.query(`
            INSERT INTO entity (entity_name, entity_type)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `, [
            ownerName.trim(),
            ownerName.includes('LLC') ? 'llc' : 
            ownerName.includes('LP') ? 'partnership' :
            ownerName.includes('TRUST') || ownerName.includes('TR') ? 'trust' :
            ownerName.includes('INC') || ownerName.includes('CORP') ? 'corporation' :
            'company'
          ]);
        }
        
        imported++;
        
        // Progress indicator
        if (imported % 500 === 0) {
          console.log(`  Imported ${imported}...`);
        }
        
      } catch (err) {
        errors++;
        if (errors < 5) {
          console.error(`  Error on APN ${apn}: ${err.message}`);
        }
      }
    }
    
    console.log(`\n✅ Import complete!`);
    console.log(`   Imported: ${imported}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
    
    // Final counts
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM parcel) as parcels,
        (SELECT COUNT(*) FROM building) as buildings,
        (SELECT COUNT(*) FROM entity) as entities
    `);
    
    const c = counts.rows[0];
    console.log(`\n📊 Database totals:`);
    console.log(`   Parcels:   ${c.parcels}`);
    console.log(`   Buildings: ${c.buildings}`);
    console.log(`   Entities:  ${c.entities}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

importParcels().catch(console.error);
