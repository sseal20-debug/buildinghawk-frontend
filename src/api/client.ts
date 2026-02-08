const API_BASE = ((import.meta as any).env?.VITE_API_URL || '') + '/api';

class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getApiKey(): string | null {
  try {
    const user = localStorage.getItem('buildingHawkUser');
    if (user) {
      const parsed = JSON.parse(user);
      // Expire sessions without loginAt (legacy) or older than 7 days
      if (!parsed.loginAt || Date.now() - parsed.loginAt > SESSION_MAX_AGE_MS) {
        localStorage.removeItem('buildingHawkUser');
        window.location.reload();
        return null;
      }
      return parsed.apiKey || null;
    }
  } catch { /* ignore */ }
  return null;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Auth failed - clear session and reload to show login
    localStorage.removeItem('buildingHawkUser');
    window.location.reload();
    throw new ApiError(401, 'Unauthorized');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, error.error || error.message, error.details);
  }

  return response.json();
}

// Unified search result types
export interface UnifiedSearchResult {
  parcels: Array<{
    type: 'parcel'
    apn: string
    situs_address: string
    city: string
    zip: string
    centroid?: { coordinates: [number, number] }
  }>
  tenants: Array<{
    type: 'tenant'
    entity_id: string
    entity_name: string
    street_address: string
    city: string
    apn: string
    centroid?: { coordinates: [number, number] }
  }>
  owners: Array<{
    type: 'owner'
    entity_id: string
    entity_name: string
    street_address: string
    city: string
    apn: string
    centroid?: { coordinates: [number, number] }
  }>
  total: number
}

// Company label for tenant map overlay
export interface CompanyLabel {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address: string;
  city: string;
}

// Property marker type for map display
export interface PropertyMarker {
  id: string;
  lat: number;
  lng: number;
  address: string;
  city: string;
  building_sf?: number;
  land_sf?: number;
  is_land_only: boolean;
  building_count: number;
}

// Sale alert from deed monitor
export interface SaleAlert {
  id: string;
  watchlist_id: string;
  deed_id: string;
  alert_type: string;
  priority: 'high' | 'normal' | 'low';
  apn: string;
  address: string;
  city: string;
  sale_price: number;
  sale_date: string;
  buyer: string;
  seller: string;
  was_listed?: boolean;
  listing_price?: number;
  price_vs_listing?: number;
  assessed_value?: number;
  price_vs_assessed?: number;
  acknowledged: boolean;
  acknowledged_at?: string;
  notes?: string;
  created_at: string;
  building_sf?: number;
  lot_sf?: number;
  zoning?: string;
  price_per_sf?: number;
  centroid?: { coordinates: [number, number] };
}

export interface SaleAlertSummary {
  total_watched_parcels: number;
  currently_listed: number;
  sales_last_7_days: number;
  sales_last_30_days: number;
  unacknowledged_alerts: number;
  last_successful_run: string | null;
  total_volume_30_days: number;
}

export interface RecentSale {
  id: string;
  apn: string;
  address: string;
  city: string;
  sale_price: number;
  sale_date: string;
  buyer: string;
  seller: string;
  building_sf?: number;
  lot_sf?: number;
  lat: number;
  lng: number;
  price_per_sf?: number;
}

// CRM Property type (from Excel import)
export interface CRMProperty {
  id: number;
  full_address: string;
  street_number?: string;
  street_name?: string;
  city: string;
  state?: string;
  zip?: string;
  latitude: number;
  longitude: number;
  sqft?: number;
  acreage?: number;
  apn?: string;
  lot_number?: string;
  tract_number?: string;
  last_sale_price?: number;
  last_sale_date?: string;
  company?: string;
  contact_name?: string;
  phone?: string;
  owner_name?: string;
  land_use?: string;
  source?: string;
}

export interface CRMPropertyAutocomplete {
  id: number;
  label: string;
  city: string;
  type: 'address' | 'apn' | 'owner';
  latitude?: number;
  longitude?: number;
  source: 'crm_property';
}

