import { Router } from 'express';
import { query } from '../db/connection.js';
import { z } from 'zod';

const router = Router();

// Validation schemas
const entitySchema = z.object({
  entity_name: z.string().min(1),
  entity_type: z.enum(['company', 'individual', 'trust', 'llc', 'partnership']).optional().default('company'),
  website: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable()
});

const contactSchema = z.object({
  entity_id: z.string().uuid(),
  name: z.string().min(1),
  title: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  mobile: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  is_primary: z.boolean().optional().default(false),
  notes: z.string().optional().nullable()
});

// GET /api/entities - List/search entities
router.get('/', async (req, res, next) => {
  try {
    const { q, limit = 50 } = req.query;

    let result;
    if (q && q.length >= 2) {
      result = await query(`
        SELECT
          e.*,
          COUNT(DISTINCT own.id) FILTER (WHERE own.is_current) as properties_owned,
          COUNT(DISTINCT occ.id) FILTER (WHERE occ.is_current) as properties_occupied
        FROM entity e
        LEFT JOIN ownership own ON own.entity_id = e.id
        LEFT JOIN occupancy occ ON occ.entity_id = e.id
        WHERE to_tsvector('english', e.entity_name) @@ plainto_tsquery('english', $1)
           OR e.entity_name ILIKE $2
        GROUP BY e.id
        ORDER BY e.entity_name
        LIMIT $3
      `, [q, `%${q}%`, limit]);
    } else {
      result = await query(`
        SELECT
          e.*,
          COUNT(DISTINCT own.id) FILTER (WHERE own.is_current) as properties_owned,
          COUNT(DISTINCT occ.id) FILTER (WHERE occ.is_current) as properties_occupied
        FROM entity e
        LEFT JOIN ownership own ON own.entity_id = e.id
        LEFT JOIN occupancy occ ON occ.entity_id = e.id
        GROUP BY e.id
        ORDER BY e.updated_at DESC
        LIMIT $1
      `, [limit]);
    }

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/entities - Create entity
router.post('/', async (req, res, next) => {
  try {
    const data = entitySchema.parse(req.body);

    const result = await query(`
      INSERT INTO entity (entity_name, entity_type, website, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [data.entity_name, data.entity_type, data.website, data.notes]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// GET /api/entities/:id - Get entity with portfolio
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get entity
    const entityResult = await query(`
      SELECT * FROM entity WHERE id = $1
    `, [id]);

    if (entityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Get contacts
    const contactsResult = await query(`
      SELECT * FROM contact WHERE entity_id = $1 ORDER BY is_primary DESC, name
    `, [id]);

    // Get portfolio (owned + occupied properties)
    const portfolioResult = await query(`
      SELECT * FROM v_entity_portfolio WHERE entity_id = $1 ORDER BY is_current DESC, address
    `, [id]);

    res.json({
      ...entityResult.rows[0],
      contacts: contactsResult.rows,
      portfolio: portfolioResult.rows
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/entities/:id - Update entity
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = entitySchema.partial().parse(req.body);

    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);

    const result = await query(`
      UPDATE entity
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// DELETE /api/entities/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      DELETE FROM entity WHERE id = $1 RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json({ deleted: true, id });
  } catch (err) {
    next(err);
  }
});

// === CONTACTS ===

// POST /api/entities/:id/contacts - Add contact to entity
router.post('/:id/contacts', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = contactSchema.parse({ ...req.body, entity_id: id });

    // If this is primary, unset other primaries
    if (data.is_primary) {
      await query(`UPDATE contact SET is_primary = false WHERE entity_id = $1`, [id]);
    }

    const result = await query(`
      INSERT INTO contact (entity_id, name, title, email, mobile, phone, is_primary, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [id, data.name, data.title, data.email, data.mobile, data.phone, data.is_primary, data.notes]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// PUT /api/entities/:entityId/contacts/:contactId - Update contact
router.put('/:entityId/contacts/:contactId', async (req, res, next) => {
  try {
    const { entityId, contactId } = req.params;
    const data = contactSchema.partial().parse(req.body);

    // If setting as primary, unset others
    if (data.is_primary) {
      await query(`UPDATE contact SET is_primary = false WHERE entity_id = $1 AND id != $2`, [entityId, contactId]);
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'entity_id') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    values.push(contactId);
    values.push(entityId);

    const result = await query(`
      UPDATE contact
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex} AND entity_id = $${paramIndex + 1}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// DELETE /api/entities/:entityId/contacts/:contactId
router.delete('/:entityId/contacts/:contactId', async (req, res, next) => {
  try {
    const { entityId, contactId } = req.params;

    const result = await query(`
      DELETE FROM contact WHERE id = $1 AND entity_id = $2 RETURNING id
    `, [contactId, entityId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ deleted: true, id: contactId });
  } catch (err) {
    next(err);
  }
});

export default router;
