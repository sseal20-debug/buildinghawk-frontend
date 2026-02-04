import { Router } from 'express';
import { query } from '../db/connection.js';
import { z } from 'zod';

const router = Router();

// For now, return mock data based on existing entities with ownership
// Later we'll add a proper crm_entity table

// GET /api/crm - List CRM entities (prospects/clients)
router.get('/', async (req, res, next) => {
  try {
    const { crm_type, looking, recently_added, city, sf_min, sf_max, limit = 100 } = req.query;

    // For now, we'll derive CRM data from entities that have ownership records
    // Owners with recent purchases = prospects
    // Owners with multiple properties = clients

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Build query to get entities with their associated property locations
    const result = await query(`
      SELECT DISTINCT
        e.id,
        e.id as entity_id,
        e.entity_name,
        e.entity_type,
        e.notes,
        e.created_at,
        -- Location from most recent owned property
        (
          SELECT ST_Y(ST_Centroid(p.geometry))
          FROM ownership o
          JOIN building b ON b.id = o.building_id
          JOIN parcel p ON p.apn = b.parcel_apn
          WHERE o.entity_id = e.id AND o.is_current = true
          LIMIT 1
        ) as lat,
        (
          SELECT ST_X(ST_Centroid(p.geometry))
          FROM ownership o
          JOIN building b ON b.id = o.building_id
          JOIN parcel p ON p.apn = b.parcel_apn
          WHERE o.entity_id = e.id AND o.is_current = true
          LIMIT 1
        ) as lng,
        (
          SELECT p.situs_address
          FROM ownership o
          JOIN building b ON b.id = o.building_id
          JOIN parcel p ON p.apn = b.parcel_apn
          WHERE o.entity_id = e.id AND o.is_current = true
          LIMIT 1
        ) as address,
        (
          SELECT p.city
          FROM ownership o
          JOIN building b ON b.id = o.building_id
          JOIN parcel p ON p.apn = b.parcel_apn
          WHERE o.entity_id = e.id AND o.is_current = true
          LIMIT 1
        ) as city,
        -- Count owned properties to determine client vs prospect
        (
          SELECT COUNT(*)
          FROM ownership o
          WHERE o.entity_id = e.id AND o.is_current = true
        ) as properties_count,
        -- Get primary contact info
        (
          SELECT c.name FROM contact c WHERE c.entity_id = e.id AND c.is_primary = true LIMIT 1
        ) as primary_contact_name,
        (
          SELECT c.mobile FROM contact c WHERE c.entity_id = e.id AND c.is_primary = true LIMIT 1
        ) as primary_contact_phone,
        (
          SELECT c.email FROM contact c WHERE c.entity_id = e.id AND c.is_primary = true LIMIT 1
        ) as primary_contact_email,
        -- Derive CRM type: entities with 2+ properties are clients, others are prospects
        CASE
          WHEN (SELECT COUNT(*) FROM ownership o WHERE o.entity_id = e.id AND o.is_current = true) >= 2 THEN 'client'
          ELSE 'prospect'
        END as crm_type,
        -- Assume all are "looking" for demo purposes
        true as is_looking
      FROM entity e
      WHERE EXISTS (
        SELECT 1 FROM ownership o WHERE o.entity_id = e.id AND o.is_current = true
      )
      ORDER BY e.entity_name
      LIMIT $1
    `, [limit]);

    // Filter by CRM type if specified
    let filteredResults = result.rows;
    if (crm_type) {
      filteredResults = filteredResults.filter(r => r.crm_type === crm_type);
    }

    // Filter out entities without location data
    filteredResults = filteredResults.filter(r => r.lat && r.lng);

    res.json(filteredResults);
  } catch (err) {
    next(err);
  }
});

// GET /api/crm/:id - Get single CRM entity
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT
        e.*,
        (SELECT COUNT(*) FROM ownership o WHERE o.entity_id = e.id AND o.is_current = true) >= 2 as is_client
      FROM entity e
      WHERE e.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const entity = result.rows[0];
    entity.crm_type = entity.is_client ? 'client' : 'prospect';

    res.json(entity);
  } catch (err) {
    next(err);
  }
});

// POST /api/crm/:id/convert - Convert prospect to client
router.post('/:id/convert', async (req, res, next) => {
  try {
    const { id } = req.params;

    // In a real implementation, this would update a crm_type field
    // For now, just return success
    res.json({ success: true, message: 'Prospect converted to client', id });
  } catch (err) {
    next(err);
  }
});

export default router;
