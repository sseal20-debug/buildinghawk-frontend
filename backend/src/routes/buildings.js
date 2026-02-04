import { Router } from 'express';
import { query } from '../db/connection.js';
import { z } from 'zod';

const router = Router();

// Validation schema
const buildingSchema = z.object({
  parcel_apn: z.string().min(1),
  building_name: z.string().optional().nullable(),
  building_sf: z.number().int().positive().optional().nullable(),
  year_built: z.number().int().min(1800).max(new Date().getFullYear()).optional().nullable(),
  construction_type: z.string().optional().nullable(),
  office_stories: z.number().int().min(1).max(2).optional().default(1),
  sprinklers: z.boolean().optional().default(false),
  notes: z.string().optional().nullable()
});

// POST /api/buildings - Create building
router.post('/', async (req, res, next) => {
  try {
    const data = buildingSchema.parse(req.body);

    const result = await query(`
      INSERT INTO building (
        parcel_apn, building_name, building_sf, year_built,
        construction_type, office_stories, sprinklers, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      data.parcel_apn,
      data.building_name,
      data.building_sf,
      data.year_built,
      data.construction_type,
      data.office_stories,
      data.sprinklers,
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

// GET /api/buildings/:id - Get building with units
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT
        b.*,
        vc.coverage_pct,
        p.land_sf,
        p.situs_address as parcel_address,
        COALESCE(
          json_agg(
            json_build_object(
              'id', u.id,
              'unit_number', u.unit_number,
              'street_address', u.street_address,
              'unit_sf', u.unit_sf,
              'unit_status', u.unit_status,
              'dock_doors', u.dock_doors,
              'power_amps', u.power_amps
            )
          ) FILTER (WHERE u.id IS NOT NULL),
          '[]'
        ) as units
      FROM building b
      JOIN parcel p ON p.apn = b.parcel_apn
      LEFT JOIN v_building_coverage vc ON vc.building_id = b.id
      LEFT JOIN unit u ON u.building_id = b.id
      WHERE b.id = $1
      GROUP BY b.id, vc.coverage_pct, p.land_sf, p.situs_address
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Building not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/buildings/:id - Update building
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = buildingSchema.partial().parse(req.body);

    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'parcel_apn') { // Don't allow changing parcel
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
      UPDATE building
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Building not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// DELETE /api/buildings/:id - Delete building
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      DELETE FROM building WHERE id = $1 RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Building not found' });
    }

    res.json({ deleted: true, id });
  } catch (err) {
    next(err);
  }
});

export default router;
