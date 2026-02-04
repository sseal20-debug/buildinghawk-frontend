/**
 * Master Data Import Script for Building Hawk
 *
 * This script imports data from multiple sources:
 * 1. Fresh GeoJSON from OC Open Data Portal (parcels with geometry)
 * 2. Local GeoJSON files (noc_buildings.geojson, oc_parcels.geojson)
 * 3. CoStar Excel exports (property data)
 * 4. Parcel CSV files (assessor data)
 * 5. Contacts CSV (CRM contacts)
 * 6. VCF contacts (Outlook/iPhone exported contacts)
 *
 * Run with: node import-all-data.js [--skip-download] [--only=<source>]
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { query } from './connection.js';
import pool from './connection.js';
import fs from 'fs';
import https from 'https';
import http from 'http';
import XLSX from 'xlsx';

// Data source paths
const DATA_PATHS = {
  grokBuildingHawk: 'C:/Users/User/AI_Projects/Grok/BuildingHawk',
  googleDrive: 'G:/My Drive/BUilding Hawk docs',
  downloads: 'C:/Users/User/Downloads',
  vcfContacts: 'C:/Users/User/Downloads/contacts_deduplicated.vcf',
};

// Orange County Open Data Portal endpoints
const OC_DATA_SOURCES = {
  parcels: 'https://data.ocgov.com/api/geospatial/5bts-5qs9?method=export&format=GeoJSON',
  // Alternative: ArcGIS REST endpoint for parcels
  parcelsArcGIS: 'https://services.arcgis.com/UXmFoWC7yDHcDN5Q/arcgis/rest/services/Assessor_Parcels/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson&resultRecordCount=1000',
};

// Import statistics
const stats = {
  parcels: { inserted: 0, updated: 0, skipped: 0, errors: 0 },
  buildings: { inserted: 0, updated: 0, skipped: 0, errors: 0 },
  entities: { inserted: 0, updated: 0, skipped: 0, errors: 0 },
  contacts: { inserted: 0, updated: 0, skipped: 0, errors: 0 },
  units: { inserted: 0, updated: 0, skipped: 0, errors: 0 },
};

// Logging
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = { info: '📌', success: '✅', error: '❌', warn: '⚠️', progress: '🔄' }[level] || '•';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

// Download file from URL
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    log(`Downloading from ${url}...`, 'progress');

    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let downloaded = 0;
      const totalSize = parseInt(response.headers['content-length'], 10) || 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalSize > 0) {
          const pct = ((downloaded / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r  Downloaded ${(downloaded / 1024 / 1024).toFixed(2)} MB (${pct}%)   `);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(''); // New line after progress
        log(`Downloaded to ${destPath}`, 'success');
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // Delete partial file
      reject(err);
    });
  });
}

// Parse CSV with proper handling of quoted fields
function parseCSV(content) {
  const lines = content.split('\n');
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = values[idx]?.trim() || '';
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line) {
  const values = [];
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
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values;
}

// Parse VCF (vCard) file
function parseVCF(content) {
  const contacts = [];
  const vcards = content.split('BEGIN:VCARD');

  for (const vcard of vcards) {
    if (!vcard.trim()) continue;

    const contact = {
      name: '',
      company: '',
      title: '',
      email: '',
      phone: '',
      mobile: '',
      address: '',
      city: '',
      state: '',
      zip: '',
    };

    const lines = vcard.split('\n').map(l => l.trim()).filter(l => l);

    for (const line of lines) {
      // Handle unfolded lines (lines starting with space or tab are continuations)
      if (line.startsWith('FN:')) {
        contact.name = line.substring(3).trim();
      } else if (line.startsWith('ORG:')) {
        contact.company = line.substring(4).split(';')[0].trim();
      } else if (line.startsWith('TITLE:')) {
        contact.title = line.substring(6).trim();
      } else if (line.includes('EMAIL')) {
        const emailMatch = line.match(/:(.*)/);
        if (emailMatch) contact.email = emailMatch[1].trim();
      } else if (line.includes('TEL') && line.includes('CELL')) {
        const phoneMatch = line.match(/:(.*)/);
        if (phoneMatch) contact.mobile = phoneMatch[1].trim();
      } else if (line.includes('TEL')) {
        const phoneMatch = line.match(/:(.*)/);
        if (phoneMatch && !contact.phone) contact.phone = phoneMatch[1].trim();
      } else if (line.includes('ADR')) {
        // VCF address format: ;;street;city;state;zip;country
        const adrMatch = line.match(/:(.*)/);
        if (adrMatch) {
          const parts = adrMatch[1].split(';');
          if (parts.length >= 6) {
            contact.address = parts[2]?.trim() || '';
            contact.city = parts[3]?.trim() || '';
            contact.state = parts[4]?.trim() || '';
            contact.zip = parts[5]?.trim() || '';
          }
        }
      }
    }

    if (contact.name || contact.company) {
      contacts.push(contact);
    }
  }

  return contacts;
}

// Normalize APN format
function normalizeAPN(apn) {
  if (!apn) return null;
  // Remove all non-alphanumeric characters and convert to string
  return String(apn).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// Normalize address
function normalizeAddress(address) {
  if (!address) return null;
  return address
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .trim();
}

// =============================================================================
// IMPORT FUNCTIONS
// =============================================================================

/**
 * Import parcels from GeoJSON file
 */
