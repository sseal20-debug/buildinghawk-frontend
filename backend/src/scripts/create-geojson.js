/**
 * Building Hawk - Create GeoJSON from CSV
 * Converts building_hawk_all.csv to JSON and GeoJSON formats
 * 
 * Usage: npm run create:geojson
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data');
const CSV_FILE = path.join(DATA_DIR, 'building_hawk_all.csv');
const JSON_FILE = path.join(DATA_DIR, 'building_hawk_all.json');
const GEOJSON_FILE = path.join(DATA_DIR, 'building_hawk_geo.geojson');

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

/**
 * Parse numeric value
 */
function parseNumber(value) {
  if (!value || value === '') return null;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

/**
 * Main function
 */
async function main() {
  console.log('\n🦅 Building Hawk - Create GeoJSON\n');
  console.log('='.repeat(50));
  
  // Check for CSV file
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV file not found: ${CSV_FILE}`);
    console.log('\nPlease download building_hawk_all.csv to the data folder.');
    process.exit(1);
  }
  
  console.log(`📂 Reading ${path.basename(CSV_FILE)}...`);
  
  const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    console.error('❌ CSV file is empty or invalid');
    process.exit(1);
  }
  
  // Parse header
  const headers = parseCSVLine(lines[0]);
  console.log(`   Found ${headers.length} columns`);
  console.log(`   Columns: ${headers.slice(0, 5).join(', ')}...`);
  
  // Parse records
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record = {};
    
    headers.forEach((header, idx) => {
      const value = values[idx];
      if (value && value !== '') {
        // Convert numeric fields
        if (['latitude', 'longitude', 'sqft', 'land_sf', 'year_built', 'building_sqft'].includes(header.toLowerCase())) {
          record[header] = parseNumber(value);
        } else {
          record[header] = value;
        }
      }
    });
    
    // Only add records with an address
    if (record.address || record.PROP_ADDRESS) {
      // Normalize field names
      if (record.PROP_ADDRESS && !record.address) record.address = record.PROP_ADDRESS;
      if (record.PROP_CITY && !record.city) record.city = record.PROP_CITY;
      if (record.PROP_STATE && !record.state) record.state = record.PROP_STATE;
      if (record.PROP_ZIP && !record.zip) record.zip = record.PROP_ZIP;
      if (record.BUILDING_SQFT && !record.sqft) record.sqft = parseNumber(record.BUILDING_SQFT);
      if (record.LATITUDE && !record.latitude) record.latitude = parseNumber(record.LATITUDE);
      if (record.LONGITUDE && !record.longitude) record.longitude = parseNumber(record.LONGITUDE);
      if (record.OWNER_NAME_1 && !record.owner_name) record.owner_name = record.OWNER_NAME_1;
      if (record.LANDUSE_CATEGORY && !record.landuse_category) record.landuse_category = record.LANDUSE_CATEGORY;
      if (record.LANDUSE_DESC && !record.landuse_desc) record.landuse_desc = record.LANDUSE_DESC;
      
      records.push(record);
    }
  }
  
  console.log(`   Parsed ${records.length} records\n`);
  
  // Save JSON
  console.log(`💾 Saving ${path.basename(JSON_FILE)}...`);
  fs.writeFileSync(JSON_FILE, JSON.stringify(records, null, 2));
  console.log(`   ✅ Saved ${records.length} records\n`);
  
  // Filter records with coordinates
  const geoRecords = records.filter(r => {
    const lat = r.latitude;
    const lng = r.longitude;
    return lat && lng && 
           lat >= 33.38 && lat <= 33.95 && 
           lng >= -118.12 && lng <= -117.41;
  });
  
  console.log(`🗺️  Creating GeoJSON...`);
  console.log(`   ${geoRecords.length} records have valid coordinates`);
  
  // Create GeoJSON
  const geojson = {
    type: 'FeatureCollection',
    features: geoRecords.map((r, idx) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [r.longitude, r.latitude]
      },
      properties: {
        id: r.id || `prop-${idx}`,
        address: r.address,
        city: r.city,
        state: r.state || 'CA',
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
        source_type: r.source_type
      }
    }))
  };
  
  // Save GeoJSON
  console.log(`💾 Saving ${path.basename(GEOJSON_FILE)}...`);
  fs.writeFileSync(GEOJSON_FILE, JSON.stringify(geojson, null, 2));
  
  // Copy to frontend public folder
  const frontendDataDir = path.join(__dirname, '../../../frontend/public/data');
  if (!fs.existsSync(frontendDataDir)) {
    fs.mkdirSync(frontendDataDir, { recursive: true });
  }
  
  fs.copyFileSync(GEOJSON_FILE, path.join(frontendDataDir, 'building_hawk_geo.geojson'));
  fs.copyFileSync(JSON_FILE, path.join(frontendDataDir, 'building_hawk_all.json'));
  
  console.log(`   ✅ Saved ${geojson.features.length} features`);
  console.log(`   ✅ Copied to frontend/public/data/\n`);
  
  // Stats
  console.log('='.repeat(50));
  console.log('📊 Summary:\n');
  console.log(`   Total records: ${records.length}`);
  console.log(`   With coordinates: ${geoRecords.length} (${(geoRecords.length/records.length*100).toFixed(1)}%)`);
  
  const cities = [...new Set(records.map(r => r.city).filter(Boolean))];
  console.log(`   Cities: ${cities.length}`);
  console.log(`   Cities list: ${cities.slice(0, 5).join(', ')}${cities.length > 5 ? '...' : ''}`);
  
  console.log(`\n📁 Files created:`);
  console.log(`   ${JSON_FILE}`);
  console.log(`   ${GEOJSON_FILE}`);
  console.log(`   ${path.join(frontendDataDir, 'building_hawk_geo.geojson')}`);
  
  console.log('\n✅ Done! Open map-preview.html to view the data.\n');
}

// Run
main().catch(console.error);
