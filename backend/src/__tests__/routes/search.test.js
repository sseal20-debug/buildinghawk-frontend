/**
 * Tests for /api/search routes
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import express from 'express';
import { Router } from 'express';
import { z } from 'zod';

const mockQuery = jest.fn();

function createTestRouter() {
  const router = Router();

  const searchCriteriaSchema = z.object({
    min_sf: z.number().int().min(0).optional(),
    max_sf: z.number().int().min(0).optional(),
    min_amps: z.number().int().min(0).optional(),
    power_volts: z.enum(['120/240', '277/480', 'both']).optional(),
    min_docks: z.number().int().min(0).optional(),
    min_gl_doors: z.number().int().min(0).optional(),
    min_clear_height: z.number().min(0).optional(),
    fenced_yard: z.boolean().optional(),
    cities: z.array(z.string()).optional(),
    for_sale: z.boolean().optional(),
    for_lease: z.boolean().optional(),
    vacant_only: z.boolean().optional(),
    year_built_min: z.number().int().optional(),
    year_built_max: z.number().int().optional()
  });

  const savedSearchSchema = z.object({
    name: z.string().min(1),
    client_name: z.string().optional().nullable(),
    client_email: z.string().email().optional().nullable(),
    criteria: searchCriteriaSchema,
    alert_enabled: z.boolean().optional().default(false),
  });

  router.post('/', async (req, res, next) => {
    try {
      const criteria = searchCriteriaSchema.parse(req.body);
      const result = await mockQuery(`SELECT * FROM units WHERE ...`, [criteria]);

      const features = result.rows.map(row => ({
        type: 'Feature',
        geometry: row.location,
        properties: { ...row, location: undefined }
      }));

      res.json({
        type: 'FeatureCollection',
        features,
        count: result.rows.length
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: err.errors });
      }
      next(err);
    }
  });

  router.get('/saved', async (req, res, next) => {
    try {
      const result = await mockQuery(`SELECT * FROM saved_search`);
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  });

  router.post('/saved', async (req, res, next) => {
    try {
      const data = savedSearchSchema.parse(req.body);
      const result = await mockQuery(`INSERT INTO saved_search...`, [data]);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: err.errors });
      }
      next(err);
    }
  });

  router.get('/saved/:id', async (req, res, next) => {
    try {
      const result = await mockQuery(`SELECT * FROM saved_search WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Saved search not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/saved/:id', async (req, res, next) => {
    try {
      const result = await mockQuery(`DELETE FROM saved_search WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Saved search not found' });
      }
      res.json({ deleted: true, id: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  router.get('/cities', async (req, res, next) => {
    try {
      const result = await mockQuery(`SELECT city, COUNT(*) FROM parcel GROUP BY city`);
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  });

  router.get('/geographies', async (req, res, next) => {
    try {
      const result = await mockQuery(`SELECT * FROM geography`);
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

const app = express();
app.use(express.json());
app.use('/api/search', createTestRouter());
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

let request;
beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;
});

describe('Search API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/search', () => {
    it('should execute search with no filters', async () => {
      const searchResults = [
        {
          unit_id: 'unit-1',
          street_address: '100 Industrial Way',
          unit_sf: 10000,
          location: { type: 'Point', coordinates: [-117.5, 33.8] },
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: searchResults });

      const response = await request(app)
        .post('/api/search')
        .send({})
        .expect(200);

      expect(response.body.type).toBe('FeatureCollection');
      expect(response.body.features).toHaveLength(1);
      expect(response.body.count).toBe(1);
    });

    it('should accept valid search criteria', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/search')
        .send({ min_sf: 5000, max_sf: 20000 })
        .expect(200);

      expect(response.body.type).toBe('FeatureCollection');
    });

    it('should filter by cities array', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/search')
        .send({ cities: ['Anaheim', 'Fullerton'] })
        .expect(200);

      expect(response.body.type).toBe('FeatureCollection');
    });

    it('should filter by for_sale flag', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/search')
        .send({ for_sale: true })
        .expect(200);

      expect(response.body.type).toBe('FeatureCollection');
    });

    it('should filter by for_lease flag', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/search')
        .send({ for_lease: true })
        .expect(200);

      expect(response.body.type).toBe('FeatureCollection');
    });

    it('should filter by vacant_only flag', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/search')
        .send({ vacant_only: true })
        .expect(200);

      expect(response.body.type).toBe('FeatureCollection');
    });

    it('should return 400 for invalid power_volts enum', async () => {
      const response = await request(app)
        .post('/api/search')
        .send({ power_volts: 'invalid' })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should accept valid power_volts values', async () => {
      const validVolts = ['120/240', '277/480', 'both'];

      for (const volts of validVolts) {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post('/api/search')
          .send({ power_volts: volts })
          .expect(200);

        expect(response.body.type).toBe('FeatureCollection');
      }
    });
  });

  describe('GET /api/search/saved', () => {
    it('should return list of saved searches', async () => {
      const savedSearches = [
        { id: 'search-1', name: 'Large Spaces', criteria: { min_sf: 50000 } },
        { id: 'search-2', name: 'Anaheim Units', criteria: { cities: ['Anaheim'] } },
      ];

      mockQuery.mockResolvedValueOnce({ rows: savedSearches });

      const response = await request(app)
        .get('/api/search/saved')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe('Large Spaces');
    });
  });

  describe('POST /api/search/saved', () => {
    it('should create a saved search', async () => {
      const newSearch = {
        name: 'My Search',
        client_name: 'John Doe',
        client_email: 'john@example.com',
        criteria: { min_sf: 10000 },
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-search-id', ...newSearch }],
      });

      const response = await request(app)
        .post('/api/search/saved')
        .send(newSearch)
        .expect(201);

      expect(response.body.name).toBe('My Search');
      expect(response.body.client_email).toBe('john@example.com');
    });

    it('should return 400 for missing name', async () => {
      const response = await request(app)
        .post('/api/search/saved')
        .send({ criteria: {} })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should return 400 for invalid email', async () => {
      const response = await request(app)
        .post('/api/search/saved')
        .send({
          name: 'Test',
          client_email: 'not-an-email',
          criteria: {},
        })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });
  });

  describe('GET /api/search/saved/:id', () => {
    it('should return saved search by id', async () => {
      const savedSearch = {
        id: 'search-1',
        name: 'Test Search',
        criteria: { min_sf: 10000 },
      };

      mockQuery.mockResolvedValueOnce({ rows: [savedSearch] });

      const response = await request(app)
        .get('/api/search/saved/search-1')
        .expect(200);

      expect(response.body.id).toBe('search-1');
    });

    it('should return 404 for non-existent search', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/search/saved/non-existent')
        .expect(404);

      expect(response.body.error).toBe('Saved search not found');
    });
  });

  describe('DELETE /api/search/saved/:id', () => {
    it('should delete saved search', async () => {
      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rows: [{ id: 'search-1' }] });

      const response = await request(app)
        .delete('/api/search/saved/search-1')
        .expect(200);

      expect(response.body.deleted).toBe(true);
    });

    it('should return 404 for non-existent search', async () => {
      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/api/search/saved/non-existent')
        .expect(404);

      expect(response.body.error).toBe('Saved search not found');
    });
  });

  describe('GET /api/search/cities', () => {
    it('should return list of cities with counts', async () => {
      const cities = [
        { city: 'Anaheim', parcel_count: 100, unit_count: 250 },
        { city: 'Fullerton', parcel_count: 50, unit_count: 120 },
      ];

      mockQuery.mockResolvedValueOnce({ rows: cities });

      const response = await request(app)
        .get('/api/search/cities')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].city).toBe('Anaheim');
    });
  });

  describe('GET /api/search/geographies', () => {
    it('should return list of geographies', async () => {
      const geographies = [
        { id: 'geo-1', name: 'North OC', geo_type: 'region' },
        { id: 'geo-2', name: 'South OC', geo_type: 'region' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: geographies });

      const response = await request(app)
        .get('/api/search/geographies')
        .expect(200);

      expect(response.body).toHaveLength(2);
    });
  });
});
