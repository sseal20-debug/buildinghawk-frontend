/**
 * Properties API Routes
 * Serves consolidated property data from Excel import and GeoJSON
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');

// Cache for property data (reloads every 5 minutes)
let propertyCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load property data from JSON file with caching
 */
function loadPropertyData() {
  const now = Date.now();
  if (propertyCache && (now - cacheTimestamp) < CACHE_TTL) {
    return propertyCache;
  }

  const filePath = path.join(DATA_DIR, 'building_hawk_all.json');
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Handle new format with properties array and autocomplete
  if (raw.properties && Array.isArray(raw.properties)) {
    propertyCache = raw;
  } else if (Array.isArray(raw)) {
    // Legacy format - just an array of properties
    propertyCache = { properties: raw, autocomplete: [], stats: { total_properties: raw.length } };
  } else {
    propertyCache = raw;
  }

  cacheTimestamp = now;
  return propertyCache;
}

/**
 * GET /api/properties/geojson
 * Returns GeoJSON feature collection for map visualization
 */
router.get('/geojson', (req, res) => {
  try {
    const data = loadPropertyData();
    if (!data) {
      return res.status(404).json({
        error: 'Property data not found.'
      });
    }

    const properties = data.properties || data;

    // Convert to GeoJSON
    const geojson = {
      type: 'FeatureCollection',
      features: properties
        .filter(p => p.latitude && p.longitude)
        .map(p => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [p.longitude, p.latitude]
          },
          properties: {
            id: p.id,
            address: p.full_address || p.address,
            city: p.city,
            state: p.state || 'CA',
            zip: p.zip,
            sqft: p.sqft,
            acreage: p.acreage,
            apn: p.apn,
            owner_name: p.owner_name,
            company: p.company,
            contact_name: p.contact_name,
            land_use: p.land_use
          }
        }))
    };

    res.setHeader('Content-Type', 'application/geo+json');
    res.json(geojson);
  } catch (error) {
    console.error('Error serving GeoJSON:', error);
    res.status(500).json({ error: 'Failed to load property data' });
  }
});

/**
 * GET /api/properties/autocomplete
 * Returns autocomplete suggestions for search
 */
router.get('/autocomplete', (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase().trim();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    if (query.length < 2) {
      return res.json([]);
    }

    const data = loadPropertyData();
    if (!data) {
      return res.json([]);
    }

    // Always search properties directly to include lat/lng coordinates
    const properties = data.properties || data;

    // Build a lookup map for quick property access by id
    const propertyById = new Map();
    properties.forEach(p => propertyById.set(p.id, p));

    // Split query into words for flexible matching
    const queryWords = query.split(/\s+/).filter(w => w.length > 0);

    let results = properties
      .filter(p => {
        const addr = (p.full_address || p.address || '').toLowerCase();
        const owner = (p.owner_name || '').toLowerCase();
        const company = (p.company || '').toLowerCase();
        const apn = (p.apn || '').toLowerCase();
        const combined = `${addr} ${owner} ${company} ${apn}`;

        // All query words must be present (flexible word matching)
        return queryWords.every(word => combined.includes(word));
      })
      .slice(0, limit)
      .map(p => ({
        id: p.id,
        label: p.full_address || p.address,
        city: p.city,
        type: 'address',
        latitude: p.latitude,
        longitude: p.longitude,
        source: 'crm_property'
      }));

    res.json(results);
  } catch (error) {
    console.error('Error serving autocomplete:', error);
    res.status(500).json({ error: 'Failed to load autocomplete data' });
  }
});

/**
 * GET /api/properties/markers
 * Returns lightweight property markers for map display (CRM Properties layer)
 */
router.get('/markers', (req, res) => {
  try {
    const data = loadPropertyData();
    if (!data) {
      return res.json([]);
    }

    const properties = data.properties || data;

    // Return lightweight markers for map
    const markers = properties
      .filter(p => p.latitude && p.longitude)
      .map(p => ({
        id: p.id,
        lat: p.latitude,
        lng: p.longitude,
        address: p.full_address || p.address,
        city: p.city,
        sqft: p.sqft,
        apn: p.apn,
        owner_name: p.owner_name,
        land_use: p.land_use,
        company: p.company || '',
        source: p.source || '',
      }));

    res.json(markers);
  } catch (error) {
    console.error('Error serving markers:', error);
    res.status(500).json({ error: 'Failed to load property markers' });
  }
});

/**
 * GET /api/properties/company-labels
 * Returns company labels from map logo import for tenant overlay
 */
