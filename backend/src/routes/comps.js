import express from 'express';
import { query } from '../db/connection.js';

const router = express.Router();

// ============================================================================
// LEASE COMPS
// ============================================================================

// Search lease comps
router.get('/lease', async (req, res, next) => {
  try {
    const {
      minSf, maxSf, minRent, maxRent,
      city, submarket, startDate, endDate,
      leaseStructure, tenant, limit = 100
    } = req.query;

    let sql = `
      SELECT * FROM lease_comp
      WHERE confidential = false
    `;
    const params = [];
    let paramIndex = 1;

    if (minSf) {
      sql += ` AND leased_sf >= $${paramIndex++}`;
      params.push(parseInt(minSf));
    }
    if (maxSf) {
      sql += ` AND leased_sf <= $${paramIndex++}`;
      params.push(parseInt(maxSf));
    }
    if (minRent) {
      sql += ` AND starting_rent_psf >= $${paramIndex++}`;
      params.push(parseFloat(minRent));
    }
    if (maxRent) {
      sql += ` AND starting_rent_psf <= $${paramIndex++}`;
      params.push(parseFloat(maxRent));
    }
    if (city) {
      sql += ` AND city ILIKE $${paramIndex++}`;
      params.push(`%${city}%`);
    }
    if (submarket) {
      sql += ` AND submarket ILIKE $${paramIndex++}`;
      params.push(`%${submarket}%`);
    }
    if (startDate) {
      sql += ` AND lease_date >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND lease_date <= $${paramIndex++}`;
      params.push(endDate);
    }
    if (leaseStructure) {
      sql += ` AND lease_structure = $${paramIndex++}`;
      params.push(leaseStructure);
    }
    if (tenant) {
      sql += ` AND tenant_name ILIKE $${paramIndex++}`;
      params.push(`%${tenant}%`);
    }

    sql += ` ORDER BY lease_date DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Get single lease comp
router.get('/lease/:id', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM lease_comp WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lease comp not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Create lease comp
router.post('/lease', async (req, res, next) => {
  try {
    const {
      property_address, city, state, zip, submarket,
      building_sf, leased_sf, office_sf, warehouse_sf,
      clear_height_ft, dock_doors, gl_doors, year_built,
      lease_date, lease_start, lease_expiration, lease_term_months,
      lease_structure, starting_rent_psf, effective_rent_psf,
      ending_rent_psf, annual_increases, free_rent_months,
      ti_allowance_psf, nnn_expenses_psf,
      tenant_name, tenant_industry, landlord_name,
      listing_broker, tenant_broker,
      source, notes, confidential
    } = req.body;

    const result = await query(`
      INSERT INTO lease_comp (
        property_address, city, state, zip, submarket,
        building_sf, leased_sf, office_sf, warehouse_sf,
        clear_height_ft, dock_doors, gl_doors, year_built,
        lease_date, lease_start, lease_expiration, lease_term_months,
        lease_structure, starting_rent_psf, effective_rent_psf,
        ending_rent_psf, annual_increases, free_rent_months,
        ti_allowance_psf, nnn_expenses_psf,
        tenant_name, tenant_industry, landlord_name,
        listing_broker, tenant_broker,
        source, notes, confidential
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33
      )
      RETURNING *
    `, [
      property_address, city, state || 'CA', zip, submarket,
      building_sf, leased_sf, office_sf, warehouse_sf,
      clear_height_ft, dock_doors, gl_doors, year_built,
      lease_date, lease_start, lease_expiration, lease_term_months,
      lease_structure, starting_rent_psf, effective_rent_psf,
      ending_rent_psf, annual_increases, free_rent_months || 0,
      ti_allowance_psf, nnn_expenses_psf,
      tenant_name, tenant_industry, landlord_name,
      listing_broker, tenant_broker,
      source || 'manual', notes, confidential || false
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Update lease comp
router.put('/lease/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'created_at') {
        setClauses.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const sql = `
      UPDATE lease_comp
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lease comp not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete lease comp
router.delete('/lease/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM lease_comp WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lease comp not found' });
    }
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// SALE COMPS
// ============================================================================

// Search sale comps
router.get('/sale', async (req, res, next) => {
  try {
    const {
      minSf, maxSf, minPrice, maxPrice, minPsf, maxPsf, minPricePsf, maxPricePsf,
      city, submarket, startDate, endDate,
      saleType, buyer, seller, limit = 100
    } = req.query;

    let sql = `
      SELECT * FROM sale_comp
      WHERE confidential = false
    `;
    const params = [];
    let paramIndex = 1;

    if (minSf) {
      sql += ` AND building_sf >= $${paramIndex++}`;
      params.push(parseInt(minSf));
    }
    if (maxSf) {
      sql += ` AND building_sf <= $${paramIndex++}`;
      params.push(parseInt(maxSf));
    }
    if (minPrice) {
      sql += ` AND sale_price >= $${paramIndex++}`;
      params.push(parseFloat(minPrice));
    }
    if (maxPrice) {
      sql += ` AND sale_price <= $${paramIndex++}`;
      params.push(parseFloat(maxPrice));
    }
    // Support both minPsf and minPricePsf for backwards compatibility
    if (minPsf || minPricePsf) {
      sql += ` AND price_psf >= $${paramIndex++}`;
      params.push(parseFloat(minPsf || minPricePsf));
    }
    if (maxPsf || maxPricePsf) {
      sql += ` AND price_psf <= $${paramIndex++}`;
      params.push(parseFloat(maxPsf || maxPricePsf));
    }
    if (city) {
      sql += ` AND city ILIKE $${paramIndex++}`;
      params.push(`%${city}%`);
    }
    if (submarket) {
      sql += ` AND submarket ILIKE $${paramIndex++}`;
      params.push(`%${submarket}%`);
    }
    if (startDate) {
      sql += ` AND sale_date >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND sale_date <= $${paramIndex++}`;
      params.push(endDate);
    }
    if (saleType) {
      sql += ` AND sale_type = $${paramIndex++}`;
      params.push(saleType);
    }
    if (buyer) {
      sql += ` AND buyer_name ILIKE $${paramIndex++}`;
      params.push(`%${buyer}%`);
    }
    if (seller) {
      sql += ` AND seller_name ILIKE $${paramIndex++}`;
      params.push(`%${seller}%`);
    }

    sql += ` ORDER BY sale_date DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Get single sale comp
router.get('/sale/:id', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM sale_comp WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sale comp not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Create sale comp
router.post('/sale', async (req, res, next) => {
  try {
    const {
      property_address, city, state, zip, submarket,
      building_sf, land_sf, land_acres, office_sf, warehouse_sf,
      clear_height_ft, dock_doors, gl_doors, year_built, building_class,
      sale_date, sale_type, sale_price, price_psf, price_per_land_sf,
      cap_rate, noi, occupancy_pct, in_place_rent_psf,
      buyer_name, buyer_type, seller_name,
      listing_broker, buyer_broker,
      down_payment_pct, loan_amount, interest_rate,
      source, notes, confidential
    } = req.body;

    const result = await query(`
      INSERT INTO sale_comp (
        property_address, city, state, zip, submarket,
        building_sf, land_sf, land_acres, office_sf, warehouse_sf,
        clear_height_ft, dock_doors, gl_doors, year_built, building_class,
        sale_date, sale_type, sale_price, price_psf, price_per_land_sf,
        cap_rate, noi, occupancy_pct, in_place_rent_psf,
        buyer_name, buyer_type, seller_name,
        listing_broker, buyer_broker,
        down_payment_pct, loan_amount, interest_rate,
        source, notes, confidential
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35
      )
      RETURNING *
    `, [
      property_address, city, state || 'CA', zip, submarket,
      building_sf, land_sf, land_acres, office_sf, warehouse_sf,
      clear_height_ft, dock_doors, gl_doors, year_built, building_class,
      sale_date, sale_type, sale_price, price_psf, price_per_land_sf,
      cap_rate, noi, occupancy_pct, in_place_rent_psf,
      buyer_name, buyer_type, seller_name,
      listing_broker, buyer_broker,
      down_payment_pct, loan_amount, interest_rate,
      source || 'manual', notes, confidential || false
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Update sale comp
router.put('/sale/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'created_at') {
        setClauses.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const sql = `
      UPDATE sale_comp
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sale comp not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete sale comp
router.delete('/sale/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM sale_comp WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sale comp not found' });
    }
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// COMP SETS
// ============================================================================

// Get all comp sets
router.get('/sets', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT cs.*,
        (SELECT COUNT(*) FROM comp_set_lease WHERE comp_set_id = cs.id) as lease_count,
        (SELECT COUNT(*) FROM comp_set_sale WHERE comp_set_id = cs.id) as sale_count
      FROM comp_set cs
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Get comp set with comps
router.get('/sets/:id', async (req, res, next) => {
  try {
    const setResult = await query('SELECT * FROM comp_set WHERE id = $1', [req.params.id]);
    if (setResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comp set not found' });
    }

    const compSet = setResult.rows[0];

    // Get associated comps based on type
    if (compSet.comp_type === 'lease') {
      const comps = await query(`
        SELECT lc.* FROM lease_comp lc
        JOIN comp_set_lease csl ON lc.id = csl.lease_comp_id
        WHERE csl.comp_set_id = $1
        ORDER BY csl.sort_order
      `, [req.params.id]);
      compSet.comps = comps.rows;
    } else {
      const comps = await query(`
        SELECT sc.* FROM sale_comp sc
        JOIN comp_set_sale css ON sc.id = css.sale_comp_id
        WHERE css.comp_set_id = $1
        ORDER BY css.sort_order
      `, [req.params.id]);
      compSet.comps = comps.rows;
    }

    res.json(compSet);
  } catch (err) {
    next(err);
  }
});

// Create comp set
router.post('/sets', async (req, res, next) => {
  try {
    const {
      name, description, comp_type, created_by,
      criteria, subject_address, subject_sf,
      subject_asking_rent, subject_asking_price,
      comp_ids
    } = req.body;

    const result = await query(`
      INSERT INTO comp_set (
        name, description, comp_type, created_by,
        criteria, subject_address, subject_sf,
        subject_asking_rent, subject_asking_price
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      name, description, comp_type, created_by,
      JSON.stringify(criteria), subject_address, subject_sf,
      subject_asking_rent, subject_asking_price
    ]);

    const compSet = result.rows[0];

    // Add comps to set
    if (comp_ids && comp_ids.length > 0) {
      const table = comp_type === 'lease' ? 'comp_set_lease' : 'comp_set_sale';
      const column = comp_type === 'lease' ? 'lease_comp_id' : 'sale_comp_id';

      for (let i = 0; i < comp_ids.length; i++) {
        await query(`
          INSERT INTO ${table} (comp_set_id, ${column}, sort_order)
          VALUES ($1, $2, $3)
        `, [compSet.id, comp_ids[i], i]);
      }
    }

    res.status(201).json(compSet);
  } catch (err) {
    next(err);
  }
});

// Delete comp set
router.delete('/sets/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM comp_set WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comp set not found' });
    }
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// PROPERTY PHOTOS
// ============================================================================

// Get property photo URL for a comp
// First checks database, then falls back to Google Street View
router.get('/photo/:type/:id', async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const table = type === 'lease' ? 'lease_comp' : 'sale_comp';

    // Get comp with photo info
    const result = await query(
      `SELECT photo_url, photo_type, property_address, city, state, zip FROM ${table} WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comp not found' });
    }

    const comp = result.rows[0];

    // If we have a stored photo, return it
    if (comp.photo_url) {
      return res.json({
        url: comp.photo_url,
        type: comp.photo_type || 'uploaded',
        source: 'database'
      });
    }

    // Otherwise, generate Google Street View URL
    const address = encodeURIComponent(
      `${comp.property_address}, ${comp.city}, ${comp.state || 'CA'} ${comp.zip || ''}`
    );

    // Google Street View Static API URL
    // Note: In production, you'd use an API key from env vars
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    const streetViewUrl = googleApiKey
      ? `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${address}&key=${googleApiKey}`
      : null;

    // Google Maps embed URL (no API key needed for basic usage)
    const mapsEmbedUrl = `https://www.google.com/maps/embed/v1/place?q=${address}&key=${googleApiKey || 'AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8'}`;

    res.json({
      url: streetViewUrl,
      embedUrl: mapsEmbedUrl,
      type: 'streetview',
      source: 'google',
      address: `${comp.property_address}, ${comp.city}, ${comp.state || 'CA'} ${comp.zip || ''}`
    });
  } catch (err) {
    next(err);
  }
});

// Batch get photos for multiple comps
router.post('/photos/batch', async (req, res, next) => {
  try {
    const { type, ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }

    const table = type === 'lease' ? 'lease_comp' : 'sale_comp';

    // Get all comps with their info
    const result = await query(
      `SELECT id, photo_url, photo_type, property_address, city, state, zip
       FROM ${table}
       WHERE id = ANY($1)`,
      [ids]
    );

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || '';

    const photos = result.rows.map(comp => {
      if (comp.photo_url) {
        return {
          id: comp.id,
          url: comp.photo_url,
          type: comp.photo_type || 'uploaded',
          source: 'database'
        };
      }

      // Generate Street View URL
      const address = encodeURIComponent(
        `${comp.property_address}, ${comp.city}, ${comp.state || 'CA'} ${comp.zip || ''}`
      );

      const streetViewUrl = googleApiKey
        ? `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${address}&key=${googleApiKey}`
        : null;

      return {
        id: comp.id,
        url: streetViewUrl,
        type: 'streetview',
        source: 'google',
        address: `${comp.property_address}, ${comp.city}, ${comp.state || 'CA'} ${comp.zip || ''}`
      };
    });

    res.json(photos);
  } catch (err) {
    next(err);
  }
});

// Update comp photo
router.put('/photo/:type/:id', async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const { photo_url, photo_type } = req.body;
    const table = type === 'lease' ? 'lease_comp' : 'sale_comp';

    const result = await query(
      `UPDATE ${table} SET photo_url = $1, photo_type = $2 WHERE id = $3 RETURNING id, photo_url, photo_type`,
      [photo_url, photo_type || 'uploaded', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comp not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// STATISTICS
// ============================================================================

// Get lease comp statistics
router.get('/stats/lease', async (req, res, next) => {
  try {
    const { city, startDate, endDate, minSf, maxSf } = req.query;

    let whereClauses = ['confidential = false'];
    const params = [];
    let paramIndex = 1;

    if (city) {
      whereClauses.push(`city ILIKE $${paramIndex++}`);
      params.push(`%${city}%`);
    }
    if (startDate) {
      whereClauses.push(`lease_date >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push(`lease_date <= $${paramIndex++}`);
      params.push(endDate);
    }
    if (minSf) {
      whereClauses.push(`leased_sf >= $${paramIndex++}`);
      params.push(parseInt(minSf));
    }
    if (maxSf) {
      whereClauses.push(`leased_sf <= $${paramIndex++}`);
      params.push(parseInt(maxSf));
    }

    const result = await query(`
      SELECT
        COUNT(*) as count,
        ROUND(AVG(starting_rent_psf), 2) as avg_rent_psf,
        MIN(starting_rent_psf) as min_rent_psf,
        MAX(starting_rent_psf) as max_rent_psf,
        ROUND(AVG(leased_sf))::INTEGER as avg_sf,
        SUM(leased_sf) as total_sf,
        ROUND(AVG(lease_term_months), 1) as avg_term_months
      FROM lease_comp
      WHERE ${whereClauses.join(' AND ')}
    `, params);

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Get sale comp statistics
router.get('/stats/sale', async (req, res, next) => {
  try {
    const { city, startDate, endDate, minSf, maxSf } = req.query;

    let whereClauses = ['confidential = false'];
    const params = [];
    let paramIndex = 1;

    if (city) {
      whereClauses.push(`city ILIKE $${paramIndex++}`);
      params.push(`%${city}%`);
    }
    if (startDate) {
      whereClauses.push(`sale_date >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push(`sale_date <= $${paramIndex++}`);
      params.push(endDate);
    }
    if (minSf) {
      whereClauses.push(`building_sf >= $${paramIndex++}`);
      params.push(parseInt(minSf));
    }
    if (maxSf) {
      whereClauses.push(`building_sf <= $${paramIndex++}`);
      params.push(parseInt(maxSf));
    }

    const result = await query(`
      SELECT
        COUNT(*) as count,
        ROUND(AVG(price_psf), 2) as avg_price_psf,
        MIN(price_psf) as min_price_psf,
        MAX(price_psf) as max_price_psf,
        ROUND(AVG(cap_rate), 2) as avg_cap_rate,
        SUM(sale_price) as total_volume,
        ROUND(AVG(building_sf))::INTEGER as avg_sf
      FROM sale_comp
      WHERE ${whereClauses.join(' AND ')}
    `, params);

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// LEASE EXPIRATION NOTIFICATIONS
// ============================================================================

// Get leases expiring within specified months
router.get('/notifications/expiring', async (req, res, next) => {
  try {
    const { months = 12 } = req.query;

    const result = await query(`
      SELECT
        id,
        property_address,
        city,
        state,
        tenant_name,
        landlord_name,
        lease_expiration,
        lease_term_months,
        leased_sf,
        starting_rent_psf,
        notifications_enabled,
        notification_months,
        last_notification_date,
        EXTRACT(MONTH FROM age(lease_expiration, CURRENT_DATE)) +
        EXTRACT(YEAR FROM age(lease_expiration, CURRENT_DATE)) * 12 AS months_remaining
      FROM lease_comp
      WHERE lease_expiration IS NOT NULL
        AND lease_expiration > CURRENT_DATE
        AND lease_expiration <= CURRENT_DATE + INTERVAL '1 month' * $1
        AND confidential = false
      ORDER BY lease_expiration ASC
    `, [parseInt(months)]);

    // Group by urgency
    const expirations = {
      critical: [],    // 0-3 months
      warning: [],     // 3-6 months
      upcoming: [],    // 6-12 months
      future: []       // 12+ months
    };

    result.rows.forEach(lease => {
      const remaining = Number(lease.months_remaining);
      if (remaining <= 3) {
        expirations.critical.push(lease);
      } else if (remaining <= 6) {
        expirations.warning.push(lease);
      } else if (remaining <= 12) {
        expirations.upcoming.push(lease);
      } else {
        expirations.future.push(lease);
      }
    });

    res.json({
      total: result.rows.length,
      expirations,
      summary: {
        critical: expirations.critical.length,
        warning: expirations.warning.length,
        upcoming: expirations.upcoming.length,
        future: expirations.future.length
      }
    });
  } catch (err) {
    next(err);
  }
});

// Update notification settings for a lease
router.put('/lease/:id/notifications', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notifications_enabled, notification_months } = req.body;

    const result = await query(`
      UPDATE lease_comp
      SET
        notifications_enabled = COALESCE($1, notifications_enabled),
        notification_months = COALESCE($2, notification_months)
      WHERE id = $3
      RETURNING id, notifications_enabled, notification_months
    `, [notifications_enabled, notification_months, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lease comp not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Get notification summary (for dashboard widget)
router.get('/notifications/summary', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE lease_expiration <= CURRENT_DATE + INTERVAL '3 months') as expiring_3_months,
        COUNT(*) FILTER (WHERE lease_expiration <= CURRENT_DATE + INTERVAL '6 months') as expiring_6_months,
        COUNT(*) FILTER (WHERE lease_expiration <= CURRENT_DATE + INTERVAL '12 months') as expiring_12_months,
        COUNT(*) FILTER (WHERE notifications_enabled = true) as notifications_enabled_count,
        SUM(leased_sf) FILTER (WHERE lease_expiration <= CURRENT_DATE + INTERVAL '12 months') as sf_expiring_12_months
      FROM lease_comp
      WHERE lease_expiration IS NOT NULL
        AND lease_expiration > CURRENT_DATE
        AND confidential = false
    `);

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
