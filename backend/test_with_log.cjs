const fs = require("fs");
const pg = require("pg");
require("dotenv").config();

const log = (msg) => {
    const line = new Date().toISOString() + " - " + msg;
    console.log(line);
    fs.appendFileSync("update_log.txt", line + "\n");
};

async function test() {
    fs.writeFileSync("update_log.txt", "Starting test...\n");
    
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    log("Connected to pool");
    
    const client = await pool.connect();
    log("Got client");
    
    try {
        const before = await client.query("SELECT apn, situs_address, city FROM parcel WHERE apn = '03310414'");
        log("Before update: " + JSON.stringify(before.rows[0]));
        
        const update = await client.query(`
            UPDATE parcel 
            SET situs_address = '515 E WALNUT AVE',
                city = 'FULLERTON',
                zoning = 'MG',
                land_sf = 10527
            WHERE apn = '03310414'
            RETURNING apn, situs_address, city
        `);
        log("Update result: " + update.rowCount + " rows - " + JSON.stringify(update.rows[0]));
        
        const after = await client.query("SELECT apn, situs_address, city FROM parcel WHERE apn = '03310414'");
        log("After update: " + JSON.stringify(after.rows[0]));
        
        log("SUCCESS");
    } catch (err) {
        log("ERROR: " + err.message);
    } finally {
        client.release();
        await pool.end();
        log("Done");
    }
}

test();