router.get('/company-labels', (req, res) => {
  try {
    const data = loadPropertyData();
    if (!data) {
      return res.json([]);
    }

    const properties = data.properties || data;

    // Filter to only map_logo_import entries with company names
    const labels = properties
      .filter(p => p.latitude && p.longitude && p.company && p.source === 'map_logo_import')
      .map(p => ({
        id: p.id,
        name: p.company,
        lat: p.latitude,
        lng: p.longitude,
        address: p.full_address || p.address || '',
        city: p.city || '',
      }));

    res.json(labels);
  } catch (error) {
    console.error('Error serving company labels:', error);
    res.status(500).json({ error: 'Failed to load company labels' });
  }
});

/**
 * GET /api/properties/stats
 * Returns summary statistics
 */
router.get('/stats', (req, res) => {
  try {
    const data = loadPropertyData();

    if (!data) {
      return res.status(404).json({ error: 'Property data not found.' });
    }

    // Return pre-computed stats if available
    if (data.stats) {
      return res.json(data.stats);
    }

    const properties = data.properties || data;

    const stats = {
      total: properties.length,
      withCoordinates: properties.filter(p => p.latitude && p.longitude).length,
      withCompany: properties.filter(p => p.company).length,
      withContact: properties.filter(p => p.contact_name).length,
      withSqft: properties.filter(p => p.sqft).length,
      withApn: properties.filter(p => p.apn).length,
      cities: {},
      types: {}
    };

    properties.forEach(p => {
      if (p.city) {
        stats.cities[p.city] = (stats.cities[p.city] || 0) + 1;
      }
      if (p.land_use) {
        stats.types[p.land_use] = (stats.types[p.land_use] || 0) + 1;
      }
    });

    res.json(stats);
  } catch (error) {
    console.error('Error computing stats:', error);
    res.status(500).json({ error: 'Failed to compute statistics' });
  }
});

/**
 * GET /api/properties/cities
 * Returns list of unique cities
 */
router.get('/cities', (req, res) => {
  try {
    const data = loadPropertyData();

    if (!data) {
      return res.status(404).json({ error: 'Property data not found.' });
    }

    // Return pre-computed cities if available
    if (data.stats?.cities) {
      const cities = Array.isArray(data.stats.cities)
        ? data.stats.cities.sort()
        : Object.keys(data.stats.cities).sort();
      return res.json(cities);
    }

    const properties = data.properties || data;
    const cities = [...new Set(properties.map(p => p.city).filter(Boolean))].sort();

    res.json(cities);
  } catch (error) {
    console.error('Error getting cities:', error);
    res.status(500).json({ error: 'Failed to get cities' });
  }
});

/**
 * GET /api/properties/:id
 * Returns a single property by ID
 */
router.get('/:id', (req, res) => {
  try {
    const data = loadPropertyData();
    if (!data) {
      return res.status(404).json({ error: 'Property data not found.' });
    }

    const properties = data.properties || data;
    const property = properties.find(p => String(p.id) === req.params.id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    res.json(property);
  } catch (error) {
    console.error('Error serving property:', error);
    res.status(500).json({ error: 'Failed to load property' });
  }
});

/**
 * GET /api/properties
 * Returns all property records with optional filtering
 */
router.get('/', (req, res) => {
  try {
    const data = loadPropertyData();

    if (!data) {
      return res.status(404).json({
        error: 'Property data not found.'
      });
    }

    let filtered = data.properties || data;

    // Apply filters from query params
    if (req.query.city) {
      filtered = filtered.filter(p =>
        p.city?.toLowerCase() === req.query.city.toLowerCase()
      );
    }

    if (req.query.type || req.query.land_use) {
      const typeFilter = (req.query.type || req.query.land_use).toLowerCase();
      filtered = filtered.filter(p =>
        p.land_use?.toLowerCase().includes(typeFilter) ||
        p.landuse_category?.toLowerCase().includes(typeFilter)
      );
    }

    if (req.query.minSqft) {
      const minSqft = parseInt(req.query.minSqft);
      filtered = filtered.filter(p => p.sqft >= minSqft);
    }

    if (req.query.maxSqft) {
      const maxSqft = parseInt(req.query.maxSqft);
      filtered = filtered.filter(p => p.sqft <= maxSqft);
    }

    if (req.query.hasCoords === 'true') {
      filtered = filtered.filter(p => p.latitude && p.longitude);
    }

    if (req.query.search || req.query.q) {
      const query = (req.query.search || req.query.q).toLowerCase();
      filtered = filtered.filter(p =>
        (p.full_address || p.address || '').toLowerCase().includes(query) ||
        (p.company || '').toLowerCase().includes(query) ||
        (p.contact_name || '').toLowerCase().includes(query) ||
        (p.owner_name || '').toLowerCase().includes(query) ||
        (p.apn || '').toLowerCase().includes(query)
      );
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const offset = (page - 1) * limit;

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    res.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error serving properties:', error);
    res.status(500).json({ error: 'Failed to load property data' });
  }
});

export default router;
