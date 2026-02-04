const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');

const supabaseUrl = 'https://yzgpmobldrdpqscsomgm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6Z3Btb2JsZHJkcHFzY3NvbWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4OTU0MDcsImV4cCI6MjA1MjQ3MTQwN30.GMvSTJQ4mGEh_cdE8xJOO24b_rB1V5AEHr0MQPbZckg';
const supabase = createClient(supabaseUrl, supabaseKey);

const files = [
  './Search Results_ Property Search (1).csv.xlsx',
  './Parcels2.csv.xlsx',
  './Parcels3 (1).csv.xlsx',
  './Parcels4 (2).csv.xlsx',
  './Parcels5 (3).csv.xlsx'
];

// Fetch all records with pagination
async function fetchAll(table, columns) {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function loadAllData() {
  const allData = [];
  for (const file of files) {
    try {
      const workbook = xlsx.readFile(file);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);
      console.log('Loaded ' + data.length + ' rows from ' + path.basename(file));
      allData.push(...data);
    } catch (err) { console.error('Error loading ' + file + ': ' + err.message); }
  }
  return allData;
}

function deduplicateByAPN(data) {
  const byAPN = new Map();
  for (const row of data) {
    const apn = row.APN;
    if (!apn) continue;
    const completeness = Object.values(row).filter(v => v != null && v !== '').length;
    const existing = byAPN.get(apn);
    if (!existing || completeness > existing.completeness) byAPN.set(apn, { ...row, completeness });
  }
  return Array.from(byAPN.values());
}

function cleanRow(row) {
  return {
    apn: String(row.APN || '').trim(),
    address: String(row.SITE_ADDR || '').trim(),
    city: String(row.SITE_CITY || '').trim(),
    zip: row.SITE_ZIP ? String(Math.floor(row.SITE_ZIP)).padStart(5, '0') : null,
    owner: row.OWNER_NAME_1 ? String(row.OWNER_NAME_1).trim() : null,
    assessedValue: row.VAL_ASSD || null,
    zoningCode: row.ZONING_CODE ? String(row.ZONING_CODE).replace(/'/g, '').trim() : null,
    saleDate: row.DATE_TRANSFER || null,
    salePrice: row.VAL_TRANSFER || null,
    buildingSqft: row.BUILDING_SQFT || null,
    landSqft: row.LAND_SQFT || null,
    yearBuilt: row.YR_BLT || null,
    useCategory: row.USE_CODE_STD_CTGR_DESC ? String(row.USE_CODE_STD_CTGR_DESC).trim() : null,
    useDescription: row.USE_CODE_STD_DESC ? String(row.USE_CODE_STD_DESC).trim() : null,
    lat: row.LATITUDE,
    lng: row.LONGITUDE
  };
}

async function importBuildings(data) {
  console.log('\n=== Importing Buildings ===');
  let inserted = 0, updated = 0, errors = 0;
  
  const parcels = await fetchAll('parcels', 'id, apn');
  console.log('Fetched ' + parcels.length + ' parcels');
  const apnToId = new Map(parcels.map(p => [p.apn, p.id]));
  
  const existingBuildings = await fetchAll('buildings', 'parcel_id');
  const existingParcelBuildings = new Set(existingBuildings.map(b => b.parcel_id));
  console.log('Existing buildings: ' + existingParcelBuildings.size);

  for (const row of data) {
    const clean = cleanRow(row);
    if (!clean.buildingSqft || clean.buildingSqft <= 0) continue;
    const parcelId = apnToId.get(clean.apn);
    if (!parcelId) continue;
    const buildingData = { parcel_id: parcelId, address: clean.address, city: clean.city, state: 'CA', zip: clean.zip, building_sf: Math.round(clean.buildingSqft), year_built: clean.yearBuilt ? Math.round(clean.yearBuilt) : null, property_type: clean.useCategory || 'INDUSTRIAL', property_subtype: clean.useDescription };
    try {
      if (existingParcelBuildings.has(parcelId)) { await supabase.from('buildings').update(buildingData).eq('parcel_id', parcelId); updated++; }
      else { await supabase.from('buildings').insert(buildingData); inserted++; existingParcelBuildings.add(parcelId); }
    } catch (err) { errors++; if (errors <= 3) console.error('Building error: ' + err.message); }
    if ((inserted + updated) % 500 === 0) console.log('  Progress: ' + (inserted + updated) + ' buildings...');
  }
  console.log('Buildings: ' + inserted + ' inserted, ' + updated + ' updated, ' + errors + ' errors');
}

async function importOwnership(data) {
  console.log('\n=== Importing Ownership ===');
  let inserted = 0, errors = 0;
  
  const parcels = await fetchAll('parcels', 'id, apn');
  console.log('Fetched ' + parcels.length + ' parcels');
  const apnToId = new Map(parcels.map(p => [p.apn, p.id]));
  
  const entities = await fetchAll('entities', 'id, name');
  console.log('Fetched ' + entities.length + ' entities');
  const nameToId = new Map(entities.map(e => [e.name.toUpperCase(), e.id]));
  
  const existingOwnership = await fetchAll('ownership', 'parcel_id, entity_id');
  const existingPairs = new Set(existingOwnership.map(o => o.parcel_id + '-' + o.entity_id));
  console.log('Existing ownership: ' + existingPairs.size);

  for (const row of data) {
    const clean = cleanRow(row);
    const parcelId = apnToId.get(clean.apn);
    const ownerId = clean.owner ? nameToId.get(clean.owner.toUpperCase()) : null;
    if (!parcelId || !ownerId) continue;
    if (existingPairs.has(parcelId + '-' + ownerId)) continue;
    let acquisitionDate = null;
    if (clean.saleDate) { try { const d = new Date(clean.saleDate); if (!isNaN(d.getTime())) acquisitionDate = d.toISOString().split('T')[0]; } catch(e){} }
    try { await supabase.from('ownership').insert({ parcel_id: parcelId, entity_id: ownerId, ownership_pct: 100, acquisition_date: acquisitionDate, acquisition_price: clean.salePrice || null }); inserted++; existingPairs.add(parcelId + '-' + ownerId); }
    catch (err) { errors++; if (errors <= 3) console.error('Ownership error: ' + err.message); }
    if (inserted % 500 === 0) console.log('  Progress: ' + inserted + ' ownership...');
  }
  console.log('Ownership: ' + inserted + ' inserted, ' + errors + ' errors');
}

async function main() {
  console.log('=== BuildingHawk Import (Buildings & Ownership) ===\n');
  const rawData = loadAllData();
  console.log('\nTotal rows: ' + rawData.length);
  const data = deduplicateByAPN(rawData);
  console.log('Unique parcels: ' + data.length);
  await importBuildings(data);
  await importOwnership(data);
  console.log('\n=== Final Counts ===');
  const parcels = await fetchAll('parcels', 'id');
  const buildings = await fetchAll('buildings', 'id');
  const entities = await fetchAll('entities', 'id');
  const ownership = await fetchAll('ownership', 'id');
  console.log('Parcels: ' + parcels.length + ', Buildings: ' + buildings.length + ', Entities: ' + entities.length + ', Ownership: ' + ownership.length);
  console.log('\nDone!');
}
main().catch(console.error);