async function importParcelsGeoJSON(filePath) {
  log(`Importing parcels from ${filePath}...`, 'progress');

  const content = fs.readFileSync(filePath, 'utf8');
  const geojson = JSON.parse(content);

  if (!geojson.features || geojson.features.length === 0) {
    log('No features found in GeoJSON', 'warn');
    return;
  }

  log(`Found ${geojson.features.length} parcel features`, 'info');

  for (const feature of geojson.features) {
    try {
      const props = feature.properties || {};
      const apn = normalizeAPN(props.APN || props.apn || props._DMP_ID?.split('_')[1]);

      if (!apn) {
        stats.parcels.skipped++;
        continue;
      }

      // Build geometry WKT from GeoJSON
      let geometryWKT = null;
      if (feature.geometry && feature.geometry.coordinates) {
        if (feature.geometry.type === 'Polygon') {
          const coords = feature.geometry.coordinates[0]
            .map(c => `${c[0]} ${c[1]}`)
            .join(', ');
          geometryWKT = `POLYGON((${coords}))`;
        } else if (feature.geometry.type === 'MultiPolygon') {
          const polygons = feature.geometry.coordinates.map(poly => {
            const coords = poly[0].map(c => `${c[0]} ${c[1]}`).join(', ');
            return `((${coords}))`;
          }).join(', ');
          geometryWKT = `MULTIPOLYGON(${polygons})`;
        }
      }

      // Extract property values
      const situsAddress = props.PROP_ADDRESS || props.situs_address || props.Address;
      const city = props.PROP_CITY || props.city || props.CITY;
      const zip = props.PROP_ZIP || props.zip || props.ZIP;
      const ownerName = props.OWNER_NAME || props.owner_name;
      const landValue = parseFloat(props.LAND_VALUE || props.land_value) || null;
      const improvementValue = parseFloat(props.IMP_VALUE || props.improvement_value) || null;
      const landSF = parseInt(props.LAND_SF || props.land_sf || props.LOT_SIZE) || null;
      const zoning = props.ZONING || props.zoning;

      // Upsert parcel
      if (geometryWKT) {
        await query(`
          INSERT INTO parcel (apn, geometry, situs_address, city, zip, assessor_owner_name,
                             assessor_land_value, assessor_improvement_value, land_sf, zoning)
          VALUES ($1, ST_GeomFromText($2, 4326), $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (apn) DO UPDATE SET
            geometry = COALESCE(ST_GeomFromText($2, 4326), parcel.geometry),
            situs_address = COALESCE($3, parcel.situs_address),
            city = COALESCE($4, parcel.city),
            zip = COALESCE($5, parcel.zip),
            assessor_owner_name = COALESCE($6, parcel.assessor_owner_name),
            assessor_land_value = COALESCE($7, parcel.assessor_land_value),
            assessor_improvement_value = COALESCE($8, parcel.assessor_improvement_value),
            land_sf = COALESCE($9, parcel.land_sf),
            zoning = COALESCE($10, parcel.zoning),
            updated_at = NOW()
        `, [apn, geometryWKT, situsAddress, city, zip, ownerName, landValue, improvementValue, landSF, zoning]);

        stats.parcels.inserted++;
      } else {
        stats.parcels.skipped++;
      }

      // Progress update every 1000 records
      if ((stats.parcels.inserted + stats.parcels.skipped) % 1000 === 0) {
        process.stdout.write(`\r  Processed ${stats.parcels.inserted + stats.parcels.skipped} parcels...   `);
      }
    } catch (err) {
      stats.parcels.errors++;
      if (stats.parcels.errors <= 10) {
        log(`Error importing parcel: ${err.message}`, 'error');
      }
    }
  }

  console.log('');
  log(`Parcels imported: ${stats.parcels.inserted} inserted/updated, ${stats.parcels.skipped} skipped, ${stats.parcels.errors} errors`, 'success');
}

