const pg = require("pg");
require("dotenv").config();

async function check() {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    // Check parcels with 033 prefix (Fullerton area)
    const result = await pool.query(`
        SELECT apn, situs_address, city, zip 
        FROM parcel 
        WHERE apn LIKE '033%' 
        LIMIT 10
    `);
    
    console.log("Parcels with 033 prefix:");
    result.rows.forEach(r => {
        console.log(`  ${r.apn}: "${r.situs_address}" - ${r.city}`);
    });
    
    // Count totals
    const counts = await pool.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN situs_address IS NOT NULL AND situs_address != '' THEN 1 END) as with_addr
        FROM parcel
    `);
    console.log(`\nTotal: ${counts.rows[0].total}, With addresses: ${counts.rows[0].with_addr}`);
    
    await pool.end();
}

check().catch(console.error);
