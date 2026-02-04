/**
 * Import Excel (CoStar) files
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { query } from './connection.js';
import pool from './connection.js';

const DATA_PATH = 'C:/Users/User/AI_Projects/Grok/BuildingHawk';

const excelFiles = [
  'CostarExport.xlsx',
  'CostarExport (1).xlsx',
  'CostarExport (2).xlsx',
  'CostarExport (3).xlsx',
  'INVENTORY 30-40k SF.xlsx'
];

async function importExcelFiles() {
  console.log('Starting Excel file import...');
  let totalImported = 0;

  for (const fileName of excelFiles) {
    const filePath = path.join(DATA_PATH, fileName);
    if (!fs.existsSync(filePath)) {
      console.log('File not found:', fileName);
      continue;
    }

    try {
      console.log('\nReading:', fileName);
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet);
      console.log('Found', rows.length, 'rows');

      // Show headers
      if (rows.length > 0) {
        console.log('Columns:', Object.keys(rows[0]).slice(0, 8).join(', '));
      }

      let imported = 0;
      for (const row of rows) {
        // CoStar field names vary - try multiple options
        const address = row['Property Address'] || row['Address'] || row['Prop Address'] || row['Building Address'];
        const city = row['City'] || row['Property City'];
        const sqft = row['RBA'] || row['Building Size'] || row['SF'] || row['Sq Ft'] || row['Building SF'];
        const yearBuilt = row['Year Built'] || row['YearBuilt'];
        const owner = row['Owner Name'] || row['Owner'] || row['True Owner'];
        const zip = row['Zip'] || row['Zip Code'];

        if (address && city) {
          const situs = `${address}, ${city}, CA`;

          try {
            // First ensure parcel exists (create placeholder with empty geometry)
            // APN must be <= 20 chars, use hash of address
            const hash = Buffer.from(situs).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);
            const apn = `CS${hash}`;

            // Create parcel with a small placeholder polygon (will be geocoded later)
            // Use ST_Buffer to create a tiny polygon around a point
            await query(`
              INSERT INTO parcel (apn, situs_address, city, zip, geometry)
              VALUES ($1, $2, $3, $4,
                ST_SetSRID(ST_Buffer(ST_MakePoint(-117.8, 33.7)::geography, 10)::geometry, 4326)
              )
              ON CONFLICT (apn) DO NOTHING
            `, [apn, situs, city, zip]);

            // Then create building
            await query(`
              INSERT INTO building (parcel_apn, building_sf, year_built)
              VALUES ($1, $2, $3)
              ON CONFLICT DO NOTHING
            `, [apn,
                sqft ? parseInt(String(sqft).replace(/,/g, '')) : null,
                yearBuilt ? parseInt(yearBuilt) : null
            ]);

            // Create owner entity if provided
            if (owner) {
              await query(`
                INSERT INTO entity (entity_name, entity_type)
                VALUES ($1, 'company')
                ON CONFLICT DO NOTHING
              `, [owner]);
            }

            imported++;
          } catch (e) {
            if (!e.message.includes('duplicate') && !e.message.includes('violates')) {
              console.error('Error importing row:', e.message.substring(0, 100));
            }
          }
        }
      }
      console.log('Imported', imported, 'buildings from', fileName);
      totalImported += imported;
    } catch (err) {
      console.error('Error with', fileName + ':', err.message);
    }
  }

  // Get final counts
  console.log('\n=== Final Database Counts ===');
  const parcels = await query('SELECT COUNT(*) as count FROM parcel');
  const buildings = await query('SELECT COUNT(*) as count FROM building');
  const entities = await query('SELECT COUNT(*) as count FROM entity');

  console.log('Parcels:', parcels.rows[0].count);
  console.log('Buildings:', buildings.rows[0].count);
  console.log('Entities:', entities.rows[0].count);
  console.log('Total imported from Excel:', totalImported);

  await pool.end();
}

importExcelFiles().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
