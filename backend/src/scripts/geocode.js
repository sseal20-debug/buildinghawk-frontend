/**
 * Building Hawk - Address Geocoder
 * Uses OpenStreetMap Nominatim API (free, 1 req/sec rate limit)
 * Fallback to Google Maps Geocoding API if key is provided
 * 
 * Usage: npm run geocode
 *        npm run geocode:google (if GOOGLE_MAPS_API_KEY set)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DATA_DIR = path.join(__dirname, '../../data');
const INPUT_FILE = path.join(DATA_DIR, 'building_hawk_all.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'building_hawk_geocoded.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'geocode_progress.json');
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

// Rate limiting: 1 request per second for Nominatim
const RATE_LIMIT_MS = 1100;

// Stats
let stats = {
  total: 0,
  already_geocoded: 0,
  newly_geocoded: 0,
  failed: 0,
  skipped_no_address: 0
};

/**
 * Sleep function for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build full address string for geocoding
 */
function buildFullAddress(record) {
  const parts = [];
  
  if (record.address) parts.push(record.address);
  if (record.city) parts.push(record.city);
  if (record.state) parts.push(record.state);
  else parts.push('CA'); // Default to California
  if (record.zip) parts.push(record.zip);
  
  return parts.join(', ');
}

/**
 * Geocode using OpenStreetMap Nominatim (free)
 */
async function geocodeNominatim(address) {
  const encodedAddress = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=us`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BuildingHawk-CRM/1.0 (Industrial Real Estate Application)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        source: 'nominatim',
        confidence: data[0].importance || 0.5
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Nominatim error for "${address}":`, error.message);
    return null;
  }
}

/**
 * Geocode using Google Maps API (if key provided)
 */
