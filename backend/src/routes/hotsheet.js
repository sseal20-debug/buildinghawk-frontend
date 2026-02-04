import { Router } from 'express';
import { query } from '../db/connection.js';
import { z } from 'zod';

const router = Router();

// Query params validation
const hotsheetQuerySchema = z.object({
  timeFilter: z.enum(['1d', '3d', '1w', '1m', '3m', '6m', '1y', '2y']).default('1w'),
  typeFilter: z.enum(['all', 'new_listing', 'price_change', 'sold', 'leased', 'new_comp']).default('all'),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).default('50'),
});

// Calculate date range based on time filter
function getDateRange(timeFilter) {
  const now = new Date();
  const ranges = {
    '1d': 1,
    '3d': 3,
    '1w': 7,
    '1m': 30,
    '3m': 90,
    '6m': 180,
    '1y': 365,
    '2y': 730,
  };
  const days = ranges[timeFilter] || 7;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { startDate, endDate: now };
}

// Transform listing row to HotsheetItem format
function toHotsheetItem(row) {
  let type = 'new_listing';
  if (row.status === 'sold') type = 'sold';
  else if (row.status === 'leased') type = 'leased';
  else if (row.is_price_reduced) type = 'price_change';
  else if (row.is_new) type = 'new_listing';

  const details = {
    sf: row.sf,
    broker: row.listing_broker,
    status: row.listing_type === 'lease' ? 'For Lease' : 'For Sale',
  };

  if (row.listing_type === 'sale') {
    details.price = row.sale_price ? parseFloat(row.sale_price) : undefined;
    if (row.is_price_reduced && row.previous_price) {
      details.priceChange = parseFloat(row.sale_price) - parseFloat(row.previous_price);
    }
  } else {
    details.price = row.rate_monthly ? parseFloat(row.rate_monthly) : undefined;
    if (row.is_price_reduced && row.previous_rate) {
      details.priceChange = parseFloat(row.rate_monthly) - parseFloat(row.previous_rate);
    }
  }

  return {
    id: row.id,
    type,
    address: row.address,
    city: row.city,
    timestamp: row.updated_at || row.created_at,
    details,
  };
}

// GET /api/hotsheet - Get recent activity feed
router.get('/', async (req, res, next) => {
  try {
    const params = hotsheetQuerySchema.parse(req.query);
    const { startDate, endDate } = getDateRange(params.timeFilter);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Build type condition
    let typeCondition = '';
    if (params.typeFilter === 'new_listing') {
      typeCondition = 'AND is_new = true';
    } else if (params.typeFilter === 'price_change') {
      typeCondition = 'AND is_price_reduced = true';
    } else if (params.typeFilter === 'sold') {
      typeCondition = "AND status = 'sold'";
    } else if (params.typeFilter === 'leased') {
      typeCondition = "AND status = 'leased'";
    }

    const result = await query(`
      SELECT
        id, address, city, listing_type, sf,
        rate_monthly, sale_price, price_psf,
        status, is_new, is_price_reduced,
        previous_price, previous_rate,
        listing_broker, notes, features,
        last_updated, created_at, updated_at
      FROM listings
      WHERE last_updated >= $1
        AND last_updated <= $2
        ${typeCondition}
      ORDER BY last_updated DESC, created_at DESC
      LIMIT $3
    `, [startDateStr, endDateStr, params.limit]);

    const items = result.rows.map(toHotsheetItem);

    res.json({
      items,
      total: items.length,
      filters: {
        timeFilter: params.timeFilter,
        typeFilter: params.typeFilter,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      }
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query parameters', details: err.errors });
    }
    next(err);
  }
});

// GET /api/hotsheet/stats - Get activity statistics
router.get('/stats', async (req, res, next) => {
  try {
    const params = hotsheetQuerySchema.parse(req.query);
    const { startDate, endDate } = getDateRange(params.timeFilter);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE is_new = true) AS new_listing,
        COUNT(*) FILTER (WHERE is_price_reduced = true) AS price_change,
        COUNT(*) FILTER (WHERE status = 'sold') AS sold,
        COUNT(*) FILTER (WHERE status = 'leased') AS leased,
        COUNT(*) AS total
      FROM listings
      WHERE last_updated >= $1 AND last_updated <= $2
    `, [startDateStr, endDateStr]);

    const row = result.rows[0];
    res.json({
      new_listing: parseInt(row.new_listing),
      price_change: parseInt(row.price_change),
      sold: parseInt(row.sold),
      leased: parseInt(row.leased),
      total: parseInt(row.total),
      period: {
        timeFilter: params.timeFilter,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/hotsheet/my-listings - Get user's own listings activity
router.get('/my-listings', async (req, res, next) => {
  try {
    const params = hotsheetQuerySchema.parse(req.query);

    // Would filter by broker_id = current user in production
    res.json({
      items: [],
      total: 0,
      filters: {
        timeFilter: params.timeFilter,
        typeFilter: params.typeFilter,
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/hotsheet/my-portfolio - Get activity on user's watched properties
router.get('/my-portfolio', async (req, res, next) => {
  try {
    const params = hotsheetQuerySchema.parse(req.query);

    res.json({
      items: [],
      total: 0,
      filters: {
        timeFilter: params.timeFilter,
        typeFilter: params.typeFilter,
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
