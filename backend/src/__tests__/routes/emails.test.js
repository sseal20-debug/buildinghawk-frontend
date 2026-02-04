/**
 * Tests for /api/emails routes
 * Uses inline router recreation with an in-memory SQLite DB
 */

import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import { Router } from 'express';
import { z } from 'zod';
import Database from 'better-sqlite3';

// Create in-memory SQLite database for testing
let testDb;

function setupTestDb() {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT,
      subject TEXT,
      from_addr TEXT,
      to_addr TEXT,
      cc TEXT,
      date TEXT,
      body TEXT
    );
    CREATE INDEX idx_emails_date ON emails(date);
    CREATE INDEX idx_emails_from ON emails(from_addr);
    CREATE INDEX idx_emails_to ON emails(to_addr);
    CREATE INDEX idx_emails_subject ON emails(subject);
  `);

  // Seed test data
  const insert = testDb.prepare(`
    INSERT INTO emails (subject, from_addr, to_addr, cc, date, body, source_path)
    VALUES (@subject, @from_addr, @to_addr, @cc, @date, @body, @source_path)
  `);

  const testEmails = [
    {
      subject: '1193 N Blue Gum St - Lease Proposal',
      from_addr: 'broker@cbre.com',
      to_addr: 'owner@company.com',
      cc: 'analyst@cbre.com',
      date: '2025-06-15',
      body: 'Please find attached the lease proposal for 1193 N Blue Gum St, Anaheim. The tenant is proposing $0.95 NNN PSF for 60 months.',
      source_path: 'Inbox/2025/lease_proposal.msg',
    },
    {
      subject: 'RE: 576 N Gilbert St Tour Request',
      from_addr: 'tenant@brentwood.com',
      to_addr: 'broker@cbre.com',
      cc: null,
      date: '2025-07-01',
      body: 'We would like to schedule a tour of the 229,536 SF building at 576 N Gilbert St, Fullerton.',
      source_path: 'Inbox/2025/tour_request.msg',
    },
    {
      subject: 'Market Update - Orange County Industrial',
      from_addr: 'research@cushwake.com',
      to_addr: 'broker@cbre.com',
      cc: 'team@cushwake.com',
      date: '2025-08-10',
      body: 'Q3 2025 Orange County industrial vacancy rate dropped to 2.1%. Average asking rents increased to $1.45 NNN.',
      source_path: 'Inbox/2025/market_update.msg',
    },
    {
      subject: 'Sale Comp - 400 Berry St, Brea',
      from_addr: 'broker@lee-associates.com',
      to_addr: 'owner@company.com',
      cc: null,
      date: '2024-12-20',
      body: 'The property at 400 Berry St, Brea sold for $42,500,000 ($285/SF). Cap rate 5.2%.',
      source_path: 'Inbox/2024/sale_comp.msg',
    },
    {
      subject: 'Happy Holidays!',
      from_addr: 'friend@gmail.com',
      to_addr: 'user@company.com',
      cc: null,
      date: '2024-12-25',
      body: 'Wishing you a wonderful holiday season!',
      source_path: 'Inbox/2024/holidays.msg',
    },
  ];

  for (const email of testEmails) {
    insert.run(email);
  }

  return testDb;
}

// Recreate the router logic with test database
function createTestRouter(db) {
  const router = Router();

  const searchSchema = z.object({
    q: z.string().min(1).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    subject: z.string().optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  });

  router.get('/search', (req, res, next) => {
    try {
      const params = searchSchema.parse(req.query);
      if (!db) {
        return res.status(503).json({ error: 'Email database not available' });
      }

      const conditions = [];
      const values = {};

      if (params.q) {
        conditions.push(`(body LIKE @q OR subject LIKE @q OR from_addr LIKE @q OR to_addr LIKE @q)`);
        values.q = `%${params.q}%`;
      }
      if (params.from) {
        conditions.push(`from_addr LIKE @from_addr`);
        values.from_addr = `%${params.from}%`;
      }
      if (params.to) {
        conditions.push(`to_addr LIKE @to_addr`);
        values.to_addr = `%${params.to}%`;
      }
      if (params.subject) {
        conditions.push(`subject LIKE @subject`);
        values.subject = `%${params.subject}%`;
      }
      if (params.date_from) {
        conditions.push(`date >= @date_from`);
        values.date_from = params.date_from;
      }
      if (params.date_to) {
        conditions.push(`date <= @date_to`);
        values.date_to = params.date_to;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const { total } = db.prepare(`SELECT COUNT(*) as total FROM emails ${whereClause}`).get(values);

      const rows = db.prepare(`
        SELECT id, subject, from_addr, to_addr, cc, date,
               SUBSTR(body, 1, 300) as body_snippet
        FROM emails ${whereClause}
        ORDER BY date DESC
        LIMIT @limit OFFSET @offset
      `).all({ ...values, limit: params.limit, offset: params.offset });

      res.json({ results: rows, total, limit: params.limit, offset: params.offset });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: err.errors });
      }
      next(err);
    }
  });

  router.get('/stats', (req, res, next) => {
    try {
      if (!db) {
        return res.status(503).json({ error: 'Email database not available' });
      }

      const total = db.prepare(`SELECT COUNT(*) as count FROM emails`).get();
      const dateRange = db.prepare(`SELECT MIN(date) as earliest, MAX(date) as latest FROM emails`).get();
      const topSenders = db.prepare(
        `SELECT from_addr, COUNT(*) as count FROM emails GROUP BY from_addr ORDER BY count DESC LIMIT 25`
      ).all();
      const byYear = db.prepare(
        `SELECT SUBSTR(date, 1, 4) as year, COUNT(*) as count FROM emails WHERE date IS NOT NULL GROUP BY year ORDER BY year`
      ).all();

      res.json({
        total_emails: total.count,
        date_range: dateRange,
        top_senders: topSenders,
        emails_by_year: byYear,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req, res, next) => {
    try {
      if (!db) {
        return res.status(503).json({ error: 'Email database not available' });
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid email ID' });
      }

      const row = db.prepare(`SELECT * FROM emails WHERE id = ?`).get(id);
      if (!row) {
        return res.status(404).json({ error: 'Email not found' });
      }

      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Create test app
let app;
let request;

beforeAll(async () => {
  setupTestDb();
  app = express();
  app.use(express.json());
  app.use('/api/emails', createTestRouter(testDb));
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  const supertest = await import('supertest');
  request = supertest.default;
});

afterAll(() => {
  if (testDb) testDb.close();
});

describe('Emails API', () => {
  describe('GET /api/emails/search', () => {
    it('should return all emails when no filters provided', async () => {
      const response = await request(app)
        .get('/api/emails/search')
        .expect(200);

      expect(response.body.total).toBe(5);
      expect(response.body.results).toHaveLength(5);
      expect(response.body.limit).toBe(50);
      expect(response.body.offset).toBe(0);
    });

    it('should search by full-text query', async () => {
      const response = await request(app)
        .get('/api/emails/search?q=lease')
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.results[0].subject).toContain('Lease Proposal');
    });

    it('should filter by sender', async () => {
      const response = await request(app)
        .get('/api/emails/search?from=cbre')
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.results[0].from_addr).toContain('cbre');
    });

    it('should filter by recipient', async () => {
      const response = await request(app)
        .get('/api/emails/search?to=owner')
        .expect(200);

      expect(response.body.total).toBe(2);
    });

    it('should filter by subject', async () => {
      const response = await request(app)
        .get('/api/emails/search?subject=Market Update')
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.results[0].subject).toContain('Market Update');
    });

    it('should filter by date range', async () => {
      const response = await request(app)
        .get('/api/emails/search?date_from=2025-01-01&date_to=2025-12-31')
        .expect(200);

      expect(response.body.total).toBe(3);
      for (const row of response.body.results) {
        expect(row.date >= '2025-01-01').toBe(true);
      }
    });

    it('should combine multiple filters', async () => {
      const response = await request(app)
        .get('/api/emails/search?from=cbre&date_from=2025-01-01')
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.results[0].from_addr).toContain('cbre');
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/emails/search?limit=2&offset=0')
        .expect(200);

      expect(response.body.results).toHaveLength(2);
      expect(response.body.total).toBe(5);
      expect(response.body.limit).toBe(2);

      const page2 = await request(app)
        .get('/api/emails/search?limit=2&offset=2')
        .expect(200);

      expect(page2.body.results).toHaveLength(2);
      // Ensure different results on page 2
      expect(page2.body.results[0].id).not.toBe(response.body.results[0].id);
    });

    it('should return body_snippet truncated to 300 chars', async () => {
      const response = await request(app)
        .get('/api/emails/search')
        .expect(200);

      for (const row of response.body.results) {
        expect(row.body_snippet).toBeDefined();
        expect(row.body_snippet.length).toBeLessThanOrEqual(300);
        // Full body should NOT be in list results
        expect(row.body).toBeUndefined();
      }
    });

    it('should order results by date descending', async () => {
      const response = await request(app)
        .get('/api/emails/search')
        .expect(200);

      const dates = response.body.results.map(r => r.date);
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i] >= dates[i + 1]).toBe(true);
      }
    });
  });

  describe('GET /api/emails/:id', () => {
    it('should return full email by id', async () => {
      const response = await request(app)
        .get('/api/emails/1')
        .expect(200);

      expect(response.body.id).toBe(1);
      expect(response.body.subject).toBe('1193 N Blue Gum St - Lease Proposal');
      expect(response.body.body).toContain('lease proposal');
      expect(response.body.from_addr).toBe('broker@cbre.com');
    });

    it('should return 404 for non-existent email', async () => {
      const response = await request(app)
        .get('/api/emails/9999')
        .expect(404);

      expect(response.body.error).toBe('Email not found');
    });

    it('should return 400 for invalid id', async () => {
      const response = await request(app)
        .get('/api/emails/abc')
        .expect(400);

      expect(response.body.error).toBe('Invalid email ID');
    });
  });

  describe('GET /api/emails/stats', () => {
    it('should return email statistics', async () => {
      const response = await request(app)
        .get('/api/emails/stats')
        .expect(200);

      expect(response.body.total_emails).toBe(5);
      expect(response.body.date_range).toBeDefined();
      expect(response.body.date_range.earliest).toBe('2024-12-20');
      expect(response.body.date_range.latest).toBe('2025-08-10');
      expect(response.body.top_senders).toBeDefined();
      expect(Array.isArray(response.body.top_senders)).toBe(true);
      expect(response.body.emails_by_year).toBeDefined();
    });

    it('should return top senders sorted by count', async () => {
      const response = await request(app)
        .get('/api/emails/stats')
        .expect(200);

      const senders = response.body.top_senders;
      for (let i = 0; i < senders.length - 1; i++) {
        expect(senders[i].count >= senders[i + 1].count).toBe(true);
      }
    });

    it('should return correct year breakdown', async () => {
      const response = await request(app)
        .get('/api/emails/stats')
        .expect(200);

      const years = response.body.emails_by_year;
      const y2024 = years.find(y => y.year === '2024');
      const y2025 = years.find(y => y.year === '2025');
      expect(y2024.count).toBe(2);
      expect(y2025.count).toBe(3);
    });
  });

  describe('Database unavailable', () => {
    let unavailableApp;

    beforeAll(() => {
      unavailableApp = express();
      unavailableApp.use(express.json());
      unavailableApp.use('/api/emails', createTestRouter(null));
      unavailableApp.use((err, req, res, next) => {
        res.status(err.status || 500).json({ error: err.message });
      });
    });

    it('should return 503 for search when db unavailable', async () => {
      const response = await request(unavailableApp)
        .get('/api/emails/search')
        .expect(503);

      expect(response.body.error).toBe('Email database not available');
    });

    it('should return 503 for stats when db unavailable', async () => {
      const response = await request(unavailableApp)
        .get('/api/emails/stats')
        .expect(503);

      expect(response.body.error).toBe('Email database not available');
    });

    it('should return 503 for single email when db unavailable', async () => {
      const response = await request(unavailableApp)
        .get('/api/emails/1')
        .expect(503);

      expect(response.body.error).toBe('Email database not available');
    });
  });
});
