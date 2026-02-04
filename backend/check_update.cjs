const pg = require("pg");
require("dotenv").config();
const { Pool } = pg;

async function check() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        // Total parcels
        const total = await pool.query("SELECT COUNT(*) as total FROM parcel");
        console.log("Total parcels:", total.rows[0].total);
        
        // With address
        const withAddr = await pool.query("SELECT COUNT(*) as total FROM parcel WHERE situs_address IS NOT NULL AND situs_address != ''");
        console.log("With address:", withAddr.rows[0].total);
        
        // With city
        const withCity = await pool.query("SELECT COUNT(*) as total FROM parcel WHERE city IS NOT NULL AND city != ''");
        console.log("With city:", withCity.rows[0].total);
        
        // With zoning
        const withZoning = await pool.query("SELECT COUNT(*) as total FROM parcel WHERE zoning IS NOT NULL AND zoning != ''");
        console.log("With zoning:", withZoning.rows[0].total);
        
        // Sample Fullerton parcels
        console.log("\nSample Fullerton parcels:");
        const samples = await pool.query(`
            SELECT apn, situs_address, city, zoning, land_sf 
            FROM parcel 
            WHERE city ILIKE '%fullerton%' OR apn LIKE '033%'
            LIMIT 10
        `);
        samples.rows.forEach(r => {
            console.log("  " + r.apn + ": " + r.situs_address + ", " + r.city + " (" + r.zoning + ")");
        });
        
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await pool.end();
    }
}

check();
