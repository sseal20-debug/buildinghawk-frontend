import { Router } from 'express';
import { query } from '../db/connection.js';

const router = Router();

// GET /api/vacant - List vacant units/buildings
router.get('/', async (req, res, next) => {
  try {
    const {
      availability = 'all',  // 'all', 'lease', 'sale'
      sf_range = 'any',      // 'any', '0-5000', '5000-10000', etc.
      city = '',
      limit = 100
    } = req.query;

    let sfMin = 0;
    let sfMax = 999999999;
    if (sf_range && sf_range !== 'any') {
      const [min, max] = sf_range.split('-').map(Number);
      sfMin = min || 0;
      sfMax = max || 999999999;
    }

    // Build availability condition
    let availabilityCondition = '';
    if (availability === 'lease') {
      availabilityCondition = 'AND u.for_lease = true';
    } else if (availability === 'sale') {
      availabilityCondition = 'AND u.for_sale = true';
    }

    const result = await query(`
      SELECT
        u.id,
        COALESCE(b.street_address, p.situs_address) as address,
        COALESCE(b.city, p.city) as city,
        u.unit_number,
        u.unit_sf as building_sf,
        u.available_sf,
        u.asking_lease_rate as lease_rate,
        u.asking_sale_price as sale_price,
        u.for_lease,
        u.for_sale,
        b.clear_height,
        b.dock_doors,
        b.grade_doors,
        b.year_built,
        o.entity_name as last_tenant,
        oc.move_out_date as vacated_date
      FROM unit u
      LEFT JOIN building b ON b.id = u.building_id
      LEFT JOIN parcel p ON p.id = b.parcel_id
      LEFT JOIN occupancy oc ON oc.unit_id = u.id AND oc.is_current = false
      LEFT JOIN entity o ON o.id = oc.entity_id
      WHERE u.unit_status = 'vacant'
        AND (u.unit_sf >= $1 AND u.unit_sf <= $2)
        ${availabilityCondition}
        ${city ? 'AND LOWER(COALESCE(b.city, p.city)) LIKE LOWER($4)' : ''}
      ORDER BY u.updated_at DESC
      LIMIT $3
    `, city
      ? [sfMin, sfMax, limit, `%${city}%`]
      : [sfMin, sfMax, limit]
    );

    res.json({
      units: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/vacant/stats - Get vacancy statistics
router.get('/stats', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total_vacant,
        SUM(u.unit_sf) as total_vacant_sf,
        COUNT(CASE WHEN u.for_lease THEN 1 END) as for_lease_count,
        COUNT(CASE WHEN u.for_sale THEN 1 END) as for_sale_count,
        AVG(u.asking_lease_rate) as avg_lease_rate,
        AVG(u.asking_sale_price / NULLIF(u.unit_sf, 0)) as avg_sale_price_psf
      FROM unit u
      WHERE u.unit_status = 'vacant'
    `);

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/vacant/by-city - Get vacant units grouped by city
router.get('/by-city', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(b.city, p.city) as city,
        COUNT(*) as count,
        SUM(u.unit_sf) as total_sf,
        AVG(u.asking_lease_rate) as avg_lease_rate
      FROM unit u
      LEFT JOIN building b ON b.id = u.building_id
      LEFT JOIN parcel p ON p.id = b.parcel_id
      WHERE u.unit_status = 'vacant'
      GROUP BY COALESCE(b.city, p.city)
      ORDER BY count DESC
    `);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

export default router;
