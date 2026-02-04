import { Router } from 'express';
import { query, toGeoJSON } from '../db/connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

// Load CRM property APNs for filtering
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');

let crmApns = new Set();
let crmCoordsWithoutApn = []; // Properties with lat/lng but no APN
let crmProperties = []; // Full CRM property list for classification

function loadCrmData() {
  try {
    const filePath = path.join(DATA_DIR, 'building_hawk_all.json');
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const properties = raw.properties || raw;

      crmApns.clear();
      crmCoordsWithoutApn = [];
      crmProperties = properties; // Store full list

      properties.forEach(p => {
        if (p.apn && p.apn.trim()) {
          crmApns.add(p.apn.trim());
        } else if (p.latitude && p.longitude) {
          // Store coords for properties without APNs for geographic matching
          crmCoordsWithoutApn.push({
            lat: p.latitude,
            lng: p.longitude,
            address: p.full_address || p.address
          });
        }
      });

      // Count buildings vs land based on sqft field
      const buildingCount = properties.filter(p => p.sqft && p.sqft > 0).length;
      const landCount = properties.filter(p => !p.sqft || p.sqft === null).length;
      console.log(`Loaded ${crmApns.size} CRM APNs: ${buildingCount} Buildings (sqft>0), ${landCount} Land (no sqft)`);
    }
  } catch (err) {
    console.error('Failed to load CRM data:', err);
  }
}

// Load CRM data on startup
loadCrmData();

// Build APN-indexed lookup for fast CRM merging
let crmByApn = {};
let crmByAddress = {};

function buildCrmLookup() {
  crmByApn = {};
  crmByAddress = {};
  crmProperties.forEach(p => {
    if (p.apn && p.apn.trim()) {
      crmByApn[p.apn.trim()] = p;
    }
    if (p.full_address) {
      crmByAddress[p.full_address.toLowerCase().trim()] = p;
    }
  });
  console.log(`CRM lookup: ${Object.keys(crmByApn).length} by APN, ${Object.keys(crmByAddress).length} by address`);
}

buildCrmLookup();

/**
 * Merge CRM data into parcel feature properties.
 * Match by APN first, then by address.
 */
function mergeCrmData(row) {
  const base = {
    apn: row.apn,
    address: row.situs_address,
    city: row.city,
    zip: row.zip,
    land_sf: row.land_sf,
    zoning: row.zoning,
    centroid: row.centroid,
    building_count: parseInt(row.building_count),
    unit_count: parseInt(row.unit_count),
    vacant_count: parseInt(row.vacant_count),
  };

  // Try matching CRM by APN
  let crm = crmByApn[row.apn];

  // Fallback: match by address
  if (!crm && row.situs_address) {
    crm = crmByAddress[row.situs_address.toLowerCase().trim()];
  }

  if (crm) {
    return {
      ...base,
      // CRM enrichment fields
      sqft: crm.sqft || null,
      building_sf: crm.sqft || null,
      acreage: crm.acreage || null,
      owner_name: crm.owner_name || crm.company || null,
      company: crm.company || null,
      contact_name: crm.contact_name || null,
      phone: crm.phone || null,
      land_use: crm.land_use || null,
      last_sale_price: crm.last_sale_price || null,
      last_sale_date: crm.last_sale_date || null,
      year_built: crm.year_built || null,
      source: crm.source || null,
      crm_id: crm.id || null,
      has_crm: true,
    };
  }

  return { ...base, has_crm: false };
}

