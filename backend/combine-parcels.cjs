/**
 * Combine multiple parcel Excel files into one CSV for import
 * Run with: node combine-parcels.cjs
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Excel files to combine (in backend folder)
const EXCEL_FILES = [
  'Parcels2.csv.xlsx',
  'Parcels3 (1).csv.xlsx',
  'Parcels4 (2).csv.xlsx',
  'Parcels5 (3).csv.xlsx',
  'Search Results_ Property Search (1).csv.xlsx'
];

// Target cities
const TARGET_CITIES = ['ANAHEIM', 'ORANGE', 'FULLERTON', 'BREA', 'PLACENTIA', 'LA HABRA', 'YORBA LINDA'];

// Normalize city names
function normalizeCity(city) {
  if (!city) return '';
  const upper = city.toString().toUpperCase().trim();
  if (upper.includes('LA HABRA')) return 'La Habra';
  if (upper.includes('YORBA LINDA')) return 'Yorba Linda';
  if (upper.includes('ANAHEIM')) return 'Anaheim';
  if (upper.includes('ORANGE')) return 'Orange';
  if (upper.includes('FULLERTON')) return 'Fullerton';
  if (upper.includes('BREA')) return 'Brea';
  if (upper.includes('PLACENTIA')) return 'Placentia';
  return city;
}

// Check if city is in target list
function isTargetCity(city) {
  if (!city) return false;
  const upper = city.toString().toUpperCase().trim();
  return TARGET_CITIES.some(tc => upper.includes(tc));
}

// Clean numeric value
function cleanNumber(val) {
  if (!val || val === '' || val === 'NaN' || val === 'null') return '';
  const num = parseFloat(String(val).replace(/[,$'"]/g, ''));
  return isNaN(num) ? '' : num;
}

// Clean string value
function cleanString(val) {
  if (!val || val === '' || val === 'NaN' || val === 'null' || val === 'nan') return '';
  return String(val).trim();
}

// Main function
function combineParcels() {
  console.log('🏢 Combining Parcel Files for Building Hawk\n');
  
  const allRecords = [];
  const seenKeys = new Set();
  
  for (const filename of EXCEL_FILES) {
    const filepath = path.join(__dirname, filename);
    
    if (!fs.existsSync(filepath)) {
      console.log(`⚠️  File not found: ${filename}`);
      continue;
    }
    
    console.log(`📄 Reading: ${filename}`);
    
    try {
      const workbook = XLSX.readFile(filepath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet);
      
      let added = 0;
      let skipped = 0;
      let noCoords = 0;
      
      for (const row of rows) {
        // Check for coordinates
        const lat = cleanNumber(row.LATITUDE);
        const lng = cleanNumber(row.LONGITUDE);
        
        if (!lat || !lng) {
          noCoords++;
          continue;
        }
        
        // Check city
        const city = row.SITE_CITY || row.PROP_CITY || '';
        if (!isTargetCity(city)) {
          skipped++;
          continue;
        }
        
        // Create dedup key
        const apn = cleanString(row.APN);
        const addr = cleanString(row.SITE_ADDR || row.PROP_ADDRESS || '');
        const key = apn || `${addr}_${city}`.toLowerCase();
        
        if (seenKeys.has(key)) {
          skipped++;
          continue;
        }
        seenKeys.add(key);
        
        // Normalize and add record
        allRecords.push({
          APN: apn,
          SITE_ADDR: addr,
          SITE_CITY: normalizeCity(city),
          SITE_ZIP: cleanString(row.SITE_ZIP || row.PROP_ZIP || '').replace('.0', '').split('.')[0],
          LATITUDE: lat,
          LONGITUDE: lng,
          LAND_SQFT: cleanNumber(row.LAND_SQFT || row.ACREAGE ? row.ACREAGE * 43560 : ''),
          BUILDING_SQFT: cleanNumber(row.BUILDING_SQFT),
          YR_BLT: cleanNumber(row.YR_BLT),
          ZONING_CODE: cleanString(row.ZONING_CODE || row.ZONING || ''),
          OWNER_NAME_1: cleanString(row.OWNER_NAME_1),
          OWNER_ADDRESS: cleanString(row.OWNER_ADDRESS),
          OWNER_CITY: cleanString(row.OWNER_CITY),
          OWNER_STATE: cleanString(row.OWNER_STATE),
          OWNER_ZIP: cleanString(row.OWNER_ZIP || '').replace('.0', '').split('.')[0],
          USE_CODE_STD_DESC: cleanString(row.USE_CODE_STD_DESC || row.LANDUSE_DESC || ''),
          VAL_TRANSFER: cleanNumber(row.VAL_TRANSFER),
          DATE_TRANSFER: cleanString(row.DATE_TRANSFER)
        });
        
        added++;
      }
      
      console.log(`   ✅ Added: ${added} | Skipped: ${skipped} | No coords: ${noCoords}`);
      
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
    }
  }
  
  console.log(`\n📊 Total unique records: ${allRecords.length}`);
  
  // City breakdown
  const cityCount = {};
  allRecords.forEach(r => {
    cityCount[r.SITE_CITY] = (cityCount[r.SITE_CITY] || 0) + 1;
  });
  console.log('\nCity breakdown:');
  Object.entries(cityCount).sort((a, b) => b[1] - a[1]).forEach(([city, count]) => {
    console.log(`   ${city}: ${count}`);
  });
  
  // Write CSV
  const outputPath = path.join(__dirname, 'data', 'combined_parcels.csv');
  
  // Ensure data directory exists
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // CSV header
  const headers = Object.keys(allRecords[0] || {});
  const csvLines = [headers.join(',')];
  
  // CSV rows
  for (const record of allRecords) {
    const values = headers.map(h => {
      const val = record[h];
      if (val === '' || val === null || val === undefined) return '';
      // Quote strings with commas
      if (String(val).includes(',') || String(val).includes('"')) {
        return `"${String(val).replace(/"/g, '""')}"`;
      }
      return val;
    });
    csvLines.push(values.join(','));
  }
  
  fs.writeFileSync(outputPath, csvLines.join('\n'), 'utf8');
  console.log(`\n💾 Saved: ${outputPath}`);
  console.log(`\n🚀 Next step: Run 'npm run db:import-parcels' to import to database`);
}

combineParcels();
