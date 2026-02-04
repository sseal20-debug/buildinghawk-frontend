/**
 * Building Hawk - Export from Supabase
 * Exports existing property data from database to JSON and GeoJSON
 * 
 * Usage: npm run export:data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data');
const JSON_FILE = path.join(DATA_DIR, 'building_hawk_all.json');
const GEOJSON_FILE = path.join(DATA_DIR, 'building_hawk_geo.geojson');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('\n🦅 Building Hawk - Export from Supabase\n');
  console.log('='.repeat(50));
  
  const client = await pool.connect();
  
  try {
    // Get total counts first
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM parcel) as parcels,
        (SELECT COUNT(*) FROM building) as buildings,
        (SELECT COUNT(*) FROM unit) as units,
        (SELECT COUNT(*) FROM entity) as entities
    `);
    
    console.log('📊 Database contains:');
    console.log(`   Parcels: ${counts.rows[0].parcels}`);
    console.log(`   Buildings: ${counts.rows[0].buildings}`);
    console.log(`   Units: ${counts.rows[0].units}`);
    console.log(`   Entities: ${counts.rows[0].entities}\n`);
    
    // Export comprehensive property data
    console.log('📥 Exporting property data...');
    
    const result = await client.query(`
      SELECT 
        p.apn,
        p.situs_address as address,
        p.city,
        'CA' as state,
        p.zip,
        p.land_sf,
        p.zoning,
        p.assessor_owner_name as owner_name,
        ST_Y(ST_Centroid(p.geometry)) as latitude,
        ST_X(ST_Centroid(p.geometry)) as longitude,
        b.building_name,
        b.building_sf as sqft,
        b.year_built,
        u.unit_sf,
        u.warehouse_sf,
        u.office_sf,
        u.unit_status,
        e.entity_name as company,
        c.name as contact_name,
        c.phone,
        o.occupant_type,
        o.lease_expiration
      FROM parcel p
      LEFT JOIN building b ON b.parcel_apn = p.apn
      LEFT JOIN unit u ON u.building_id = b.id
      LEFT JOIN occupancy o ON o.unit_id = u.id AND o.is_current = true
      LEFT JOIN entity e ON e.id = o.entity_id
      LEFT JOIN contact c ON c.entity_id = e.id AND c.is_primary = true
      ORDER BY p.city, p.situs_address
    `);
    
    console.log(`   Found ${result.rows.length} records\n`);
    
    // Convert to simple array format
    const records = result.rows.map((row, idx) => ({
      id: idx + 1,
      apn: row.apn,
      address: row.address,
      city: row.city,
      state: row.state,
      zip: row.zip,
      sqft: row.sqft || row.unit_sf,
      land_sf: row.land_sf,
      year_built: row.year_built,
      owner_name: row.owner_name,
      company: row.company,
      contact_name: row.contact_name,
      phone: row.phone,
      latitude: row.latitude ? parseFloat(row.latitude) : null,
      longitude: row.longitude ? parseFloat(row.longitude) : null,
      zoning: row.zoning,
      warehouse_sf: row.warehouse_sf,
      office_sf: row.office_sf,
      unit_status: row.unit_status,
      lease_expiration: row.lease_expiration
    }));
    
    // Save JSON
    console.log(`💾 Saving ${path.basename(JSON_FILE)}...`);
    fs.writeFileSync(JSON_FILE, JSON.stringify(records, null, 2));
    console.log(`   ✅ Saved ${records.length} records\n`);
    
    // Filter records with valid coordinates for Orange County area
    const geoRecords = records.filter(r => {
      const lat = r.latitude;
      const lng = r.longitude;
      return lat && lng && 
             lat >= 33.38 && lat <= 34.0 && 
             lng >= -118.2 && lng <= -117.4;
    });
    
    console.log(`🗺️  Creating GeoJSON...`);
    console.log(`   ${geoRecords.length} records have valid OC coordinates`);
    
    // Create GeoJSON
    const geojson = {
      type: 'FeatureCollection',
      features: geoRecords.map(r => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [r.longitude, r.latitude]
        },
        properties: {
          id: r.id,
          apn: r.apn,
          address: r.address,
          city: r.city,
          state: r.state,
          zip: r.zip,
          sqft: r.sqft,
          land_sf: r.land_sf,
          year_built: r.year_built,
          owner_name: r.owner_name,
          company: r.company,
          contact_name: r.contact_name,
          phone: r.phone,
          zoning: r.zoning,
          warehouse_sf: r.warehouse_sf,
          office_sf: r.office_sf,
          unit_status: r.unit_status
        }
      }))
    };
    
    // Save GeoJSON
    console.log(`💾 Saving ${path.basename(GEOJSON_FILE)}...`);
    fs.writeFileSync(GEOJSON_FILE, JSON.stringify(geojson, null, 2));
    
    // Copy to frontend
    const frontendDataDir = path.join(__dirname, '../../../frontend/public/data');
    if (!fs.existsSync(frontendDataDir)) {
      fs.mkdirSync(frontendDataDir, { recursive: true });
    }
    
    fs.copyFileSync(GEOJSON_FILE, path.join(frontendDataDir, 'building_hawk_geo.geojson'));
    fs.copyFileSync(JSON_FILE, path.join(frontendDataDir, 'building_hawk_all.json'));
    
    console.log(`   ✅ Saved ${geojson.features.length} features`);
    console.log(`   ✅ Copied to frontend/public/data/\n`);
    
    // City breakdown
    const cityCounts = {};
    geoRecords.forEach(r => {
      const city = r.city || 'Unknown';
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    });
    
    console.log('📊 Properties by City:');
    Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([city, count]) => {
        console.log(`   ${city}: ${count}`);
      });
    
    console.log('\n✅ Export complete!\n');
    
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
