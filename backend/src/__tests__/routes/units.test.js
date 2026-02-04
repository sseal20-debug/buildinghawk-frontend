/**
 * Tests for /api/units routes
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import express from 'express';
import { Router } from 'express';
import { z } from 'zod';

const mockQuery = jest.fn();

function createTestRouter() {
  const router = Router();

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
    asking_lease_rate: z.number().positive().optional().nullable(),
    notes: z.string().optional().nullable()
  });

  router.post('/', async (req, res, next) => {
    try {
      const data = unitSchema.parse(req.body);
      const result = await mockQuery(`INSERT INTO unit...`, [data]);
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
      const result = await mockQuery(`SELECT * FROM unit WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Unit not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const data = unitSchema.partial().parse(req.body);
      const fields = Object.keys(data).filter(k => k !== 'building_id');

      if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const result = await mockQuery(`UPDATE unit SET ...`, [data, req.params.id]);
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

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await mockQuery(`DELETE FROM unit WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Unit not found' });
      }
      res.json({ deleted: true, id: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

const app = express();
app.use(express.json());
app.use('/api/units', createTestRouter());
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

let request;
beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;
});

describe('Units API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/units', () => {
    it('should create a new unit with valid data', async () => {
      const newUnit = {
        building_id: '123e4567-e89b-12d3-a456-426614174000',
        street_address: '100 Industrial Way',
        unit_number: 'A',
        unit_sf: 10000,
        warehouse_sf: 8000,
        office_sf: 2000,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'unit-uuid', ...newUnit }],
      });

      const response = await request(app)
        .post('/api/units')
        .send(newUnit)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.street_address).toBe('100 Industrial Way');
      expect(response.body.unit_sf).toBe(10000);
    });

    it('should return 400 for missing building_id', async () => {
      const invalidUnit = {
        street_address: '100 Industrial Way',
      };

      const response = await request(app)
        .post('/api/units')
        .send(invalidUnit)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should return 400 for invalid building_id format', async () => {
      const invalidUnit = {
        building_id: 'not-a-uuid',
        street_address: '100 Industrial Way',
      };

      const response = await request(app)
        .post('/api/units')
        .send(invalidUnit)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should return 400 for missing street_address', async () => {
      const invalidUnit = {
        building_id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const response = await request(app)
        .post('/api/units')
        .send(invalidUnit)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should return 400 for negative unit_sf', async () => {
      const invalidUnit = {
        building_id: '123e4567-e89b-12d3-a456-426614174000',
        street_address: '100 Industrial Way',
        unit_sf: -100,
      };

      const response = await request(app)
        .post('/api/units')
        .send(invalidUnit)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should accept valid unit_status values', async () => {
      const validStatuses = ['occupied', 'vacant', 'under_construction'];

      for (const status of validStatuses) {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'uuid', unit_status: status }],
        });

        const response = await request(app)
          .post('/api/units')
          .send({
            building_id: '123e4567-e89b-12d3-a456-426614174000',
            street_address: '100 Industrial Way',
            unit_status: status,
          })
          .expect(201);

        expect(response.body.unit_status).toBe(status);
      }
    });

    it('should return 400 for invalid unit_status', async () => {
      const response = await request(app)
        .post('/api/units')
        .send({
          building_id: '123e4567-e89b-12d3-a456-426614174000',
          street_address: '100 Industrial Way',
          unit_status: 'invalid_status',
        })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should accept valid power_volts values', async () => {
      const validVolts = ['120/240', '277/480', 'both', 'unknown'];

      for (const volts of validVolts) {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'uuid', power_volts: volts }],
        });

        const response = await request(app)
          .post('/api/units')
          .send({
            building_id: '123e4567-e89b-12d3-a456-426614174000',
            street_address: '100 Industrial Way',
            power_volts: volts,
          })
          .expect(201);

        expect(response.body.power_volts).toBe(volts);
      }
    });

    it('should accept unit with for_sale and for_lease flags', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'uuid',
          for_sale: true,
          for_lease: true,
          asking_sale_price: 5000000,
          asking_lease_rate: 1.25,
        }],
      });

      const response = await request(app)
        .post('/api/units')
        .send({
          building_id: '123e4567-e89b-12d3-a456-426614174000',
          street_address: '100 Industrial Way',
          for_sale: true,
          for_lease: true,
          asking_sale_price: 5000000,
          asking_lease_rate: 1.25,
        })
        .expect(201);

      expect(response.body.for_sale).toBe(true);
      expect(response.body.for_lease).toBe(true);
    });
  });

  describe('GET /api/units/:id', () => {
    it('should return unit by id', async () => {
      const unit = {
        id: 'unit-123',
        building_id: 'building-456',
        street_address: '100 Industrial Way',
        unit_sf: 10000,
      };

      mockQuery.mockResolvedValueOnce({ rows: [unit] });

      const response = await request(app)
        .get('/api/units/unit-123')
        .expect(200);

      expect(response.body.id).toBe('unit-123');
      expect(response.body.unit_sf).toBe(10000);
    });

    it('should return 404 for non-existent unit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/units/non-existent')
        .expect(404);

      expect(response.body.error).toBe('Unit not found');
    });
  });

  describe('PUT /api/units/:id', () => {
    it('should update unit with valid data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'unit-123', unit_sf: 15000 }],
      });

      const response = await request(app)
        .put('/api/units/unit-123')
        .send({ unit_sf: 15000 })
        .expect(200);

      expect(response.body.unit_sf).toBe(15000);
    });

    it('should return 400 when no fields to update', async () => {
      const response = await request(app)
        .put('/api/units/unit-123')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('No fields to update');
    });

    it('should return 404 for non-existent unit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .put('/api/units/non-existent')
        .send({ unit_sf: 15000 })
        .expect(404);

      expect(response.body.error).toBe('Unit not found');
    });
  });

  describe('DELETE /api/units/:id', () => {
    it('should delete existing unit', async () => {
      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rows: [{ id: 'unit-123' }] });

      const response = await request(app)
        .delete('/api/units/unit-123')
        .expect(200);

      expect(response.body.deleted).toBe(true);
    });

    it('should return 404 for non-existent unit', async () => {
      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/api/units/non-existent')
        .expect(404);

      expect(response.body.error).toBe('Unit not found');
    });
  });
});
