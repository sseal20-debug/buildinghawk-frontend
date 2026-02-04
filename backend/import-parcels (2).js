const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');

// Supabase connection
const supabaseUrl = 'https://yzgpmobldrdpqscsomgm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6Z3Btb2JsZHJkcHFzY3NvbWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4OTU0MDcsImV4cCI6MjA1MjQ3MTQwN30.GMvSTJQ4mGEh_cdE8xJOO24b_rB1V5AEHr0MQPbZckg';
const supabase = createClient(supabaseUrl, supabaseKey);

// File paths - looking in current directory
const files = [
  './Search_Results__Property_Search__1__csv.xlsx',
  './Parcels2_csv.xlsx',
  './Parcels3__1__csv.xlsx',
  './Parcels4__2__csv.xlsx',
  './Parcels5__3__csv.xlsx'
];

// Read and combine all files
function loadAllData() {
  const allData = [];
  
  for (const file of files) {
    try {
      const workbook = xlsx.readFile(file);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);
      console.log(`Loaded ${data.length} rows from ${path.basename(file)}`);
      allData.push(...data);
    } catch (err) {
      console.error(`Error loading ${file}:`, err.message);
    }
  }
  
  return allData;
}

// Deduplicate by APN, keeping most complete record
function deduplicateByAPN(data) {
  const byAPN = new Map();
  
  for (const row of data) {
    const apn = row.APN;
    if (!apn) continue;
    
    const completeness = Object.values(row).filter(v => v != null && v !== '').length;
    const existing = byAPN.get(apn);
    
    if (!existing || completeness > existing.completeness) {
      byAPN.set(apn, { ...row, completeness });
    }
  }
  
  return Array.from(byAPN.values());
}

