import { Router } from 'express';
import { query } from '../db/connection.js';
import { z } from 'zod';

const router = Router();

// Validation schema
const ownershipSchema = z.object({
  building_id: z.string().uuid(),
  entity_id: z.string().uuid(),
  purchase_date: z.string().optional().nullable(),
  purchase_price: z.number().min(0).optional().nullable(),
  purchase_price_psf: z.number().min(0).optional().nullable(),
  land_price_psf: z.number().min(0).optional().nullable(),
  notes: z.string().optional().nullable()
});

// POST /api/ownership - Create ownership record
router.post('/', async (req, res, next) => {
  try {
    const data = ownershipSchema.parse(req.body);

    // Mark previous ownership as not current
    await query(`
      UPDATE ownership SET is_current = false WHERE building_id = $1 AND is_current = true
    `, [data.building_id]);

    const result = await query(`
      INSERT INTO ownership (
        building_id, entity_id, purchase_date, purchase_price,
        purchase_price_psf, land_price_psf, is_current, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, $7)
      RETURNING *
    `, [
      data.building_id,
      data.entity_id,
      data.purchase_date,
      data.purchase_price,
      data.purchase_price_psf,
      data.land_price_psf,
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

// GET /api/ownership/building/:buildingId - Get ownership history for building
router.get('/building/:buildingId', async (req, res, next) => {
  try {
    const { buildingId } = req.params;

    const result = await query(`
      SELECT
        o.*,
        e.entity_name,
        e.entity_type,
        vc.coverage_pct,
        CASE
          WHEN vc.coverage_pct < 45 THEN true
          ELSE false
        END as show_land_price
      FROM ownership o
      JOIN entity e ON e.id = o.entity_id
      LEFT JOIN v_building_coverage vc ON vc.building_id = o.building_id
      WHERE o.building_id = $1
      ORDER BY o.purchase_date DESC NULLS LAST, o.created_at DESC
    `, [buildingId]);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/ownership/:id - Get single ownership record
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT
        o.*,
        e.entity_name,
        e.entity_type,
        b.building_name,
        b.building_sf,
        p.situs_address,
        p.city,
        vc.coverage_pct,
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
      FROM ownership o
      JOIN entity e ON e.id = o.entity_id
      JOIN building b ON b.id = o.building_id
      JOIN parcel p ON p.apn = b.parcel_apn
      LEFT JOIN v_building_coverage vc ON vc.building_id = o.building_id
      LEFT JOIN contact c ON c.entity_id = e.id
      WHERE o.id = $1
      GROUP BY o.id, e.entity_name, e.entity_type, b.building_name, b.building_sf,
               p.situs_address, p.city, vc.coverage_pct
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ownership record not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/ownership/:id - Update ownership
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = ownershipSchema.partial().parse(req.body);

    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (!['building_id', 'entity_id'].includes(key)) {
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
      UPDATE ownership
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ownership record not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

export default router;
