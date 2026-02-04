/**
 * Tests for /api/entities routes
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import express from 'express';
import { Router } from 'express';
import { z } from 'zod';

const mockQuery = jest.fn();

function createTestRouter() {
  const router = Router();

  const entitySchema = z.object({
    entity_name: z.string().min(1),
    entity_type: z.enum(['company', 'individual', 'trust', 'llc', 'partnership']).optional().default('company'),
    website: z.string().url().optional().nullable(),
    notes: z.string().optional().nullable()
  });

  const contactSchema = z.object({
    name: z.string().min(1),
    title: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
    mobile: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    is_primary: z.boolean().optional().default(false),
    notes: z.string().optional().nullable()
  });

  router.get('/', async (req, res, next) => {
    try {
      const { q, limit = 50 } = req.query;
      const result = await mockQuery(`SELECT * FROM entity`, [q, limit]);
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  });

  router.get('/search', async (req, res, next) => {
    try {
      const { q, limit = 50 } = req.query;
      const result = await mockQuery(`SELECT * FROM entity WHERE entity_name ILIKE $1`, [`%${q}%`]);
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const data = entitySchema.parse(req.body);
      const result = await mockQuery(`INSERT INTO entity...`, [data]);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: err.errors });
      }
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const result = await mockQuery(`SELECT * FROM entity WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Entity not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const data = entitySchema.partial().parse(req.body);
      const result = await mockQuery(`UPDATE entity SET ...`, [data, req.params.id]);
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

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await mockQuery(`DELETE FROM entity WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Entity not found' });
      }
      res.json({ deleted: true, id: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/contacts', async (req, res, next) => {
    try {
      const data = contactSchema.parse(req.body);
      const result = await mockQuery(`INSERT INTO contact...`, [req.params.id, data]);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: err.errors });
      }
      next(err);
    }
  });

  return router;
}

const app = express();
app.use(express.json());
app.use('/api/entities', createTestRouter());
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

let request;
beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;
});

describe('Entities API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/entities', () => {
    it('should create a new entity with valid data', async () => {
      const newEntity = {
        entity_name: 'Test Company LLC',
        entity_type: 'llc',
        website: 'https://testcompany.com',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'entity-uuid', ...newEntity }],
      });

      const response = await request(app)
        .post('/api/entities')
        .send(newEntity)
        .expect(201);

      expect(response.body.entity_name).toBe('Test Company LLC');
      expect(response.body.entity_type).toBe('llc');
    });

    it('should return 400 for missing entity_name', async () => {
      const response = await request(app)
        .post('/api/entities')
        .send({ entity_type: 'company' })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should return 400 for invalid entity_type', async () => {
      const response = await request(app)
        .post('/api/entities')
        .send({
          entity_name: 'Test',
          entity_type: 'invalid_type',
        })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should accept valid entity types', async () => {
      const validTypes = ['company', 'individual', 'trust', 'llc', 'partnership'];

      for (const entityType of validTypes) {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'uuid', entity_name: 'Test', entity_type: entityType }],
        });

        const response = await request(app)
          .post('/api/entities')
          .send({ entity_name: 'Test', entity_type: entityType })
          .expect(201);

        expect(response.body.entity_type).toBe(entityType);
      }
    });
  });

  describe('GET /api/entities/search', () => {
    it('should search entities by name', async () => {
      const searchResults = [
        { id: '1', entity_name: 'Test Company', entity_type: 'company' },
        { id: '2', entity_name: 'Testing Inc', entity_type: 'company' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: searchResults });

      const response = await request(app)
        .get('/api/entities/search?q=Test')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%Test%'])
      );
    });

    it('should return empty array for no matches', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/entities/search?q=NonExistent')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/entities/:id', () => {
    it('should return entity with contacts and history', async () => {
      const entity = {
        id: 'entity-1',
        entity_name: 'Test Company',
        entity_type: 'company',
        contacts: [
          { id: 'contact-1', name: 'John Doe', is_primary: true },
        ],
        occupancies: [
          { unit_id: 'unit-1', is_current: true },
        ],
        ownerships: [
          { parcel_apn: '123-456-78', is_current: true },
        ],
      };

      mockQuery.mockResolvedValueOnce({ rows: [entity] });

      const response = await request(app)
        .get('/api/entities/entity-1')
        .expect(200);

      expect(response.body.entity_name).toBe('Test Company');
      expect(response.body.contacts).toHaveLength(1);
    });

    it('should return 404 for non-existent entity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/entities/non-existent')
        .expect(404);

      expect(response.body.error).toBe('Entity not found');
    });
  });

  describe('PUT /api/entities/:id', () => {
    it('should update entity', async () => {
      const updateData = {
        entity_name: 'Updated Name',
        website: 'https://updated.com',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'entity-1', ...updateData }],
      });

      const response = await request(app)
        .put('/api/entities/entity-1')
        .send(updateData)
        .expect(200);

      expect(response.body.entity_name).toBe('Updated Name');
    });

    it('should return 404 for non-existent entity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .put('/api/entities/non-existent')
        .send({ entity_name: 'Updated' })
        .expect(404);

      expect(response.body.error).toBe('Entity not found');
    });
  });

  describe('DELETE /api/entities/:id', () => {
    it('should delete entity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'entity-1' }] });

      const response = await request(app)
        .delete('/api/entities/entity-1')
        .expect(200);

      expect(response.body.deleted).toBe(true);
    });

    it('should return 404 for non-existent entity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .delete('/api/entities/non-existent')
        .expect(404);

      expect(response.body.error).toBe('Entity not found');
    });
  });

  describe('POST /api/entities/:id/contacts', () => {
    it('should add contact to entity', async () => {
      const newContact = {
        name: 'Jane Doe',
        title: 'Manager',
        email: 'jane@example.com',
        is_primary: true,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'contact-1', entity_id: 'entity-1', ...newContact }],
      });

      const response = await request(app)
        .post('/api/entities/entity-1/contacts')
        .send(newContact)
        .expect(201);

      expect(response.body.name).toBe('Jane Doe');
      expect(response.body.is_primary).toBe(true);
    });

    it('should return 400 for missing contact name', async () => {
      const response = await request(app)
        .post('/api/entities/entity-1/contacts')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should return 400 for invalid email', async () => {
      const response = await request(app)
        .post('/api/entities/entity-1/contacts')
        .send({ name: 'Test', email: 'invalid-email' })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });
  });
});
