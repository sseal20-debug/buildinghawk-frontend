import { Router } from 'express';
import { query, toGeoJSON } from '../db/connection.js';
import { z } from 'zod';

const router = Router();

// Search criteria schema
const searchCriteriaSchema = z.object({
  min_sf: z.number().int().min(0).optional(),
  max_sf: z.number().int().min(0).optional(),
  min_amps: z.number().int().min(0).optional(),
  power_volts: z.enum(['120/240', '277/480', 'both']).optional(),
  min_docks: z.number().int().min(0).optional(),
  min_gl_doors: z.number().int().min(0).optional(),
  min_clear_height: z.number().min(0).optional(),
  fenced_yard: z.boolean().optional(),
  cities: z.array(z.string()).optional(),
  geography_id: z.string().uuid().optional(),
  for_sale: z.boolean().optional(),
  for_lease: z.boolean().optional(),
  vacant_only: z.boolean().optional(),
  in_market_only: z.boolean().optional(),
  year_built_min: z.number().int().optional(),
  year_built_max: z.number().int().optional()
});

// Saved search schema
const savedSearchSchema = z.object({
  name: z.string().min(1),
  client_name: z.string().optional().nullable(),
  client_email: z.string().email().optional().nullable(),
  client_phone: z.string().optional().nullable(),
  criteria: searchCriteriaSchema,
  alert_enabled: z.boolean().optional().default(false),
  notes: z.string().optional().nullable()
});

