const pg = require("pg");
require("dotenv").config();

async function check() {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    // Check specific APNs
    const result = await pool.query(`
        SELECT apn, situs_address, city 
        FROM parcel 
        WHERE apn IN ('03309123', '03310117', '03310414')
    `);
    
    console.log("Specific parcels:");
    result.rows.forEach(r => console.log(`  ${r.apn}: "${r.situs_address}" - ${r.city}`));
    
    // Count with addresses
    const counts = await pool.query(`
        SELECT COUNT(*) as with_addr FROM parcel 
        WHERE situs_address IS NOT NULL AND situs_address != ''
    `);
    console.log("\nParcels with addresses:", counts.rows[0].with_addr);
    
    // Sample some with addresses
    const samples = await pool.query(`
        SELECT apn, situs_address, city FROM parcel 
        WHERE situs_address IS NOT NULL AND situs_address != ''
        LIMIT 5
    `);
    console.log("\nSample with addresses:");
    samples.rows.forEach(r => console.log(`  ${r.apn}: ${r.situs_address}, ${r.city}`));
    
    await pool.end();
}

check().catch(console.error);
