/**
 * Tests for Zod validation schemas used in forms
 * These test the business logic without rendering components
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Entity validation schema (same as in EntityForm)
const contactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  title: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  mobile: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  is_primary: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});

const entityFormSchema = z.object({
  entity_name: z.string().min(1, 'Entity name is required'),
  entity_type: z.enum(['company', 'individual', 'trust', 'llc', 'partnership']).default('company'),
  website: z.string().url().optional().or(z.literal('')).nullable(),
  notes: z.string().optional().nullable(),
  contacts: z.array(contactSchema).default([]),
});

// Building validation schema
const buildingSchema = z.object({
  parcel_apn: z.string().min(1),
  building_name: z.string().optional().nullable(),
  building_sf: z.number().int().positive().optional().nullable(),
  year_built: z.number().int().min(1800).max(new Date().getFullYear()).optional().nullable(),
  construction_type: z.string().optional().nullable(),
  office_stories: z.number().int().min(1).max(2).optional().default(1),
  sprinklers: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
});

// Search criteria schema
const searchCriteriaSchema = z.object({
  min_sf: z.number().int().min(0).optional(),
  max_sf: z.number().int().min(0).optional(),
  min_amps: z.number().int().min(0).optional(),
  power_volts: z.enum(['120/240', '277/480', 'both']).optional(),
  min_docks: z.number().int().min(0).optional(),
  cities: z.array(z.string()).optional(),
  for_sale: z.boolean().optional(),
  for_lease: z.boolean().optional(),
  vacant_only: z.boolean().optional(),
});

describe('Entity Form Validation', () => {
  it('should accept valid entity data', () => {
    const validEntity = {
      entity_name: 'Test Company LLC',
      entity_type: 'llc',
      website: 'https://testcompany.com',
    };

    const result = entityFormSchema.safeParse(validEntity);
    expect(result.success).toBe(true);
  });

  it('should reject missing entity_name', () => {
    const invalidEntity = {
      entity_type: 'company',
    };

    const result = entityFormSchema.safeParse(invalidEntity);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('entity_name');
    }
  });

  it('should reject invalid entity_type', () => {
    const invalidEntity = {
      entity_name: 'Test',
      entity_type: 'invalid_type',
    };

    const result = entityFormSchema.safeParse(invalidEntity);
    expect(result.success).toBe(false);
  });

  it('should accept valid entity types', () => {
    const validTypes = ['company', 'individual', 'trust', 'llc', 'partnership'];

    for (const entityType of validTypes) {
      const result = entityFormSchema.safeParse({
        entity_name: 'Test',
        entity_type: entityType,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should validate contact email format', () => {
    const invalidContact = {
      name: 'John Doe',
      email: 'not-an-email',
    };

    const result = contactSchema.safeParse(invalidContact);
    expect(result.success).toBe(false);
  });

  it('should accept valid contact with email', () => {
    const validContact = {
      name: 'John Doe',
      email: 'john@example.com',
      is_primary: true,
    };

    const result = contactSchema.safeParse(validContact);
    expect(result.success).toBe(true);
  });

  it('should accept contact with empty email', () => {
    const contact = {
      name: 'John Doe',
      email: '',
    };

    const result = contactSchema.safeParse(contact);
    expect(result.success).toBe(true);
  });
});

describe('Building Validation', () => {
  it('should accept valid building data', () => {
    const validBuilding = {
      parcel_apn: '123-456-78',
      building_name: 'Test Industrial Park',
      building_sf: 50000,
      year_built: 2010,
    };

    const result = buildingSchema.safeParse(validBuilding);
    expect(result.success).toBe(true);
  });

  it('should reject missing parcel_apn', () => {
    const invalidBuilding = {
      building_name: 'Test Building',
    };

    const result = buildingSchema.safeParse(invalidBuilding);
    expect(result.success).toBe(false);
  });

  it('should reject invalid year_built (too old)', () => {
    const invalidBuilding = {
      parcel_apn: '123-456-78',
      year_built: 1500,
    };

    const result = buildingSchema.safeParse(invalidBuilding);
    expect(result.success).toBe(false);
  });

  it('should reject invalid year_built (future)', () => {
    const invalidBuilding = {
      parcel_apn: '123-456-78',
      year_built: 2100,
    };

    const result = buildingSchema.safeParse(invalidBuilding);
    expect(result.success).toBe(false);
  });

  it('should reject negative building_sf', () => {
    const invalidBuilding = {
      parcel_apn: '123-456-78',
      building_sf: -100,
    };

    const result = buildingSchema.safeParse(invalidBuilding);
    expect(result.success).toBe(false);
  });

  it('should accept building with sprinklers', () => {
    const building = {
      parcel_apn: '123-456-78',
      sprinklers: true,
    };

    const result = buildingSchema.safeParse(building);
    expect(result.success).toBe(true);
  });
});

describe('Search Criteria Validation', () => {
  it('should accept empty search criteria', () => {
    const result = searchCriteriaSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept valid square footage range', () => {
    const criteria = {
      min_sf: 5000,
      max_sf: 20000,
    };

    const result = searchCriteriaSchema.safeParse(criteria);
    expect(result.success).toBe(true);
  });

  it('should reject negative min_sf', () => {
    const criteria = {
      min_sf: -100,
    };

    const result = searchCriteriaSchema.safeParse(criteria);
    expect(result.success).toBe(false);
  });

  it('should accept valid power_volts values', () => {
    const validVolts = ['120/240', '277/480', 'both'];

    for (const volts of validVolts) {
      const result = searchCriteriaSchema.safeParse({ power_volts: volts });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid power_volts', () => {
    const criteria = {
      power_volts: 'invalid',
    };

    const result = searchCriteriaSchema.safeParse(criteria);
    expect(result.success).toBe(false);
  });

  it('should accept cities array', () => {
    const criteria = {
      cities: ['Anaheim', 'Fullerton', 'Brea'],
    };

    const result = searchCriteriaSchema.safeParse(criteria);
    expect(result.success).toBe(true);
  });

  it('should accept boolean filters', () => {
    const criteria = {
      for_sale: true,
      for_lease: true,
      vacant_only: false,
    };

    const result = searchCriteriaSchema.safeParse(criteria);
    expect(result.success).toBe(true);
  });
});

// Unit validation schema
const unitSchema = z.object({
  building_id: z.string().uuid(),
  street_address: z.string().min(1, 'Street address is required'),
  unit_number: z.string().optional().nullable(),
  unit_sf: z.number().int().positive().optional().nullable(),
  unit_status: z.enum(['vacant', 'occupied', 'unknown']).default('unknown'),
  power_volts: z.enum(['120/240', '277/480', 'both']).optional().nullable(),
  power_amps: z.number().int().positive().optional().nullable(),
  dock_doors: z.number().int().min(0).optional().nullable(),
  grade_doors: z.number().int().min(0).optional().nullable(),
  clear_height: z.number().positive().optional().nullable(),
  has_rail: z.boolean().optional().default(false),
  has_fenced_yard: z.boolean().optional().default(false),
  for_sale: z.boolean().optional().default(false),
  for_lease: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
});

// Saved search validation schema
const savedSearchSchema = z.object({
  name: z.string().min(1, 'Search name is required'),
  client_name: z.string().optional().nullable(),
  client_email: z.string().email().optional().or(z.literal('')).nullable(),
  criteria: searchCriteriaSchema,
  alert_enabled: z.boolean().optional().default(false),
});

// Lease comp validation schema
const leaseCompSchema = z.object({
  property_address: z.string().min(1, 'Property address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().length(2, 'State must be 2 characters').default('CA'),
  zip: z.string().optional().nullable(),
  tenant_name: z.string().min(1, 'Tenant name is required'),
  landlord_name: z.string().optional().nullable(),
  leased_sf: z.number().int().positive().optional().nullable(),
  lease_date: z.string().optional().nullable(),
  starting_rent_psf: z.number().positive().optional().nullable(),
  lease_structure: z.enum(['NNN', 'G', 'MG', 'IG']).optional().default('NNN'),
  lease_term_months: z.number().int().min(1).max(180).optional().nullable(),
  free_rent_months: z.number().int().min(0).optional().nullable(),
  ti_allowance_psf: z.number().min(0).optional().nullable(),
  tenant_broker: z.string().optional().nullable(),
  listing_broker: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

describe('Unit Validation', () => {
  it('should accept valid unit data', () => {
    const validUnit = {
      building_id: '123e4567-e89b-12d3-a456-426614174000',
      street_address: '100 Industrial Way',
      unit_number: 'A',
      unit_sf: 10000,
      unit_status: 'occupied',
    };

    const result = unitSchema.safeParse(validUnit);
    expect(result.success).toBe(true);
  });

  it('should reject missing building_id', () => {
    const invalidUnit = {
      street_address: '100 Industrial Way',
    };

    const result = unitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  it('should reject invalid building_id format', () => {
    const invalidUnit = {
      building_id: 'not-a-uuid',
      street_address: '100 Industrial Way',
    };

    const result = unitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  it('should reject missing street_address', () => {
    const invalidUnit = {
      building_id: '123e4567-e89b-12d3-a456-426614174000',
    };

    const result = unitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  it('should reject negative unit_sf', () => {
    const invalidUnit = {
      building_id: '123e4567-e89b-12d3-a456-426614174000',
      street_address: '100 Industrial Way',
      unit_sf: -1000,
    };

    const result = unitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  it('should accept valid unit_status values', () => {
    const validStatuses = ['vacant', 'occupied', 'unknown'];

    for (const status of validStatuses) {
      const result = unitSchema.safeParse({
        building_id: '123e4567-e89b-12d3-a456-426614174000',
        street_address: '100 Industrial Way',
        unit_status: status,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid unit_status', () => {
    const invalidUnit = {
      building_id: '123e4567-e89b-12d3-a456-426614174000',
      street_address: '100 Industrial Way',
      unit_status: 'invalid',
    };

    const result = unitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  it('should accept unit with dock and grade doors', () => {
    const unit = {
      building_id: '123e4567-e89b-12d3-a456-426614174000',
      street_address: '100 Industrial Way',
      dock_doors: 4,
      grade_doors: 2,
    };

    const result = unitSchema.safeParse(unit);
    expect(result.success).toBe(true);
  });

  it('should reject negative door counts', () => {
    const invalidUnit = {
      building_id: '123e4567-e89b-12d3-a456-426614174000',
      street_address: '100 Industrial Way',
      dock_doors: -1,
    };

    const result = unitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  it('should accept unit with boolean flags', () => {
    const unit = {
      building_id: '123e4567-e89b-12d3-a456-426614174000',
      street_address: '100 Industrial Way',
      has_rail: true,
      has_fenced_yard: true,
      for_sale: true,
      for_lease: false,
    };

    const result = unitSchema.safeParse(unit);
    expect(result.success).toBe(true);
  });
});

describe('Saved Search Validation', () => {
  it('should accept valid saved search', () => {
    const validSearch = {
      name: 'Large Warehouses',
      client_name: 'John Doe',
      client_email: 'john@example.com',
      criteria: { min_sf: 50000 },
      alert_enabled: true,
    };

    const result = savedSearchSchema.safeParse(validSearch);
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const invalidSearch = {
      criteria: { min_sf: 50000 },
    };

    const result = savedSearchSchema.safeParse(invalidSearch);
    expect(result.success).toBe(false);
  });

  it('should reject invalid client_email', () => {
    const invalidSearch = {
      name: 'Test Search',
      client_email: 'not-an-email',
      criteria: {},
    };

    const result = savedSearchSchema.safeParse(invalidSearch);
    expect(result.success).toBe(false);
  });

  it('should accept empty client_email', () => {
    const search = {
      name: 'Test Search',
      client_email: '',
      criteria: {},
    };

    const result = savedSearchSchema.safeParse(search);
    expect(result.success).toBe(true);
  });

  it('should accept saved search with complex criteria', () => {
    const search = {
      name: 'Complex Search',
      criteria: {
        min_sf: 10000,
        max_sf: 50000,
        cities: ['Anaheim', 'Fullerton'],
        for_lease: true,
        vacant_only: true,
      },
    };

    const result = savedSearchSchema.safeParse(search);
    expect(result.success).toBe(true);
  });
});

describe('Lease Comp Validation', () => {
  it('should accept valid lease comp', () => {
    const validComp = {
      property_address: '576 N Gilbert St',
      city: 'Fullerton',
      state: 'CA',
      tenant_name: 'Brentwood Home, LLC',
      landlord_name: 'DWS',
      leased_sf: 229536,
      starting_rent_psf: 0.89,
      lease_structure: 'NNN',
      lease_term_months: 120,
    };

    const result = leaseCompSchema.safeParse(validComp);
    expect(result.success).toBe(true);
  });

  it('should reject missing property_address', () => {
    const invalidComp = {
      city: 'Fullerton',
      tenant_name: 'Test Tenant',
    };

    const result = leaseCompSchema.safeParse(invalidComp);
    expect(result.success).toBe(false);
  });

  it('should reject missing city', () => {
    const invalidComp = {
      property_address: '576 N Gilbert St',
      tenant_name: 'Test Tenant',
    };

    const result = leaseCompSchema.safeParse(invalidComp);
    expect(result.success).toBe(false);
  });

  it('should reject missing tenant_name', () => {
    const invalidComp = {
      property_address: '576 N Gilbert St',
      city: 'Fullerton',
    };

    const result = leaseCompSchema.safeParse(invalidComp);
    expect(result.success).toBe(false);
  });

  it('should reject invalid state length', () => {
    const invalidComp = {
      property_address: '576 N Gilbert St',
      city: 'Fullerton',
      state: 'California', // Should be 2 chars
      tenant_name: 'Test Tenant',
    };

    const result = leaseCompSchema.safeParse(invalidComp);
    expect(result.success).toBe(false);
  });

  it('should accept valid lease_structure values', () => {
    const validStructures = ['NNN', 'G', 'MG', 'IG'];

    for (const structure of validStructures) {
      const result = leaseCompSchema.safeParse({
        property_address: '576 N Gilbert St',
        city: 'Fullerton',
        tenant_name: 'Test Tenant',
        lease_structure: structure,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject lease_term_months over 180', () => {
    const invalidComp = {
      property_address: '576 N Gilbert St',
      city: 'Fullerton',
      tenant_name: 'Test Tenant',
      lease_term_months: 200, // Max is 180 (15 years)
    };

    const result = leaseCompSchema.safeParse(invalidComp);
    expect(result.success).toBe(false);
  });

  it('should reject negative starting_rent_psf', () => {
    const invalidComp = {
      property_address: '576 N Gilbert St',
      city: 'Fullerton',
      tenant_name: 'Test Tenant',
      starting_rent_psf: -0.50,
    };

    const result = leaseCompSchema.safeParse(invalidComp);
    expect(result.success).toBe(false);
  });

  it('should accept lease comp with all optional fields', () => {
    const fullComp = {
      property_address: '576 N Gilbert St',
      city: 'Fullerton',
      state: 'CA',
      zip: '92836',
      tenant_name: 'Brentwood Home, LLC',
      landlord_name: 'DWS',
      leased_sf: 229536,
      lease_date: '2020-10-01',
      starting_rent_psf: 0.89,
      lease_structure: 'NNN',
      lease_term_months: 120,
      free_rent_months: 5,
      ti_allowance_psf: 1.00,
      tenant_broker: 'NAI Capital - Stephen Lim',
      listing_broker: 'Cushman & Wakefield - Rick Ellison',
      notes: 'Phase I lease',
    };

    const result = leaseCompSchema.safeParse(fullComp);
    expect(result.success).toBe(true);
  });
});
