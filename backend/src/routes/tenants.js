import { Router } from 'express';
import { query } from '../db/connection.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

// Load SIC codes once at startup
let sicCodes = [];
try {
  const sicPath = join(__dirname, '../../data/sic_codes.json');
  sicCodes = JSON.parse(readFileSync(sicPath, 'utf-8'));
  console.log(`Loaded ${sicCodes.length} SIC codes`);
} catch (err) {
  console.warn('SIC codes file not found, autocomplete will be empty');
}

// GET /api/tenants/sic-codes - Static SIC code list for autocomplete
router.get('/sic-codes', (req, res) => {
  const { q } = req.query;
  if (q && q.length >= 1) {
    const lower = q.toLowerCase();
    const filtered = sicCodes.filter(s =>
      s.code.startsWith(lower) ||
      s.description.toLowerCase().includes(lower)
    ).slice(0, 50);
    return res.json(filtered);
  }
  res.json(sicCodes);
});

// GET /api/tenants/stats - Summary counts
router.get('/stats', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(DISTINCT e.id) AS total_tenants,
        COALESCE(SUM(u.unit_sf), 0) AS total_occupied_sf,
        json_agg(DISTINCT jsonb_build_object('city', p.city, 'count', 1)) AS cities_raw
      FROM occupancy o
      JOIN entity e ON o.entity_id = e.id
      JOIN unit u ON o.unit_id = u.id
      JOIN building b ON u.building_id = b.id
      JOIN parcel p ON b.parcel_apn = p.apn
      WHERE o.is_current = true
        AND o.occupant_type = 'tenant'
    `);

    // Get city breakdown separately for accurate counts
    const citiesResult = await query(`
      SELECT p.city, COUNT(DISTINCT e.id) AS count
      FROM occupancy o
      JOIN entity e ON o.entity_id = e.id
      JOIN unit u ON o.unit_id = u.id
      JOIN building b ON u.building_id = b.id
      JOIN parcel p ON b.parcel_apn = p.apn
      WHERE o.is_current = true
        AND o.occupant_type = 'tenant'
        AND p.city IS NOT NULL
      GROUP BY p.city
      ORDER BY count DESC
    `);

    res.json({
      total_tenants: parseInt(result.rows[0]?.total_tenants || 0),
      total_occupied_sf: parseInt(result.rows[0]?.total_occupied_sf || 0),
      cities: citiesResult.rows
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/search - Multi-table tenant search with filters
router.get('/search', async (req, res, next) => {
  try {
    const {
      q,              // Business name search
      firstName,      // Contact first name
      lastName,       // Contact last name
      address,        // Address search
      city,           // City filter
      sicCode,        // SIC code exact or prefix
      industrySector, // Industry text search
      minSf, maxSf,   // SF occupied range
      minLotAcres, maxLotAcres, // Lot size range
      minClearance, maxClearance, // Clear height range
      minPower, maxPower,         // Power amps range
      minOfficeSf, maxOfficeSf,   // Office SF range
      minOfficePct, maxOfficePct, // Office % range
      minYearBuilt, maxYearBuilt, // Year built range
      propertyType,               // Property type filter
      minEmployees, maxEmployees, // Employee count range
      headquarters,   // Headquarters only
      multiLocation,  // Multiple locations only
      currentOnly = 'true', // Current occupancy only (default true)
      limit = '50',
      offset = '0'
    } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Always filter for tenants (not owner-users or investors)
    conditions.push(`o.occupant_type = 'tenant'`);

    // Current only
    if (currentOnly === 'true') {
      conditions.push(`o.is_current = true`);
    }

    // Business name search
    if (q && q.length >= 2) {
      conditions.push(`(
        to_tsvector('english', e.entity_name) @@ plainto_tsquery('english', $${paramIndex})
        OR e.entity_name ILIKE $${paramIndex + 1}
      )`);
      params.push(q, `%${q}%`);
      paramIndex += 2;
    }

    // Contact name search
    if (firstName && firstName.length >= 2) {
      conditions.push(`c.name ILIKE $${paramIndex}`);
      params.push(`${firstName}%`);
      paramIndex++;
    }
    if (lastName && lastName.length >= 2) {
      conditions.push(`c.name ILIKE $${paramIndex}`);
      params.push(`%${lastName}%`);
      paramIndex++;
    }

    // Address search
    if (address && address.length >= 2) {
      conditions.push(`(
        u.street_address ILIKE $${paramIndex}
        OR p.situs_address ILIKE $${paramIndex}
      )`);
      params.push(`%${address}%`);
      paramIndex++;
    }

    // City filter
    if (city) {
      conditions.push(`p.city ILIKE $${paramIndex}`);
      params.push(`%${city}%`);
      paramIndex++;
    }

    // SIC code
    if (sicCode) {
      conditions.push(`e.sic_code LIKE $${paramIndex}`);
      params.push(`${sicCode}%`);
      paramIndex++;
    }

    // Industry sector text search
    if (industrySector) {
      conditions.push(`e.industry_sector ILIKE $${paramIndex}`);
      params.push(`%${industrySector}%`);
      paramIndex++;
    }

    // SF range
    if (minSf) {
      conditions.push(`u.unit_sf >= $${paramIndex}`);
      params.push(parseInt(minSf));
      paramIndex++;
    }
    if (maxSf) {
      conditions.push(`u.unit_sf <= $${paramIndex}`);
      params.push(parseInt(maxSf));
      paramIndex++;
    }

    // Lot size (acres) - convert from acres to SF (1 acre = 43560 SF)
    if (minLotAcres) {
      conditions.push(`p.land_sf >= $${paramIndex}`);
      params.push(Math.round(parseFloat(minLotAcres) * 43560));
      paramIndex++;
    }
    if (maxLotAcres) {
      conditions.push(`p.land_sf <= $${paramIndex}`);
      params.push(Math.round(parseFloat(maxLotAcres) * 43560));
      paramIndex++;
    }

    // Clear height range
    if (minClearance) {
      conditions.push(`u.clear_height_ft >= $${paramIndex}`);
      params.push(parseFloat(minClearance));
      paramIndex++;
    }
    if (maxClearance) {
      conditions.push(`u.clear_height_ft <= $${paramIndex}`);
      params.push(parseFloat(maxClearance));
      paramIndex++;
    }

    // Power range
    if (minPower) {
      conditions.push(`u.power_amps >= $${paramIndex}`);
      params.push(parseInt(minPower));
      paramIndex++;
    }
    if (maxPower) {
      conditions.push(`u.power_amps <= $${paramIndex}`);
      params.push(parseInt(maxPower));
      paramIndex++;
    }

    // Office SF range
    if (minOfficeSf) {
      conditions.push(`u.office_sf >= $${paramIndex}`);
      params.push(parseInt(minOfficeSf));
      paramIndex++;
    }
    if (maxOfficeSf) {
      conditions.push(`u.office_sf <= $${paramIndex}`);
      params.push(parseInt(maxOfficeSf));
      paramIndex++;
    }

    // Office % range (calculated)
    if (minOfficePct) {
      conditions.push(`CASE WHEN u.unit_sf > 0 THEN (COALESCE(u.office_sf,0)::decimal / u.unit_sf * 100) ELSE 0 END >= $${paramIndex}`);
      params.push(parseFloat(minOfficePct));
      paramIndex++;
    }
    if (maxOfficePct) {
      conditions.push(`CASE WHEN u.unit_sf > 0 THEN (COALESCE(u.office_sf,0)::decimal / u.unit_sf * 100) ELSE 0 END <= $${paramIndex}`);
      params.push(parseFloat(maxOfficePct));
      paramIndex++;
    }

    // Year built range
    if (minYearBuilt) {
      conditions.push(`b.year_built >= $${paramIndex}`);
      params.push(parseInt(minYearBuilt));
      paramIndex++;
    }
    if (maxYearBuilt) {
      conditions.push(`b.year_built <= $${paramIndex}`);
      params.push(parseInt(maxYearBuilt));
      paramIndex++;
    }

    // Employee count range
    if (minEmployees) {
      conditions.push(`e.employee_count >= $${paramIndex}`);
      params.push(parseInt(minEmployees));
      paramIndex++;
    }
    if (maxEmployees) {
      conditions.push(`e.employee_count <= $${paramIndex}`);
      params.push(parseInt(maxEmployees));
      paramIndex++;
    }

    // Headquarters
    if (headquarters === 'true') {
      conditions.push(`e.headquarters = true`);
    }

    // Multi-location
    if (multiLocation === 'true') {
      conditions.push(`e.multi_location = true`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countResult = await query(`
      SELECT COUNT(DISTINCT e.id) AS total
      FROM occupancy o
      JOIN entity e ON o.entity_id = e.id
      JOIN unit u ON o.unit_id = u.id
      JOIN building b ON u.building_id = b.id
      JOIN parcel p ON b.parcel_apn = p.apn
      LEFT JOIN contact c ON c.entity_id = e.id AND c.is_primary = true
      ${whereClause}
    `, params);

    // Paginated results
    const limitVal = Math.min(parseInt(limit) || 50, 200);
    const offsetVal = parseInt(offset) || 0;

    const result = await query(`
      SELECT
        e.id AS entity_id,
        e.entity_name,
        e.entity_type,
        e.sic_code,
        e.sic_description,
        e.industry_sector,
        e.employee_count,
        e.employee_range,
        e.headquarters,
        e.multi_location,
        e.linkedin_url,
        e.website,
        e.data_source,
        e.notes AS entity_notes,
        o.id AS occupancy_id,
        o.occupant_type,
        o.lease_start,
        o.lease_expiration,
        o.rent_psf_month,
        o.rent_total_month,
        o.lease_type,
        o.market_status,
        o.is_current,
        u.id AS unit_id,
        u.street_address,
        u.unit_number,
        u.unit_sf,
        u.warehouse_sf,
        u.office_sf,
        u.clear_height_ft,
        u.dock_doors,
        u.gl_doors,
        u.power_amps,
        u.power_volts,
        u.fenced_yard,
        b.id AS building_id,
        b.year_built,
        b.building_sf AS total_building_sf,
        b.building_name,
        b.sprinklers,
        p.apn,
        p.city,
        p.zip,
        p.land_sf,
        CASE WHEN p.land_sf > 0 THEN ROUND(p.land_sf::decimal / 43560, 2) ELSE NULL END AS lot_acres,
        ST_X(p.centroid::geometry) AS lng,
        ST_Y(p.centroid::geometry) AS lat,
        c.name AS primary_contact_name,
        c.email AS primary_contact_email,
        c.mobile AS primary_contact_mobile,
        c.phone AS primary_contact_phone,
        c.title AS primary_contact_title
      FROM occupancy o
      JOIN entity e ON o.entity_id = e.id
      JOIN unit u ON o.unit_id = u.id
      JOIN building b ON u.building_id = b.id
      JOIN parcel p ON b.parcel_apn = p.apn
      LEFT JOIN contact c ON c.entity_id = e.id AND c.is_primary = true
      ${whereClause}
      ORDER BY e.entity_name, u.street_address
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limitVal, offsetVal]);

    res.json({
      results: result.rows,
      total: parseInt(countResult.rows[0]?.total || 0),
      limit: limitVal,
      offset: offsetVal
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/map-labels - Tenant company names with lat/lng for map overlay
router.get('/map-labels', async (req, res, next) => {
  try {
    const { bounds } = req.query;

    let boundsFilter = '';
    const params = [];

    if (bounds) {
      // bounds format: "south,west,north,east"
      const [south, west, north, east] = bounds.split(',').map(Number);
      if (!isNaN(south) && !isNaN(west) && !isNaN(north) && !isNaN(east)) {
        boundsFilter = `AND ST_Within(p.centroid, ST_MakeEnvelope($1, $2, $3, $4, 4326))`;
        params.push(west, south, east, north);
      }
    }

    const result = await query(`
      SELECT DISTINCT ON (e.id)
        e.id AS entity_id,
        e.entity_name,
        e.entity_type,
        e.website,
        u.street_address,
        u.unit_sf,
        p.city,
        p.apn,
        ST_Y(p.centroid::geometry) AS lat,
        ST_X(p.centroid::geometry) AS lng
      FROM occupancy o
      JOIN entity e ON o.entity_id = e.id
      JOIN unit u ON o.unit_id = u.id
      JOIN building b ON u.building_id = b.id
      JOIN parcel p ON b.parcel_apn = p.apn
      WHERE o.is_current = true
        ${boundsFilter}
      ORDER BY e.id, o.created_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:entityId - Full tenant detail
router.get('/:entityId', async (req, res, next) => {
  try {
    const { entityId } = req.params;

    // Get entity
    const entityResult = await query(`
      SELECT * FROM entity WHERE id = $1
    `, [entityId]);

    if (entityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Get all contacts
    const contactsResult = await query(`
      SELECT * FROM contact WHERE entity_id = $1 ORDER BY is_primary DESC, name
    `, [entityId]);

    // Get current + historical occupancy with building/unit info
    const occupancyResult = await query(`
      SELECT
        o.*,
        u.street_address,
        u.unit_number,
        u.unit_sf,
        u.warehouse_sf,
        u.office_sf,
        u.clear_height_ft,
        u.dock_doors,
        u.gl_doors,
        u.power_amps,
        u.power_volts,
        b.year_built,
        b.building_sf AS total_building_sf,
        b.building_name,
        p.apn,
        p.city,
        p.zip,
        p.land_sf,
        CASE WHEN p.land_sf > 0 THEN ROUND(p.land_sf::decimal / 43560, 2) ELSE NULL END AS lot_acres,
        ST_X(p.centroid::geometry) AS lng,
        ST_Y(p.centroid::geometry) AS lat
      FROM occupancy o
      JOIN unit u ON o.unit_id = u.id
      JOIN building b ON u.building_id = b.id
      JOIN parcel p ON b.parcel_apn = p.apn
      WHERE o.entity_id = $1
      ORDER BY o.is_current DESC, o.lease_start DESC
    `, [entityId]);

    res.json({
      ...entityResult.rows[0],
      contacts: contactsResult.rows,
      occupancy: occupancyResult.rows
    });
  } catch (err) {
    next(err);
  }
});

export default router;
