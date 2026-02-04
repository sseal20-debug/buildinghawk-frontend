import { Router } from 'express';
import { query } from '../db/connection.js';
import { z } from 'zod';

const router = Router();

// Validation schema
const unitSchema = z.object({
  building_id: z.string().uuid(),
  unit_number: z.string().optional().nullable(),
  street_address: z.string().min(1),
  unit_sf: z.number().int().positive().optional().nullable(),
  warehouse_sf: z.number().int().min(0).optional().nullable(),
  office_sf: z.number().int().min(0).optional().nullable(),
  clear_height_ft: z.number().positive().optional().nullable(),
  dock_doors: z.number().int().min(0).optional().default(0),
  gl_doors: z.number().int().min(0).optional().default(0),
  power_amps: z.number().int().positive().optional().nullable(),
  power_volts: z.enum(['120/240', '277/480', 'both', 'unknown']).optional().default('unknown'),
  fenced_yard: z.boolean().optional().default(false),
  yard_sf: z.number().int().min(0).optional().nullable(),
  unit_status: z.enum(['occupied', 'vacant', 'under_construction']).optional().default('vacant'),
  for_sale: z.boolean().optional().default(false),
  for_lease: z.boolean().optional().default(false),
  asking_sale_price: z.number().positive().optional().nullable(),
  asking_sale_price_psf: z.number().positive().optional().nullable(),
  asking_lease_rate: z.number().positive().optional().nullable(),
  notes: z.string().optional().nullable()
});

// POST /api/units - Create unit
router.post('/', async (req, res, next) => {
  try {
    const data = unitSchema.parse(req.body);

    const result = await query(`
      INSERT INTO unit (
        building_id, unit_number, street_address, unit_sf,
        warehouse_sf, office_sf, clear_height_ft, dock_doors,
        gl_doors, power_amps, power_volts, fenced_yard, yard_sf,
        unit_status, for_sale, for_lease, asking_sale_price,
        asking_sale_price_psf, asking_lease_rate, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `, [
      data.building_id,
      data.unit_number,
      data.street_address,
      data.unit_sf,
      data.warehouse_sf,
      data.office_sf,
      data.clear_height_ft,
      data.dock_doors,
      data.gl_doors,
      data.power_amps,
      data.power_volts,
      data.fenced_yard,
      data.yard_sf,
      data.unit_status,
      data.for_sale,
      data.for_lease,
      data.asking_sale_price,
      data.asking_sale_price_psf,
      data.asking_lease_rate,
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

// GET /api/units/:id - Get unit with current occupancy
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT
        u.*,
        b.building_name,
        b.year_built,
        b.building_sf as total_building_sf,
        p.apn,
        p.situs_address as parcel_address,
        p.city,
        p.land_sf,
        json_build_object(
          'id', o.id,
          'entity_id', o.entity_id,
          'entity_name', e.entity_name,
          'occupant_type', o.occupant_type,
          'lease_start', o.lease_start,
          'lease_expiration', o.lease_expiration,
          'rent_psf_month', o.rent_psf_month,
          'rent_total_month', o.rent_total_month,
          'lease_type', o.lease_type,
          'nnn_fees_month', o.nnn_fees_month,
          'market_status', o.market_status
        ) FILTER (WHERE o.id IS NOT NULL) as current_occupancy
      FROM unit u
      JOIN building b ON b.id = u.building_id
      JOIN parcel p ON p.apn = b.parcel_apn
      LEFT JOIN occupancy o ON o.unit_id = u.id AND o.is_current = true
      LEFT JOIN entity e ON e.id = o.entity_id
      WHERE u.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/units/:id/history - Get unit change history
router.get('/:id/history', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;

    // Get audit log entries for this unit
    const auditResult = await query(`
      SELECT
        timestamp,
        action,
        field_name,
        old_value,
        new_value
      FROM audit_log
      WHERE table_name = 'unit' AND record_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [id, limit]);

    // Get occupancy history
    const occupancyResult = await query(`
      SELECT
        o.*,
        e.entity_name
      FROM occupancy o
      JOIN entity e ON e.id = o.entity_id
      WHERE o.unit_id = $1
      ORDER BY o.lease_start DESC NULLS LAST, o.created_at DESC
    `, [id]);

    res.json({
      changes: auditResult.rows,
      occupancy_history: occupancyResult.rows
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/units/:id - Update unit
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = unitSchema.partial().parse(req.body);

    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'building_id') { // Don't allow changing building
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
      UPDATE unit
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// DELETE /api/units/:id - Delete unit
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      DELETE FROM unit WHERE id = $1 RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    res.json({ deleted: true, id });
  } catch (err) {
    next(err);
  }
});

export default router;
