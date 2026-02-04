/**
 * Test script - verify parcel import works
 */

const shapefile = require('shapefile');
const fs = require('fs');
const pg = require('pg');
require('dotenv').config();

const { Pool } = pg;

const SHAPEFILE_PATH = 'C:/Users/User/BuildingHawk/app/backend/data/parcel_polygons/Parcel_Polygons.shp';
const INDUSTRIAL_CSV = 'C:/Users/User/BuildingHawk/data/Parcels.csv';

async function test() {
  console.log('🦅 BuildingHawk - Parcel Import Test');
  console.log('='.repeat(50));
  
  // Step 1: Load industrial APNs
  console.log('\n1. Loading industrial APNs from CSV...');
  const content = fs.readFileSync(INDUSTRIAL_CSV, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  const apns = new Map();
  const headers = lines[0].split(',');
  const apnIdx = headers.findIndex(h => h.includes('APN'));
  console.log(`   Header row: ${headers.slice(0, 5).join(', ')}...`);
  console.log(`   APN column index: ${apnIdx}`);
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const apn = (values[apnIdx] || '').trim().replace(/"/g, '');
    if (apn) {
      const normalized = apn.replace(/-/g, '');
      apns.set(normalized, apn);
    }
  }
  console.log(`   Loaded ${apns.size} industrial APNs`);
  console.log(`   Sample: ${Array.from(apns.values()).slice(0, 3).join(', ')}`);
  
  // Step 2: Test shapefile reading
  console.log('\n2. Testing shapefile reading...');
  const source = await shapefile.open(SHAPEFILE_PATH);
  console.log('   Shapefile opened successfully');
  
  let count = 0;
  let matched = 0;
  let sampleGeometry = null;
  
  let result;
  while ((result = await source.read()) && !result.done) {
    count++;
    const feature = result.value;
    if (!feature || !feature.properties) continue;
    
    const shpAPN = (feature.properties.AssessmentNo || '').toString().trim();
    const normalized = shpAPN.replace(/-/g, '');
    
    if (apns.has(normalized)) {
      matched++;
      if (!sampleGeometry && feature.geometry) {
        sampleGeometry = feature.geometry;
        console.log(`   First match: APN ${shpAPN}`);
        console.log(`   Geometry type: ${feature.geometry.type}`);
        console.log(`   Coordinates count: ${feature.geometry.coordinates[0]?.length || 0}`);
      }
    }
    
    if (count % 100000 === 0) {
      console.log(`   Read ${count} features, matched ${matched}...`);
    }
  }
  
  console.log(`\n   Total features in shapefile: ${count}`);
  console.log(`   Matched to industrial parcels: ${matched}`);
  
  // Step 3: Test database connection
  console.log('\n3. Testing database connection...');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  const client = await pool.connect();
  const dbResult = await client.query('SELECT COUNT(*) FROM parcel');
  console.log(`   Current parcels in database: ${dbResult.rows[0].count}`);
  
  client.release();
  await pool.end();
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Test complete!');
  console.log(`   ${matched} parcels ready to import from shapefile`);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
