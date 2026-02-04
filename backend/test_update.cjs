const pg = require("pg");
require("dotenv").config();

async function test() {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    // Update 03310414 (033-104-14) with address from CSV
    const apn = "03310414";
    const addr = "515 E WALNUT AVE";
    const city = "FULLERTON";
    const zip = "92832";
    
    console.log(`Updating ${apn}...`);
    
    const result = await pool.query(`
        UPDATE parcel SET 
            situs_address = $2,
            city = $3,
            zip = $4
        WHERE apn = $1
        RETURNING apn, situs_address, city
    `, [apn, addr, city, zip]);
    
    if (result.rows.length > 0) {
        console.log("Updated:", result.rows[0]);
    } else {
        console.log("No rows updated - checking if APN exists...");
        const check = await pool.query("SELECT apn FROM parcel WHERE apn LIKE '%33104%' LIMIT 5");
        console.log("Similar APNs:", check.rows);
    }
    
    await pool.end();
}

test().catch(console.error);
