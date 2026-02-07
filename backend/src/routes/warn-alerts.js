import { Router } from 'express';
import { query } from '../db/connection.js';
import { z } from 'zod';

const router = Router();

const warnQuerySchema = z.object({
  priority: z.enum(['all', 'HIGH', 'MEDIUM', 'LOW']).default('all'),
  property_type: z.string().optional(),
  city: z.string().optional(),
  status: z.string().default('Active Alert'),
  sort: z.enum(['priority', 'employees_desc', 'effective_date', 'city']).default('employees_desc'),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(200)).default('100'),
  offset: z.string().transform(Number).pipe(z.number().min(0)).default('0'),
});

const sortMap = {
  priority: `CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, employees DESC NULLS LAST`,
  employees_desc: 'employees DESC NULLS LAST',
  effective_date: 'effective_date DESC NULLS LAST',
  city: 'city ASC, company ASC',
};

// GET /api/warn-alerts - List with filters
router.get('/', async (req, res, next) => {
  try {
    const params = warnQuerySchema.parse(req.query);

    let conditions = [];
    let values = [];
    let idx = 1;

    if (params.priority !== 'all') {
      conditions.push(`priority = $${idx++}`);
      values.push(params.priority);
    }
    if (params.property_type) {
      conditions.push(`property_type ILIKE $${idx++}`);
      values.push(`%${params.property_type}%`);
    }
    if (params.city) {
      conditions.push(`city ILIKE $${idx++}`);
      values.push(params.city);
    }
    if (params.status !== 'all') {
      conditions.push(`status = $${idx++}`);
      values.push(params.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = `ORDER BY ${sortMap[params.sort]}`;

    const [countResult, dataResult] = await Promise.all([
      query(`SELECT COUNT(*) FROM warn_alerts ${where}`, values),
      query(
        `SELECT * FROM warn_alerts ${where} ${order} LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, params.limit, params.offset]
      ),
    ]);

    res.json({
      alerts: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      filters: { priority: params.priority, city: params.city, property_type: params.property_type },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid parameters', details: err.errors });
    }
    next(err);
  }
});

// GET /api/warn-alerts/stats - Summary stats
router.get('/stats', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE priority = 'HIGH') AS high_priority,
        COUNT(*) FILTER (WHERE priority = 'MEDIUM') AS medium_priority,
        COUNT(*) FILTER (WHERE priority = 'LOW') AS low_priority,
        SUM(employees) AS total_employees,
        SUM(est_sf) AS total_est_sf,
        COUNT(*) FILTER (WHERE property_type ILIKE '%Industrial%' OR property_type ILIKE '%Warehouse%') AS industrial_count
      FROM warn_alerts
      WHERE status = 'Active Alert'
    `);

    const row = result.rows[0];
    res.json({
      total: parseInt(row.total),
      high_priority: parseInt(row.high_priority),
      medium_priority: parseInt(row.medium_priority),
      low_priority: parseInt(row.low_priority),
      total_employees: parseInt(row.total_employees) || 0,
      total_est_sf: parseInt(row.total_est_sf) || 0,
      industrial_count: parseInt(row.industrial_count),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/warn-alerts/map - GeoJSON for map overlay
router.get('/map', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT id, company, address, city, property_type, employees, est_sf,
             priority, layoff_type, effective_date, status,
             latitude, longitude
      FROM warn_alerts
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY employees DESC NULLS LAST
    `);

    const features = result.rows.map(row => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(row.longitude), parseFloat(row.latitude)],
      },
      properties: {
        id: row.id,
        company: row.company,
        address: row.address,
        city: row.city,
        property_type: row.property_type,
        employees: row.employees,
        est_sf: row.est_sf,
        priority: row.priority,
        layoff_type: row.layoff_type,
        effective_date: row.effective_date,
        status: row.status,
      },
    }));

    res.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/warn-alerts/:id - Single alert
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM warn_alerts WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'WARN alert not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
