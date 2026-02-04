/**
 * Mock API responses for testing
 */

import { vi } from 'vitest';

// Sample test data
export const mockBuilding = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  parcel_apn: '123-456-78',
  building_name: 'Test Industrial Park',
  building_sf: 50000,
  year_built: 2010,
  construction_type: 'tilt-up',
  units: [
    {
      id: 'unit-1',
      unit_number: 'A',
      street_address: '100 Industrial Way',
      unit_sf: 10000,
      unit_status: 'occupied',
    },
    {
      id: 'unit-2',
      unit_number: 'B',
      street_address: '102 Industrial Way',
      unit_sf: 15000,
      unit_status: 'vacant',
    },
  ],
};

export const mockEntity = {
  id: 'entity-123',
  entity_name: 'Test Company LLC',
  entity_type: 'llc',
  website: 'https://testcompany.com',
  contacts: [
    {
      id: 'contact-1',
      name: 'John Doe',
      title: 'CEO',
      email: 'john@testcompany.com',
      is_primary: true,
    },
  ],
};

export const mockSearchResults = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-117.5, 33.8] },
      properties: {
        unit_id: 'unit-1',
        street_address: '100 Industrial Way',
        unit_sf: 10000,
        city: 'Anaheim',
      },
    },
  ],
  count: 1,
};

export const mockCities = [
  { city: 'Anaheim', parcel_count: 100, unit_count: 250 },
  { city: 'Fullerton', parcel_count: 50, unit_count: 120 },
  { city: 'Buena Park', parcel_count: 30, unit_count: 80 },
];

// Mock API client
export const createMockApiClient = () => ({
  buildings: {
    get: vi.fn().mockResolvedValue(mockBuilding),
    create: vi.fn().mockResolvedValue(mockBuilding),
    update: vi.fn().mockResolvedValue(mockBuilding),
    delete: vi.fn().mockResolvedValue({ deleted: true }),
  },
  entities: {
    get: vi.fn().mockResolvedValue(mockEntity),
    search: vi.fn().mockResolvedValue([mockEntity]),
    create: vi.fn().mockResolvedValue(mockEntity),
    update: vi.fn().mockResolvedValue(mockEntity),
    delete: vi.fn().mockResolvedValue({ deleted: true }),
  },
  search: {
    execute: vi.fn().mockResolvedValue(mockSearchResults),
    getCities: vi.fn().mockResolvedValue(mockCities),
    getSaved: vi.fn().mockResolvedValue([]),
    createSaved: vi.fn().mockResolvedValue({ id: 'saved-1' }),
  },
});
