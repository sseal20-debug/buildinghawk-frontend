import { Router } from 'express';
import { query } from '../db/connection.js';
import { z } from 'zod';

const router = Router();

// Validation schema
const alertSchema = z.object({
  alert_type: z.enum(['call', 'email', 'follow_up', 'lease_expiration', 'search_match']),
  alert_date: z.string(),  // ISO date string
  entity_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  unit_id: z.string().uuid().optional().nullable(),
  saved_search_id: z.string().uuid().optional().nullable(),
  note: z.string().optional().nullable()
});

// GET /api/alerts - List alerts
router.get('/', async (req, res, next) => {
  try {
    const {
      completed = 'false',
      upcoming_days = 30,
      limit = 100
    } = req.query;

    const showCompleted = completed === 'true';

    const result = await query(`
      SELECT
        a.*,
        e.entity_name,
        c.name as contact_name,
        c.mobile as contact_mobile,
        c.email as contact_email,
        u.street_address as unit_address,
        u.unit_sf
      FROM alert a
      LEFT JOIN entity e ON e.id = a.entity_id
      LEFT JOIN contact c ON c.id = a.contact_id
      LEFT JOIN unit u ON u.id = a.unit_id
      WHERE ($1 = true OR a.is_completed = false)
        AND (a.alert_date <= NOW() + INTERVAL '1 day' * $2 OR a.is_completed = true)
      ORDER BY
        a.is_completed ASC,
        a.alert_date ASC
      LIMIT $3
    `, [showCompleted, upcoming_days, limit]);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/alerts/today - Get today's alerts
router.get('/today', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        a.*,
        e.entity_name,
        c.name as contact_name,
        c.mobile as contact_mobile,
        c.email as contact_email,
        u.street_address as unit_address
      FROM alert a
      LEFT JOIN entity e ON e.id = a.entity_id
      LEFT JOIN contact c ON c.id = a.contact_id
      LEFT JOIN unit u ON u.id = a.unit_id
      WHERE a.is_completed = false
        AND DATE(a.alert_date) <= CURRENT_DATE
      ORDER BY a.alert_date ASC
    `);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/alerts/overdue - Get overdue alerts
router.get('/overdue', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        a.*,
        e.entity_name,
        c.name as contact_name,
        c.mobile as contact_mobile,
        u.street_address as unit_address
      FROM alert a
      LEFT JOIN entity e ON e.id = a.entity_id
      LEFT JOIN contact c ON c.id = a.contact_id
      LEFT JOIN unit u ON u.id = a.unit_id
      WHERE a.is_completed = false
        AND a.alert_date < NOW()
      ORDER BY a.alert_date ASC
    `);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/alerts - Create alert
router.post('/', async (req, res, next) => {
  try {
    const data = alertSchema.parse(req.body);

    const result = await query(`
      INSERT INTO alert (
        alert_type, alert_date, entity_id, contact_id,
        unit_id, saved_search_id, note
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      data.alert_type,
      data.alert_date,
      data.entity_id,
      data.contact_id,
      data.unit_id,
      data.saved_search_id,
      data.note
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// PUT /api/alerts/:id - Update alert
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = alertSchema.partial().parse(req.body);

    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    values.push(id);

    const result = await query(`
      UPDATE alert
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// POST /api/alerts/:id/complete - Mark alert as completed
router.post('/:id/complete', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      UPDATE alert
      SET is_completed = true, completed_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/alerts/:id/snooze - Snooze alert to a new date
router.post('/:id/snooze', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { new_date } = req.body;

    if (!new_date) {
      return res.status(400).json({ error: 'new_date is required' });
    }

    const result = await query(`
      UPDATE alert
      SET alert_date = $1
      WHERE id = $2
      RETURNING *
    `, [new_date, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/alerts/:id - Delete alert
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      DELETE FROM alert WHERE id = $1 RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ deleted: true, id });
  } catch (err) {
    next(err);
  }
});

export default router;
