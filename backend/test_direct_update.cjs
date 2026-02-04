const pg = require("pg");
require("dotenv").config();

async function test() {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    const client = await pool.connect();
    
    try {
        // Check current state
        console.log("1. Current state of APN 03310414:");
        const before = await client.query("SELECT * FROM parcel WHERE apn = '03310414'");
        console.log(JSON.stringify(before.rows[0], null, 2));
        
        // Try a direct update
        console.log("\n2. Running UPDATE...");
        const update = await client.query(`
            UPDATE parcel 
            SET situs_address = '515 E WALNUT AVE',
                city = 'FULLERTON',
                zoning = 'MG',
                land_sf = 10527
            WHERE apn = '03310414'
            RETURNING *
        `);
        console.log("Updated rows:", update.rowCount);
        
        // Check after update
        console.log("\n3. After update:");
        const after = await client.query("SELECT apn, situs_address, city, zoning, land_sf FROM parcel WHERE apn = '03310414'");
        console.log(JSON.stringify(after.rows[0], null, 2));
        
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

test();
