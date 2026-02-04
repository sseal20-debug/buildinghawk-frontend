/**
 * Update parcel addresses from CSV - Simple direct approach
 */
const fs = require('fs');
const pg = require('pg');
require('dotenv').config();

const CSV_PATH = 'C:/Users/User/BuildingHawk/data/Parcels.csv';

async function main() {
  console.log('🦅 Updating parcel addresses from CSV...\n');
  
  // Read CSV
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  // Parse records
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;
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
  
  console.log(`Found ${records.length} parcels in CSV`);
  
  // Connect to DB
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  const client = await pool.connect();
  let updated = 0, inserted = 0, errors = 0;
  
  try {
    for (const rec of records) {
      // Normalize APN - remove dashes
      const apn = rec.APN.replace(/-/g, '');
      const lat = parseFloat(rec.LATITUDE);
      const lng = parseFloat(rec.LONGITUDE);
      const landSf = parseInt(rec.LAND_SQFT) || null;
      
      if (!apn || isNaN(lat) || isNaN(lng)) continue;
      
      // Create simple square polygon from centroid + land area
      const area = landSf || 21780;
      const side = Math.sqrt(area);
      const latOff = (side / 2) / 364000;
      const lngOff = (side / 2) / 288000;
      
      const wkt = `POLYGON((${lng-lngOff} ${lat-latOff}, ${lng+lngOff} ${lat-latOff}, ${lng+lngOff} ${lat+latOff}, ${lng-lngOff} ${lat+latOff}, ${lng-lngOff} ${lat-latOff}))`;
      
      try {
        // Check if exists
        const check = await client.query('SELECT apn FROM parcel WHERE apn = $1', [apn]);
        
        if (check.rows.length > 0) {
          // Update existing
          await client.query(`
            UPDATE parcel SET 
              situs_address = $2,
              city = $3,
              zip = $4,
              zoning = $5,
              land_sf = $6,
              owner_name = $7,
              building_sf = $8,
              year_built = $9,
              geometry = CASE WHEN ST_NPoints(geometry) <= 5 THEN ST_GeomFromText($10, 4326) ELSE geometry END,
              updated_at = NOW()
            WHERE apn = $1
          `, [
            apn,
            rec.SITE_ADDR || null,
            rec.SITE_CITY || null,
            rec.SITE_ZIP || null,
            (rec.ZONING_CODE || '').replace(/'/g, '') || null,
            landSf,
            rec.OWNER_NAME_1 || null,
            parseInt(rec.BUILDING_SQFT) || null,
            parseInt(rec.YR_BLT) || null,
            wkt
          ]);
          updated++;
        } else {
          // Insert new
          await client.query(`
            INSERT INTO parcel (apn, geometry, situs_address, city, zip, zoning, land_sf, owner_name, building_sf, year_built, building_count)
            VALUES ($1, ST_GeomFromText($2, 4326), $3, $4, $5, $6, $7, $8, $9, $10, 1)
          `, [
            apn, wkt,
            rec.SITE_ADDR || null,
            rec.SITE_CITY || null,
            rec.SITE_ZIP || null,
            (rec.ZONING_CODE || '').replace(/'/g, '') || null,
            landSf,
            rec.OWNER_NAME_1 || null,
            parseInt(rec.BUILDING_SQFT) || null,
            parseInt(rec.YR_BLT) || null
          ]);
          inserted++;
        }
        
        if ((updated + inserted) % 100 === 0) {
          process.stdout.write(`\rProcessed ${updated + inserted}...`);
        }
      } catch (err) {
        errors++;
        if (errors < 3) console.error(`\nError ${apn}:`, err.message);
      }
    }
    
    console.log(`\n\n✅ Complete! Updated: ${updated}, Inserted: ${inserted}, Errors: ${errors}`);
    
    // Verify
    const result = await client.query(`
      SELECT COUNT(*) as total, 
             COUNT(CASE WHEN situs_address IS NOT NULL AND situs_address != '' THEN 1 END) as with_addr
      FROM parcel
    `);
    console.log(`\nDatabase: ${result.rows[0].total} parcels, ${result.rows[0].with_addr} with addresses`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
