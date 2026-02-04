/**
 * BuildingHawk - Export Industrial Parcels to GeoJSON
 * Creates a GeoJSON file that frontend can load directly
 * 
 * Usage: node export-industrial-geojson.cjs
 */

const shapefile = require('shapefile');
const fs = require('fs');

// Paths
const SHAPEFILE_PATH = 'C:/Users/User/BuildingHawk/app/backend/data/parcel_polygons/Parcel_Polygons.shp';
const INDUSTRIAL_CSV = 'C:/Users/User/BuildingHawk/data/Parcels.csv';
const OUTPUT_PATH = 'C:/Users/User/BuildingHawk/app/frontend/public/data/industrial_parcels.geojson';

// Stats
const stats = {
  total_read: 0,
  matched: 0
};

/**
 * Parse CSV to get industrial APNs
 */
function loadIndustrialAPNs() {
  console.log('Loading industrial parcels from CSV...');
  const content = fs.readFileSync(INDUSTRIAL_CSV, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  const apns = new Map();
  
  // Parse header
  const headerLine = lines[0].replace(/^\uFEFF/, ''); // Remove BOM
  const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));
  
  const apnIdx = headers.findIndex(h => h === 'APN');
  const addrIdx = headers.findIndex(h => h === 'SITE_ADDR');
  const cityIdx = headers.findIndex(h => h === 'SITE_CITY');
  const zipIdx = headers.findIndex(h => h === 'SITE_ZIP');
  const zoningIdx = headers.findIndex(h => h === 'ZONING_CODE');
  const landSfIdx = headers.findIndex(h => h === 'LAND_SQFT');
  const bldgSfIdx = headers.findIndex(h => h === 'BUILDING_SQFT');
  const ownerIdx = headers.findIndex(h => h === 'OWNER_NAME_1');
  
  console.log(`  Column indices: APN=${apnIdx}, ADDR=${addrIdx}, CITY=${cityIdx}`);
  
  for (let i = 1; i < lines.length; i++) {
    // Parse CSV line handling quotes
    const values = [];
    let current = '';
    let inQuotes = false;
    const line = lines[i];
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const apn = (values[apnIdx] || '').replace(/"/g, '').trim();
    if (apn) {
      // Normalize APN for matching (remove dashes)
      const normalizedAPN = apn.replace(/-/g, '');
      apns.set(normalizedAPN, {
        apn: apn,
        address: (values[addrIdx] || '').replace(/"/g, '').trim(),
        city: (values[cityIdx] || '').replace(/"/g, '').trim(),
        zip: (values[zipIdx] || '').replace(/"/g, '').trim(),
        zoning: (values[zoningIdx] || '').replace(/"/g, '').replace(/'/g, '').trim(),
        land_sf: parseInt((values[landSfIdx] || '0').replace(/[^0-9]/g, '')) || null,
        building_sf: parseInt((values[bldgSfIdx] || '0').replace(/[^0-9]/g, '')) || null,
        owner: (values[ownerIdx] || '').replace(/"/g, '').trim()
      });
    }
  }
  
  console.log(`  Loaded ${apns.size} industrial parcels`);
  return apns;
}

/**
 * Main export function
 */
async function main() {
  console.log('\n🦅 BuildingHawk - Export Industrial Parcels to GeoJSON');
  console.log('='.repeat(50));
  
  // Load industrial APNs
  const industrialAPNs = loadIndustrialAPNs();
  
  // Ensure output directory exists
  const outputDir = 'C:/Users/User/BuildingHawk/app/frontend/public/data';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Read shapefile
  console.log('\n🗺️  Reading shapefile...');
  console.log(`   ${SHAPEFILE_PATH}`);
  
  const source = await shapefile.open(SHAPEFILE_PATH);
  const features = [];
  
  let result;
  while ((result = await source.read()) && !result.done) {
    stats.total_read++;
    
    const feature = result.value;
    if (!feature || !feature.properties || !feature.geometry) continue;
    
    // Get APN from shapefile
    const shpAPN = (feature.properties.AssessmentNo || '').toString().trim();
    const normalizedAPN = shpAPN.replace(/-/g, '');
    
    // Check if this is an industrial parcel
    const industrialData = industrialAPNs.get(normalizedAPN);
    if (!industrialData) continue;
    
    stats.matched++;
    
    // Create feature with properties
    features.push({
      type: 'Feature',
      geometry: feature.geometry,
      properties: {
        apn: industrialData.apn,
        situs_address: industrialData.address,
        city: industrialData.city,
        zip: industrialData.zip,
        zoning: industrialData.zoning,
        land_sf: industrialData.land_sf,
        building_sf: industrialData.building_sf,
        owner_name: industrialData.owner,
        building_count: 1
      }
    });
    
    // Progress
    if (stats.total_read % 50000 === 0) {
      console.log(`   Read ${stats.total_read} features, matched ${stats.matched}...`);
    }
  }
  
  console.log(`\n   Total read: ${stats.total_read}`);
  console.log(`   Matched industrial: ${stats.matched}`);
  
  // Create GeoJSON
  const geojson = {
    type: 'FeatureCollection',
    features: features
  };
  
  // Write to file
  console.log(`\n💾 Writing GeoJSON to ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson));
  
  const fileSizeMB = (fs.statSync(OUTPUT_PATH).size / (1024 * 1024)).toFixed(2);
  console.log(`   ✅ Saved ${features.length} features (${fileSizeMB} MB)`);
  
  console.log('\n='.repeat(50));
  console.log('✅ Export Complete!');
  console.log(`   File: ${OUTPUT_PATH}`);
  console.log('\n   Load this file in BuildingHawk using "Load GeoJSON" button');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
