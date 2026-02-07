import { Router } from 'express';
import { query } from '../db/connection.js';

const router = Router();

// GET /api/stats/market - Get overall market statistics
router.get('/market', async (req, res, next) => {
  try {
    const { period = 'ytd' } = req.query;

    // Calculate date range based on period
    let dateCondition = '';
    const now = new Date();
    let startDate;

    switch (period) {
      case '1y':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case '2y':
        startDate = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
        break;
      case '5y':
        startDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
        break;
      case 'ytd':
      default:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    dateCondition = `AND lc.lease_date >= '${startDate.toISOString().split('T')[0]}'`;

    // Get lease stats
    const leaseStats = await query(`
      SELECT
        AVG(lc.starting_rent_psf) as avg_lease_rate,
        COUNT(*) as lease_transactions
      FROM lease_comp lc
      WHERE lc.starting_rent_psf IS NOT NULL
        ${dateCondition}
    `);

    // Get sale stats
    const saleStats = await query(`
      SELECT
        AVG(sc.sale_price / NULLIF(sc.building_sf, 0)) as avg_sale_price_psf,
        AVG(sc.cap_rate_actual) as avg_cap_rate,
        COUNT(*) as sale_transactions
      FROM sale_comp sc
      WHERE sc.sale_price IS NOT NULL
        AND sc.sale_date >= '${startDate.toISOString().split('T')[0]}'
    `);

    // Get inventory stats
    const inventoryStats = await query(`
      SELECT
        SUM(b.building_sf) as total_inventory_sf,
        COUNT(DISTINCT b.id) as total_buildings
      FROM building b
      WHERE b.building_sf > 0
    `);

    // Get vacancy stats
    const vacancyStats = await query(`
      SELECT
        COUNT(CASE WHEN u.unit_status = 'vacant' THEN 1 END) as vacant_units,
        COUNT(*) as total_units,
        SUM(CASE WHEN u.unit_status = 'vacant' THEN u.unit_sf ELSE 0 END) as vacant_sf,
        SUM(u.unit_sf) as total_sf
      FROM unit u
    `);

    const vacancy = vacancyStats.rows[0];
    const vacancyRate = vacancy.total_sf > 0
      ? (vacancy.vacant_sf / vacancy.total_sf * 100)
      : 0;

    res.json({
      avg_lease_rate: parseFloat(leaseStats.rows[0]?.avg_lease_rate) || null,
      avg_sale_price_psf: parseFloat(saleStats.rows[0]?.avg_sale_price_psf) || null,
      vacancy_rate: parseFloat(vacancyRate.toFixed(1)),
      avg_cap_rate: parseFloat(saleStats.rows[0]?.avg_cap_rate) || null,
      total_inventory_sf: parseInt(inventoryStats.rows[0]?.total_inventory_sf) || 0,
      ytd_absorption_sf: null, // TODO: Calculate from occupancy changes
      avg_days_on_market: null, // TODO: Calculate from listing dates
      total_transactions: (parseInt(leaseStats.rows[0]?.lease_transactions) || 0) +
                          (parseInt(saleStats.rows[0]?.sale_transactions) || 0)
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/cities - Get statistics by city
router.get('/cities', async (req, res, next) => {
  try {
    const { period = 'ytd' } = req.query;

    const now = new Date();
    let startDate;

    switch (period) {
      case '1y':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case '2y':
        startDate = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
        break;
      case '5y':
        startDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
        break;
      case 'ytd':
      default:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    const startDateStr = startDate.toISOString().split('T')[0];

    // Get city-level stats combining lease and sale comps
    const result = await query(`
      WITH city_lease AS (
        SELECT
          COALESCE(lc.city, 'Unknown') as city,
          AVG(lc.starting_rent_psf) as avg_lease_rate,
          COUNT(*) as lease_count
        FROM lease_comp lc
        WHERE lc.starting_rent_psf IS NOT NULL
          AND lc.lease_date >= $1
        GROUP BY COALESCE(lc.city, 'Unknown')
      ),
      city_sale AS (
        SELECT
          COALESCE(sc.city, 'Unknown') as city,
          AVG(sc.sale_price / NULLIF(sc.building_sf, 0)) as avg_sale_price_psf,
          COUNT(*) as sale_count
        FROM sale_comp sc
        WHERE sc.sale_price IS NOT NULL
          AND sc.sale_date >= $1
        GROUP BY COALESCE(sc.city, 'Unknown')
      ),
      city_inventory AS (
        SELECT
          COALESCE(b.city, p.city, 'Unknown') as city,
          SUM(b.building_sf) as inventory_sf,
          SUM(CASE WHEN u.unit_status = 'vacant' THEN u.unit_sf ELSE 0 END) as vacant_sf,
          SUM(u.unit_sf) as total_sf
        FROM building b
        LEFT JOIN parcel p ON p.id = b.parcel_id
        LEFT JOIN unit u ON u.building_id = b.id
        GROUP BY COALESCE(b.city, p.city, 'Unknown')
      )
      SELECT
        COALESCE(ci.city, cl.city, cs.city) as city,
        cl.avg_lease_rate,
        cs.avg_sale_price_psf,
        CASE WHEN ci.total_sf > 0 THEN (ci.vacant_sf / ci.total_sf * 100) ELSE 0 END as vacancy_rate,
        ci.inventory_sf,
        COALESCE(cl.lease_count, 0) + COALESCE(cs.sale_count, 0) as recent_transactions
      FROM city_inventory ci
      FULL OUTER JOIN city_lease cl ON cl.city = ci.city
      FULL OUTER JOIN city_sale cs ON cs.city = ci.city
      WHERE COALESCE(ci.city, cl.city, cs.city) != 'Unknown'
      ORDER BY ci.inventory_sf DESC NULLS LAST
    `, [startDateStr]);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/trends - Get trend data for charts
router.get('/trends', async (req, res, next) => {
  try {
    const { metric = 'lease_rate', period = '2y' } = req.query;

    // This is a placeholder - would need proper time series data
    res.json({
      metric,
      period,
      data: [],
      message: 'Trend data coming soon'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