// Parcels API
export const parcelsApi = {
  getInBounds: (bounds: { west: number; south: number; east: number; north: number }) =>
    request<import('@/types').ParcelFeatureCollection>(
      `/parcels?west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}&all=true`
    ),

  // Get single parcel at a specific point (for search result selection)
  getAtPoint: (lat: number, lng: number) =>
    request<import('@/types').ParcelFeatureCollection>(
      `/parcels/at-point?lat=${lat}&lng=${lng}`
    ),

  search: (query: string) =>
    request<UnifiedSearchResult>(`/parcels/search?q=${encodeURIComponent(query)}`),

  // Search parcels by street name (returns GeoJSON FeatureCollection for map highlighting)
  searchStreet: (street: string, limit = 200) =>
    request<import('@/types').ParcelFeatureCollection>(
      `/parcels/search-street?street=${encodeURIComponent(street)}&limit=${limit}`
    ),

  // Get parcels by a list of APNs (returns GeoJSON FeatureCollection)
  getByApns: (apns: string[]) =>
    request<import('@/types').ParcelFeatureCollection>(
      `/parcels/by-apns?apns=${apns.map(encodeURIComponent).join(',')}`
    ),

  getByPoints: (points: Array<{ lat: number; lng: number }>) =>
    request<import('@/types').ParcelFeatureCollection>(
      `/parcels/by-points?points=${points.map(p => `${p.lat},${p.lng}`).join('|')}`
    ),

  getByApn: (apn: string) =>
    request<import('@/types').Parcel>(`/parcels/${encodeURIComponent(apn)}`),

  updateByApn: (apn: string, data: { land_sf?: number; zoning?: string; assessor_owner_name?: string }) =>
    request<import('@/types').Parcel>(`/parcels/${encodeURIComponent(apn)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Get all properties with buildings for map markers
  getAllProperties: () =>
    request<PropertyMarker[]>('/parcels/properties'),

  // Get all land-only parcels (no buildings) for map markers
  getLandOnly: () =>
    request<PropertyMarker[]>('/parcels/land'),

  // Get parcel units within map bounds (for unit pins)
  getUnitsInBounds: (bounds: { west: number; south: number; east: number; north: number }) =>
    request<ParcelUnit[]>(
      `/parcels/units/in-bounds?west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}`
    ),

  // Get units for a specific parcel
  getUnitsForParcel: (apn: string) =>
    request<ParcelUnit[]>(`/parcels/units/${encodeURIComponent(apn)}`),

  // Classify parcels within a polygon as land or building
  classifyByPolygon: (polygon: GeoJSON.Polygon, classification: 'land' | 'building') =>
    request<{ count: number; apns: string[]; classification: string }>(
      '/parcels/classify-polygon',
      {
        method: 'POST',
        body: JSON.stringify({ polygon, classification }),
      }
    ),

  // Get all unclassified parcels for classification UI
  getUnclassified: (limit = 10000) =>
    request<{
      count: number;
      total: number;
      parcels: Array<{
        id: number;
        apn: string;
        lat: number;
        lng: number;
        address: string;
        city: string;
        sqft: number | null;
        acreage: number | null;
        owner_name: string;
        land_use: string;
      }>;
    }>(`/parcels/unclassified?limit=${limit}`),

  // Classify multiple parcels at once
  classify: (ids: (number | string)[], classification: 'building' | 'land' | 'deleted') =>
    request<{ success: boolean; count: number; classification: string }>(
      '/parcels/classify',
      {
        method: 'POST',
        body: JSON.stringify({ ids, classification }),
      }
    ),

  // Get classification statistics
  getClassificationStats: () =>
    request<{
      total: number;
      unclassified: number;
      building: number;
      land: number;
      deleted: number;
      with_coordinates: number;
      missing_coordinates: number;
    }>('/parcels/classification-stats'),
};

// Parcel unit type (from parcel_unit table)
export interface ParcelUnit {
  id: number;
  parcel_apn: string;
  unit_address: string;
  unit_number: string | null;
  latitude: number;
  longitude: number;
  city?: string;
}

// CRM Properties API (from Excel import)
export const crmPropertiesApi = {
  // Get autocomplete suggestions
  autocomplete: (query: string, limit = 20) =>
    request<CRMPropertyAutocomplete[]>(
      `/properties/autocomplete?q=${encodeURIComponent(query)}&limit=${limit}`
    ),

  // Get all property markers for map
  getMarkers: () =>
    request<Array<{
      id: number;
      lat: number;
      lng: number;
      address: string;
      city: string;
      sqft?: number;
      apn?: string;
      owner_name?: string;
      land_use?: string;
      company?: string;
      source?: string;
    }>>('/properties/markers'),

  // Get company labels for tenant map overlay
  getCompanyLabels: () =>
    request<CompanyLabel[]>('/properties/company-labels'),

  // Get single property by ID
  get: (id: number) =>
    request<CRMProperty>(`/properties/${id}`),

  // Search properties with filtering
  search: (params: {
    q?: string;
    city?: string;
    minSqft?: number;
    maxSqft?: number;
    land_use?: string;
    page?: number;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.append(key, String(value));
      }
    });
    return request<{
      data: CRMProperty[];
      pagination: { page: number; limit: number; total: number; pages: number };
    }>(`/properties?${searchParams.toString()}`);
  },

  // Get statistics
  getStats: () =>
    request<{
      total_properties: number;
      with_coordinates: number;
      with_sqft: number;
      with_apn: number;
      cities: string[];
    }>('/properties/stats'),

  // Get GeoJSON for map
  getGeoJSON: () =>
    request<GeoJSON.FeatureCollection>('/properties/geojson'),
};

// Buildings API
export const buildingsApi = {
  create: (data: Partial<import('@/types').Building>) =>
    request<import('@/types').Building>('/buildings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: string) =>
    request<import('@/types').Building>(`/buildings/${id}`),

  update: (id: string, data: Partial<import('@/types').Building>) =>
    request<import('@/types').Building>(`/buildings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ deleted: boolean }>(`/buildings/${id}`, { method: 'DELETE' }),
};

