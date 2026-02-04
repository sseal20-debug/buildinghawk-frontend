import { Router } from 'express';
import { query } from '../db/connection.js';
import { z } from 'zod';

const router = Router();

// Validation schema
const occupancySchema = z.object({
  unit_id: z.string().uuid(),
  entity_id: z.string().uuid(),
  occupant_type: z.enum(['owner_user', 'tenant', 'investor']),
  lease_start: z.string().optional().nullable(),
  lease_expiration: z.string().optional().nullable(),
  rent_psf_month: z.number().min(0).optional().nullable(),
  rent_total_month: z.number().min(0).optional().nullable(),
  lease_type: z.enum(['nnn', 'gross', 'modified_gross']).optional().nullable(),
  nnn_fees_month: z.number().min(0).optional().nullable(),
  market_status: z.enum(['stable', 'relocation', 'growth', 'expansion', 'contraction']).optional().default('stable'),
  notes: z.string().optional().nullable()
});

// POST /api/occupancy - Create occupancy record
router.post('/', async (req, res, next) => {
  try {
    const data = occupancySchema.parse(req.body);

    // Mark previous occupancy as not current
    await query(`
      UPDATE occupancy SET is_current = false WHERE unit_id = $1 AND is_current = true
    `, [data.unit_id]);

    // Update unit status to occupied
    await query(`
      UPDATE unit SET unit_status = 'occupied' WHERE id = $1
    `, [data.unit_id]);

    const result = await query(`
      INSERT INTO occupancy (
        unit_id, entity_id, occupant_type, lease_start, lease_expiration,
        rent_psf_month, rent_total_month, lease_type, nnn_fees_month,
        market_status, is_current, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)
      RETURNING *
    `, [
      data.unit_id,
      data.entity_id,
      data.occupant_type,
      data.lease_start,
      data.lease_expiration,
      data.rent_psf_month,
      data.rent_total_month,
      data.lease_type,
      data.nnn_fees_month,
      data.market_status,
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

// GET /api/occupancy/:id - Get occupancy with entity details
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT
        o.*,
        e.entity_name,
        e.entity_type,
        u.street_address,
        u.unit_sf,
        json_agg(
          json_build_object(
            'id', c.id,
            'name', c.name,
            'title', c.title,
            'email', c.email,
            'mobile', c.mobile,
            'is_primary', c.is_primary
          )
        ) FILTER (WHERE c.id IS NOT NULL) as contacts
      FROM occupancy o
      JOIN entity e ON e.id = o.entity_id
      JOIN unit u ON u.id = o.unit_id
      LEFT JOIN contact c ON c.entity_id = e.id
      WHERE o.id = $1
      GROUP BY o.id, e.entity_name, e.entity_type, u.street_address, u.unit_sf
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Occupancy record not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/occupancy/:id - Update occupancy
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = occupancySchema.partial().parse(req.body);

    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (!['unit_id', 'entity_id'].includes(key)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);

    const result = await query(`
      UPDATE occupancy
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Occupancy record not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// POST /api/occupancy/:id/vacate - Mark tenant as vacated
router.post('/:id/vacate', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get the unit_id first
    const occResult = await query(`
      SELECT unit_id FROM occupancy WHERE id = $1
    `, [id]);

    if (occResult.rows.length === 0) {
      return res.status(404).json({ error: 'Occupancy record not found' });
    }

    const unitId = occResult.rows[0].unit_id;

    // Mark occupancy as not current
    await query(`
      UPDATE occupancy SET is_current = false WHERE id = $1
    `, [id]);

    // Mark unit as vacant
    await query(`
      UPDATE unit SET unit_status = 'vacant' WHERE id = $1
    `, [unitId]);

    res.json({ success: true, message: 'Tenant vacated' });
  } catch (err) {
    next(err);
  }
});

// GET /api/occupancy/expiring - Get upcoming lease expirations
router.get('/reports/expiring', async (req, res, next) => {
  try {
    const { days = 180 } = req.query;

    const result = await query(`
      SELECT * FROM v_lease_expirations
      WHERE days_until_expiration <= $1
        AND days_until_expiration >= 0
      ORDER BY days_until_expiration
    `, [days]);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/occupancy/in-market - Get tenants in the market
router.get('/reports/in-market', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        o.*,
        e.entity_name,
        u.street_address,
        u.unit_sf,
        p.city,
        c.name as primary_contact,
        c.mobile as contact_mobile,
        c.email as contact_email
      FROM occupancy o
      JOIN entity e ON e.id = o.entity_id
      JOIN unit u ON u.id = o.unit_id
      JOIN building b ON b.id = u.building_id
      JOIN parcel p ON p.apn = b.parcel_apn
      LEFT JOIN contact c ON c.entity_id = e.id AND c.is_primary = true
      WHERE o.is_current = true
        AND o.market_status IN ('relocation', 'growth', 'expansion', 'contraction')
      ORDER BY o.market_status, e.entity_name
    `);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

export default router;
