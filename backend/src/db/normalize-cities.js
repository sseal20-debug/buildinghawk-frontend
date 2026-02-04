/**
 * Normalize city names - fix case inconsistencies
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { query } from './connection.js';
import pool from './connection.js';

// Proper city name mappings (lowercase -> proper case)
const CITY_NAMES = {
  'anaheim': 'Anaheim',
  'orange': 'Orange',
  'fullerton': 'Fullerton',
  'brea': 'Brea',
  'placentia': 'Placentia',
  'la habra': 'La Habra',
  'yorba linda': 'Yorba Linda',
  'buena park': 'Buena Park',
  'corona': 'Corona',
  'irvine': 'Irvine',
  'santa ana': 'Santa Ana',
  'costa mesa': 'Costa Mesa',
  'huntington beach': 'Huntington Beach',
  'garden grove': 'Garden Grove',
  'tustin': 'Tustin',
  'lake forest': 'Lake Forest',
  'mission viejo': 'Mission Viejo',
  'laguna hills': 'Laguna Hills',
  'laguna niguel': 'Laguna Niguel',
  'san clemente': 'San Clemente',
  'dana point': 'Dana Point',
  'newport beach': 'Newport Beach',
  'fountain valley': 'Fountain Valley',
  'westminster': 'Westminster',
  'cypress': 'Cypress',
  'la palma': 'La Palma',
  'stanton': 'Stanton',
  'los alamitos': 'Los Alamitos',
  'seal beach': 'Seal Beach',
  'la mirada': 'La Mirada',
  'chino': 'Chino',
  'ontario': 'Ontario',
  'rancho cucamonga': 'Rancho Cucamonga',
  'riverside': 'Riverside',
  'san bernardino': 'San Bernardino',
  'fontana': 'Fontana',
  'redlands': 'Redlands',
  'pomona': 'Pomona',
  'upland': 'Upland',
  'claremont': 'Claremont',
  'azusa': 'Azusa',
  'covina': 'Covina',
  'west covina': 'West Covina',
  'la verne': 'La Verne',
  'diamond bar': 'Diamond Bar',
  'industry': 'Industry',
  'city of industry': 'City of Industry',
  'commerce': 'Commerce',
  'montebello': 'Montebello',
  'pico rivera': 'Pico Rivera',
  'whittier': 'Whittier',
  'norwalk': 'Norwalk',
  'cerritos': 'Cerritos',
  'lakewood': 'Lakewood',
  'long beach': 'Long Beach',
  'carson': 'Carson',
  'torrance': 'Torrance',
  'gardena': 'Gardena',
  'compton': 'Compton',
  'paramount': 'Paramount',
  'downey': 'Downey',
  'bellflower': 'Bellflower',
  'south gate': 'South Gate',
  'lynwood': 'Lynwood',
  'vernon': 'Vernon',
  'los angeles': 'Los Angeles',
};

async function normalizeCities() {
  console.log('Starting city name normalization...\n');

  // Get current city distribution
  const before = await query(`
    SELECT city, COUNT(*) as count
    FROM parcel
    WHERE city IS NOT NULL AND city != ''
    GROUP BY city
    ORDER BY count DESC
  `);

  console.log('BEFORE normalization:');
  console.log('Unique city values:', before.rows.length);

  // Find cities that need normalization
  const toNormalize = [];
  for (const row of before.rows) {
    const lower = row.city.toLowerCase().trim();
    const proper = CITY_NAMES[lower];
    if (proper && row.city !== proper) {
      toNormalize.push({ from: row.city, to: proper, count: row.count });
    }
  }

  console.log('\nCities to normalize:', toNormalize.length);
  toNormalize.forEach(n => {
    console.log(`  "${n.from}" -> "${n.to}" (${n.count} records)`);
  });

  // Perform normalization
  let totalUpdated = 0;
  for (const n of toNormalize) {
    const result = await query(`
      UPDATE parcel SET city = $1 WHERE city = $2
    `, [n.to, n.from]);
    totalUpdated += result.rowCount;
    console.log(`  Updated ${result.rowCount} parcels: ${n.from} -> ${n.to}`);
  }

  // Also normalize any ALL CAPS cities not in our map
  const capsResult = await query(`
    UPDATE parcel
    SET city = INITCAP(city)
    WHERE city = UPPER(city) AND LENGTH(city) > 2
  `);
  totalUpdated += capsResult.rowCount;
  console.log(`  Updated ${capsResult.rowCount} ALL CAPS cities to Title Case`);

  // Get after distribution
  const after = await query(`
    SELECT city, COUNT(*) as count
    FROM parcel
    WHERE city IS NOT NULL AND city != ''
    GROUP BY city
    ORDER BY count DESC
    LIMIT 20
  `);

  console.log('\nAFTER normalization:');
  console.log('Unique city values:', (await query('SELECT COUNT(DISTINCT city) FROM parcel WHERE city IS NOT NULL')).rows[0].count);
  console.log('\nTop 20 cities:');
  after.rows.forEach(r => {
    console.log(`  ${r.city}: ${r.count}`);
  });

  console.log(`\nTotal records updated: ${totalUpdated}`);

  await pool.end();
}

normalizeCities().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
