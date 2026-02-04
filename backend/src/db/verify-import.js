/**
 * Data Verification Script for Building Hawk
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { query } from './connection.js';
import pool from './connection.js';

async function verifyData() {
  console.log('\n========================================');
  console.log('  Building Hawk - Data Import Summary');
  console.log('========================================\n');

  // Basic counts
  const counts = await query(`
    SELECT
      (SELECT COUNT(*) FROM parcel) as parcels,
      (SELECT COUNT(*) FROM building) as buildings,
      (SELECT COUNT(*) FROM unit) as units,
      (SELECT COUNT(*) FROM entity) as entities,
      (SELECT COUNT(*) FROM contact) as contacts,
      (SELECT COUNT(*) FROM occupancy) as occupancies,
      (SELECT COUNT(*) FROM ownership) as ownerships
  `);
  const c = counts.rows[0];

  console.log('RECORD COUNTS:');
  console.log('  Parcels:     ', c.parcels);
  console.log('  Buildings:   ', c.buildings);
  console.log('  Units:       ', c.units);
  console.log('  Entities:    ', c.entities);
  console.log('  Contacts:    ', c.contacts);
  console.log('  Occupancies: ', c.occupancies);
  console.log('  Ownerships:  ', c.ownerships);

  // Cities breakdown
  const cities = await query(`
    SELECT city, COUNT(*) as count
    FROM parcel
    WHERE city IS NOT NULL AND city != ''
    GROUP BY city
    ORDER BY count DESC
    LIMIT 15
  `);

  console.log('\nTOP CITIES (by parcels):');
  cities.rows.forEach(r => {
    console.log(`  ${r.city}: ${r.count}`);
  });

  // Entity types
  const entityTypes = await query(`
    SELECT entity_type, COUNT(*) as count
    FROM entity
    GROUP BY entity_type
    ORDER BY count DESC
  `);

  console.log('\nENTITY TYPES:');
  entityTypes.rows.forEach(r => {
    console.log(`  ${r.entity_type || 'null'}: ${r.count}`);
  });

  // Buildings with data quality
  const buildingQuality = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(building_sf) as has_sf,
      COUNT(year_built) as has_year,
      COUNT(CASE WHEN building_sf > 0 THEN 1 END) as valid_sf
    FROM building
  `);
  const bq = buildingQuality.rows[0];

  console.log('\nBUILDING DATA QUALITY:');
  console.log(`  Total Buildings:  ${bq.total}`);
  console.log(`  Has Square Feet:  ${bq.has_sf} (${Math.round(bq.has_sf/bq.total*100)}%)`);
  console.log(`  Has Year Built:   ${bq.has_year} (${Math.round(bq.has_year/bq.total*100)}%)`);

  // Contact data quality
  const contactQuality = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(email) as has_email,
      COUNT(mobile) as has_mobile,
      COUNT(phone) as has_phone
    FROM contact
  `);
  const cq = contactQuality.rows[0];

  console.log('\nCONTACT DATA QUALITY:');
  console.log(`  Total Contacts:  ${cq.total}`);
  console.log(`  Has Email:       ${cq.has_email} (${Math.round(cq.has_email/cq.total*100)}%)`);
  console.log(`  Has Mobile:      ${cq.has_mobile} (${Math.round(cq.has_mobile/cq.total*100)}%)`);
  console.log(`  Has Phone:       ${cq.has_phone} (${Math.round(cq.has_phone/cq.total*100)}%)`);

  // Sample addresses
  const sampleParcels = await query(`
    SELECT situs_address, city, apn
    FROM parcel
    WHERE situs_address IS NOT NULL AND situs_address != ''
    ORDER BY RANDOM()
    LIMIT 5
  `);

  console.log('\nSAMPLE ADDRESSES:');
  sampleParcels.rows.forEach(r => {
    console.log(`  ${r.situs_address}, ${r.city} (APN: ${r.apn})`);
  });

  console.log('\n========================================');
  console.log('  Data Import Complete!');
  console.log('========================================\n');

  await pool.end();
}

verifyData().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
