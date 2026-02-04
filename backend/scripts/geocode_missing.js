/**
 * Geocode Missing Coordinates Script
 *
 * This script finds all records in building_hawk_all.json that are missing
 * latitude/longitude coordinates and geocodes them using Google Geocoding API.
 *
 * Usage:
 *   node scripts/geocode_missing.js
 *
 * The script will:
 * 1. Load building_hawk_all.json
 * 2. Find records with addresses but no coordinates
 * 3. Geocode each address using Google API
 * 4. Save the updated JSON file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Google Geocoding API Key
const GOOGLE_API_KEY = "AIzaSyCeBL8MCVvOvsbti1YHQlT1UycFFTgdItM";

// Path to data file
const DATA_PATH = path.join(__dirname, '../data/building_hawk_all.json');

// Rate limiting: 40 requests per second
const RATE_LIMIT_MS = 25; // 1000ms / 40 = 25ms between requests

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Geocode a single address using Google Geocoding API
 */
async function geocodeAddress(address) {
  const encodedAddress = encodeURIComponent(address);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results[0]) {
      const location = data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
        formatted_address: data.results[0].formatted_address
      };
    } else if (data.status === 'ZERO_RESULTS') {
      console.warn(`  No results for: ${address}`);
      return null;
    } else if (data.status === 'OVER_QUERY_LIMIT') {
      console.error('  Rate limit exceeded! Waiting 60 seconds...');
      await sleep(60000);
      return geocodeAddress(address); // Retry
    } else {
      console.warn(`  Geocoding failed for ${address}: ${data.status}`);
      return null;
    }
  } catch (error) {
    console.error(`  Error geocoding ${address}:`, error.message);
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('=== Geocode Missing Coordinates ===\n');

  // Load data
  console.log('Loading data from:', DATA_PATH);
  const rawData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const properties = rawData.properties || rawData;

  // Find records missing coordinates
  const missingCoords = properties.filter(p =>
    (!p.latitude || p.latitude === null) &&
    p.full_address &&
    p.full_address.trim().length > 0
  );

  console.log(`Total records: ${properties.length}`);
  console.log(`Missing coordinates: ${missingCoords.length}`);
  console.log('');

  if (missingCoords.length === 0) {
    console.log('All records have coordinates. Nothing to do.');
    return;
  }

  // Geocode each address
  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < missingCoords.length; i++) {
    const property = missingCoords[i];
    const progress = `[${i + 1}/${missingCoords.length}]`;

    console.log(`${progress} Geocoding: ${property.full_address}`);

    const result = await geocodeAddress(property.full_address);

    if (result) {
      // Find the property in the original array and update it
      const idx = properties.findIndex(p => p.id === property.id);
      if (idx !== -1) {
        properties[idx].latitude = result.latitude;
        properties[idx].longitude = result.longitude;
        successCount++;
        console.log(`  ✓ ${result.latitude}, ${result.longitude}`);
      }
    } else {
      failCount++;
    }

    // Rate limiting
    await sleep(RATE_LIMIT_MS);

    // Save progress every 100 records
    if ((i + 1) % 100 === 0) {
      console.log(`\nSaving progress (${i + 1} processed)...`);
      fs.writeFileSync(DATA_PATH, JSON.stringify(rawData, null, 2));
      console.log('Saved.\n');
    }
  }

  // Final save
  console.log('\n=== Saving final results ===');
  fs.writeFileSync(DATA_PATH, JSON.stringify(rawData, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone!`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Time: ${elapsed} seconds`);
}

// Run
main().catch(console.error);
