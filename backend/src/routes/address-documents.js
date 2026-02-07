import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

// Local paths (dev only)
const INDEX_PATH = process.env.ADDRESS_PDFS_INDEX || 'D:/BuildingHawk_Master/AddressPDFs/address_pdfs_index.json';
const ARCHIVE_DIR = process.env.ADDRESS_PDFS_ARCHIVE || 'D:/BuildingHawk_Master/AddressPDFs/archive';

// Supabase Storage URL for production
const INDEX_URL = 'https://mcslwdnlpyxnugojmvjk.supabase.co/storage/v1/object/public/buildinghawk-data/address_pdfs_index.json';

// In-memory cache
let indexCache = null;
let indexLoadedAt = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (cloud fetch is slower)

async function loadIndex() {
  const now = Date.now();
  if (indexCache && (now - indexLoadedAt) < CACHE_TTL) {
    return indexCache;
  }

  // Try local file first (dev)
  try {
    if (fs.existsSync(INDEX_PATH)) {
      const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
      indexCache = JSON.parse(raw);
      indexLoadedAt = now;
      console.log(`Loaded address PDFs index (local): ${indexCache.total_addresses} addresses, ${indexCache.total_files} files`);
      return indexCache;
    }
  } catch (err) {
    console.warn('Local index not available:', err.message);
  }

  // Fetch from Supabase Storage (production)
  try {
    console.log('Fetching address PDFs index from Supabase Storage...');
    const response = await fetch(INDEX_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    indexCache = await response.json();
    indexLoadedAt = now;
    console.log(`Loaded address PDFs index (cloud): ${indexCache.total_addresses} addresses, ${indexCache.total_files} files`);
    return indexCache;
  } catch (err) {
    console.error('Error fetching address PDFs index from cloud:', err.message);
    return indexCache || null; // Return stale cache if available
  }
}

// Normalize an address query for matching
function normalizeQuery(query) {
  return query
    .toUpperCase()
    .replace(/[.,#]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .trim();
}

// Jaccard similarity for fuzzy matching
function jaccardSimilarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/[\s\-_]+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/[\s\-_]+/).filter(Boolean));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// Pre-load index on startup
loadIndex().catch(err => console.error('Startup index load failed:', err.message));

// GET /api/address-documents?address=...
// Returns all PDFs for an exact or fuzzy-matched address
router.get('/', async (req, res) => {
  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ error: 'address query parameter is required' });
  }

  const index = await loadIndex();
  if (!index) {
    return res.json({ files: [], file_count: 0, message: 'Index not available' });
  }

  const normalized = normalizeQuery(address);

  // Exact match
  if (index.addresses[normalized]) {
    return res.json(index.addresses[normalized]);
  }

  // Fuzzy match — find best matches
  const threshold = 0.35;
  const matches = [];

  for (const [key, data] of Object.entries(index.addresses)) {
    const score = Math.max(
      jaccardSimilarity(normalized, key),
      jaccardSimilarity(address, data.display)
    );
    if (score >= threshold) {
      matches.push({ ...data, score });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  if (matches.length > 0) {
    return res.json({
      ...matches[0],
      fuzzy_match: true,
      alternatives: matches.slice(1, 5).map(m => ({
        normalized: m.normalized,
        display: m.display,
        city: m.city,
        file_count: m.file_count,
        score: m.score,
      })),
    });
  }

  res.json({ files: [], file_count: 0, message: 'No documents found' });
});

// GET /api/address-documents/search?q=...&limit=20
// Fuzzy search across all addresses
router.get('/search', async (req, res) => {
  const { q, limit = 20 } = req.query;
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const index = await loadIndex();
  if (!index) {
    return res.json({ results: [], total: 0 });
  }

  const queryLower = q.toLowerCase();
  const results = [];

  for (const [key, data] of Object.entries(index.addresses)) {
    const displayLower = (data.display || '').toLowerCase();

    let score = 0;
    if (displayLower.includes(queryLower)) {
      score = 0.9;
    } else if (key.toLowerCase().includes(normalizeQuery(q).toLowerCase())) {
      score = 0.8;
    } else {
      score = jaccardSimilarity(q, data.display);
    }

    if (score >= 0.3) {
      results.push({
        normalized: data.normalized,
        display: data.display,
        city: data.city,
        file_count: data.file_count,
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score || b.file_count - a.file_count);
  const limited = results.slice(0, parseInt(limit));

  res.json({ results: limited, total: results.length });
});

// GET /api/address-documents/file/*
// Serve a PDF from local archive (dev only, won't work on Railway)
router.get('/file/*', (req, res) => {
  const relativePath = req.params[0];
  if (!relativePath) {
    return res.status(400).json({ error: 'File path required' });
  }

  const fullPath = path.resolve(ARCHIVE_DIR, decodeURIComponent(relativePath));
  const resolvedArchive = path.resolve(ARCHIVE_DIR);

  if (!fullPath.startsWith(resolvedArchive)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found. PDF viewing available in local dev mode only.' });
  }

  const stat = fs.statSync(fullPath);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(fullPath)}"`);
  fs.createReadStream(fullPath).pipe(res);
});

// GET /api/address-documents/stats
router.get('/stats', async (req, res) => {
  const index = await loadIndex();
  if (!index) {
    return res.json({ total_addresses: 0, total_files: 0, message: 'Index not available' });
  }

  const cities = {};
  const docTypes = {};
  for (const data of Object.values(index.addresses)) {
    const city = data.city || 'Unknown';
    cities[city] = (cities[city] || 0) + data.file_count;
    for (const f of data.files) {
      const dt = f.document_type || 'unknown';
      docTypes[dt] = (docTypes[dt] || 0) + 1;
    }
  }

  res.json({
    total_addresses: index.total_addresses,
    total_files: index.total_files,
    generated_at: index.generated_at,
    cities,
    document_types: docTypes,
  });
});

// POST /api/address-documents/batch-check
router.post('/batch-check', async (req, res) => {
  const { addresses } = req.body;
  if (!addresses || !Array.isArray(addresses)) {
    return res.status(400).json({ error: 'addresses array is required' });
  }

  const index = await loadIndex();
  if (!index) {
    const result = {};
    addresses.forEach(a => { result[a] = { has_docs: false, count: 0 }; });
    return res.json(result);
  }

  const result = {};
  for (const addr of addresses) {
    const normalized = normalizeQuery(addr);

    if (index.addresses[normalized]) {
      result[addr] = {
        has_docs: true,
        count: index.addresses[normalized].file_count,
      };
    } else {
      let found = false;
      for (const [key, data] of Object.entries(index.addresses)) {
        if (jaccardSimilarity(addr, data.display) >= 0.5) {
          result[addr] = { has_docs: true, count: data.file_count };
          found = true;
          break;
        }
      }
      if (!found) {
        result[addr] = { has_docs: false, count: 0 };
      }
    }
  }

  res.json(result);
});

export default router;
