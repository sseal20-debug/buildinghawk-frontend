/**
 * Add building records for parcels that have building_sf data but no building record.
 * This fixes the issue where parcels with buildings are incorrectly shown as "land only".
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzgpmobldrdpqscsomgm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6Z3Btb2JsZHJkcHFzY3NvbWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4OTU0MDcsImV4cCI6MjA1MjQ3MTQwN30.GMvSTJQ0mGEh_cdE8xJOO24b_rB1V5AEHr0MQPbZckg';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('='.repeat(60));
  console.log('Add Missing Building Records');
  console.log('='.repeat(60));

  // Get all parcels
  console.log('\n1. Fetching all parcels...');
  const { data: parcels, error: parcelsError } = await supabase
    .from('parcel')
    .select('apn, situs_address, city, zip, land_sf');

  if (parcelsError) {
    console.error('Error fetching parcels:', parcelsError);
    return;
  }
  console.log(`   Found ${parcels.length} parcels`);

  // Get all existing building records (by parcel_apn)
  console.log('\n2. Fetching existing buildings...');
  const { data: buildings, error: buildingsError } = await supabase
    .from('building')
    .select('parcel_apn');

  if (buildingsError) {
    console.error('Error fetching buildings:', buildingsError);
    return;
  }

  const existingBuildingAPNs = new Set(buildings.map(b => b.parcel_apn));
  console.log(`   Found ${existingBuildingAPNs.size} parcels with buildings`);

  // Find parcels without buildings
  const parcelsWithoutBuildings = parcels.filter(p => !existingBuildingAPNs.has(p.apn));
  console.log(`   Parcels without building records: ${parcelsWithoutBuildings.length}`);

  // Now we need to check our source data for building_sqft info
  // Load the source Excel files to get building_sqft data
  const xlsx = require('xlsx');
  const path = require('path');

  const sourceFiles = [
    path.join(__dirname, '..', 'Search Results_ Property Search (1).csv.xlsx'),
    path.join(__dirname, '..', 'Parcels2.csv.xlsx'),
    path.join(__dirname, '..', 'Parcels3 (1).csv.xlsx'),
    path.join(__dirname, '..', 'Parcels4 (2).csv.xlsx'),
    path.join(__dirname, '..', 'Parcels5 (3).csv.xlsx'),
  ];

  // Also check the Downloads folder
  const downloadsFile = 'C:/Users/User/Downloads/Parcels.csv';

  console.log('\n3. Loading source data for building_sqft...');

  // Create APN -> building_sqft map
  const apnToBuildingSF = new Map();
  const apnToYearBuilt = new Map();
  const apnToUseType = new Map();

  // Load Excel files
  for (const file of sourceFiles) {
    try {
      const workbook = xlsx.readFile(file);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);

      for (const row of data) {
        const apn = String(row.APN || '').trim();
        const buildingSf = row.BUILDING_SQFT;
        const yearBuilt = row.YR_BLT;
        const useType = row.USE_CODE_STD_CTGR_DESC || row.USE_CODE_STD_DESC;

        if (apn && buildingSf && buildingSf > 0) {
          apnToBuildingSF.set(apn, buildingSf);
          if (yearBuilt) apnToYearBuilt.set(apn, yearBuilt);
          if (useType) apnToUseType.set(apn, useType);
        }
      }
    } catch (e) {
      // File might not exist, skip
    }
  }

  // Load CSV file from Downloads
  try {
    const fs = require('fs');
    const csv = fs.readFileSync(downloadsFile, 'utf8');
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',');

    const apnIdx = headers.indexOf('APN');
    const bldgSfIdx = headers.indexOf('BUILDING_SQFT');
    const yrBuiltIdx = headers.indexOf('YR_BLT');
    const useTypeIdx = headers.indexOf('USE_CODE_STD_CTGR_DESC');

    for (let i = 1; i < lines.length; i++) {
      // Simple CSV parsing (doesn't handle quoted commas perfectly)
      const cols = lines[i].split(',');
      const apn = cols[apnIdx]?.replace(/"/g, '').trim();
      const buildingSf = parseFloat(cols[bldgSfIdx]);
      const yearBuilt = parseInt(cols[yrBuiltIdx]);
      const useType = cols[useTypeIdx]?.replace(/"/g, '').trim();

      if (apn && buildingSf && buildingSf > 0) {
        apnToBuildingSF.set(apn, buildingSf);
        if (yearBuilt && yearBuilt > 1800) apnToYearBuilt.set(apn, yearBuilt);
        if (useType) apnToUseType.set(apn, useType);
      }
    }
  } catch (e) {
    console.log('   Could not load Downloads/Parcels.csv:', e.message);
  }

  console.log(`   Found building_sqft data for ${apnToBuildingSF.size} APNs`);

  // Find parcels that need building records
  console.log('\n4. Finding parcels that need building records...');
  const parcelsNeedingBuildings = [];

  for (const parcel of parcelsWithoutBuildings) {
    // Normalize APN for lookup (remove dashes)
    const normalizedAPN = parcel.apn.replace(/-/g, '');
    const withDashes = parcel.apn;

    let buildingSf = apnToBuildingSF.get(normalizedAPN) || apnToBuildingSF.get(withDashes);
    let yearBuilt = apnToYearBuilt.get(normalizedAPN) || apnToYearBuilt.get(withDashes);
    let useType = apnToUseType.get(normalizedAPN) || apnToUseType.get(withDashes);

    if (buildingSf && buildingSf > 0) {
      parcelsNeedingBuildings.push({
        parcel_apn: parcel.apn,
        address: parcel.situs_address,
        city: parcel.city,
        state: 'CA',
        zip: parcel.zip,
        building_sf: Math.round(buildingSf),
        year_built: yearBuilt || null,
        property_type: useType || 'INDUSTRIAL',
        property_subtype: null
      });
    }
  }

  console.log(`   Found ${parcelsNeedingBuildings.length} parcels with building data but no building record`);

  if (parcelsNeedingBuildings.length === 0) {
    console.log('\nNo buildings to add!');
    return;
  }

  // Insert missing building records
  console.log(`\n5. Inserting ${parcelsNeedingBuildings.length} building records...`);

  const batchSize = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < parcelsNeedingBuildings.length; i += batchSize) {
    const batch = parcelsNeedingBuildings.slice(i, i + batchSize);

    const { error } = await supabase
      .from('building')
      .insert(batch);

    if (error) {
      console.error(`   Batch error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }

    if ((i + batchSize) % 500 === 0 || i + batchSize >= parcelsNeedingBuildings.length) {
      console.log(`   Progress: ${Math.min(i + batchSize, parcelsNeedingBuildings.length)}/${parcelsNeedingBuildings.length}`);
    }
  }

  console.log(`\n6. Results:`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Errors: ${errors}`);

  // Verify final counts
  console.log('\n7. Final verification...');
  const { count: buildingCount } = await supabase
    .from('building')
    .select('*', { count: 'exact', head: true });

  const { count: parcelCount } = await supabase
    .from('parcel')
    .select('*', { count: 'exact', head: true });

  console.log(`   Total parcels: ${parcelCount}`);
  console.log(`   Total buildings: ${buildingCount}`);

  console.log('\n' + '='.repeat(60));
  console.log('Done!');
  console.log('='.repeat(60));
}

main().catch(console.error);
