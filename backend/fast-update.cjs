/**
 * Fast bulk update parcel addresses
 */
const fs = require('fs');
const pg = require('pg');
require('dotenv').config();

const CSV_PATH = 'C:/Users/User/BuildingHawk/data/Parcels.csv';

async function main() {
  console.log('🦅 Fast bulk address update...\n');
  
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  // Parse all records
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '', inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else current += char;
    }
    values.push(current.trim());
    const rec = {};
    headers.forEach((h, idx) => rec[h] = (values[idx] || '').replace(/"/g, '').trim());
    records.push(rec);
  }
  
  console.log(`Loaded ${records.length} records from CSV`);
  
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  const client = await pool.connect();
  
  try {
    // Build batch update
    let updated = 0;
    
    for (const rec of records) {
      const apn = rec.APN.replace(/-/g, '');
      if (!apn) continue;
      
      try {
        await client.query(`
          UPDATE parcel SET 
            situs_address = $2,
            city = $3,
            zip = $4,
            zoning = $5,
            land_sf = $6,
            owner_name = $7,
            building_sf = $8,
            year_built = $9
          WHERE apn = $1
        `, [
          apn,
          rec.SITE_ADDR || null,
          rec.SITE_CITY || null,
          rec.SITE_ZIP || null,
          (rec.ZONING_CODE || '').replace(/'/g, '') || null,
          parseInt(rec.LAND_SQFT) || null,
          rec.OWNER_NAME_1 || null,
          parseInt(rec.BUILDING_SQFT) || null,
          parseInt(rec.YR_BLT) || null
        ]);
        updated++;
        
        if (updated % 200 === 0) {
          process.stdout.write(`\rUpdated ${updated}...`);
        }
      } catch (err) {
        // Skip errors
      }
    }
    
    console.log(`\n\n✅ Done! Updated ${updated} parcels`);
    
    // Verify
    const check = await client.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN situs_address IS NOT NULL AND situs_address != '' THEN 1 END) as with_addr
      FROM parcel
    `);
    console.log(`DB: ${check.rows[0].total} total, ${check.rows[0].with_addr} with addresses`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