/**
 * Import buildings from GeoJSON (noc_buildings.geojson)
 */
async function importBuildingsGeoJSON(filePath) {
  log(`Importing buildings from ${filePath}...`, 'progress');

  const content = fs.readFileSync(filePath, 'utf8');
  const geojson = JSON.parse(content);

  if (!geojson.features || geojson.features.length === 0) {
    log('No features found in GeoJSON', 'warn');
    return;
  }

  log(`Found ${geojson.features.length} building features`, 'info');

  for (const feature of geojson.features) {
    try {
      const props = feature.properties || {};

      // Get address for matching to parcel
      const address = props.Address || props.PROP_ADDRESS;
      const city = props.PROP_CITY || '';
      const zip = props.PROP_ZIP || '';
      const buildingSF = parseInt(props.SQFT || props.building_sf) || null;
      const yearBuilt = parseInt(props.YEAR_BUILT || props.year_built) || null;
      const propertyName = props.Property_Name || props.property_name;
      const constructionType = props.Construction || props.construction_type;
      const stories = parseInt(props.STORIES || props.stories) || 1;
      const clearHeight = parseFloat(props.CLEAR_HEIGHT || props.clear_height) || null;
      const dockDoors = parseInt(props.DOCK_DOORS || props.dock_doors) || 0;
      const gradeDoors = parseInt(props.GRADE_DOORS || props.grade_doors) || 0;
      const apn = normalizeAPN(props.APN || props.apn);

      // First, try to find or create a parcel for this building
      let parcelApn = apn;

      if (!parcelApn && address) {
        // Try to find parcel by address match
        const parcelResult = await query(`
          SELECT apn FROM parcel
          WHERE UPPER(situs_address) LIKE $1
          LIMIT 1
        `, [`%${normalizeAddress(address)}%`]);

        if (parcelResult.rows.length > 0) {
          parcelApn = parcelResult.rows[0].apn;
        }
      }

      // If no parcel found, create a placeholder parcel
      if (!parcelApn) {
        // Generate a temporary APN based on address
        parcelApn = `TEMP_${Buffer.from(address || 'unknown').toString('base64').substring(0, 12)}`;

        // Create placeholder parcel (no geometry)
        await query(`
          INSERT INTO parcel (apn, geometry, situs_address, city, zip)
          VALUES ($1, ST_GeomFromText('POLYGON((-117.9 33.85, -117.89 33.85, -117.89 33.84, -117.9 33.84, -117.9 33.85))', 4326), $2, $3, $4)
          ON CONFLICT (apn) DO NOTHING
        `, [parcelApn, address, city, zip]);
      }

      // Insert building
      const buildingResult = await query(`
        INSERT INTO building (parcel_apn, building_name, building_sf, year_built, construction_type, office_stories)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [parcelApn, propertyName, buildingSF, yearBuilt, constructionType, Math.min(stories, 2)]);

      if (buildingResult.rows.length > 0) {
        stats.buildings.inserted++;

        // Create a unit for this building if it has SF
        if (buildingSF) {
          await query(`
            INSERT INTO unit (building_id, street_address, unit_sf, clear_height_ft, dock_doors, gl_doors)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
          `, [buildingResult.rows[0].id, address, buildingSF, clearHeight, dockDoors, gradeDoors]);

          stats.units.inserted++;
        }
      } else {
        stats.buildings.skipped++;
      }

    } catch (err) {
      stats.buildings.errors++;
      if (stats.buildings.errors <= 10) {
        log(`Error importing building: ${err.message}`, 'error');
      }
    }
  }

  log(`Buildings imported: ${stats.buildings.inserted} inserted, ${stats.buildings.skipped} skipped, ${stats.buildings.errors} errors`, 'success');
}

/**
 * Import contacts from CSV
 */
async function importContactsCSV(filePath) {
  log(`Importing contacts from ${filePath}...`, 'progress');

  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(content);

  log(`Found ${rows.length} contact records`, 'info');

  for (const row of rows) {
    try {
      // Extract fields - column names may vary
      const entityName = row['Company'] || row['company'] || row['Entity'] || row['entity_name'] || '';
      const contactName = row['Name'] || row['name'] || row['Contact'] || row['Full Name'] || '';
      const title = row['Title'] || row['title'] || row['Job Title'] || '';
      const email = row['Email'] || row['email'] || row['E-mail'] || '';
      const mobile = row['Mobile'] || row['mobile'] || row['Cell'] || row['Phone'] || '';
      const phone = row['Phone'] || row['phone'] || row['Work Phone'] || row['Office Phone'] || '';

      if (!contactName && !entityName) {
        stats.contacts.skipped++;
        continue;
      }

      // Create or find entity
      let entityId = null;
      if (entityName) {
        const entityResult = await query(`
          INSERT INTO entity (entity_name)
          VALUES ($1)
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [entityName]);

        if (entityResult.rows.length > 0) {
          entityId = entityResult.rows[0].id;
          stats.entities.inserted++;
        } else {
          // Entity exists, find it
          const existingEntity = await query(`
            SELECT id FROM entity WHERE entity_name = $1
          `, [entityName]);
          if (existingEntity.rows.length > 0) {
            entityId = existingEntity.rows[0].id;
          }
        }
      }

      // Create contact if we have an entity
      if (entityId && contactName) {
        await query(`
          INSERT INTO contact (entity_id, name, title, email, mobile, phone)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT DO NOTHING
        `, [entityId, contactName, title || null, email || null, mobile || null, phone || null]);

        stats.contacts.inserted++;
      }

      // Progress
      if ((stats.contacts.inserted + stats.contacts.skipped) % 500 === 0) {
        process.stdout.write(`\r  Processed ${stats.contacts.inserted + stats.contacts.skipped} contacts...   `);
      }

    } catch (err) {
      stats.contacts.errors++;
      if (stats.contacts.errors <= 10) {
        log(`Error importing contact: ${err.message}`, 'error');
      }
    }
  }

  console.log('');
  log(`Contacts imported: ${stats.contacts.inserted} inserted, ${stats.contacts.skipped} skipped, ${stats.contacts.errors} errors`, 'success');
}

