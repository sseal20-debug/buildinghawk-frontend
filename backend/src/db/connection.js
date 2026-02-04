import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root (handles being called from any directory)
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper for single queries
export const query = (text, params) => pool.query(text, params);

// Helper for transactions
export const getClient = () => pool.connect();

// GeoJSON helper - converts PostGIS geometry to GeoJSON
export const toGeoJSON = (geometryColumn) =>
  `ST_AsGeoJSON(${geometryColumn})::json`;

// Bounds helper - creates ST_MakeEnvelope from map bounds
export const boundsToEnvelope = (west, south, east, north, srid = 4326) =>
  `ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, ${srid})`;

export default pool;
