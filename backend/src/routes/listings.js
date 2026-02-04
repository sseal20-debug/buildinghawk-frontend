import { Router } from 'express';
import { query } from '../db/connection.js';
import { z } from 'zod';

const router = Router();

// Query params validation
const listingsQuerySchema = z.object({
  type: z.enum(['all', 'lease', 'sale']).default('all'),
  city: z.string().optional(),
  status: z.enum(['active', 'sold', 'leased', 'pending', 'off_market', 'all']).default('active'),
  min_sf: z.string().transform(Number).pipe(z.number().min(0)).optional(),
  max_sf: z.string().transform(Number).pipe(z.number().min(0)).optional(),
  sort: z.enum(['sf_asc', 'sf_desc', 'rate_asc', 'rate_desc', 'price_asc', 'price_desc', 'newest', 'city']).default('newest'),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(500)).default('100'),
  offset: z.string().transform(Number).pipe(z.number().min(0)).default('0'),
});

const sortMap = {
  sf_asc: 'sf ASC NULLS LAST',
  sf_desc: 'sf DESC NULLS LAST',
  rate_asc: 'rate_monthly ASC NULLS LAST',
  rate_desc: 'rate_monthly DESC NULLS LAST',
  price_asc: 'sale_price ASC NULLS LAST',
  price_desc: 'sale_price DESC NULLS LAST',
  newest: 'last_updated DESC, created_at DESC',
  city: 'city ASC, address ASC',
};

// GET /api/listings - List with filters
router.get('/', async (req, res, next) => {
  try {
    const params = listingsQuerySchema.parse(req.query);

    let conditions = [];
    let values = [];
    let idx = 1;

    if (params.status !== 'all') {
      conditions.push(`status = $${idx++}`);
      values.push(params.status);
    }
    if (params.type !== 'all') {
      conditions.push(`listing_type = $${idx++}`);
      values.push(params.type);
    }
    if (params.city) {
      conditions.push(`city ILIKE $${idx++}`);
      values.push(params.city);
    }
    if (params.min_sf !== undefined) {
      conditions.push(`sf >= $${idx++}`);
      values.push(params.min_sf);
    }
    if (params.max_sf !== undefined) {
      conditions.push(`sf <= $${idx++}`);
      values.push(params.max_sf);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = `ORDER BY ${sortMap[params.sort]}`;

    const [countResult, dataResult] = await Promise.all([
      query(`SELECT COUNT(*) FROM listings ${where}`, values),
      query(
        `SELECT * FROM listings ${where} ${order} LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, params.limit, params.offset]
      ),
    ]);

    res.json({
      listings: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      filters: { type: params.type, city: params.city, status: params.status },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid parameters', details: err.errors });
    }
    next(err);
  }
});

// GET /api/listings/stats - City stats
router.get('/stats', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        city,
        listing_type,
        COUNT(*) AS listing_count,
        SUM(sf) AS total_sf,
        AVG(rate_monthly) AS avg_rate_monthly,
        AVG(price_psf) AS avg_price_psf,
        COUNT(*) FILTER (WHERE is_new) AS new_today,
        COUNT(*) FILTER (WHERE is_price_reduced) AS price_reduced
      FROM listings
      WHERE status = 'active'
      GROUP BY city, listing_type
      ORDER BY city, listing_type
    `);
    res.json({ stats: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/listings/new - New listings
router.get('/new', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM listings WHERE is_new = true ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ listings: result.rows, total: result.rows.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/listings/reduced - Price-reduced
router.get('/reduced', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM listings WHERE is_price_reduced = true ORDER BY updated_at DESC LIMIT 50'
    );
    res.json({ listings: result.rows, total: result.rows.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/listings/:id - Single listing with history
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [listingResult, historyResult] = await Promise.all([
      query('SELECT * FROM listings WHERE id = $1', [id]),
      query(
        'SELECT * FROM listing_history WHERE listing_id = $1 ORDER BY change_date DESC',
        [id]
      ),
    ]);

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    res.json({
      ...listingResult.rows[0],
      history: historyResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