/**
 * Import contacts from VCF (vCard) file
 */
async function importContactsVCF(filePath) {
  log(`Importing contacts from VCF: ${filePath}...`, 'progress');

  const content = fs.readFileSync(filePath, 'utf8');
  const contacts = parseVCF(content);

  log(`Found ${contacts.length} contacts in VCF`, 'info');

  let processed = 0;
  for (const contact of contacts) {
    try {
      const entityName = contact.company || contact.name;
      const contactName = contact.name;

      if (!entityName) {
        stats.contacts.skipped++;
        continue;
      }

      // Create or find entity
      let entityId = null;
      const entityResult = await query(`
        INSERT INTO entity (entity_name, notes)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [entityName, contact.address ? `Address: ${contact.address}, ${contact.city}, ${contact.state} ${contact.zip}` : null]);

      if (entityResult.rows.length > 0) {
        entityId = entityResult.rows[0].id;
        stats.entities.inserted++;
      } else {
        // Entity exists, find it
        const existingEntity = await query(`
          SELECT id FROM entity WHERE entity_name = $1 LIMIT 1
        `, [entityName]);
        if (existingEntity.rows.length > 0) {
          entityId = existingEntity.rows[0].id;
        }
      }

      // Create contact if we have an entity
      if (entityId && contactName) {
        await query(`
          INSERT INTO contact (entity_id, name, title, email, mobile, phone, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT DO NOTHING
        `, [
          entityId,
          contactName,
          contact.title || null,
          contact.email || null,
          contact.mobile || null,
          contact.phone || null,
          contact.address ? `${contact.address}, ${contact.city}, ${contact.state} ${contact.zip}` : null
        ]);

        stats.contacts.inserted++;
      }

      processed++;
      if (processed % 200 === 0) {
        process.stdout.write(`\r  Processed ${processed} VCF contacts...   `);
      }

    } catch (err) {
      stats.contacts.errors++;
      if (stats.contacts.errors <= 10) {
        log(`Error importing VCF contact: ${err.message}`, 'error');
      }
    }
  }

  console.log('');
  log(`VCF contacts imported: ${processed} processed`, 'success');
}

/**
 * Import parcels from CSV files
 */
async function importParcelsCSV(filePath) {
  log(`Importing parcels from CSV: ${filePath}...`, 'progress');

  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(content);

  log(`Found ${rows.length} parcel records`, 'info');

  let processed = 0;
  for (const row of rows) {
    try {
      // Extract APN - try various column names
      const apn = normalizeAPN(
        row['APN'] || row['apn'] || row['Parcel Number'] || row['ParcelNumber'] ||
        row['Assessor Parcel Number'] || row['ASMT_APNID'] || ''
      );

      if (!apn) {
        stats.parcels.skipped++;
        continue;
      }

      const situsAddress = row['Situs Address'] || row['SITUS_ADDRESS'] || row['Address'] || row['Property Address'] || '';
      const city = row['City'] || row['CITY'] || row['Situs City'] || '';
      const zip = row['Zip'] || row['ZIP'] || row['Situs Zip'] || '';
      const ownerName = row['Owner'] || row['OWNER'] || row['Owner Name'] || '';
      const landValue = parseFloat(row['Land Value'] || row['LAND_VALUE'] || row['Assessed Land']) || null;
      const improvementValue = parseFloat(row['Improvement Value'] || row['IMP_VALUE'] || row['Assessed Improvement']) || null;
      const landSF = parseInt(row['Lot Size'] || row['LOT_SIZE'] || row['Land SF'] || row['Acres']?.replace(/[^0-9.]/g, '') * 43560) || null;
      const zoning = row['Zoning'] || row['ZONING'] || '';

      // Upsert parcel (without geometry - will need geocoding)
      await query(`
        INSERT INTO parcel (apn, geometry, situs_address, city, zip, assessor_owner_name,
                           assessor_land_value, assessor_improvement_value, land_sf, zoning)
        VALUES ($1, ST_GeomFromText('POLYGON((-117.9 33.85, -117.89 33.85, -117.89 33.84, -117.9 33.84, -117.9 33.85))', 4326),
                $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (apn) DO UPDATE SET
          situs_address = COALESCE(NULLIF($2, ''), parcel.situs_address),
          city = COALESCE(NULLIF($3, ''), parcel.city),
          zip = COALESCE(NULLIF($4, ''), parcel.zip),
          assessor_owner_name = COALESCE(NULLIF($5, ''), parcel.assessor_owner_name),
          assessor_land_value = COALESCE($6, parcel.assessor_land_value),
          assessor_improvement_value = COALESCE($7, parcel.assessor_improvement_value),
          land_sf = COALESCE($8, parcel.land_sf),
          zoning = COALESCE(NULLIF($9, ''), parcel.zoning),
          updated_at = NOW()
      `, [apn, situsAddress, city, zip, ownerName, landValue, improvementValue, landSF, zoning]);

      stats.parcels.inserted++;
      processed++;

      if (processed % 500 === 0) {
        process.stdout.write(`\r  Processed ${processed} parcels...   `);
      }

    } catch (err) {
      stats.parcels.errors++;
      if (stats.parcels.errors <= 10) {
        log(`Error importing parcel from CSV: ${err.message}`, 'error');
      }
    }
  }

  console.log('');
  log(`CSV parcels imported: ${processed} processed`, 'success');
}

/**
 * Import CoStar property data from Excel/CSV
 */
async function importCoStarData(filePath) {
  log(`Importing CoStar data from ${filePath}...`, 'progress');

  let rows = [];

  // Handle Excel files using xlsx package
  if (filePath.endsWith('.xlsx') || filePath.endsWith('.xls')) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet);
      log(`Parsed Excel file: ${rows.length} rows from sheet "${sheetName}"`, 'info');
    } catch (err) {
      log(`Error reading Excel file: ${err.message}`, 'error');
      return;
    }
  } else {
    // CSV file
    const content = fs.readFileSync(filePath, 'utf8');
    rows = parseCSV(content);
    log(`Found ${rows.length} CoStar records`, 'info');
  }

  for (const row of rows) {
    try {
      // CoStar typically has these fields
      const address = row['Property Address'] || row['Address'] || '';
      const city = row['City'] || row['Market'] || '';
      const zip = row['Zip'] || row['Postal Code'] || '';
      const buildingSF = parseInt(row['Building SF'] || row['RBA'] || row['Rentable Building Area'] || 0);
      const yearBuilt = parseInt(row['Year Built'] || row['Year Renovated'] || 0) || null;
      const propertyType = row['Property Type'] || row['Building Type'] || '';
      const stories = parseInt(row['Stories'] || row['Number Of Stories'] || 1);
      const lotSize = parseFloat(row['Land Area'] || row['Lot Size (Acres)'] || 0);
      const clearHeight = parseFloat(row['Clear Height'] || row['Ceiling Height'] || 0) || null;
      const dockDoors = parseInt(row['Dock Doors'] || row['Dock High Doors'] || 0);
      const gradeDoors = parseInt(row['Grade Level Doors'] || row['Drive In Doors'] || 0);

      if (!address) {
        stats.buildings.skipped++;
        continue;
      }

      // Create a placeholder APN
      const tempApn = `COSTAR_${Buffer.from(address).toString('base64').substring(0, 12)}`;

      // Create parcel
      await query(`
        INSERT INTO parcel (apn, geometry, situs_address, city, zip, land_sf)
        VALUES ($1, ST_GeomFromText('POLYGON((-117.9 33.85, -117.89 33.85, -117.89 33.84, -117.9 33.84, -117.9 33.85))', 4326),
                $2, $3, $4, $5)
        ON CONFLICT (apn) DO UPDATE SET
          situs_address = COALESCE($2, parcel.situs_address),
          city = COALESCE($3, parcel.city),
          zip = COALESCE($4, parcel.zip),
          land_sf = COALESCE($5, parcel.land_sf),
          updated_at = NOW()
      `, [tempApn, address, city, zip, lotSize ? Math.round(lotSize * 43560) : null]);

      // Create building
      const buildingResult = await query(`
        INSERT INTO building (parcel_apn, building_sf, year_built, construction_type, office_stories)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [tempApn, buildingSF || null, yearBuilt, propertyType || null, Math.min(stories, 2)]);

      if (buildingResult.rows.length > 0 && buildingSF) {
        // Create unit
        await query(`
          INSERT INTO unit (building_id, street_address, unit_sf, clear_height_ft, dock_doors, gl_doors)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [buildingResult.rows[0].id, address, buildingSF, clearHeight, dockDoors, gradeDoors]);

        stats.buildings.inserted++;
        stats.units.inserted++;
      }

    } catch (err) {
      stats.buildings.errors++;
      if (stats.buildings.errors <= 10) {
        log(`Error importing CoStar record: ${err.message}`, 'error');
      }
    }
  }

  log(`CoStar data imported: ${stats.buildings.inserted} buildings created`, 'success');
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const skipDownload = args.includes('--skip-download');
  const onlySource = args.find(a => a.startsWith('--only='))?.split('=')[1];

  log('========================================', 'info');
  log('Building Hawk - Master Data Import', 'info');
  log('========================================', 'info');

  try {
    // Test database connection
    const testResult = await query('SELECT NOW()');
    log(`Database connected at ${testResult.rows[0].now}`, 'success');

    // 1. Download fresh OC parcel data (if not skipping)
    if (!skipDownload && (!onlySource || onlySource === 'download')) {
      log('\n--- Step 1: Download Fresh OC Parcel Data ---', 'info');
      try {
        const downloadPath = path.join(DATA_PATHS.downloads, 'oc_parcels_fresh.geojson');
        // Note: OC Open Data Portal may require different endpoint
        // For now, we'll skip the actual download and use local files
        log('Skipping download - will use local GeoJSON files', 'warn');
      } catch (err) {
        log(`Download failed: ${err.message}. Continuing with local files.`, 'warn');
      }
    }

    // 2. Import local GeoJSON parcels
    if (!onlySource || onlySource === 'geojson') {
      log('\n--- Step 2: Import Local GeoJSON Files ---', 'info');

      const ocParcelsPath = path.join(DATA_PATHS.grokBuildingHawk, 'oc_parcels.geojson');
      if (fs.existsSync(ocParcelsPath)) {
        await importParcelsGeoJSON(ocParcelsPath);
      } else {
        log(`File not found: ${ocParcelsPath}`, 'warn');
      }

      const nocBuildingsPath = path.join(DATA_PATHS.grokBuildingHawk, 'noc_buildings.geojson');
      if (fs.existsSync(nocBuildingsPath)) {
        await importBuildingsGeoJSON(nocBuildingsPath);
      } else {
        log(`File not found: ${nocBuildingsPath}`, 'warn');
      }
    }

    // 3. Import Parcel CSVs
    if (!onlySource || onlySource === 'parcels') {
      log('\n--- Step 3: Import Parcel CSV Files ---', 'info');

      const parcelFiles = [
        'Parcels.csv',
        'Parcels (1).csv',
        'Parcels (2).csv',
        'Parcels (3).csv',
      ];

      for (const file of parcelFiles) {
        const filePath = path.join(DATA_PATHS.grokBuildingHawk, file);
        if (fs.existsSync(filePath)) {
          await importParcelsCSV(filePath);
        }
      }
    }

    // 4. Import Contacts
    if (!onlySource || onlySource === 'contacts') {
      log('\n--- Step 4: Import Contacts CSV ---', 'info');

      const contactsPath = path.join(DATA_PATHS.grokBuildingHawk, 'contacts.csv');
      if (fs.existsSync(contactsPath)) {
        await importContactsCSV(contactsPath);
      } else {
        log(`File not found: ${contactsPath}`, 'warn');
      }
    }

    // 4b. Import VCF contacts (Outlook/iPhone)
    if (!onlySource || onlySource === 'contacts' || onlySource === 'vcf') {
      log('\n--- Step 4b: Import VCF Contacts (Outlook/iPhone) ---', 'info');

      if (fs.existsSync(DATA_PATHS.vcfContacts)) {
        await importContactsVCF(DATA_PATHS.vcfContacts);
      } else {
        log(`VCF file not found: ${DATA_PATHS.vcfContacts}`, 'warn');
      }

      // Also check for additional VCF files
      const vcfFiles = fs.readdirSync(DATA_PATHS.downloads)
        .filter(f => f.endsWith('.vcf') && f !== 'contacts_deduplicated.vcf');

      for (const vcfFile of vcfFiles) {
        const vcfPath = path.join(DATA_PATHS.downloads, vcfFile);
        await importContactsVCF(vcfPath);
      }
    }

    // 5. Import CoStar data
    if (!onlySource || onlySource === 'costar') {
      log('\n--- Step 5: Import CoStar Data ---', 'info');

      // Import CoStar Excel files
      const costarFiles = fs.readdirSync(DATA_PATHS.grokBuildingHawk)
        .filter(f => f.startsWith('CostarExport') || f.includes('INVENTORY'));

      log(`Found ${costarFiles.length} CoStar/Inventory files: ${costarFiles.join(', ')}`, 'info');

      for (const costarFile of costarFiles) {
        const costarPath = path.join(DATA_PATHS.grokBuildingHawk, costarFile);
        await importCoStarData(costarPath);
      }

      // Also import any Search Results CSV files
      const searchResultFiles = fs.readdirSync(DATA_PATHS.grokBuildingHawk)
        .filter(f => f.startsWith('Search Results') && f.endsWith('.csv'));

      for (const srFile of searchResultFiles) {
        const srPath = path.join(DATA_PATHS.grokBuildingHawk, srFile);
        await importCoStarData(srPath);
      }
    }

    // Print summary
    log('\n========================================', 'info');
    log('IMPORT SUMMARY', 'success');
    log('========================================', 'info');
    log(`Parcels:   ${stats.parcels.inserted} inserted/updated, ${stats.parcels.skipped} skipped, ${stats.parcels.errors} errors`);
    log(`Buildings: ${stats.buildings.inserted} inserted, ${stats.buildings.skipped} skipped, ${stats.buildings.errors} errors`);
    log(`Units:     ${stats.units.inserted} inserted`);
    log(`Entities:  ${stats.entities.inserted} inserted`);
    log(`Contacts:  ${stats.contacts.inserted} inserted, ${stats.contacts.skipped} skipped, ${stats.contacts.errors} errors`);

    // Get final counts
    const counts = await query(`
      SELECT
        (SELECT COUNT(*) FROM parcel) as parcels,
        (SELECT COUNT(*) FROM building) as buildings,
        (SELECT COUNT(*) FROM unit) as units,
        (SELECT COUNT(*) FROM entity) as entities,
        (SELECT COUNT(*) FROM contact) as contacts
    `);

    log('\nFinal Database Counts:', 'success');
    log(`  Parcels:   ${counts.rows[0].parcels}`);
    log(`  Buildings: ${counts.rows[0].buildings}`);
    log(`  Units:     ${counts.rows[0].units}`);
    log(`  Entities:  ${counts.rows[0].entities}`);
    log(`  Contacts:  ${counts.rows[0].contacts}`);

  } catch (err) {
    log(`Fatal error: ${err.message}`, 'error');
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
