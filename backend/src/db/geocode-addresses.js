/**
 * Geocode addresses that have placeholder geometry
 * Uses Google Maps Geocoding API
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { query } from './connection.js';
import pool from './connection.js';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const RATE_LIMIT_MS = 100; // 10 requests per second max

async function geocodeAddress(address) {
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY not set in .env');
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status === 'OK' && data.results.length > 0) {
    const location = data.results[0].geometry.location;
    return {
      lat: location.lat,
      lng: location.lng,
      formatted: data.results[0].formatted_address,
    };
  }

  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocodeParcels() {
  console.log('Starting geocoding of parcels with placeholder geometry...\n');

  if (!GOOGLE_API_KEY) {
    console.log('WARNING: GOOGLE_MAPS_API_KEY not set in .env');
    console.log('Geocoding requires a Google Maps API key.');
    console.log('Add GOOGLE_MAPS_API_KEY=your_key to industrial-tracker/backend/.env');

    // Show count of parcels needing geocoding
    const needGeo = await query(`
      SELECT COUNT(*) as count FROM parcel
      WHERE ST_X(ST_Centroid(geometry)) BETWEEN -117.81 AND -117.79
        AND ST_Y(ST_Centroid(geometry)) BETWEEN 33.69 AND 33.71
    `);
    console.log(`\nParcels needing geocoding: ${needGeo.rows[0].count}`);

    await pool.end();
    return;
  }

  // Find parcels with placeholder geometry (all at the same point)
  const parcels = await query(`
    SELECT apn, situs_address, city
    FROM parcel
    WHERE situs_address IS NOT NULL
      AND ST_X(ST_Centroid(geometry)) BETWEEN -117.81 AND -117.79
      AND ST_Y(ST_Centroid(geometry)) BETWEEN 33.69 AND 33.71
    LIMIT 500
  `);

  console.log(`Found ${parcels.rows.length} parcels to geocode`);

  let geocoded = 0;
  let failed = 0;
  let skipped = 0;

  for (const parcel of parcels.rows) {
    try {
      const address = `${parcel.situs_address}${parcel.city ? ', ' + parcel.city : ''}, CA`;
      const result = await geocodeAddress(address);

      if (result) {
        // Update parcel with new geometry (small polygon around the point)
        await query(`
          UPDATE parcel
          SET geometry = ST_SetSRID(
            ST_Buffer(ST_MakePoint($1, $2)::geography, 20)::geometry,
            4326
          )
          WHERE apn = $3
        `, [result.lng, result.lat, parcel.apn]);

        geocoded++;
        if (geocoded % 50 === 0) {
          console.log(`  Geocoded ${geocoded} parcels...`);
        }
      } else {
        failed++;
      }

      // Rate limit
      await sleep(RATE_LIMIT_MS);

    } catch (err) {
      console.error(`Error geocoding ${parcel.apn}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nGeocoding complete:`);
  console.log(`  Geocoded: ${geocoded}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped: ${skipped}`);

  // Check remaining
  const remaining = await query(`
    SELECT COUNT(*) as count FROM parcel
    WHERE ST_X(ST_Centroid(geometry)) BETWEEN -117.81 AND -117.79
      AND ST_Y(ST_Centroid(geometry)) BETWEEN 33.69 AND 33.71
  `);
  console.log(`  Remaining to geocode: ${remaining.rows[0].count}`);

  await pool.end();
}

geocodeParcels().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