// Clean and normalize data
function cleanRow(row) {
  return {
    apn: String(row.APN || '').trim(),
    address: String(row.SITE_ADDR || '').trim(),
    city: String(row.SITE_CITY || '').trim(),
    zip: row.SITE_ZIP ? String(Math.floor(row.SITE_ZIP)).padStart(5, '0') : null,
    owner: row.OWNER_NAME_1 ? String(row.OWNER_NAME_1).trim() : null,
    assessedValue: row.VAL_ASSD || null,
    zoningCode: row.ZONING_CODE ? String(row.ZONING_CODE).replace(/'/g, '').trim() : null,
    zoningCategory: row.ZONING_CATEGORY ? String(row.ZONING_CATEGORY).replace(/'/g, '').trim() : null,
    saleDate: row.DATE_TRANSFER || null,
    salePrice: row.VAL_TRANSFER || null,
    pricePerSqft: row.PRICE_PER_SQFT || null,
    buildingSqft: row.BUILDING_SQFT || null,
    acreage: row.ACREAGE || null,
    landSqft: row.LAND_SQFT || null,
    units: row.UNITS_NUMBER || null,
    yearBuilt: row.YR_BLT || null,
    useCategory: row.USE_CODE_STD_CTGR_DESC ? String(row.USE_CODE_STD_CTGR_DESC).trim() : null,
    useDescription: row.USE_CODE_STD_DESC ? String(row.USE_CODE_STD_DESC).trim() : null,
    buyer: row.BUYER_NAME ? String(row.BUYER_NAME).trim() : null,
    lat: row.LATITUDE,
    lng: row.LONGITUDE
  };
}

// Import parcels
async function importParcels(data) {
  console.log('\n=== Importing Parcels ===');
  let inserted = 0, updated = 0, errors = 0;
  
  // Get existing APNs
  const { data: existing } = await supabase.from('parcels').select('apn');
  const existingAPNs = new Set(existing?.map(p => p.apn) || []);
  console.log(`Existing parcels in DB: ${existingAPNs.size}`);
  
  for (const row of data) {
    const clean = cleanRow(row);
    if (!clean.apn || !clean.lat || !clean.lng) continue;
    
    // Create ~80m radius circle geometry for parcel
    const geometry = `SRID=4326;POINT(${clean.lng} ${clean.lat})`;
    
    const parcelData = {
      apn: clean.apn,
      address: clean.address || null,
      city: clean.city || null,
      state: 'CA',
      zip: clean.zip,
      zoning: clean.zoningCode,
      land_sf: clean.landSqft,
      assessed_value: clean.assessedValue,
      geometry: geometry
    };
    
    try {
      if (existingAPNs.has(clean.apn)) {
        // Update existing
        const { error } = await supabase
          .from('parcels')
          .update(parcelData)
          .eq('apn', clean.apn);
        
        if (error) throw error;
        updated++;
      } else {
        // Insert new
        const { error } = await supabase
          .from('parcels')
          .insert(parcelData);
        
        if (error) throw error;
        inserted++;
        existingAPNs.add(clean.apn);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) console.error(`Parcel error ${clean.apn}:`, err.message);
    }
  }
  
  console.log(`Parcels: ${inserted} inserted, ${updated} updated, ${errors} errors`);
  return existingAPNs;
}

// Import buildings
async function importBuildings(data) {
  console.log('\n=== Importing Buildings ===');
  let inserted = 0, updated = 0, errors = 0;
  
  // Get parcel IDs mapping
  const { data: parcels } = await supabase.from('parcels').select('id, apn');
  const apnToId = new Map(parcels?.map(p => [p.apn, p.id]) || []);
  
  // Get existing buildings by parcel
  const { data: existingBuildings } = await supabase.from('buildings').select('parcel_id, building_sf');
  const existingParcelBuildings = new Set(existingBuildings?.map(b => b.parcel_id) || []);
  
  for (const row of data) {
    const clean = cleanRow(row);
    if (!clean.buildingSqft || clean.buildingSqft <= 0) continue;
    
    const parcelId = apnToId.get(clean.apn);
    if (!parcelId) continue;
    
    const buildingData = {
      parcel_id: parcelId,
      address: clean.address,
      city: clean.city,
      state: 'CA',
      zip: clean.zip,
      building_sf: Math.round(clean.buildingSqft),
      year_built: clean.yearBuilt ? Math.round(clean.yearBuilt) : null,
      property_type: clean.useCategory || 'INDUSTRIAL',
      property_subtype: clean.useDescription
    };
    
    try {
      if (existingParcelBuildings.has(parcelId)) {
        // Update existing
        const { error } = await supabase
          .from('buildings')
          .update(buildingData)
          .eq('parcel_id', parcelId);
        
        if (error) throw error;
        updated++;
      } else {
        // Insert new
        const { error } = await supabase
          .from('buildings')
          .insert(buildingData);
        
        if (error) throw error;
        inserted++;
        existingParcelBuildings.add(parcelId);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) console.error(`Building error:`, err.message);
    }
  }
  
  console.log(`Buildings: ${inserted} inserted, ${updated} updated, ${errors} errors`);
}

// Import owners as entities
async function importOwners(data) {
  console.log('\n=== Importing Owners ===');
  let inserted = 0, skipped = 0, errors = 0;
  
  // Get existing entity names (normalized)
  const { data: existing } = await supabase.from('entities').select('name');
  const existingNames = new Set(existing?.map(e => e.name.toUpperCase().trim()) || []);
  
  const owners = new Set();
  for (const row of data) {
    const owner = row.OWNER_NAME_1;
    if (owner && typeof owner === 'string') {
      owners.add(owner.trim());
    }
  }
  
  console.log(`Unique owners found: ${owners.size}`);
  
  for (const owner of owners) {
    if (existingNames.has(owner.toUpperCase())) {
      skipped++;
      continue;
    }
    
    // Determine entity type
    let entityType = 'individual';
    const upperOwner = owner.toUpperCase();
    if (upperOwner.includes(' LLC') || upperOwner.includes(' LP') || 
        upperOwner.includes(' INC') || upperOwner.includes(' CORP') ||
        upperOwner.includes(' PARTNERS') || upperOwner.includes(' PROPERTIES') ||
        upperOwner.includes(' INVESTMENTS') || upperOwner.includes(' REIT') ||
        upperOwner.includes(' TRUST') || upperOwner.includes(' CO ') ||
        upperOwner.includes(' COMPANY')) {
      entityType = 'company';
    } else if (upperOwner.includes(' TR') || upperOwner.includes(' TRUST')) {
      entityType = 'trust';
    }
    
    try {
      const { error } = await supabase
        .from('entities')
        .insert({
          name: owner,
          entity_type: entityType,
          role: 'owner'
        });
      
      if (error) throw error;
      inserted++;
      existingNames.add(owner.toUpperCase());
    } catch (err) {
      errors++;
      if (errors <= 5) console.error(`Owner error:`, err.message);
    }
  }
  
  console.log(`Owners: ${inserted} inserted, ${skipped} skipped (existing), ${errors} errors`);
}

// Import ownership records with sales data
async function importOwnership(data) {
  console.log('\n=== Importing Ownership Records ===');
  let inserted = 0, errors = 0;
  
  // Get parcel mapping
  const { data: parcels } = await supabase.from('parcels').select('id, apn');
  const apnToId = new Map(parcels?.map(p => [p.apn, p.id]) || []);
  
  // Get entity mapping
  const { data: entities } = await supabase.from('entities').select('id, name');
  const nameToId = new Map(entities?.map(e => [e.name.toUpperCase(), e.id]) || []);
  
  // Get existing ownership records
  const { data: existingOwnership } = await supabase.from('ownership').select('parcel_id, entity_id');
  const existingPairs = new Set(existingOwnership?.map(o => `${o.parcel_id}-${o.entity_id}`) || []);
  
  for (const row of data) {
    const clean = cleanRow(row);
    const parcelId = apnToId.get(clean.apn);
    const ownerId = clean.owner ? nameToId.get(clean.owner.toUpperCase()) : null;
    
    if (!parcelId || !ownerId) continue;
    
    const pairKey = `${parcelId}-${ownerId}`;
    if (existingPairs.has(pairKey)) continue;
    
    // Parse sale date
    let acquisitionDate = null;
    if (clean.saleDate) {
      try {
        const d = new Date(clean.saleDate);
        if (!isNaN(d.getTime())) {
          acquisitionDate = d.toISOString().split('T')[0];
        }
      } catch (e) {}
    }
    
    try {
      const { error } = await supabase
        .from('ownership')
        .insert({
          parcel_id: parcelId,
          entity_id: ownerId,
          ownership_pct: 100,
          acquisition_date: acquisitionDate,
          acquisition_price: clean.salePrice || null
        });
      
      if (error) throw error;
      inserted++;
      existingPairs.add(pairKey);
    } catch (err) {
      errors++;
      if (errors <= 5) console.error(`Ownership error:`, err.message);
    }
  }
  
  console.log(`Ownership: ${inserted} inserted, ${errors} errors`);
}

// Main import function
async function main() {
  console.log('=== BuildingHawk Data Import ===\n');
  
  // Load all data
  console.log('Loading files...');
  const rawData = loadAllData();
  console.log(`\nTotal rows loaded: ${rawData.length}`);
  
  // Deduplicate
  const data = deduplicateByAPN(rawData);
  console.log(`Unique parcels after deduplication: ${data.length}`);
  
  // Run imports
  await importParcels(data);
  await importBuildings(data);
  await importOwners(data);
  await importOwnership(data);
  
  // Final counts
  console.log('\n=== Final Database Counts ===');
  const { count: parcelCount } = await supabase.from('parcels').select('*', { count: 'exact', head: true });
  const { count: buildingCount } = await supabase.from('buildings').select('*', { count: 'exact', head: true });
  const { count: entityCount } = await supabase.from('entities').select('*', { count: 'exact', head: true });
  const { count: ownershipCount } = await supabase.from('ownership').select('*', { count: 'exact', head: true });
  
  console.log(`Parcels: ${parcelCount}`);
  console.log(`Buildings: ${buildingCount}`);
  console.log(`Entities: ${entityCount}`);
  console.log(`Ownership records: ${ownershipCount}`);
  
  console.log('\n✅ Import complete!');
}

main().catch(console.error);
