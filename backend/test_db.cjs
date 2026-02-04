const pg = require("pg");
require("dotenv").config();
const { Pool } = pg;

async function test() {
    console.log("Connecting to:", process.env.DATABASE_URL ? "DB URL set" : "DB URL missing");
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        const result = await pool.query("SELECT COUNT(*) as total FROM parcel");
        console.log("Total parcels in DB:", result.rows[0].total);
        
        const sample = await pool.query("SELECT apn, situs_address, city FROM parcel LIMIT 5");
        console.log("Sample parcels:", JSON.stringify(sample.rows, null, 2));
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await pool.end();
    }
}

test();
