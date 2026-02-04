const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://yzgpmobldrdpqscsomgm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6Z3Btb2JsZHJkcHFzY3NvbWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4OTU0MDcsImV4cCI6MjA1MjQ3MTQwN30.GMvSTJQ4mGEh_cdE8xJOO24b_rB1V5AEHr0MQPbZckg';
const supabase = createClient(supabaseUrl, supabaseKey);

const BATCH_SIZE = 50;
const inventoryPath = path.join(process.env.USERPROFILE, 'BuildingHawk', 'building-hawk-inventory.json');

async function clearBadData() {
  console.log('\n=== Clearing Bad INV- Parcels ===');
  
  // Delete parcels that start with INV- (our generated bad APNs)
  const { data: badParcels, error: fetchError } = await supabase
    .from('parcels')
    .select('id, apn')
    .like('apn', 'INV-%');
  
  if (fetchError) {
    console.log('Error fetching bad parcels:', fetchError.message);
    return;
  }
  
  console.log('Found ' + (badParcels?.length || 0) + ' parcels with INV- prefix to delete');
  
  if (badParcels && badParcels.length > 0) {
    // Delete in batches
    const ids = badParcels.map(p => p.id);
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      
      // First delete related buildings
      await supabase.from('buildings').delete().in('parcel_id', batch);
      // Then delete parcels
      await supabase.from('parcels').delete().in('id', batch);
      
      console.log('  Deleted batch ' + Math.floor(i/100 + 1));
    }
    console.log('Cleared ' + ids.length + ' bad parcels');
  }
}

async function loadInventory() {
  console.log('Loading inventory from: ' + inventoryPath);
  const data = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
  console.log('Metadata:', JSON.stringify(data.metadata, null, 2));
  return data.properties;
}

function generateAPN(prop, index) {
  // Create a more meaningful APN from address
  const addr = (prop.address || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20).toUpperCase();
  const city = (prop.city || 'CA').substring(0, 3).toUpperCase();
  return `BH-${city}-${addr}-${index}`;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function importParcels(properties) {
  console.log('\n=== Importing Parcels (Clean Data) ===');
  
  // Filter to only properties with addresses
  const validProps = properties.filter(p => p.address && p.address.trim().length > 0);
  console.log('Properties with valid addresses: ' + validProps.length);
  
  // Deduplicate by address+city
  const seen = new Map();
  const uniqueProps = [];
  
  for (let i = 0; i < validProps.length; i++) {
    const prop = validProps[i];
    const key = (prop.address + '|' + prop.city).toUpperCase();
    
    if (!seen.has(key)) {
      seen.set(key, true);
      uniqueProps.push({ ...prop, _index: i });
    }
  }
  
  console.log('Unique addresses: ' + uniqueProps.length);
  
  // Get existing parcels by address
  const { data: existing } = await supabase.from('parcels').select('id, address, city');
  const existingAddresses = new Set(
    (existing || []).map(p => (p.address + '|' + p.city).toUpperCase())
  );
  console.log('Existing parcels in DB: ' + existingAddresses.size);
  
  // Filter to only new parcels
  const newParcels = uniqueProps.filter(p => {
    const key = (p.address + '|' + p.city).toUpperCase();
    return !existingAddresses.has(key);
  });
  
  console.log('New parcels to insert: ' + newParcels.length);
  
  if (newParcels.length === 0) {
    console.log('No new parcels to import.');
    return;
  }
  
  // Prepare records
  const records = newParcels.map((prop, idx) => {
    const apn = prop.apn || generateAPN(prop, prop._index);
    return {
      apn: apn.substring(0, 50),
      address: prop.address.substring(0, 200),
      city: prop.city ? prop.city.substring(0, 100) : null,
      state: 'CA',
      zip: prop.zip ? String(prop.zip).substring(0, 10) : null,
      zoning: prop.zoning ? String(prop.zoning).substring(0, 50) : null
    };
  });
  
  // Batch insert
  const batches = chunk(records, BATCH_SIZE);
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      const { error } = await supabase.from('parcels').insert(batch);
      if (error) {
        console.error(`Batch ${i+1} error:`, error.message);
        errors += batch.length;
      } else {
        inserted += batch.length;
      }
    } catch (err) {
      console.error(`Batch ${i+1} exception:`, err.message);
      errors += batch.length;
    }
    
    if ((i + 1) % 20 === 0 || i === batches.length - 1) {
      console.log(`  Progress: ${inserted}/${records.length} (${errors} errors)`);
    }
    
    await new Promise(r => setTimeout(r, 150));
  }
  
  console.log(`\nParcels: ${inserted} inserted, ${errors} errors`);
  return uniqueProps;
}