async function geocodeGoogle(address) {
  if (!GOOGLE_API_KEY) return null;
  
  const encodedAddress = encodeURIComponent(address);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
        source: 'google',
        confidence: 0.9
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Google geocoding error for "${address}":`, error.message);
    return null;
  }
}

/**
 * Main geocoding function with fallback
 */
async function geocodeAddress(address) {
  // Try Google first if API key available
  if (GOOGLE_API_KEY) {
    const googleResult = await geocodeGoogle(address);
    if (googleResult) return googleResult;
  }
  
  // Fallback to Nominatim
  return await geocodeNominatim(address);
}

/**
 * Load progress from previous run
 */
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.log('No previous progress found, starting fresh.');
  }
  return { processedAddresses: {} };
}

/**
 * Save progress for resume capability
 */
function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Validate coordinates are within Orange County bounds
 */
function isValidOCCoordinate(lat, lng) {
  // Orange County approximate bounds
  const bounds = {
    minLat: 33.38,
    maxLat: 33.95,
    minLng: -118.12,
    maxLng: -117.41
  };
  
  return lat >= bounds.minLat && lat <= bounds.maxLat &&
         lng >= bounds.minLng && lng <= bounds.maxLng;
}

/**
 * Main processing function
 */
async function main() {
  console.log('\n🦅 Building Hawk Address Geocoder\n');
  console.log('='.repeat(50));
  
  // Check for input file
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    console.log('\nPlease ensure building_hawk_all.json is in the data folder.');
    process.exit(1);
  }
  
  // Load data
  console.log('📂 Loading data...');
  const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
  const records = JSON.parse(rawData);
  stats.total = records.length;
  console.log(`   Found ${stats.total} records\n`);
  
  // Load previous progress
  const progress = loadProgress();
  
  // Count records needing geocoding
  const needsGeocoding = records.filter(r => 
    !r.latitude && !r.longitude && r.address
  ).length;
  
  const alreadyHasCoords = records.filter(r => 
    r.latitude && r.longitude
  ).length;
  
  console.log(`📍 Coordinates status:`);
  console.log(`   Already geocoded: ${alreadyHasCoords}`);
  console.log(`   Need geocoding: ${needsGeocoding}`);
  console.log(`   No address: ${stats.total - alreadyHasCoords - needsGeocoding}\n`);
  
  if (needsGeocoding === 0) {
    console.log('✅ All addresses with valid data are already geocoded!');
    return;
  }
  
  console.log(`🌐 Using: ${GOOGLE_API_KEY ? 'Google Maps API (primary) + Nominatim (fallback)' : 'OpenStreetMap Nominatim'}`);
  console.log(`⏱️  Rate limit: ${RATE_LIMIT_MS}ms between requests\n`);
  console.log('Starting geocoding... (Press Ctrl+C to pause)\n');
  
  let processed = 0;
  let lastSaveTime = Date.now();
  
  // Process records
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    
    // Skip if already has coordinates
    if (record.latitude && record.longitude) {
      stats.already_geocoded++;
      continue;
    }
    
    // Skip if no address
    if (!record.address) {
      stats.skipped_no_address++;
      continue;
    }
    
    const fullAddress = buildFullAddress(record);
    
    // Check if already processed in previous run
    if (progress.processedAddresses[fullAddress]) {
      const cached = progress.processedAddresses[fullAddress];
      if (cached.lat && cached.lng) {
        record.latitude = cached.lat;
        record.longitude = cached.lng;
        record.geo_source = cached.source;
        stats.newly_geocoded++;
      } else {
        stats.failed++;
      }
      continue;
    }
    
    // Geocode the address
    processed++;
    process.stdout.write(`\r[${processed}/${needsGeocoding}] Geocoding: ${fullAddress.substring(0, 50).padEnd(50)}...`);
    
    const result = await geocodeAddress(fullAddress);
    
    if (result && isValidOCCoordinate(result.lat, result.lng)) {
      record.latitude = result.lat;
      record.longitude = result.lng;
      record.geo_source = result.source;
      record.geo_confidence = result.confidence;
      
      progress.processedAddresses[fullAddress] = result;
      stats.newly_geocoded++;
    } else {
      progress.processedAddresses[fullAddress] = { failed: true };
      stats.failed++;
    }
    
    // Rate limiting
    await sleep(RATE_LIMIT_MS);
    
    // Save progress every 50 records or every 30 seconds
    if (processed % 50 === 0 || Date.now() - lastSaveTime > 30000) {
      saveProgress(progress);
      lastSaveTime = Date.now();
    }
  }
  
  console.log('\n\n' + '='.repeat(50));
  console.log('📊 Geocoding Complete!\n');
  console.log(`   Total records: ${stats.total}`);
  console.log(`   Already had coordinates: ${stats.already_geocoded}`);
  console.log(`   Newly geocoded: ${stats.newly_geocoded}`);
  console.log(`   Failed to geocode: ${stats.failed}`);
  console.log(`   Skipped (no address): ${stats.skipped_no_address}`);
  
  const totalWithCoords = stats.already_geocoded + stats.newly_geocoded;
  const percentage = ((totalWithCoords / stats.total) * 100).toFixed(1);
  console.log(`\n   📍 Total with coordinates: ${totalWithCoords} (${percentage}%)\n`);
  
  // Save final output
  console.log(`💾 Saving to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(records, null, 2));
  
  // Save progress
  saveProgress(progress);
  
  // Generate GeoJSON for map
  const geoRecords = records.filter(r => r.latitude && r.longitude);
  const geojson = {
    type: 'FeatureCollection',
    features: geoRecords.map(r => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [r.longitude, r.latitude]
      },
      properties: {
        id: r.id || `${r.address}-${r.city}`,
        address: r.address,
        city: r.city,
        state: r.state,
        zip: r.zip,
        company: r.company,
        contact_name: r.contact_name,
        phone: r.phone,
        sqft: r.sqft,
        land_sf: r.land_sf,
        year_built: r.year_built,
        owner_name: r.owner_name,
        landuse_category: r.landuse_category,
        landuse_desc: r.landuse_desc,
        source_type: r.source_type,
        geo_source: r.geo_source
      }
    }))
  };
  
  const geoJsonPath = path.join(DATA_DIR, 'building_hawk_geocoded.geojson');
  fs.writeFileSync(geoJsonPath, JSON.stringify(geojson, null, 2));
  console.log(`🗺️  GeoJSON saved to ${geoJsonPath}`);
  console.log(`   ${geojson.features.length} features with coordinates\n`);
  
  console.log('✅ Done!\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Interrupted! Progress has been saved.');
  console.log('   Run again to resume from where you left off.\n');
  process.exit(0);
});

// Run
main().catch(console.error);
