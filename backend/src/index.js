import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import parcelsRouter from './routes/parcels.js';
import buildingsRouter from './routes/buildings.js';
import unitsRouter from './routes/units.js';
import entitiesRouter from './routes/entities.js';
import occupancyRouter from './routes/occupancy.js';
import ownershipRouter from './routes/ownership.js';
import searchRouter from './routes/search.js';
import placesRouter from './routes/places.js';
import alertsRouter from './routes/alerts.js';
import documentsRouter from './routes/documents.js';
import propertiesRouter from './routes/properties.js';
import crmRouter from './routes/crm.js';
import compsRouter from './routes/comps.js';
import saleAlertsRouter from './routes/sale-alerts.js';
import hotsheetRouter from './routes/hotsheet.js';
import roadsRouter from './routes/roads.js';
import emailsRouter from './routes/emails.js';
import tenantsRouter from './routes/tenants.js';
import listingsRouter from './routes/listings.js';
import warnAlertsRouter from './routes/warn-alerts.js';
import addressDocumentsRouter from './routes/address-documents.js';
import { requireAuth } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [
        process.env.FRONTEND_URL,
        'https://buildinghawk.com',
        'https://www.buildinghawk.com',
        'https://buildinghawk-frontend.vercel.app'
      ].filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Auth gate (checks APP_PASSWORD env var; skips /health)
app.use(requireAuth);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth check endpoint (goes through requireAuth middleware above)
app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: true });
});

// API Routes
app.use('/api/parcels', parcelsRouter);
app.use('/api/buildings', buildingsRouter);
app.use('/api/units', unitsRouter);
app.use('/api/entities', entitiesRouter);
app.use('/api/occupancy', occupancyRouter);
app.use('/api/ownership', ownershipRouter);
app.use('/api/search', searchRouter);
app.use('/api/places', placesRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/properties', propertiesRouter);
app.use('/api/crm', crmRouter);
app.use('/api/comps', compsRouter);
app.use('/api/sale-alerts', saleAlertsRouter);
app.use('/api/hotsheet', hotsheetRouter);
app.use('/api/roads', roadsRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/listings', listingsRouter);
app.use('/api/warn-alerts', warnAlertsRouter);
app.use('/api/address-documents', addressDocumentsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Duplicate entry',
      message: err.detail
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Foreign key violation',
      message: err.detail
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