// Units API
export const unitsApi = {
  create: (data: Partial<import('@/types').Unit>) =>
    request<import('@/types').Unit>('/units', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: string) =>
    request<import('@/types').Unit>(`/units/${id}`),

  getHistory: (id: string) =>
    request<{ changes: unknown[]; occupancy_history: import('@/types').Occupancy[] }>(
      `/units/${id}/history`
    ),

  update: (id: string, data: Partial<import('@/types').Unit>) =>
    request<import('@/types').Unit>(`/units/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ deleted: boolean }>(`/units/${id}`, { method: 'DELETE' }),
};

// Entities API
export const entitiesApi = {
  list: (query?: string) =>
    request<import('@/types').Entity[]>(`/entities${query ? `?q=${encodeURIComponent(query)}` : ''}`),

  create: (data: Partial<import('@/types').Entity>) =>
    request<import('@/types').Entity>('/entities', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: string) =>
    request<import('@/types').Entity>(`/entities/${id}`),

  update: (id: string, data: Partial<import('@/types').Entity>) =>
    request<import('@/types').Entity>(`/entities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ deleted: boolean }>(`/entities/${id}`, { method: 'DELETE' }),

  addContact: (entityId: string, data: Partial<import('@/types').Contact>) =>
    request<import('@/types').Contact>(`/entities/${entityId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateContact: (entityId: string, contactId: string, data: Partial<import('@/types').Contact>) =>
    request<import('@/types').Contact>(`/entities/${entityId}/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteContact: (entityId: string, contactId: string) =>
    request<{ deleted: boolean }>(`/entities/${entityId}/contacts/${contactId}`, {
      method: 'DELETE',
    }),
};

// Occupancy API
export const occupancyApi = {
  create: (data: Partial<import('@/types').Occupancy>) =>
    request<import('@/types').Occupancy>('/occupancy', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: string) =>
    request<import('@/types').Occupancy>(`/occupancy/${id}`),

  update: (id: string, data: Partial<import('@/types').Occupancy>) =>
    request<import('@/types').Occupancy>(`/occupancy/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  vacate: (id: string) =>
    request<{ success: boolean }>(`/occupancy/${id}/vacate`, { method: 'POST' }),

  getExpiring: (days = 180) =>
    request<import('@/types').Occupancy[]>(`/occupancy/reports/expiring?days=${days}`),

  getInMarket: () =>
    request<import('@/types').Occupancy[]>('/occupancy/reports/in-market'),
};

// Ownership API
export const ownershipApi = {
  create: (data: Partial<import('@/types').Ownership>) =>
    request<import('@/types').Ownership>('/ownership', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getForBuilding: (buildingId: string) =>
    request<import('@/types').Ownership[]>(`/ownership/building/${buildingId}`),

  get: (id: string) =>
    request<import('@/types').Ownership>(`/ownership/${id}`),

  update: (id: string, data: Partial<import('@/types').Ownership>) =>
    request<import('@/types').Ownership>(`/ownership/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// Search API
export const searchApi = {
  execute: (criteria: import('@/types').SearchCriteria) =>
    request<import('@/types').SearchResultCollection>('/search', {
      method: 'POST',
      body: JSON.stringify(criteria),
    }),

  getSavedSearches: () =>
    request<import('@/types').SavedSearch[]>('/search/saved'),

  createSavedSearch: (data: Partial<import('@/types').SavedSearch>) =>
    request<import('@/types').SavedSearch>('/search/saved', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSavedSearch: (id: string) =>
    request<import('@/types').SavedSearch>(`/search/saved/${id}`),

  updateSavedSearch: (id: string, data: Partial<import('@/types').SavedSearch>) =>
    request<import('@/types').SavedSearch>(`/search/saved/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSavedSearch: (id: string) =>
    request<{ deleted: boolean }>(`/search/saved/${id}`, { method: 'DELETE' }),

  getGeographies: () =>
    request<{ id: string; name: string; geo_type: string }[]>('/search/geographies'),

  getCities: () =>
    request<{ city: string; parcel_count: number; unit_count: number }[]>('/search/cities'),
};

// Places API (Google Maps integration)
export const placesApi = {
  findNearby: (lat: number, lng: number, radius = 50) =>
    request<{ places: import('@/types').GooglePlace[]; count: number }>(
      `/places/nearby?lat=${lat}&lng=${lng}&radius=${radius}`
    ),

  getDetails: (placeId: string) =>
    request<{
      name: string;
      formatted_address: string;
      formatted_phone_number?: string;
      website?: string;
    }>(`/places/details/${placeId}`),

  autocomplete: (input: string) =>
    request<{ place_id: string; description: string }[]>(
      `/places/autocomplete?input=${encodeURIComponent(input)}`
    ),

  geocode: (params: { place_id?: string; address?: string }) =>
    request<{ lat: number; lng: number; formatted_address: string }>(
      `/places/geocode?${params.place_id ? `place_id=${encodeURIComponent(params.place_id)}` : `address=${encodeURIComponent(params.address || '')}`}`
    ),
};

// Documents API (Dropbox file index)
export const documentsApi = {
  // Search addresses in Dropbox index
  search: (query: string, limit = 20) =>
    request<{
      results: Array<{
        address: string;
        file_count: number;
        score: number;
      }>;
      total: number;
    }>(`/documents/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  // Get files for a specific address
  getFiles: (address: string) =>
    request<{
      address: string;
      files: Array<{
        path: string;
        filename: string;
        size?: number;
        modified?: string;
      }>;
      count: number;
    }>(`/documents/files?address=${encodeURIComponent(address)}`),

  // Check if address has documents (quick lookup)
  checkAddress: (address: string) =>
    request<{ has_docs: boolean; count: number }>(
      `/documents/check?address=${encodeURIComponent(address)}`
    ),

  // Batch check multiple addresses
  batchCheck: (addresses: string[]) =>
    request<Record<string, { has_docs: boolean; count: number }>>(
      '/documents/batch-check',
      {
        method: 'POST',
        body: JSON.stringify({ addresses }),
      }
    ),
};

// Address Documents API (organized PDFs from Dropbox, indexed by address)
export const addressDocumentsApi = {
  // Get all PDFs for an address (exact or fuzzy match)
  getByAddress: (address: string) =>
    request<{
      normalized: string;
      display: string;
      city?: string;
      files: Array<{
        filename: string;
        original_path: string;
        archive_path: string;
        file_size: number;
        document_type: string;
        added_date: string;
      }>;
      file_count: number;
      fuzzy_match?: boolean;
      alternatives?: Array<{
        normalized: string;
        display: string;
        city?: string;
        file_count: number;
        score: number;
      }>;
    }>(`/address-documents?address=${encodeURIComponent(address)}`),

  // Search addresses
  search: (query: string, limit = 20) =>
    request<{
      results: Array<{
        normalized: string;
        display: string;
        city?: string;
        file_count: number;
        score: number;
      }>;
      total: number;
    }>(`/address-documents/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  // Get direct URL to view a PDF
  getFileUrl: (archivePath: string) =>
    `${API_BASE}/address-documents/file/${encodeURIComponent(archivePath)}`,

  // Get system stats
  getStats: () =>
    request<{
      total_addresses: number;
      total_files: number;
      generated_at: string;
      cities: Record<string, number>;
      document_types: Record<string, number>;
    }>('/address-documents/stats'),

  // Batch check multiple addresses for document counts
  batchCheck: (addresses: string[]) =>
    request<Record<string, { has_docs: boolean; count: number }>>(
      '/address-documents/batch-check',
      {
        method: 'POST',
        body: JSON.stringify({ addresses }),
      }
    ),
};

// Alerts API
export const alertsApi = {
  list: (options?: { completed?: boolean; upcoming_days?: number }) =>
    request<import('@/types').Alert[]>(
      `/alerts?completed=${options?.completed ?? false}&upcoming_days=${options?.upcoming_days ?? 30}`
    ),

  getToday: () =>
    request<import('@/types').Alert[]>('/alerts/today'),

  getOverdue: () =>
    request<import('@/types').Alert[]>('/alerts/overdue'),

  create: (data: Partial<import('@/types').Alert>) =>
    request<import('@/types').Alert>('/alerts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<import('@/types').Alert>) =>
    request<import('@/types').Alert>(`/alerts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  complete: (id: string) =>
    request<import('@/types').Alert>(`/alerts/${id}/complete`, { method: 'POST' }),

  snooze: (id: string, newDate: string) =>
    request<import('@/types').Alert>(`/alerts/${id}/snooze`, {
      method: 'POST',
      body: JSON.stringify({ new_date: newDate }),
    }),

  delete: (id: string) =>
    request<{ deleted: boolean }>(`/alerts/${id}`, { method: 'DELETE' }),
};

// CRM API - Prospects and Clients
export const crmApi = {
  // Get all prospects
  getProspects: (filter?: {
    looking?: boolean;
    recentlyAdded?: string;
    city?: string;
    sfMin?: number;
    sfMax?: number;
  }) => {
    const params = new URLSearchParams();
    params.append('crm_type', 'prospect');
    if (filter?.looking) params.append('looking', 'true');
    if (filter?.recentlyAdded) params.append('recently_added', filter.recentlyAdded);
    if (filter?.city) params.append('city', filter.city);
    if (filter?.sfMin) params.append('sf_min', filter.sfMin.toString());
    if (filter?.sfMax) params.append('sf_max', filter.sfMax.toString());
    return request<import('@/types').CRMEntity[]>(`/crm?${params.toString()}`);
  },

  // Get all clients
  getClients: () =>
    request<import('@/types').CRMEntity[]>('/crm?crm_type=client'),

  // Get both prospects and clients
  getAll: () =>
    request<import('@/types').CRMEntity[]>('/crm'),

  // Get single CRM entity
  get: (id: string) =>
    request<import('@/types').CRMEntity>(`/crm/${id}`),

  // Create new prospect or client
  create: (data: Partial<import('@/types').CRMEntity>) =>
    request<import('@/types').CRMEntity>('/crm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update CRM entity
  update: (id: string, data: Partial<import('@/types').CRMEntity>) =>
    request<import('@/types').CRMEntity>(`/crm/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Delete CRM entity
  delete: (id: string) =>
    request<{ deleted: boolean }>(`/crm/${id}`, { method: 'DELETE' }),

  // Convert prospect to client
  convertToClient: (id: string) =>
    request<import('@/types').CRMEntity>(`/crm/${id}/convert`, { method: 'POST' }),
};

// Comps API - Lease and Sale Comparables
export interface LeaseComp {
  id: string;
  property_name?: string;
  property_address: string;
  city: string;
  state?: string;
  zip?: string;
  county?: string;
  submarket?: string;
  building_sf?: number;
  leased_sf: number;
  office_sf?: number;
  warehouse_sf?: number;
  clear_height_ft?: number;  // Clear height in feet
  clear_height?: number;  // Alias for clear_height_ft
  dock_doors?: number;  // DH doors
  dock_high_doors?: number;  // Alias for dock_doors
  gl_doors?: number;  // GL doors
  grade_level_doors?: number;  // Alias for gl_doors
  power_amps?: number;  // Amps
  sprinklers?: boolean;
  rail_served?: boolean;  // Rail
  yard?: boolean;  // Yard
  multi_tenant?: boolean;
  year_built?: number;
  property_type?: string;
  lease_date: string;
  lease_start?: string;
  lease_expiration?: string;
  lease_term_months?: number;  // Term in months (1-180 for 15 yr max)
  lease_structure?: 'NNN' | 'G' | 'MG' | 'FSG' | 'IG' | 'nnn' | 'gross' | 'modified_gross' | 'fsg' | 'industrial_gross';
  starting_rent_psf?: number;  // Rent PSF
  effective_rent_psf?: number;
  ending_rent_psf?: number;
  nnn_expenses_psf?: number;  // NNN/Operating Expenses PSF
  cam?: number;  // CAM charges (legacy)
  nnn_charges?: number;  // NNN Charges (legacy)
  annual_increases?: number;  // Rent Adjustments (annual %)
  free_rent_months?: number;  // Free Rent
  ti_allowance_psf?: number;  // TIs PSF
  ti_allowance?: number;  // Alias for ti_allowance_psf
  lease_options?: string;  // Renewal options, e.g., "One (1) Five (5) Yr Option"
  notification_months?: number[];  // Months before expiration to send reminders
  notifications_enabled?: boolean;  // Whether notifications are enabled
  last_notification_date?: string;  // Date of last notification sent
  tenant_name?: string;
  tenant_industry?: string;
  landlord_name?: string;
  listing_broker?: string;  // Lessor's broker
  tenant_broker?: string;  // Lessee's broker
  source?: string;
  notes?: string;  // Comments
  confidential?: boolean;
  photo_url?: string;  // Property photo URL
  photo_type?: string;  // Type of photo (uploaded, streetview, aerial)
  created_at?: string;
  updated_at?: string;
}

export interface SaleComp {
  id: string;
  property_name?: string;
  property_address: string;
  city: string;
  state?: string;
  zip?: string;
  county?: string;  // County
  submarket?: string;
  building_sf: number;  // Building SF
  land_sf?: number;
  land_acres?: number;  // Land Area (Acres)
  office_sf?: number;
  warehouse_sf?: number;
  clear_height?: number;  // Clear Height
  dock_high_doors?: number;  // Dock High
  grade_level_doors?: number;  // Grade Level
  power_amps?: number;
  year_built?: number;
  property_type?: string;
  building_class?: string;  // Building Class (A, B, C)
  sale_date: string;  // Sale Date
  sale_type?: 'investment' | 'owner_user' | 'land' | 'portfolio' | 'distressed';  // Sale Type
  sale_price: number;  // Sale Price
  price_psf?: number;  // Sale Price PSF
  price_per_land_sf?: number;
  cap_rate?: number;  // Cap Rate
  noi?: number;
  occupancy_at_sale?: number;  // Occupancy
  in_place_rent_psf?: number;
  buyer_name?: string;  // Buyer
  buyer_type?: string;
  seller_name?: string;  // Seller
  listing_broker?: string;
  buyer_broker?: string;
  source?: string;
  notes?: string;  // Comments
  confidential?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CompSet {
  id: string;
  name: string;
  description?: string;
  comp_type: 'lease' | 'sale';
  created_by?: string;
  criteria?: Record<string, unknown>;
  subject_address?: string;
  subject_sf?: number;
  subject_asking_rent?: number;
  subject_asking_price?: number;
  comps?: LeaseComp[] | SaleComp[];
  lease_count?: number;
  sale_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CompStats {
  count: number;
  totalCount?: number;
  avg_rent_psf?: number;
  min_rent_psf?: number;
  max_rent_psf?: number;
  avg_price_psf?: number;
  min_price_psf?: number;
  max_price_psf?: number;
  avg_cap_rate?: number;
  avg_sf?: number;
  total_sf?: number;
  total_volume?: number;
  avg_term_months?: number;
}

export interface LeaseCompSearchParams {
  minSf?: number;
  maxSf?: number;
  minRent?: number;
  maxRent?: number;
  city?: string;
  submarket?: string;
  startDate?: string;
  endDate?: string;
  leaseStructure?: string;
  tenant?: string;
  limit?: number;
}

export interface SaleCompSearchParams {
  minSf?: number;
  maxSf?: number;
  minPrice?: number;
  maxPrice?: number;
  minPricePsf?: number;
  maxPricePsf?: number;
  city?: string;
  submarket?: string;
  startDate?: string;
  endDate?: string;
  saleType?: string;
  buyer?: string;
  seller?: string;
  limit?: number;
}

export const compsApi = {
  // Lease Comps
  searchLeaseComps: (params: LeaseCompSearchParams) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.append(key, String(value));
      }
    });
    return request<LeaseComp[]>(`/comps/lease?${searchParams.toString()}`);
  },

  getLeaseComp: (id: string) =>
    request<LeaseComp>(`/comps/lease/${id}`),

  createLeaseComp: (data: Partial<LeaseComp>) =>
    request<LeaseComp>('/comps/lease', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateLeaseComp: (id: string, data: Partial<LeaseComp>) =>
    request<LeaseComp>(`/comps/lease/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteLeaseComp: (id: string) =>
    request<{ deleted: boolean }>(`/comps/lease/${id}`, { method: 'DELETE' }),

  // Sale Comps
  searchSaleComps: (params: SaleCompSearchParams) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.append(key, String(value));
      }
    });
    return request<SaleComp[]>(`/comps/sale?${searchParams.toString()}`);
  },

  getSaleComp: (id: string) =>
    request<SaleComp>(`/comps/sale/${id}`),

  createSaleComp: (data: Partial<SaleComp>) =>
    request<SaleComp>('/comps/sale', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSaleComp: (id: string, data: Partial<SaleComp>) =>
    request<SaleComp>(`/comps/sale/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSaleComp: (id: string) =>
    request<{ deleted: boolean }>(`/comps/sale/${id}`, { method: 'DELETE' }),

  // Comp Sets
  getCompSets: () =>
    request<CompSet[]>('/comps/sets'),

  getCompSet: (id: string) =>
    request<CompSet>(`/comps/sets/${id}`),

  createCompSet: (data: {
    name: string;
    description?: string;
    comp_type: 'lease' | 'sale';
    created_by?: string;
    criteria?: Record<string, unknown>;
    subject_address?: string;
    subject_sf?: number;
    subject_asking_rent?: number;
    subject_asking_price?: number;
    comp_ids?: string[];
  }) =>
    request<CompSet>('/comps/sets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteCompSet: (id: string) =>
    request<{ deleted: boolean }>(`/comps/sets/${id}`, { method: 'DELETE' }),

  // Statistics
  getLeaseCompStats: (params?: {
    city?: string;
    startDate?: string;
    endDate?: string;
    minSf?: number;
    maxSf?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.append(key, String(value));
        }
      });
    }
    return request<CompStats>(`/comps/stats/lease?${searchParams.toString()}`);
  },

  getSaleCompStats: (params?: {
    city?: string;
    startDate?: string;
    endDate?: string;
    minSf?: number;
    maxSf?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.append(key, String(value));
        }
      });
    }
    return request<CompStats>(`/comps/stats/sale?${searchParams.toString()}`);
  },

  // Photos
  getCompPhoto: (type: 'lease' | 'sale', id: string) =>
    request<{
      url: string | null;
      embedUrl?: string;
      type: string;
      source: string;
      address?: string;
    }>(`/comps/photo/${type}/${id}`),

  getCompPhotos: (type: 'lease' | 'sale', ids: string[]) =>
    request<Array<{
      id: string;
      url: string | null;
      type: string;
      source: string;
      address?: string;
    }>>('/comps/photos/batch', {
      method: 'POST',
      body: JSON.stringify({ type, ids }),
    }),

  updateCompPhoto: (type: 'lease' | 'sale', id: string, photo_url: string, photo_type: string) =>
    request<{ id: string; photo_url: string; photo_type: string }>(`/comps/photo/${type}/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ photo_url, photo_type }),
    }),

  // Lease Expiration Notifications
  getExpiringLeases: (months: number = 12) =>
    request<{
      total: number;
      expirations: {
        critical: LeaseComp[];  // 0-3 months
        warning: LeaseComp[];   // 3-6 months
        upcoming: LeaseComp[];  // 6-12 months
        future: LeaseComp[];    // 12+ months
      };
      summary: {
        critical: number;
        warning: number;
        upcoming: number;
        future: number;
      };
    }>(`/comps/notifications/expiring?months=${months}`),

  getNotificationSummary: () =>
    request<{
      expiring_3_months: number;
      expiring_6_months: number;
      expiring_12_months: number;
      notifications_enabled_count: number;
      sf_expiring_12_months: number;
    }>('/comps/notifications/summary'),

  updateLeaseNotifications: (id: string, settings: {
    notifications_enabled?: boolean;
    notification_months?: number[];
  }) =>
    request<{ id: string; notifications_enabled: boolean; notification_months: number[] }>(
      `/comps/lease/${id}/notifications`,
      {
        method: 'PUT',
        body: JSON.stringify(settings),
      }
    ),
};

// Sale Alerts API - Deed monitor sale alerts
export const saleAlertsApi = {
  // Get sale alerts
  list: (options?: { acknowledged?: boolean; days?: number; city?: string }) => {
    const params = new URLSearchParams();
    if (options?.acknowledged !== undefined) params.append('acknowledged', String(options.acknowledged));
    if (options?.days) params.append('days', String(options.days));
    if (options?.city) params.append('city', options.city);
    return request<SaleAlert[]>(`/sale-alerts?${params.toString()}`);
  },

  // Get dashboard summary
  getSummary: () =>
    request<SaleAlertSummary>('/sale-alerts/summary'),

  // Get recent sales for map display
  getRecent: (days = 90, limit = 100) =>
    request<RecentSale[]>(`/sale-alerts/recent?days=${days}&limit=${limit}`),

  // Acknowledge an alert
  acknowledge: (id: string, notes?: string) =>
    request<SaleAlert>(`/sale-alerts/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  // Get sales by city
  getByCity: (days = 90) =>
    request<Array<{
      city: string;
      sale_count: number;
      total_volume: number;
      avg_price: number;
      avg_price_per_sf: number;
    }>>(`/sale-alerts/by-city?days=${days}`),
};

// Hotsheet API - Recent activity feed
export interface HotsheetItem {
  id: string;
  type: 'new_listing' | 'price_change' | 'sold' | 'leased' | 'new_comp' | 'escrow' | 'data_change';
  address: string;
  city: string;
  timestamp: string;
  details: {
    price?: number;
    priceChange?: number;
    sf?: number;
    broker?: string;
    status?: string;
  };
}

export interface HotsheetFilters {
  timeFilter: string;
  typeFilter: string;
  startDate: string;
  endDate: string;
}

export interface HotsheetStats {
  new_listing: number;
  price_change: number;
  sold: number;
  leased: number;
  new_comp: number;
  escrow: number;
  data_change: number;
  total: number;
  period: {
    timeFilter: string;
    startDate: string;
    endDate: string;
  };
}

export const hotsheetApi = {
  // Get hotsheet items (recent activity feed)
  list: (options?: { timeFilter?: string; typeFilter?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.timeFilter) params.append('timeFilter', options.timeFilter);
    if (options?.typeFilter) params.append('typeFilter', options.typeFilter);
    if (options?.limit) params.append('limit', String(options.limit));
    return request<{ items: HotsheetItem[]; total: number; filters: HotsheetFilters }>(
      `/hotsheet?${params.toString()}`
    );
  },

  // Get hotsheet statistics
  getStats: (timeFilter = '1w') =>
    request<HotsheetStats>(`/hotsheet/stats?timeFilter=${timeFilter}`),

  // Get user's own listings
  getMyListings: (options?: { timeFilter?: string; typeFilter?: string }) => {
    const params = new URLSearchParams();
    if (options?.timeFilter) params.append('timeFilter', options.timeFilter);
    if (options?.typeFilter) params.append('typeFilter', options.typeFilter);
    return request<{ items: HotsheetItem[]; total: number; filters: HotsheetFilters }>(
      `/hotsheet/my-listings?${params.toString()}`
    );
  },

  // Get activity on user's watched properties
  getMyPortfolio: (options?: { timeFilter?: string; typeFilter?: string }) => {
    const params = new URLSearchParams();
    if (options?.timeFilter) params.append('timeFilter', options.timeFilter);
    if (options?.typeFilter) params.append('typeFilter', options.typeFilter);
    return request<{ items: HotsheetItem[]; total: number; filters: HotsheetFilters }>(
      `/hotsheet/my-portfolio?${params.toString()}`
    );
  },
};

// Email search types (Outlook archive - 246K+ emails)
export interface EmailSearchResult {
  id: number;
  subject: string;
  from_addr: string;
  to_addr: string;
  cc: string;
  date: string;
  body_snippet: string;
}

export interface EmailSearchResponse {
  results: EmailSearchResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface EmailDetail extends EmailSearchResult {
  body: string;
  source_path: string;
}

export interface EmailSearchParams {
  q?: string;
  from?: string;
  to?: string;
  subject?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export const emailsApi = {
  search: (params: EmailSearchParams) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    return request<EmailSearchResponse>(`/emails/search?${qs.toString()}`);
  },

  getById: (id: number) =>
    request<EmailDetail>(`/emails/${id}`),

  getStats: () =>
    request<{
      total_emails: number;
      date_range: { earliest: string; latest: string };
      top_senders: Array<{ from_addr: string; count: number }>;
      emails_by_year: Array<{ year: string; count: number }>;
    }>('/emails/stats'),
};

// Road geometry types
export interface RoadFeature {
  type: 'Feature';
  properties: {
    id: number;
    highway: string;
    ref: string;
    name: string;
    roadType: 'freeway' | 'highway' | 'primary' | 'secondary';
    strokeWidth: number;
  };
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export interface RoadGeometry {
  type: 'FeatureCollection';
  features: RoadFeature[];
  metadata: {
    source: string;
    fetchedAt: string;
    bounds: { south: number; west: number; north: number; east: number };
    featureCount: number;
  };
}

// Roads API - Road geometry from OpenStreetMap
export const roadsApi = {
  // Get all road geometry for Orange County
  getAll: () => request<RoadGeometry>('/roads'),

  // Get road geometry within bounds
  getInBounds: (bounds: { south: number; west: number; north: number; east: number }) =>
    request<RoadGeometry>(
      `/roads/bounds?south=${bounds.south}&west=${bounds.west}&north=${bounds.north}&east=${bounds.east}`
    ),

  // Clear cache (for testing)
  clearCache: () => request<{ message: string }>('/roads/clear-cache'),
};

// ============================================================================
// BUILDING SEARCH API (Full-screen search page)
// ============================================================================

export interface BuildingSearchCriteria {
  cities?: string[];
  min_sf?: number;
  max_sf?: number;
  property_type?: string;
  listing_status?: string;
  year_built_min?: number;
  year_built_max?: number;
  owner_name?: string;
  min_clear_height?: number;
  min_docks?: number;
  min_gl_doors?: number;
  min_amps?: number;
  power_volts?: string;
  fenced_yard?: boolean;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

export interface BuildingSearchResult {
  building_id: string;
  apn: string;
  address: string;
  city: string;
  building_sf: number | null;
  lot_sf: number | null;
  year_built: number | null;
  zoning: string | null;
  latitude: number;
  longitude: number;
  // Spec data (aggregated from units)
  clear_height_ft: number | null;
  dock_doors: number;
  gl_doors: number;
  power_amps: number | null;
  fenced_yard: boolean;
  // Listing match
  listing_type: string | null;
  listing_status: string | null;
  listing_rate: number | null;
  listing_price: number | null;
  broker_name: string | null;
  // CRM notes
  owner_name: string | null;
  land_use: string | null;
  last_sale_price: number | null;
  last_sale_date: string | null;
  company: string | null;
  contact_name: string | null;
  phone: string | null;
}

export interface FilterOptions {
  cities: Array<{ city: string; count: number }>;
  property_types: string[];
  statuses: string[];
}

export const buildingSearchApi = {
  execute: (criteria: BuildingSearchCriteria) =>
    request<{ results: BuildingSearchResult[]; count: number }>('/search/buildings', {
      method: 'POST',
      body: JSON.stringify(criteria),
    }),

  getFilterOptions: () =>
    request<FilterOptions>('/search/filter-options'),
};

// ============================================================================
// TENANTS API (Layer 5)
// ============================================================================

export interface TenantSearchResult {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  sic_code?: string;
  sic_description?: string;
  industry_sector?: string;
  employee_count?: number;
  employee_range?: string;
  headquarters?: boolean;
  multi_location?: boolean;
  linkedin_url?: string;
  website?: string;
  data_source?: string;
  entity_notes?: string;
  occupancy_id: string;
  occupant_type: string;
  lease_start?: string;
  lease_expiration?: string;
  rent_psf_month?: number;
  rent_total_month?: number;
  lease_type?: string;
  market_status?: string;
  is_current: boolean;
  unit_id: string;
  street_address: string;
  unit_number?: string;
  unit_sf?: number;
  warehouse_sf?: number;
  office_sf?: number;
  clear_height_ft?: number;
  dock_doors?: number;
  gl_doors?: number;
  power_amps?: number;
  power_volts?: string;
  fenced_yard?: boolean;
  building_id: string;
  year_built?: number;
  total_building_sf?: number;
  building_name?: string;
  sprinklers?: boolean;
  apn: string;
  city: string;
  zip?: string;
  land_sf?: number;
  lot_acres?: number;
  lat?: number;
  lng?: number;
  primary_contact_name?: string;
  primary_contact_email?: string;
  primary_contact_mobile?: string;
  primary_contact_phone?: string;
  primary_contact_title?: string;
}

export interface TenantSearchParams {
  q?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  sicCode?: string;
  industrySector?: string;
  minSf?: number;
  maxSf?: number;
  minLotAcres?: number;
  maxLotAcres?: number;
  minClearance?: number;
  maxClearance?: number;
  minPower?: number;
  maxPower?: number;
  minOfficeSf?: number;
  maxOfficeSf?: number;
  minOfficePct?: number;
  maxOfficePct?: number;
  minYearBuilt?: number;
  maxYearBuilt?: number;
  propertyType?: string;
  minEmployees?: number;
  maxEmployees?: number;
  headquarters?: boolean;
  multiLocation?: boolean;
  currentOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface TenantSearchResponse {
  results: TenantSearchResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface TenantDetail extends TenantSearchResult {
  contacts: Array<{
    id: string;
    name: string;
    title?: string;
    email?: string;
    mobile?: string;
    phone?: string;
    is_primary: boolean;
  }>;
  occupancy: Array<{
    id: string;
    occupant_type: string;
    lease_start?: string;
    lease_expiration?: string;
    rent_psf_month?: number;
    lease_type?: string;
    market_status?: string;
    is_current: boolean;
    street_address: string;
    unit_sf?: number;
    city: string;
  }>;
}

export interface SICCode {
  code: string;
  description: string;
  division: string;
  major_group: string;
}

export interface TenantStats {
  total_tenants: number;
  total_occupied_sf: number;
  cities: Array<{ city: string; count: number }>;
}

export const tenantsApi = {
  // Search tenants with filters
  search: (params: TenantSearchParams) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    return request<TenantSearchResponse>(`/tenants/search?${searchParams.toString()}`);
  },

  // Get full tenant detail
  getDetail: (entityId: string) =>
    request<TenantDetail>(`/tenants/${entityId}`),

  // Get SIC codes for autocomplete
  getSicCodes: (q?: string) => {
    const params = q ? `?q=${encodeURIComponent(q)}` : '';
    return request<SICCode[]>(`/tenants/sic-codes${params}`);
  },

  // Get summary statistics
  getStats: () =>
    request<TenantStats>('/tenants/stats'),
};

// ============================================================================
// WARN Layoff Alerts API
// ============================================================================

export interface WarnAlert {
  id: string;
  company: string;
  industry: string | null;
  employees: number | null;
  est_sf: number | null;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  property_type: string | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  layoff_type: string | null;
  notice_date: string | null;
  effective_date: string | null;
  status: string;
  opportunity_notes: string | null;
  matched_listing_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface WarnAlertStats {
  total: number;
  high_priority: number;
  medium_priority: number;
  low_priority: number;
  total_employees: number;
  total_est_sf: number;
  industrial_count: number;
}

export const warnAlertsApi = {
  getAll: (params?: { priority?: string; city?: string; property_type?: string; sort?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
    }
    const qs = searchParams.toString();
    return request<{ alerts: WarnAlert[]; total: number }>(`/warn-alerts${qs ? '?' + qs : ''}`);
  },

  getStats: () =>
    request<WarnAlertStats>('/warn-alerts/stats'),

  getMapData: () =>
    request<GeoJSON.FeatureCollection>('/warn-alerts/map'),

  getById: (id: string) =>
    request<WarnAlert>(`/warn-alerts/${id}`),
};

// ---------------------------------------------------------------------------
// Listing Map Markers
// ---------------------------------------------------------------------------
export interface ListingMarker {
  id: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  sf: number | null;
  land_sf: number | null;
  acres: number | null;
  listing_type: string;
  property_type: string | null;
  status: string;
  rate_monthly: number | null;
  rate_display: string | null;
  sale_price: number | null;
  price_psf: number | null;
  dom: number | null;
  photo_url: string | null;
  lease_structure: string | null;
  nnn_psf_monthly: number | null;
  nnn_to_gross_total: number | null;
  listing_page_url: string | null;
  listed_app: string | null;
  listing_broker: string | null;
  listing_company: string | null;
  is_new: boolean;
  is_price_reduced: boolean;
  notes: string | null;
  clear_height: string | null;
  dock_doors: number | null;
  grade_doors: number | null;
  power: string | null;
  has_yard: boolean | null;
  buyer_company: string | null;
  seller_company: string | null;
  cap_rate: number | null;
  sale_date: string | null;
  year_built: number | null;
}

export interface ListingMapFilters {
  type?: string;
  status?: string;
  city?: string;
  min_sf?: number;
  property_type?: string;
}

export const listingsMapApi = {
  getMarkers: (filters?: ListingMapFilters) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== 'all') {
          params.append(key, String(value));
        }
      });
    }
    const qs = params.toString();
    return request<{ markers: ListingMarker[]; total: number }>(`/listings/map${qs ? '?' + qs : ''}`);
  },

  getCities: () =>
    request<{ cities: { city: string; count: number }[] }>('/listings/cities'),

  getById: (id: string) =>
    request<ListingMarker>(`/listings/${id}`),
};

// ---------------------------------------------------------------------------
// Notifications API
// ---------------------------------------------------------------------------
export interface NotificationConfig {
  id: string;
  channel: 'email' | 'sms';
  destination: string;
  alert_types: string[];
  is_enabled: boolean;
  min_sf: number | null;
  cities: string[] | null;
  property_types: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationLogEntry {
  id: number;
  config_id: string;
  channel: string;
  destination: string;
  subject: string | null;
  body: string | null;
  listing_id: string | null;
  alert_type: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export const notificationsApi = {
  getConfigs: () =>
    request<{ configs: NotificationConfig[] }>('/notifications/config'),

  createConfig: (data: Partial<NotificationConfig>) =>
    request<NotificationConfig>('/notifications/config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateConfig: (id: string, data: Partial<NotificationConfig>) =>
    request<NotificationConfig>(`/notifications/config/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteConfig: (id: string) =>
    request<{ deleted: boolean }>(`/notifications/config/${id}`, { method: 'DELETE' }),

  getLog: (limit?: number) =>
    request<{ log: NotificationLogEntry[] }>(`/notifications/log?limit=${limit || 50}`),

  sendTest: (data?: { config_id?: string; channel?: string; destination?: string }) =>
    request<{ test: boolean; results?: unknown[] }>('/notifications/test', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  trigger: (checkTypes?: string[]) =>
    request<{ triggered: boolean; results: Record<string, string> }>('/notifications/trigger', {
      method: 'POST',
      body: JSON.stringify({ check_types: checkTypes }),
    }),
};