async function importBuildings(properties) {
  console.log('\n=== Importing Buildings ===');
  
  // Get parcel ID mapping by address
  const { data: parcels } = await supabase.from('parcels').select('id, address, city');
  const addressToId = new Map();
  for (const p of (parcels || [])) {
    const key = (p.address + '|' + p.city).toUpperCase();
    addressToId.set(key, p.id);
  }
  console.log('Parcels available: ' + addressToId.size);
  
  // Get existing buildings
  const { data: existingBuildings } = await supabase.from('buildings').select('parcel_id');
  const existingParcelIds = new Set((existingBuildings || []).map(b => b.parcel_id));
  
  // Filter properties with square footage
  const withSqft = properties.filter(p => p.squareFeet && p.squareFeet > 0 && p.address);
  console.log('Properties with square footage: ' + withSqft.length);
  
  // Prepare building records
  const buildings = [];
  const seenParcels = new Set();
  
  for (const prop of withSqft) {
    const key = (prop.address + '|' + prop.city).toUpperCase();
    const parcelId = addressToId.get(key);
    
    if (!parcelId) continue;
    if (existingParcelIds.has(parcelId)) continue;
    if (seenParcels.has(parcelId)) continue;
    seenParcels.add(parcelId);
    
    buildings.push({
      parcel_id: parcelId,
      address: prop.address.substring(0, 200),
      city: prop.city ? prop.city.substring(0, 100) : null,
      state: 'CA',
      zip: prop.zip ? String(prop.zip).substring(0, 10) : null,
      building_sf: Math.round(prop.squareFeet),
      year_built: prop.yearBuilt || null,
      property_type: 'INDUSTRIAL'
    });
  }
  
  console.log('New buildings to insert: ' + buildings.length);
  
  if (buildings.length === 0) {
    console.log('No new buildings to import.');
    return;
  }
  
  // Batch insert
  const batches = chunk(buildings, BATCH_SIZE);
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < batches.length; i++) {
    try {
      const { error } = await supabase.from('buildings').insert(batches[i]);
      if (error) errors += batches[i].length;
      else inserted += batches[i].length;
    } catch (err) {
      errors += batches[i].length;
    }
    
    if ((i + 1) % 20 === 0 || i === batches.length - 1) {
      console.log(`  Progress: ${inserted}/${buildings.length}`);
    }
    
    await new Promise(r => setTimeout(r, 150));
  }
  
  console.log(`\nBuildings: ${inserted} inserted, ${errors} errors`);
}

async function importEntities(properties) {
  console.log('\n=== Importing Owners/Tenants ===');
  
  // Get existing entities
  const { data: existing } = await supabase.from('entities').select('name');
  const existingNames = new Set((existing || []).map(e => e.name.toUpperCase().trim()));
  console.log('Existing entities: ' + existingNames.size);
  
  // Collect unique names
  const names = new Map();
  for (const prop of properties) {
    if (prop.ownerName && !existingNames.has(prop.ownerName.toUpperCase().trim())) {
      names.set(prop.ownerName.toUpperCase().trim(), prop.ownerName);
    }
    if (prop.tenant && prop.tenant !== prop.ownerName && 
        !existingNames.has(prop.tenant.toUpperCase().trim())) {
      names.set(prop.tenant.toUpperCase().trim(), prop.tenant);
    }
  }
  
  console.log('New entities to insert: ' + names.size);
  
  if (names.size === 0) {
    console.log('No new entities to import.');
    return;
  }
  
  const entities = Array.from(names.values()).map(name => {
    const upper = name.toUpperCase();
    let entityType = 'individual';
    if (upper.includes(' LLC') || upper.includes(' LP') || upper.includes(' INC') ||
        upper.includes(' CORP') || upper.includes(' PARTNERS') || upper.includes(' PROPERTIES') ||
        upper.includes(' REIT') || upper.includes(' TRUST') || upper.includes(' COMPANY') ||
        upper.includes(' CO.') || upper.includes(' LTD') || upper.includes(' L.P.')) {
      entityType = 'company';
    }
    return { name: name.substring(0, 200), entity_type: entityType, role: 'owner' };
  });
  
  // Batch insert
  const batches = chunk(entities, BATCH_SIZE);
  let inserted = 0;
  
  for (const batch of batches) {
    try {
      const { error } = await supabase.from('entities').insert(batch);
      if (!error) inserted += batch.length;
    } catch (err) {}
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\nEntities: ${inserted} inserted`);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  BuildingHawk - Clean Import (v2)                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // First clear any bad data from previous imports
  await clearBadData();

  const properties = await loadInventory();

  await importParcels(properties);
  await importBuildings(properties);
  await importEntities(properties);

  // Final counts
  console.log('\n=== Final Database Counts ===');
  const { count: p } = await supabase.from('parcels').select('*', { count: 'exact', head: true });
  const { count: b } = await supabase.from('buildings').select('*', { count: 'exact', head: true });
  const { count: e } = await supabase.from('entities').select('*', { count: 'exact', head: true });
  console.log(`Parcels: ${p}, Buildings: ${b}, Entities: ${e}`);

  console.log('\n✓ Import complete!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
