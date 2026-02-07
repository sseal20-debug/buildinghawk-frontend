import { Router } from 'express';
import { query } from '../db/connection.js';

const router = Router();

// GET /api/condos - List industrial condos
router.get('/', async (req, res, next) => {
  try {
    const {
      status = 'all',  // 'all', 'sale', 'lease', 'sold', 'leased'
      city = '',
      q = '',  // search query
      limit = 100
    } = req.query;

    // For now, query units that might be condos (smaller industrial units)
    // In the future, this should query a dedicated condos table
    let statusCondition = '';
    if (status === 'sale') {
      statusCondition = 'AND u.for_sale = true AND u.unit_status = \'available\'';
    } else if (status === 'lease') {
      statusCondition = 'AND u.for_lease = true AND u.unit_status = \'available\'';
    } else if (status === 'sold') {
      statusCondition = 'AND u.unit_status = \'sold\'';
    } else if (status === 'leased') {
      statusCondition = 'AND u.unit_status = \'occupied\'';
    }

    // Note: This is a placeholder query. When condo data is imported,
    // this should query a dedicated condos table.
    const result = await query(`
      SELECT
        u.id,
        COALESCE(b.street_address, p.situs_address) as address,
        COALESCE(b.city, p.city) as city,
        u.unit_number,
        b.name as building_name,
        u.unit_sf as sf,
        b.year_built,
        u.for_sale,
        u.for_lease,
        u.asking_sale_price as sale_price,
        u.asking_lease_rate as lease_rate,
        CASE
          WHEN u.for_sale AND u.unit_status = 'available' THEN 'available'
          WHEN u.for_lease AND u.unit_status = 'available' THEN 'available'
          WHEN u.unit_status = 'sold' THEN 'sold'
          WHEN u.unit_status = 'occupied' THEN 'leased'
          ELSE 'available'
        END as status,
        e.entity_name as owner_name
      FROM unit u
      LEFT JOIN building b ON b.id = u.building_id
      LEFT JOIN parcel p ON p.id = b.parcel_id
      LEFT JOIN ownership ow ON ow.building_id = b.id AND ow.is_current = true
      LEFT JOIN entity e ON e.id = ow.entity_id
      WHERE u.unit_sf < 10000  -- Smaller units more likely to be condos
        ${statusCondition}
        ${city ? 'AND LOWER(COALESCE(b.city, p.city)) LIKE LOWER($2)' : ''}
        ${q ? `AND (
          LOWER(COALESCE(b.street_address, p.situs_address)) LIKE LOWER($${city ? 3 : 2})
          OR LOWER(b.name) LIKE LOWER($${city ? 3 : 2})
        )` : ''}
      ORDER BY u.updated_at DESC
      LIMIT $1
    `, [
      limit,
      ...(city ? [`%${city}%`] : []),
      ...(q ? [`%${q}%`] : [])
    ].filter(Boolean));

    res.json({
      condos: result.rows,
      count: result.rows.length,
      note: 'Condo data not yet imported. Showing placeholder data from units table.'
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/condos/stats - Get condo statistics
router.get('/stats', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total_condos,
        COUNT(CASE WHEN u.for_sale THEN 1 END) as for_sale,
        COUNT(CASE WHEN u.for_lease THEN 1 END) as for_lease,
        AVG(u.asking_sale_price) as avg_sale_price,
        AVG(u.asking_lease_rate) as avg_lease_rate
      FROM unit u
      WHERE u.unit_sf < 10000
    `);

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
