import { Router } from 'express';
import { query, toGeoJSON } from '../db/connection.js';

const router = Router();

// GET /api/sale-alerts - List sale alerts from deed monitor
router.get('/', async (req, res, next) => {
  try {
    const {
      acknowledged = 'false',
      days = 30,
      limit = 100,
      city
    } = req.query;

    const showAcknowledged = acknowledged === 'true';

    let whereClause = `WHERE ($1 = true OR sa.acknowledged = false)
      AND sa.created_at > NOW() - INTERVAL '1 day' * $2`;
    const params = [showAcknowledged, days, limit];

    if (city) {
      whereClause += ` AND sa.city ILIKE $4`;
      params.push(`%${city}%`);
    }

    const result = await query(`
      SELECT
        sa.*,
        w.building_sf,
        w.lot_sf,
        w.zoning,
        w.property_type,
        ${toGeoJSON('w.geom')} as centroid,
        CASE WHEN w.building_sf > 0
             THEN ROUND(sa.sale_price / w.building_sf, 2)
             ELSE NULL
        END AS price_per_sf
      FROM sale_alerts sa
      JOIN apn_watchlist w ON sa.watchlist_id = w.id
      ${whereClause}
      ORDER BY sa.created_at DESC
      LIMIT $3
    `, params);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/sale-alerts/summary - Dashboard summary
router.get('/summary', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM apn_watchlist) AS total_watched_parcels,
        (SELECT COUNT(*) FROM apn_watchlist WHERE is_listed_for_sale) AS currently_listed,
        (SELECT COUNT(*) FROM sale_alerts WHERE created_at > NOW() - INTERVAL '7 days') AS sales_last_7_days,
        (SELECT COUNT(*) FROM sale_alerts WHERE created_at > NOW() - INTERVAL '30 days') AS sales_last_30_days,
        (SELECT COUNT(*) FROM sale_alerts WHERE NOT acknowledged) AS unacknowledged_alerts,
        (SELECT MAX(completed_at) FROM monitor_runs WHERE status = 'completed') AS last_successful_run,
        (SELECT COALESCE(SUM(sale_price), 0) FROM sale_alerts
         WHERE created_at > NOW() - INTERVAL '30 days') AS total_volume_30_days
    `);

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/sale-alerts/recent - Recent sales for map display
router.get('/recent', async (req, res, next) => {
  try {
    const { days = 90, limit = 100 } = req.query;

    const result = await query(`
      SELECT
        sa.id,
        sa.apn,
        sa.address,
        sa.city,
        sa.sale_price,
        sa.sale_date,
        sa.buyer,
        sa.seller,
        w.building_sf,
        w.lot_sf,
        ST_Y(w.geom::geometry) as lat,
        ST_X(w.geom::geometry) as lng,
        CASE WHEN w.building_sf > 0
             THEN ROUND(sa.sale_price / w.building_sf, 2)
             ELSE NULL
        END AS price_per_sf
      FROM sale_alerts sa
      JOIN apn_watchlist w ON sa.watchlist_id = w.id
      WHERE sa.sale_date > NOW() - INTERVAL '1 day' * $1
        AND w.geom IS NOT NULL
      ORDER BY sa.sale_date DESC
      LIMIT $2
    `, [days, limit]);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/sale-alerts/:id/acknowledge - Mark alert as acknowledged
router.post('/:id/acknowledge', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await query(`
      UPDATE sale_alerts
      SET acknowledged = true,
          acknowledged_at = NOW(),
          notes = COALESCE($2, notes)
      WHERE id = $1
      RETURNING *
    `, [id, notes]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sale alert not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/sale-alerts/by-city - Sales grouped by city
router.get('/by-city', async (req, res, next) => {
  try {
    const { days = 90 } = req.query;

    const result = await query(`
      SELECT
        sa.city,
        COUNT(*) as sale_count,
        SUM(sa.sale_price) as total_volume,
        AVG(sa.sale_price) as avg_price,
        AVG(CASE WHEN w.building_sf > 0
                 THEN sa.sale_price / w.building_sf
                 ELSE NULL
            END) as avg_price_per_sf
      FROM sale_alerts sa
      JOIN apn_watchlist w ON sa.watchlist_id = w.id
      WHERE sa.sale_date > NOW() - INTERVAL '1 day' * $1
      GROUP BY sa.city
      ORDER BY sale_count DESC
    `, [days]);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

export default router;