// POST /api/search - Execute property search
router.post('/', async (req, res, next) => {
  try {
    const criteria = searchCriteriaSchema.parse(req.body);

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (criteria.min_sf) {
      conditions.push(`u.unit_sf >= $${paramIndex}`);
      values.push(criteria.min_sf);
      paramIndex++;
    }

    if (criteria.max_sf) {
      conditions.push(`u.unit_sf <= $${paramIndex}`);
      values.push(criteria.max_sf);
      paramIndex++;
    }

    if (criteria.min_amps) {
      conditions.push(`u.power_amps >= $${paramIndex}`);
      values.push(criteria.min_amps);
      paramIndex++;
    }

    if (criteria.power_volts) {
      conditions.push(`u.power_volts = $${paramIndex}`);
      values.push(criteria.power_volts);
      paramIndex++;
    }

    if (criteria.min_docks) {
      conditions.push(`u.dock_doors >= $${paramIndex}`);
      values.push(criteria.min_docks);
      paramIndex++;
    }

    if (criteria.min_gl_doors) {
      conditions.push(`u.gl_doors >= $${paramIndex}`);
      values.push(criteria.min_gl_doors);
      paramIndex++;
    }

    if (criteria.min_clear_height) {
      conditions.push(`u.clear_height_ft >= $${paramIndex}`);
      values.push(criteria.min_clear_height);
      paramIndex++;
    }

    if (criteria.fenced_yard !== undefined) {
      conditions.push(`u.fenced_yard = $${paramIndex}`);
      values.push(criteria.fenced_yard);
      paramIndex++;
    }

    if (criteria.cities && criteria.cities.length > 0) {
      conditions.push(`p.city = ANY($${paramIndex})`);
      values.push(criteria.cities);
      paramIndex++;
    }

    if (criteria.geography_id) {
      conditions.push(`ST_Within(p.centroid, (SELECT geometry FROM geography WHERE id = $${paramIndex}))`);
      values.push(criteria.geography_id);
      paramIndex++;
    }

    if (criteria.for_sale) {
      conditions.push(`u.for_sale = true`);
    }

    if (criteria.for_lease) {
      conditions.push(`u.for_lease = true`);
    }

    if (criteria.vacant_only) {
      conditions.push(`u.unit_status = 'vacant'`);
    }

    if (criteria.in_market_only) {
      conditions.push(`o.market_status IN ('relocation', 'growth', 'expansion', 'contraction')`);
    }

    if (criteria.year_built_min) {
      conditions.push(`b.year_built >= $${paramIndex}`);
      values.push(criteria.year_built_min);
      paramIndex++;
    }

    if (criteria.year_built_max) {
      conditions.push(`b.year_built <= $${paramIndex}`);
      values.push(criteria.year_built_max);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(`
      SELECT
        u.id as unit_id,
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
        u.yard_sf,
        u.unit_status,
        u.for_sale,
        u.for_lease,
        u.asking_sale_price,
        u.asking_lease_rate,
        b.id as building_id,
        b.building_name,
        b.building_sf as total_building_sf,
        b.year_built,
        p.apn,
        p.city,
        p.land_sf,
        ${toGeoJSON('p.centroid')} as location,
        e.entity_name as current_tenant,
        o.market_status,
        o.lease_expiration,
        o.occupant_type
      FROM unit u
      JOIN building b ON b.id = u.building_id
      JOIN parcel p ON p.apn = b.parcel_apn
      LEFT JOIN occupancy o ON o.unit_id = u.id AND o.is_current = true
      LEFT JOIN entity e ON e.id = o.entity_id
      ${whereClause}
      ORDER BY u.unit_sf
      LIMIT 500
    `, values);

    // Convert to GeoJSON FeatureCollection for map display
    const features = result.rows.map(row => ({
      type: 'Feature',
      geometry: row.location,
      properties: {
        ...row,
        location: undefined  // Remove duplicate
      }
    }));

    res.json({
      type: 'FeatureCollection',
      features,
      count: result.rows.length
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// GET /api/search/saved - List saved searches
router.get('/saved', async (req, res, next) => {
  try {
    const { active_only = true } = req.query;

    const result = await query(`
      SELECT * FROM saved_search
      WHERE ($1 = false OR is_active = true)
      ORDER BY updated_at DESC
    `, [active_only === 'true' || active_only === true]);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/search/saved - Create saved search
router.post('/saved', async (req, res, next) => {
  try {
    const data = savedSearchSchema.parse(req.body);

    const result = await query(`
      INSERT INTO saved_search (name, client_name, client_email, client_phone, criteria, alert_enabled, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      data.name,
      data.client_name,
      data.client_email,
      data.client_phone,
      JSON.stringify(data.criteria),
      data.alert_enabled,
      data.notes
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// GET /api/search/saved/:id - Get saved search with current matches
router.get('/saved/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const searchResult = await query(`
      SELECT * FROM saved_search WHERE id = $1
    `, [id]);

    if (searchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    const savedSearch = searchResult.rows[0];

    // Execute the search with saved criteria
    // Reuse the POST / logic by making an internal call
    // For simplicity, we'll return the saved search metadata
    // and let the client execute the search

    res.json(savedSearch);
  } catch (err) {
    next(err);
  }
});

// PUT /api/search/saved/:id - Update saved search
router.put('/saved/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = savedSearchSchema.partial().parse(req.body);

    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (key === 'criteria') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
      }
      paramIndex++;
    }

    values.push(id);

    const result = await query(`
      UPDATE saved_search
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// DELETE /api/search/saved/:id - Delete saved search
router.delete('/saved/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      DELETE FROM saved_search WHERE id = $1 RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    res.json({ deleted: true, id });
  } catch (err) {
    next(err);
  }
});

// GET /api/search/geographies - List available geographies for filtering
router.get('/geographies', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT id, name, geo_type FROM geography ORDER BY geo_type, name
    `);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/search/cities - List all cities with property counts
router.get('/cities', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        p.city,
        COUNT(DISTINCT p.apn) as parcel_count,
        COUNT(DISTINCT u.id) as unit_count
      FROM parcel p
      LEFT JOIN building b ON b.parcel_apn = p.apn
      LEFT JOIN unit u ON u.building_id = b.id
      WHERE p.city IS NOT NULL
      GROUP BY p.city
      ORDER BY p.city
    `);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

export default router;
