import { Router } from 'express';
import { z } from 'zod';
import Database from 'better-sqlite3';
import path from 'path';

const router = Router();

let db = null;

/**
 * Get or open the SQLite database connection (lazy singleton).
 * Reads OUTLOOK_DB_PATH at call time so dotenv has loaded.
 * Returns null if the database file doesn't exist.
 */
function getDb() {
  if (db) return db;
  try {
    const dbPath = process.env.OUTLOOK_DB_PATH ||
      path.resolve('../../OutlookSearch/all_mail_v2.db');
    console.log('[emails] Opening SQLite DB:', dbPath);
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const count = db.prepare('SELECT COUNT(*) as c FROM emails').get();
    console.log(`[emails] Connected - ${count.c} emails available`);
    return db;
  } catch (err) {
    console.error('[emails] Failed to open email database:', err.message);
    return null;
  }
}

// Validation schemas
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

// GET /api/emails/search - Search emails
router.get('/search', (req, res, next) => {
  try {
    const params = searchSchema.parse(req.query);
    const emailDb = getDb();
    if (!emailDb) {
      return res.status(503).json({
        error: 'Email database not available',
        detail: 'Outlook email database is not configured or accessible',
      });
    }

    const conditions = [];
    const values = {};

    if (params.q) {
      conditions.push(
        `(body LIKE @q OR subject LIKE @q OR from_addr LIKE @q OR to_addr LIKE @q)`
      );
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

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countStmt = emailDb.prepare(
      `SELECT COUNT(*) as total FROM emails ${whereClause}`
    );
    const { total } = countStmt.get(values);

    // Get results (exclude full body for list view, include snippet)
    const stmt = emailDb.prepare(`
      SELECT id, subject, from_addr, to_addr, cc, date,
             SUBSTR(body, 1, 300) as body_snippet
      FROM emails
      ${whereClause}
      ORDER BY date DESC
      LIMIT @limit OFFSET @offset
    `);

    const rows = stmt.all({ ...values, limit: params.limit, offset: params.offset });

    res.json({
      results: rows,
      total,
      limit: params.limit,
      offset: params.offset,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// GET /api/emails/stats - Email archive statistics
// NOTE: Must be before /:id to avoid "stats" matching as an id param
router.get('/stats', (req, res, next) => {
  try {
    const emailDb = getDb();
    if (!emailDb) {
      return res.status(503).json({
        error: 'Email database not available',
      });
    }

    const total = emailDb
      .prepare(`SELECT COUNT(*) as count FROM emails`)
      .get();

    const dateRange = emailDb
      .prepare(`SELECT MIN(date) as earliest, MAX(date) as latest FROM emails`)
      .get();

    const topSenders = emailDb
      .prepare(
        `SELECT from_addr, COUNT(*) as count FROM emails
         GROUP BY from_addr ORDER BY count DESC LIMIT 25`
      )
      .all();

    const byYear = emailDb
      .prepare(
        `SELECT SUBSTR(date, 1, 4) as year, COUNT(*) as count FROM emails
         WHERE date IS NOT NULL
         GROUP BY year ORDER BY year`
      )
      .all();

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

// GET /api/emails/:id - Get single email with full body
router.get('/:id', (req, res, next) => {
  try {
    const emailDb = getDb();
    if (!emailDb) {
      return res.status(503).json({
        error: 'Email database not available',
      });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid email ID' });
    }

    const stmt = emailDb.prepare(`SELECT * FROM emails WHERE id = ?`);
    const row = stmt.get(id);

    if (!row) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json(row);
  } catch (err) {
    next(err);
  }
});

export default router;
