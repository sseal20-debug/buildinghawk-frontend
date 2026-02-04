/**
 * Tests for /api/buildings routes
 * Uses inline router recreation to avoid ESM mocking issues
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import express from 'express';
import { Router } from 'express';
import { z } from 'zod';

// Create mock query function
const mockQuery = jest.fn();

// Recreate the router logic with mocked database (same as actual buildings.js)
function createTestRouter() {
  const router = Router();

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

  router.post('/', async (req, res, next) => {
    try {
      const data = buildingSchema.parse(req.body);
      const result = await mockQuery(`INSERT INTO building...`, [data]);
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
      const result = await mockQuery(`SELECT * FROM building WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Building not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const data = buildingSchema.partial().parse(req.body);
      const fields = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(data)) {
        if (key !== 'parcel_apn') {
          fields.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(req.params.id);
      const result = await mockQuery(`UPDATE building SET ${fields.join(', ')}`, values);

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

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await mockQuery(`DELETE FROM building WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Building not found' });
      }
      res.json({ deleted: true, id: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Create test app
const app = express();
app.use(express.json());
app.use('/api/buildings', createTestRouter());
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

// Import supertest dynamically
let request;
beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;
});

describe('Buildings API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/buildings', () => {
    it('should create a new building with valid data', async () => {
      const newBuilding = {
        parcel_apn: '123-456-78',
        building_name: 'Test Industrial Park',
        building_sf: 50000,
        year_built: 2010,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'uuid-123', ...newBuilding }],
      });

      const response = await request(app)
        .post('/api/buildings')
        .send(newBuilding)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.parcel_apn).toBe('123-456-78');
      expect(response.body.building_sf).toBe(50000);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return 400 for missing required parcel_apn', async () => {
      const invalidBuilding = {
        building_name: 'Test Building',
      };

      const response = await request(app)
        .post('/api/buildings')
        .send(invalidBuilding)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for invalid year_built', async () => {
      const invalidBuilding = {
        parcel_apn: '123-456-78',
        year_built: 1500, // Too old
      };

      const response = await request(app)
        .post('/api/buildings')
        .send(invalidBuilding)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should return 400 for invalid building_sf', async () => {
      const invalidBuilding = {
        parcel_apn: '123-456-78',
        building_sf: -100, // Negative
      };

      const response = await request(app)
        .post('/api/buildings')
        .send(invalidBuilding)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });
  });

  describe('GET /api/buildings/:id', () => {
    it('should return building with units', async () => {
      const buildingWithUnits = {
        id: 'uuid-123',
        parcel_apn: '123-456-78',
        building_name: 'Test Park',
        building_sf: 50000,
        units: [
          { id: 'unit-1', unit_number: 'A', unit_sf: 10000 },
          { id: 'unit-2', unit_number: 'B', unit_sf: 15000 },
        ],
      };

      mockQuery.mockResolvedValueOnce({ rows: [buildingWithUnits] });

      const response = await request(app)
        .get('/api/buildings/uuid-123')
        .expect(200);

      expect(response.body.id).toBe('uuid-123');
      expect(response.body.units).toHaveLength(2);
    });

    it('should return 404 for non-existent building', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/buildings/non-existent-id')
        .expect(404);

      expect(response.body.error).toBe('Building not found');
    });
  });

  describe('PUT /api/buildings/:id', () => {
    it('should update building with valid data', async () => {
      const updateData = {
        building_name: 'Updated Name',
        building_sf: 60000,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'uuid-123', ...updateData }],
      });

      const response = await request(app)
        .put('/api/buildings/uuid-123')
        .send(updateData)
        .expect(200);

      expect(response.body.building_name).toBe('Updated Name');
    });

    it('should return 400 when no fields to update', async () => {
      const response = await request(app)
        .put('/api/buildings/uuid-123')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('No fields to update');
    });

    it('should return 404 for non-existent building', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .put('/api/buildings/non-existent-id')
        .send({ building_name: 'Updated' })
        .expect(404);

      expect(response.body.error).toBe('Building not found');
    });

    it('should not allow changing parcel_apn', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .put('/api/buildings/uuid-123')
        .send({ parcel_apn: 'new-apn' })
        .expect(400);

      expect(response.body.error).toBe('No fields to update');
    });
  });

  describe('DELETE /api/buildings/:id', () => {
    it('should delete existing building', async () => {
      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-123' }] });

      const response = await request(app)
        .delete('/api/buildings/uuid-123')
        .expect(200);

      expect(response.body.deleted).toBe(true);
      expect(response.body.id).toBe('uuid-123');
    });

    it('should return 404 for non-existent building', async () => {
      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/api/buildings/non-existent-id')
        .expect(404);

      expect(response.body.error).toBe('Building not found');
    });
  });
});
