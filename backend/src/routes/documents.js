import { Router } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

// Dropbox search API (building_hawk_search.py runs on port 8080)
const DROPBOX_API_URL = process.env.DROPBOX_API_URL || 'http://127.0.0.1:8080';

// GET /api/documents/search - Search addresses in Dropbox index
router.get('/search', async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const url = new URL(`${DROPBOX_API_URL}/api/search`);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', limit);

    const response = await fetch(url);

    if (!response.ok) {
      console.error('Dropbox API error:', response.status);
      return res.status(502).json({ error: 'Document search service unavailable' });
    }

    const data = await response.json();

    // Transform to consistent format
    const results = (data.results || []).map(r => ({
      address: r.address,
      file_count: r.file_count || r.files?.length || 0,
      score: r.score || 1,
    }));

    res.json({
      results,
      total: results.length,
    });
  } catch (err) {
    console.error('Documents search error:', err.message);
    // Return empty results if service unavailable (don't break the app)
    res.json({ results: [], total: 0 });
  }
});

// GET /api/documents/files - Get files for a specific address
router.get('/files', async (req, res, next) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const url = new URL(`${DROPBOX_API_URL}/api/files/${encodeURIComponent(address)}`);

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return res.json({ address, files: [], count: 0 });
      }
      return res.status(502).json({ error: 'Document service unavailable' });
    }

    const data = await response.json();

    // Transform file data
    const files = (data.files || []).map(f => ({
      path: f.path || f,
      filename: f.filename || (typeof f === 'string' ? f.split('/').pop() : 'Unknown'),
      size: f.size,
      modified: f.modified,
    }));

    res.json({
      address: data.address || address,
      files,
      count: files.length,
    });
  } catch (err) {
    console.error('Documents files error:', err.message);
    res.json({ address: req.query.address, files: [], count: 0 });
  }
});

// GET /api/documents/check - Quick check if address has documents
router.get('/check', async (req, res, next) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    // Search for exact match
    const url = new URL(`${DROPBOX_API_URL}/api/search`);
    url.searchParams.set('q', address);
    url.searchParams.set('limit', 1);

    const response = await fetch(url);

    if (!response.ok) {
      return res.json({ has_docs: false, count: 0 });
    }

    const data = await response.json();
    const match = data.results?.find(r =>
      r.address?.toLowerCase() === address.toLowerCase() ||
      r.score > 0.9
    );

    res.json({
      has_docs: !!match,
      count: match?.file_count || 0,
    });
  } catch (err) {
    console.error('Documents check error:', err.message);
    res.json({ has_docs: false, count: 0 });
  }
});

// POST /api/documents/batch-check - Check multiple addresses at once
router.post('/batch-check', async (req, res, next) => {
  try {
    const { addresses } = req.body;

    if (!addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ error: 'addresses array is required' });
    }

    // Check each address (could be optimized with a single API call if the Dropbox API supports it)
    const results = {};

    // Limit concurrent requests
    const chunks = [];
    for (let i = 0; i < addresses.length; i += 5) {
      chunks.push(addresses.slice(i, i + 5));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (address) => {
        try {
          const url = new URL(`${DROPBOX_API_URL}/api/search`);
          url.searchParams.set('q', address);
          url.searchParams.set('limit', 1);

          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            const match = data.results?.find(r => r.score > 0.8);
            results[address] = {
              has_docs: !!match,
              count: match?.file_count || 0,
            };
          } else {
            results[address] = { has_docs: false, count: 0 };
          }
        } catch {
          results[address] = { has_docs: false, count: 0 };
        }
      }));
    }

    res.json(results);
  } catch (err) {
    console.error('Batch check error:', err.message);
    res.json({});
  }
});

export default router;
