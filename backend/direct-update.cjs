/**
 * BuildingHawk - Direct Database Update from CSV
 * Simple version that directly updates parcels
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

// Parse CSV
function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQuotes = !inQuotes;
      else if (line[i] === ',' && !inQuotes) {
        values.push(current.trim().replace(/"/g, ''));
        current = '';
      } else {
        current += line[i];
      }
    }
    values.push(current.trim().replace(/"/g, ''));
    
    const record = {};
    headers.forEach((h, i) => record[h] = values[i] || '');
    return record;
  });
}

async function main() {
  console.log('🦅 Direct CSV to Database Update\n');
  
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const parcels = parseCSV(content);
  console.log(`Loaded ${parcels.length} parcels from CSV`);
  
  const client = await pool.connect();
  
  let updated = 0, notFound = 0, errors = 0;
  
  for (const p of parcels) {
    const apn = p.APN.replace(/[-'\s]/g, '');
    if (!apn) continue;
    
    try {
      const result = await client.query(`
        UPDATE parcel SET
          situs_address = $1,
          city = $2,
          zip = $3,
          zoning = $4,
          land_sf = $5,
          building_sf = $6,
          year_built = $7,
          owner_name = $8,
          acres = $9,
          updated_at = NOW()
        WHERE apn = $10
        RETURNING apn
      `, [
        p.SITE_ADDR || null,
        p.SITE_CITY || null,
        p.SITE_ZIP || null,
        (p.ZONING_CODE || '').replace(/'/g, '') || null,
        parseInt(p.LAND_SQFT) || null,
        parseInt(p.BUILDING_SQFT) || null,
        parseInt(p.YR_BLT) || null,
        p.OWNER_NAME_1 || null,
        parseFloat(p.ACREAGE) || null,
        apn
      ]);
      
      if (result.rowCount > 0) {
        updated++;
        if (updated <= 5) {
          console.log(`  Updated: ${apn} -> ${p.SITE_ADDR}, ${p.SITE_CITY}`);
        }
      } else {
        notFound++;
      }
    } catch (err) {
      errors++;
      if (errors <= 3) console.error(`  Error ${apn}:`, err.message);
    }
  }
  
  console.log(`\n✅ Complete: ${updated} updated, ${notFound} not found, ${errors} errors`);
  
  // Verify
  const check = await client.query(`
    SELECT apn, situs_address, city FROM parcel 
    WHERE situs_address IS NOT NULL AND situs_address != ''
    LIMIT 5
  `);
  console.log('\nVerification - parcels with addresses:');
  check.rows.forEach(r => console.log(`  ${r.apn}: ${r.situs_address}, ${r.city}`));
  
  client.release();
  await pool.end();
}

main().catch(console.error);
