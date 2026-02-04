/**
 * Database mock for unit tests
 * Provides mock implementations of database functions
 */

import { jest } from '@jest/globals';

export const mockQuery = jest.fn();
export const mockToGeoJSON = jest.fn((column) => `ST_AsGeoJSON(${column})`);

// Sample test data
export const sampleBuilding = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  parcel_apn: '123-456-78',
  building_name: 'Test Industrial Park',
  building_sf: 50000,
  year_built: 2010,
  construction_type: 'tilt-up',
  office_stories: 1,
  sprinklers: true,
  notes: 'Test building',
};

export const sampleUnit = {
  id: '223e4567-e89b-12d3-a456-426614174001',
  building_id: '123e4567-e89b-12d3-a456-426614174000',
  unit_number: 'A',
  street_address: '100 Industrial Way',
  unit_sf: 10000,
  warehouse_sf: 8000,
  office_sf: 2000,
  clear_height_ft: 24,
  dock_doors: 2,
  gl_doors: 1,
  power_amps: 400,
  power_volts: '277/480',
  unit_status: 'occupied',
};

export const sampleEntity = {
  id: '323e4567-e89b-12d3-a456-426614174002',
  entity_name: 'Test Company LLC',
  entity_type: 'llc',
  website: 'https://testcompany.com',
  notes: 'Test entity',
};

export const sampleParcel = {
  apn: '123-456-78',
  situs_address: '100 Industrial Way',
  city: 'Anaheim',
  land_sf: 100000,
  zoning: 'M1',
};

// Mock query responses
export function setupMockQueryResponses(query) {
  query.mockImplementation((sql, params) => {
    // Extract the table being queried
    const insertMatch = sql.match(/INSERT INTO (\w+)/i);
    const selectMatch = sql.match(/FROM (\w+)/i);
    const updateMatch = sql.match(/UPDATE (\w+)/i);
    const deleteMatch = sql.match(/DELETE FROM (\w+)/i);

    if (insertMatch) {
      const table = insertMatch[1].toLowerCase();
      if (table === 'building') {
        return Promise.resolve({ rows: [{ ...sampleBuilding, ...params }] });
      }
      if (table === 'unit') {
        return Promise.resolve({ rows: [{ ...sampleUnit, ...params }] });
      }
      if (table === 'entity') {
        return Promise.resolve({ rows: [{ ...sampleEntity, ...params }] });
      }
    }

    if (selectMatch) {
      const table = selectMatch[1].toLowerCase();
      if (table === 'building') {
        return Promise.resolve({ rows: [sampleBuilding] });
      }
      if (table === 'unit') {
        return Promise.resolve({ rows: [sampleUnit] });
      }
      if (table === 'entity') {
        return Promise.resolve({ rows: [sampleEntity] });
      }
      if (table === 'parcel') {
        return Promise.resolve({ rows: [sampleParcel] });
      }
    }

    if (updateMatch || deleteMatch) {
      return Promise.resolve({ rows: [{ id: params[params.length - 1] }] });
    }

    return Promise.resolve({ rows: [] });
  });
}
