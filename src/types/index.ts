// Core entity types

export type UnitStatus = 'occupied' | 'vacant' | 'under_construction';
export type OccupantType = 'owner_user' | 'tenant' | 'investor';
export type LeaseType = 'nnn' | 'gross' | 'modified_gross';
export type MarketStatus = 'stable' | 'relocation' | 'growth' | 'expansion' | 'contraction';
export type EntityType = 'company' | 'individual' | 'trust' | 'llc' | 'partnership';
export type AlertType = 'call' | 'email' | 'follow_up' | 'lease_expiration' | 'search_match';
export type PowerVolts = '120/240' | '277/480' | 'both' | 'unknown';

export interface Parcel {
  apn: string;
  situs_address: string;
  city: string;
  zip: string;
  land_sf: number;
  zoning: string;
  assessor_owner_name?: string;
  geometry?: GeoJSON.Polygon;
  centroid?: GeoJSON.Point;
  buildings?: Building[];
  building_count?: number;
  unit_count?: number;
  vacant_count?: number;
  // Aggregated building/unit specs (from SQL JOINs)
  building_sf?: number;
  year_built?: number;
  land_use?: string;
  owner_name?: string;
  contact_name?: string;
  phone?: string;
  last_sale_price?: number;
  last_sale_date?: string;
  clear_height_ft?: number;
  dock_doors?: number;
  gl_doors?: number;
  power_amps?: number;
  power_volts?: PowerVolts;
  fenced_yard?: boolean;
  yard_sf?: number;
  office_sf?: number;
  unit_sf?: number;
  sprinklers?: boolean;
}

export interface Building {
  id: string;
  parcel_apn: string;
  building_name?: string;
  building_sf?: number;
  year_built?: number;
  construction_type?: string;
  office_stories: number;
  sprinklers: boolean;
  notes?: string;
  units?: Unit[];
  coverage_pct?: number;
}

export interface Unit {
  id: string;
  building_id: string;
  unit_number?: string;
  street_address: string;
  unit_sf?: number;
  warehouse_sf?: number;
  office_sf?: number;
  clear_height_ft?: number;
  dock_doors: number;
  gl_doors: number;
  power_amps?: number;
  power_volts: PowerVolts;
  fenced_yard: boolean;
  yard_sf?: number;
  unit_status: UnitStatus;
  for_sale: boolean;
  for_lease: boolean;
  asking_sale_price?: number;
  asking_sale_price_psf?: number;
  asking_lease_rate?: number;
  notes?: string;
  current_occupancy?: Occupancy;
}

export interface Entity {
  id: string;
  entity_name: string;
  entity_type: EntityType;
  website?: string;
  notes?: string;
  contacts?: Contact[];
  portfolio?: PortfolioItem[];
  properties_owned?: number;
  properties_occupied?: number;
}

export interface Contact {
  id: string;
  entity_id: string;
  name: string;
  title?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  is_primary: boolean;
  notes?: string;
}

export interface Occupancy {
  id: string;
  unit_id: string;
  entity_id: string;
  entity_name?: string;
  occupant_type: OccupantType;
  lease_start?: string;
  lease_expiration?: string;
  rent_psf_month?: number;
  rent_total_month?: number;
  lease_type?: LeaseType;
  nnn_fees_month?: number;
  market_status: MarketStatus;
  is_current: boolean;
  notes?: string;
}

export interface Ownership {
  id: string;
  building_id: string;
  entity_id: string;
  entity_name?: string;
  purchase_date?: string;
  purchase_price?: number;
  purchase_price_psf?: number;
  land_price_psf?: number;
  is_current: boolean;
  notes?: string;
  show_land_price?: boolean;
}

export interface Alert {
  id: string;
  alert_type: AlertType;
  alert_date: string;
  entity_id?: string;
  entity_name?: string;
  contact_id?: string;
  contact_name?: string;
  contact_mobile?: string;
  contact_email?: string;
  unit_id?: string;
  unit_address?: string;
  saved_search_id?: string;
  note?: string;
  is_completed: boolean;
  completed_at?: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  criteria: SearchCriteria;
  alert_enabled: boolean;
  last_run_at?: string;
  last_sent_at?: string;
  match_count: number;
  is_active: boolean;
  notes?: string;
}

export interface SearchCriteria {
  min_sf?: number;
  max_sf?: number;
  min_amps?: number;
  power_volts?: PowerVolts;
  min_docks?: number;
  min_gl_doors?: number;
  min_clear_height?: number;
  fenced_yard?: boolean;
  cities?: string[];
  geography_id?: string;
  for_sale?: boolean;
  for_lease?: boolean;
  vacant_only?: boolean;
  in_market_only?: boolean;
  year_built_min?: number;
  year_built_max?: number;
}

export interface PortfolioItem {
  entity_id: string;
  entity_name: string;
  relationship_type: 'ownership' | 'occupancy';
  building_id: string;
  unit_id?: string;
  address: string;
  city: string;
  sf?: number;
  purchase_date?: string;
  purchase_price?: number;
  is_current: boolean;
}

export interface GooglePlace {
  place_id: string;
  name: string;
  address: string;
  types: string[];
  business_status?: string;
  location: {
    lat: number;
    lng: number;
  };
}

// GeoJSON types for map features
export interface ParcelFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJSON.Polygon;
  properties: {
    apn: string;
    address: string;
    city: string;
    zip: string;
    land_sf: number;
    zoning: string;
    building_count: number;
    unit_count: number;
    vacant_count: number;
    centroid: GeoJSON.Point;
  };
}

export interface ParcelFeatureCollection {
  type: 'FeatureCollection';
  features: ParcelFeature[];
}

export interface SearchResultFeature {
  type: 'Feature';
  geometry: GeoJSON.Point;
  properties: Unit & {
    building_id: string;
    building_name?: string;
    total_building_sf?: number;
    year_built?: number;
    apn: string;
    city: string;
    land_sf: number;
    current_tenant?: string;
    market_status?: MarketStatus;
    lease_expiration?: string;
    occupant_type?: OccupantType;
  };
}

export interface SearchResultCollection {
  type: 'FeatureCollection';
  features: SearchResultFeature[];
  count: number;
}

// CRM Types
export type CRMType = 'prospect' | 'client';

export interface CRMEntity {
  id: string;
  entity_id: string;
  entity_name: string;
  entity_type: EntityType;
  crm_type: CRMType;
  is_looking: boolean;
  created_at: string;
  notes?: string;
  // Location for map marker (from linked building/parcel or explicit)
  lat?: number;
  lng?: number;
  address?: string;
  city?: string;
  // Requirements
  sf_min?: number;
  sf_max?: number;
  target_cities?: string[];
  // Contact info
  primary_contact_name?: string;
  primary_contact_phone?: string;
  primary_contact_email?: string;
}
