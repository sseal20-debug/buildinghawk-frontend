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

async function importParcels(data) {
  console.log('\n=== Importing Parcels ===');
  let inserted = 0, updated = 0, errors = 0;
  const { data: existing } = await supabase.from('parcels').select('apn');
  const existingAPNs = new Set(existing?.map(p => p.apn) || []);
  console.log('Existing parcels: ' + existingAPNs.size);
  for (const row of data) {
    const clean = cleanRow(row);
    if (!clean.apn || !clean.lat || !clean.lng) continue;
    const parcelData = { apn: clean.apn, address: clean.address || null, city: clean.city || null, state: 'CA', zip: clean.zip, zoning: clean.zoningCode, land_sf: clean.landSqft, assessed_value: clean.assessedValue, geometry: 'SRID=4326;POINT(' + clean.lng + ' ' + clean.lat + ')' };
    try {
      if (existingAPNs.has(clean.apn)) { await supabase.from('parcels').update(parcelData).eq('apn', clean.apn); updated++; }
      else { await supabase.from('parcels').insert(parcelData); inserted++; existingAPNs.add(clean.apn); }
    } catch (err) { errors++; if (errors <= 3) console.error('Parcel error: ' + err.message); }
    if ((inserted + updated) % 500 === 0) console.log('  Progress: ' + (inserted + updated) + ' parcels...');
  }
  console.log('Parcels: ' + inserted + ' inserted, ' + updated + ' updated, ' + errors + ' errors');
}

async function importBuildings(data) {
  console.log('\n=== Importing Buildings ===');
  let inserted = 0, updated = 0, errors = 0;
  const { data: parcels } = await supabase.from('parcels').select('id, apn');
  const apnToId = new Map(parcels?.map(p => [p.apn, p.id]) || []);
  const { data: existingBuildings } = await supabase.from('buildings').select('parcel_id');
  const existingParcelBuildings = new Set(existingBuildings?.map(b => b.parcel_id) || []);
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

async function importOwners(data) {
  console.log('\n=== Importing Owners ===');
  let inserted = 0, skipped = 0, errors = 0;
  const { data: existing } = await supabase.from('entities').select('name');
  const existingNames = new Set(existing?.map(e => e.name.toUpperCase().trim()) || []);
  const owners = new Set();
  for (const row of data) { if (row.OWNER_NAME_1 && typeof row.OWNER_NAME_1 === 'string') owners.add(row.OWNER_NAME_1.trim()); }
  console.log('Unique owners: ' + owners.size);
  for (const owner of owners) {
    if (existingNames.has(owner.toUpperCase())) { skipped++; continue; }
    let entityType = 'individual';
    const upper = owner.toUpperCase();
    if (upper.includes(' LLC') || upper.includes(' LP') || upper.includes(' INC') || upper.includes(' CORP') || upper.includes(' PARTNERS') || upper.includes(' PROPERTIES') || upper.includes(' REIT') || upper.includes(' TRUST') || upper.includes(' COMPANY')) entityType = 'company';
    try { await supabase.from('entities').insert({ name: owner, entity_type: entityType, role: 'owner' }); inserted++; existingNames.add(owner.toUpperCase()); }
    catch (err) { errors++; if (errors <= 3) console.error('Owner error: ' + err.message); }
  }
  console.log('Owners: ' + inserted + ' inserted, ' + skipped + ' skipped, ' + errors + ' errors');
}

async function importOwnership(data) {
  console.log('\n=== Importing Ownership ===');
  let inserted = 0, errors = 0;
  const { data: parcels } = await supabase.from('parcels').select('id, apn');
  const apnToId = new Map(parcels?.map(p => [p.apn, p.id]) || []);
  const { data: entities } = await supabase.from('entities').select('id, name');
  const nameToId = new Map(entities?.map(e => [e.name.toUpperCase(), e.id]) || []);
  const { data: existingOwnership } = await supabase.from('ownership').select('parcel_id, entity_id');
  const existingPairs = new Set(existingOwnership?.map(o => o.parcel_id + '-' + o.entity_id) || []);
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
  console.log('=== BuildingHawk Import ===\n');
  const rawData = loadAllData();
  console.log('\nTotal rows: ' + rawData.length);
  const data = deduplicateByAPN(rawData);
  console.log('Unique parcels: ' + data.length);
  await importParcels(data);
  await importBuildings(data);
  await importOwners(data);
  await importOwnership(data);
  console.log('\n=== Final Counts ===');
  const { count: p } = await supabase.from('parcels').select('*', { count: 'exact', head: true });
  const { count: b } = await supabase.from('buildings').select('*', { count: 'exact', head: true });
  const { count: e } = await supabase.from('entities').select('*', { count: 'exact', head: true });
  const { count: o } = await supabase.from('ownership').select('*', { count: 'exact', head: true });
  console.log('Parcels: ' + p + ', Buildings: ' + b + ', Entities: ' + e + ', Ownership: ' + o);
  console.log('\nDone!');
}
main().catch(console.error);