// GET /api/parcels - Get parcels within map bounds (filtered to CRM properties only)
router.get('/', async (req, res, next) => {
  try {
    const { west, south, east, north, limit: limitParam = '5000', all = 'false' } = req.query;

    if (!west || !south || !east || !north) {
      return res.status(400).json({
        error: 'Missing bounds parameters (west, south, east, north)'
      });
    }

    // Parse all numeric parameters
    const boundsW = parseFloat(west);
    const boundsS = parseFloat(south);
    const boundsE = parseFloat(east);
    const boundsN = parseFloat(north);
    const limit = parseInt(limitParam, 10) || 500;

    const filterToCrm = all !== 'true' && (crmApns.size > 0 || crmCoordsWithoutApn.length > 0);

    if (!filterToCrm) {
      // Return all parcels in bounds (no CRM filtering)
      const result = await query(`
        SELECT
          p.apn,
          p.situs_address,
          p.city,
          p.zip,
          p.land_sf,
          p.zoning,
          ${toGeoJSON('p.geometry')} as geometry,
          ${toGeoJSON('p.centroid')} as centroid,
          COUNT(DISTINCT b.id) as building_count,
          COUNT(DISTINCT u.id) as unit_count,
          SUM(CASE WHEN u.unit_status = 'vacant' THEN 1 ELSE 0 END) as vacant_count
        FROM parcel p
        LEFT JOIN building b ON b.parcel_apn = p.apn
        LEFT JOIN unit u ON u.building_id = b.id
        WHERE p.geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        GROUP BY p.apn
        ORDER BY p.apn
        LIMIT $5::integer
      `, [boundsW, boundsS, boundsE, boundsN, limit]);

      return res.json({
        type: 'FeatureCollection',
        features: result.rows.map(row => ({
          type: 'Feature',
          id: row.apn,
          geometry: row.geometry,
          properties: mergeCrmData(row)
        }))
      });
    }

    // Filter CRM coordinates to those within current map bounds
    const coordsInBounds = crmCoordsWithoutApn.filter(c =>
      c.lng >= boundsW && c.lng <= boundsE &&
      c.lat >= boundsS && c.lat <= boundsN
    );

    // Build query that matches by APN OR by geographic containment
    let result;
    if (coordsInBounds.length > 0) {
      // Create point list for geographic matching
      // For geoResult query (no LIMIT, so params start at $5)
      const pointConditions = coordsInBounds.map((c, i) =>
        `ST_Contains(p.geometry, ST_SetSRID(ST_MakePoint($${5 + i * 2}, $${6 + i * 2}), 4326))`
      ).join(' OR ');

      const coordParams = coordsInBounds.flatMap(c => [c.lng, c.lat]);

      result = await query(`
        SELECT
          p.apn,
          p.situs_address,
          p.city,
          p.zip,
          p.land_sf,
          p.zoning,
          ${toGeoJSON('p.geometry')} as geometry,
          ${toGeoJSON('p.centroid')} as centroid,
          COUNT(DISTINCT b.id) as building_count,
          COUNT(DISTINCT u.id) as unit_count,
          SUM(CASE WHEN u.unit_status = 'vacant' THEN 1 ELSE 0 END) as vacant_count
        FROM parcel p
        LEFT JOIN building b ON b.parcel_apn = p.apn
        LEFT JOIN unit u ON u.building_id = b.id
        WHERE p.geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        GROUP BY p.apn
        ORDER BY p.apn
        LIMIT $5::integer
      `, [boundsW, boundsS, boundsE, boundsN, limit]);

      // Filter by APN match OR geographic containment
      const matchedApns = new Set();

      // First add all APN matches
      result.rows.forEach(row => {
        if (crmApns.has(row.apn)) {
          matchedApns.add(row.apn);
        }
      });

      // Now find parcels containing CRM coordinates (for properties without APNs)
      // We need to do this with a separate query for each coordinate group
      if (coordsInBounds.length > 0 && coordsInBounds.length <= 50) {
        // Batch query for geographic matching
        const geoResult = await query(`
          SELECT DISTINCT p.apn
          FROM parcel p
          WHERE p.geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326)
            AND (${pointConditions})
        `, [boundsW, boundsS, boundsE, boundsN, ...coordParams]);

        geoResult.rows.forEach(row => matchedApns.add(row.apn));
      }

      // Filter to matched APNs
      const filteredRows = result.rows.filter(row => matchedApns.has(row.apn));

      return res.json({
        type: 'FeatureCollection',
        features: filteredRows.map(row => ({
          type: 'Feature',
          id: row.apn,
          geometry: row.geometry,
          properties: mergeCrmData(row)
        }))
      });
    } else {
      // No coordinates in bounds, just filter by APN
      result = await query(`
        SELECT
          p.apn,
          p.situs_address,
          p.city,
          p.zip,
          p.land_sf,
          p.zoning,
          ${toGeoJSON('p.geometry')} as geometry,
          ${toGeoJSON('p.centroid')} as centroid,
          COUNT(DISTINCT b.id) as building_count,
          COUNT(DISTINCT u.id) as unit_count,
          SUM(CASE WHEN u.unit_status = 'vacant' THEN 1 ELSE 0 END) as vacant_count
        FROM parcel p
        LEFT JOIN building b ON b.parcel_apn = p.apn
        LEFT JOIN unit u ON u.building_id = b.id
        WHERE p.geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        GROUP BY p.apn
        ORDER BY p.apn
        LIMIT $5::integer
      `, [boundsW, boundsS, boundsE, boundsN, limit]);

      const filteredRows = result.rows.filter(row => crmApns.has(row.apn));

      return res.json({
        type: 'FeatureCollection',
        features: filteredRows.map(row => ({
          type: 'Feature',
          id: row.apn,
          geometry: row.geometry,
          properties: mergeCrmData(row)
        }))
      });
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/parcels/search - Unified search across parcels, tenants, owners, streets, and cities
router.get('/search', async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const searchTerm = q.trim();
    const isApnSearch = /^[\d-]+$/.test(searchTerm.replace(/\s/g, ''));

    // Run all searches in parallel
    const [parcelsResult, tenantsResult, ownersResult] = await Promise.all([
      // Parcel search (by APN or address)
      isApnSearch
        ? query(`
            SELECT
              apn,
              situs_address,
              city,
              zip,
              land_sf,
              ${toGeoJSON('centroid')} as centroid
            FROM parcel
            WHERE apn LIKE $1
            ORDER BY apn
            LIMIT $2
          `, [`${searchTerm.replace(/\s/g, '')}%`, limit])
        : query(`
            SELECT
              apn,
              situs_address,
              city,
              zip,
              land_sf,
              ${toGeoJSON('centroid')} as centroid
            FROM parcel
            WHERE to_tsvector('english', situs_address) @@ plainto_tsquery('english', $1)
               OR situs_address ILIKE $2
               OR city ILIKE $3
            ORDER BY
              CASE WHEN city ILIKE $3 THEN 0 ELSE 1 END,
              situs_address
            LIMIT $4
          `, [searchTerm, `%${searchTerm}%`, `${searchTerm}%`, limit]),

      // Tenant search (current occupants) - gracefully handle missing entity table
      query(`
        SELECT DISTINCT
          e.id AS entity_id,
          e.entity_name,
          u.street_address,
          p.city,
          p.apn,
          ${toGeoJSON('p.centroid')} as centroid,
          'tenant' AS match_type
        FROM entity e
        JOIN occupancy o ON o.entity_id = e.id AND o.is_current = true
        JOIN unit u ON o.unit_id = u.id
        JOIN building b ON u.building_id = b.id
        JOIN parcel p ON b.parcel_apn = p.apn
        WHERE to_tsvector('english', e.entity_name) @@ plainto_tsquery('english', $1)
           OR e.entity_name ILIKE $2
        ORDER BY e.entity_name
        LIMIT $3
      `, [searchTerm, `%${searchTerm}%`, limit])
        .catch(() => ({ rows: [] })),

      // Owner search (current owners) - gracefully handle missing entity table
      query(`
        SELECT DISTINCT
          e.id AS entity_id,
          e.entity_name,
          p.situs_address AS street_address,
          p.city,
          p.apn,
          ${toGeoJSON('p.centroid')} as centroid,
          'owner' AS match_type
        FROM entity e
        JOIN ownership ow ON ow.entity_id = e.id AND ow.is_current = true
        JOIN building b ON ow.building_id = b.id
        JOIN parcel p ON b.parcel_apn = p.apn
        WHERE to_tsvector('english', e.entity_name) @@ plainto_tsquery('english', $1)
           OR e.entity_name ILIKE $2
        ORDER BY e.entity_name
        LIMIT $3
      `, [searchTerm, `%${searchTerm}%`, limit])
        .catch(() => ({ rows: [] }))
    ]);

    // Transform parcel results
    const parcels = parcelsResult.rows.map(row => ({
      type: 'parcel',
      apn: row.apn,
      situs_address: row.situs_address,
      city: row.city,
      zip: row.zip,
      centroid: row.centroid
    }));

    // Transform tenant results
    const tenants = tenantsResult.rows.map(row => ({
      type: 'tenant',
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      street_address: row.street_address,
      city: row.city,
      apn: row.apn,
      centroid: row.centroid
    }));

    // Transform owner results
    const owners = ownersResult.rows.map(row => ({
      type: 'owner',
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      street_address: row.street_address,
      city: row.city,
      apn: row.apn,
      centroid: row.centroid
    }));

    res.json({
      parcels,
      tenants,
      owners,
      total: parcels.length + tenants.length + owners.length
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/parcels/properties - Get BUILDINGS from CRM data (sqft > 0)
router.get('/properties', async (req, res, next) => {
  try {
    const { limit = 10000 } = req.query;

    // Filter CRM properties where sqft > 0 (has building)
    const buildings = crmProperties
      .filter(p => p.sqft && p.sqft > 0 && p.latitude && p.longitude)
      .slice(0, parseInt(limit))
      .map(p => ({
        id: p.apn || `crm-${p.id}`,
        lat: p.latitude,
        lng: p.longitude,
        address: p.full_address || '',
        city: p.city || '',
        building_sf: p.sqft || 0,
        land_sf: p.acreage ? Math.round(p.acreage * 43560) : 0,
        is_land_only: false,
        building_count: 1
      }));

    res.json(buildings);
  } catch (err) {
    next(err);
  }
});

// GET /api/parcels/land - Get LAND from CRM data (sqft = null or 0)
router.get('/land', async (req, res, next) => {
  try {
    const { limit = 5000 } = req.query;

    // Filter CRM properties where sqft is null/0 (land only, no building)
    const landParcels = crmProperties
      .filter(p => (!p.sqft || p.sqft === null || p.sqft === 0) && p.latitude && p.longitude)
      .slice(0, parseInt(limit))
      .map(p => ({
        id: p.apn || `crm-${p.id}`,
        lat: p.latitude,
        lng: p.longitude,
        address: p.full_address || '',
        city: p.city || '',
        building_sf: 0,
        land_sf: p.acreage ? Math.round(p.acreage * 43560) : 0,
        is_land_only: true,
        building_count: 0
      }));

    res.json(landParcels);
  } catch (err) {
    next(err);
  }
});

// POST /api/parcels/classify-polygon - Classify parcels within a polygon as land or building
router.post('/classify-polygon', async (req, res, next) => {
  try {
    const { polygon, classification } = req.body;

    if (!polygon || !classification) {
      return res.status(400).json({
        error: 'Missing polygon or classification in request body'
      });
    }

    if (!['land', 'building'].includes(classification)) {
      return res.status(400).json({
        error: 'Classification must be "land" or "building"'
      });
    }

    // Convert GeoJSON polygon to PostGIS geometry
    const polygonGeoJSON = JSON.stringify(polygon);

    // Find all CRM properties within the polygon
    // We match by checking if the property's lat/lng falls within the polygon
    const matchedProperties = crmProperties.filter(p => {
      if (!p.latitude || !p.longitude) return false;

      // Point-in-polygon test using the coordinates
      const point = [p.longitude, p.latitude];
      return isPointInPolygon(point, polygon.coordinates[0]);
    });

    // Update the sqft field based on classification
    const newSqft = classification === 'building' ? 1 : null;

    matchedProperties.forEach(p => {
      // Find the property in the crmProperties array and update its sqft
      const idx = crmProperties.findIndex(cp => cp.id === p.id);
      if (idx !== -1) {
        if (classification === 'building' && (!crmProperties[idx].sqft || crmProperties[idx].sqft === 0)) {
          crmProperties[idx].sqft = 1; // Minimal sqft to mark as building
        } else if (classification === 'land') {
          crmProperties[idx].sqft = null; // Set to null to mark as land
        }
      }
    });

    // Note: This is an in-memory update. For persistence, you would need to:
    // 1. Write back to the JSON file, or
    // 2. Store classification overrides in the database

    const apns = matchedProperties
      .map(p => p.apn || `crm-${p.id}`)
      .filter(Boolean);

    console.log(`Classified ${matchedProperties.length} parcels as ${classification}`);

    res.json({
      count: matchedProperties.length,
      apns,
      classification
    });
  } catch (err) {
    next(err);
  }
});

// Helper function: Point in Polygon test (ray casting algorithm)
function isPointInPolygon(point, polygon) {
  const x = point[0];
  const y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

// GET /api/parcels/unclassified - Get all unclassified parcels
router.get('/unclassified', async (req, res, next) => {
  try {
    const { limit = 10000 } = req.query;

    // Filter CRM properties that have no classification and have coordinates
    const unclassified = crmProperties
      .filter(p =>
        (!p.classification || p.classification === null) &&
        p.latitude && p.longitude
      )
      .slice(0, parseInt(limit))
      .map(p => ({
        id: p.id,
        apn: p.apn || `crm-${p.id}`,
        lat: p.latitude,
        lng: p.longitude,
        address: p.full_address || '',
        city: p.city || '',
        sqft: p.sqft || null,
        acreage: p.acreage || null,
        owner_name: p.owner_name || '',
        land_use: p.land_use || ''
      }));

    res.json({
      count: unclassified.length,
      total: crmProperties.filter(p => !p.classification || p.classification === null).length,
      parcels: unclassified
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/parcels/classify - Classify multiple parcels
router.post('/classify', async (req, res, next) => {
  try {
    const { ids, classification } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'ids must be a non-empty array'
      });
    }

    if (!['building', 'land', 'deleted'].includes(classification)) {
      return res.status(400).json({
        error: 'Classification must be "building", "land", or "deleted"'
      });
    }

    let updatedCount = 0;
    const idSet = new Set(ids.map(id => String(id)));

    crmProperties.forEach(p => {
      const propId = String(p.id);
      const propApn = p.apn || `crm-${p.id}`;

      if (idSet.has(propId) || idSet.has(propApn)) {
        p.classification = classification;
        updatedCount++;
      }
    });

    // Persist to JSON file
    const filePath = path.join(DATA_DIR, 'building_hawk_all.json');
    fs.writeFileSync(filePath, JSON.stringify({ properties: crmProperties }, null, 2));

    console.log(`Classified ${updatedCount} parcels as ${classification}`);

    res.json({
      success: true,
      count: updatedCount,
      classification
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/parcels/classification-stats - Get classification statistics
router.get('/classification-stats', async (req, res, next) => {
  try {
    const stats = {
      total: crmProperties.length,
      unclassified: crmProperties.filter(p => !p.classification || p.classification === null).length,
      building: crmProperties.filter(p => p.classification === 'building').length,
      land: crmProperties.filter(p => p.classification === 'land').length,
      deleted: crmProperties.filter(p => p.classification === 'deleted').length,
      with_coordinates: crmProperties.filter(p => p.latitude && p.longitude).length,
      missing_coordinates: crmProperties.filter(p => !p.latitude || !p.longitude).length
    };

    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// GET /api/parcels/at-point - Get single parcel containing a specific lat/lng point
router.get('/at-point', async (req, res, next) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        error: 'Missing lat/lng parameters'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    const result = await query(`
      SELECT
        p.apn,
        p.situs_address,
        p.city,
        p.zip,
        p.land_sf,
        p.zoning,
        ${toGeoJSON('p.geometry')} as geometry,
        ${toGeoJSON('p.centroid')} as centroid,
        COUNT(DISTINCT b.id) as building_count,
        COUNT(DISTINCT u.id) as unit_count,
        SUM(CASE WHEN u.unit_status = 'vacant' THEN 1 ELSE 0 END) as vacant_count
      FROM parcel p
      LEFT JOIN building b ON b.parcel_apn = p.apn
      LEFT JOIN unit u ON u.building_id = b.id
      WHERE ST_Contains(p.geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      GROUP BY p.apn
      LIMIT 1
    `, [longitude, latitude]);

    if (result.rows.length === 0) {
      return res.json({
        type: 'FeatureCollection',
        features: []
      });
    }

    const row = result.rows[0];
    res.json({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: row.apn,
        geometry: row.geometry,
        properties: {
          apn: row.apn,
          address: row.situs_address,
          city: row.city,
          zip: row.zip,
          land_sf: row.land_sf,
          zoning: row.zoning,
          centroid: row.centroid,
          building_count: parseInt(row.building_count),
          unit_count: parseInt(row.unit_count),
          vacant_count: parseInt(row.vacant_count)
        }
      }]
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/parcels/units/in-bounds - Get parcel units within map bounds (for unit pins)
router.get('/units/in-bounds', async (req, res, next) => {
  try {
    const { west, south, east, north, limit: limitParam = '500' } = req.query;

    if (!west || !south || !east || !north) {
      return res.status(400).json({
        error: 'Missing bounds parameters (west, south, east, north)'
      });
    }

    const boundsW = parseFloat(west);
    const boundsS = parseFloat(south);
    const boundsE = parseFloat(east);
    const boundsN = parseFloat(north);
    const limit = parseInt(limitParam, 10) || 500;

    const result = await query(`
      SELECT
        pu.id,
        pu.parcel_apn,
        pu.unit_address,
        pu.unit_number,
        pu.latitude,
        pu.longitude,
        COALESCE(p.city, '') as city
      FROM parcel_unit pu
      LEFT JOIN parcel p ON p.apn = pu.parcel_apn
      WHERE pu.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      ORDER BY pu.parcel_apn, pu.unit_address
      LIMIT $5
    `, [boundsW, boundsS, boundsE, boundsN, limit]);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/parcels/units/:apn - Get all units for a specific parcel
router.get('/units/:apn', async (req, res, next) => {
  try {
    const { apn } = req.params;

    const result = await query(`
      SELECT
        pu.id,
        pu.parcel_apn,
        pu.unit_address,
        pu.unit_number,
        pu.latitude,
        pu.longitude
      FROM parcel_unit pu
      WHERE pu.parcel_apn = $1
      ORDER BY pu.unit_address
    `, [apn]);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/parcels/search-street - Get all parcels matching a street name (returns GeoJSON)
router.get('/search-street', async (req, res, next) => {
  try {
    const { street, limit = 200 } = req.query;

    if (!street || street.length < 2) {
      return res.status(400).json({ error: 'Street query must be at least 2 characters' });
    }

    const result = await query(`
      SELECT
        p.apn,
        p.situs_address,
        p.city,
        p.zip,
        p.land_sf,
        p.zoning,
        ${toGeoJSON('p.geometry')} as geometry,
        ${toGeoJSON('p.centroid')} as centroid,
        COUNT(DISTINCT b.id) as building_count,
        COUNT(DISTINCT u.id) as unit_count,
        SUM(CASE WHEN u.unit_status = 'vacant' THEN 1 ELSE 0 END) as vacant_count
      FROM parcel p
      LEFT JOIN building b ON b.parcel_apn = p.apn
      LEFT JOIN unit u ON u.building_id = b.id
      WHERE p.situs_address ILIKE $1
      GROUP BY p.apn
      ORDER BY p.situs_address
      LIMIT $2
    `, [`%${street.trim()}%`, parseInt(limit)]);

    res.json({
      type: 'FeatureCollection',
      features: result.rows.map(row => ({
        type: 'Feature',
        id: row.apn,
        geometry: row.geometry,
        properties: mergeCrmData(row)
      }))
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/parcels/:apn - Get single parcel with buildings and units
router.get('/:apn', async (req, res, next) => {
  try {
    const { apn } = req.params;

    // Get parcel
    const parcelResult = await query(`
      SELECT
        p.*,
        ${toGeoJSON('p.geometry')} as geometry,
        ${toGeoJSON('p.centroid')} as centroid
      FROM parcel p
      WHERE p.apn = $1
    `, [apn]);

    if (parcelResult.rows.length === 0) {
      return res.status(404).json({ error: 'Parcel not found' });
    }

    const parcel = parcelResult.rows[0];

    // Get buildings with units
    const buildingsResult = await query(`
      SELECT
        b.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', u.id,
              'unit_number', u.unit_number,
              'street_address', u.street_address,
              'unit_sf', u.unit_sf,
              'warehouse_sf', u.warehouse_sf,
              'office_sf', u.office_sf,
              'clear_height_ft', u.clear_height_ft,
              'dock_doors', u.dock_doors,
              'gl_doors', u.gl_doors,
              'power_amps', u.power_amps,
              'power_volts', u.power_volts,
              'fenced_yard', u.fenced_yard,
              'yard_sf', u.yard_sf,
              'unit_status', u.unit_status,
              'for_sale', u.for_sale,
              'for_lease', u.for_lease,
              'asking_sale_price', u.asking_sale_price,
              'asking_lease_rate', u.asking_lease_rate
            )
          ) FILTER (WHERE u.id IS NOT NULL),
          '[]'
        ) as units,
        vc.coverage_pct
      FROM building b
      LEFT JOIN unit u ON u.building_id = b.id
      LEFT JOIN v_building_coverage vc ON vc.building_id = b.id
      WHERE b.parcel_apn = $1
      GROUP BY b.id, vc.coverage_pct
      ORDER BY b.building_name
    `, [apn]);

    res.json({
      ...parcel,
      buildings: buildingsResult.rows
    });
  } catch (err) {
    next(err);
  }
});

// Update parcel fields by APN
router.patch('/:apn', async (req, res, next) => {
  try {
    const { apn } = req.params;
    const { land_sf, zoning, assessor_owner_name } = req.body;

    // Build SET clause dynamically from provided fields
    const updates = [];
    const values = [];
    let paramIdx = 1;

    if (land_sf !== undefined) {
      updates.push(`land_sf = $${paramIdx++}`);
      values.push(land_sf);
    }
    if (zoning !== undefined) {
      updates.push(`zoning = $${paramIdx++}`);
      values.push(zoning);
    }
    if (assessor_owner_name !== undefined) {
      updates.push(`assessor_owner_name = $${paramIdx++}`);
      values.push(assessor_owner_name);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(apn);

    const result = await query(
      `UPDATE parcel SET ${updates.join(', ')} WHERE apn = $${paramIdx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Parcel not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
