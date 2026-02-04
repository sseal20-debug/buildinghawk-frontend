import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { tenantsApi } from '@/api/client'
import type { TenantSearchResult, TenantSearchParams, SICCode } from '@/api/client'
import { TenantDetailCard } from './TenantDetailCard'
import { FilterPanel } from './FilterPanel'
import { SICCodeAutocomplete } from './SICCodeAutocomplete'

interface TenantsSearchProps {
  onClose: () => void
}

export interface TenantFilterForm {
  q: string           // Bus Name
  firstName: string   // Contact first name
  lastName: string    // Contact last name
  address: string     // Address search
  city: string        // City filter
  minSf?: number
  maxSf?: number
  minLotAcres?: number
  maxLotAcres?: number
  minClearance?: number
  maxClearance?: number
  minPower?: number
  maxPower?: number
  minOfficeSf?: number
  maxOfficeSf?: number
  minOfficePct?: number
  maxOfficePct?: number
  minYearBuilt?: number
  maxYearBuilt?: number
  minEmployees?: number
  maxEmployees?: number
  headquarters: boolean
  multiLocation: boolean
  propertyTypes: string[]
}

const DATA_SOURCES = [
  { label: 'D&B', color: 'bg-blue-900/50 text-blue-300' },
  { label: 'iProUSA', color: 'bg-green-900/50 text-green-300' },
  { label: 'Inside Prospects', color: 'bg-purple-900/50 text-purple-300' },
  { label: 'Hoovers', color: 'bg-orange-900/50 text-orange-300' },
]

export function TenantsSearch({ onClose }: TenantsSearchProps) {
  const [searchParams, setSearchParams] = useState<TenantSearchParams | null>(null)
  const [selectedTenant, setSelectedTenant] = useState<TenantSearchResult | null>(null)
  const [selectedSicCodes, setSelectedSicCodes] = useState<SICCode[]>([])
  const [combineIndustry, setCombineIndustry] = useState(false)
  const [combineCity, setCombineCity] = useState(false)
  const [combineSpecs, setCombineSpecs] = useState(false)
  const [combineEmployees, setCombineEmployees] = useState(false)

  const { register, handleSubmit, setValue, watch, reset } = useForm<TenantFilterForm>({
    defaultValues: {
      q: '',
      firstName: '',
      lastName: '',
      address: '',
      city: '',
      headquarters: false,
      multiLocation: false,
      propertyTypes: [],
    }
  })

  // Search query
  const { data: searchData, isLoading, isFetching } = useQuery({
    queryKey: ['tenants', 'search', searchParams],
    queryFn: () => searchParams ? tenantsApi.search(searchParams) : Promise.resolve({ results: [], total: 0, limit: 50, offset: 0 }),
    enabled: searchParams !== null,
  })

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['tenants', 'stats'],
    queryFn: tenantsApi.getStats,
  })

  const onSearch = useCallback((data: TenantFilterForm) => {
    const params: TenantSearchParams = {
      limit: 100,
      currentOnly: true,
    }

    if (data.q) params.q = data.q
    if (data.firstName) params.firstName = data.firstName
    if (data.lastName) params.lastName = data.lastName
    if (data.address) params.address = data.address
    if (combineCity && data.city) params.city = data.city
    if (!combineCity && data.city) params.city = data.city

    // SIC codes (use first selected if any)
    if (combineIndustry && selectedSicCodes.length > 0) {
      params.sicCode = selectedSicCodes[0].code
    }

    // Specs (only apply if combine is checked)
    if (combineSpecs) {
      if (data.minSf) params.minSf = data.minSf
      if (data.maxSf) params.maxSf = data.maxSf
      if (data.minLotAcres) params.minLotAcres = data.minLotAcres
      if (data.maxLotAcres) params.maxLotAcres = data.maxLotAcres
      if (data.minClearance) params.minClearance = data.minClearance
      if (data.maxClearance) params.maxClearance = data.maxClearance
      if (data.minPower) params.minPower = data.minPower
      if (data.maxPower) params.maxPower = data.maxPower
      if (data.minOfficeSf) params.minOfficeSf = data.minOfficeSf
      if (data.maxOfficeSf) params.maxOfficeSf = data.maxOfficeSf
      if (data.minOfficePct) params.minOfficePct = data.minOfficePct
      if (data.maxOfficePct) params.maxOfficePct = data.maxOfficePct
      if (data.minYearBuilt) params.minYearBuilt = data.minYearBuilt
      if (data.maxYearBuilt) params.maxYearBuilt = data.maxYearBuilt
    } else {
      // Always apply these from the right filter panel
      if (data.minSf) params.minSf = data.minSf
      if (data.maxSf) params.maxSf = data.maxSf
      if (data.minLotAcres) params.minLotAcres = data.minLotAcres
      if (data.maxLotAcres) params.maxLotAcres = data.maxLotAcres
      if (data.minClearance) params.minClearance = data.minClearance
      if (data.maxClearance) params.maxClearance = data.maxClearance
      if (data.minPower) params.minPower = data.minPower
      if (data.maxPower) params.maxPower = data.maxPower
      if (data.minOfficeSf) params.minOfficeSf = data.minOfficeSf
      if (data.maxOfficeSf) params.maxOfficeSf = data.maxOfficeSf
      if (data.minOfficePct) params.minOfficePct = data.minOfficePct
      if (data.maxOfficePct) params.maxOfficePct = data.maxOfficePct
      if (data.minYearBuilt) params.minYearBuilt = data.minYearBuilt
      if (data.maxYearBuilt) params.maxYearBuilt = data.maxYearBuilt
    }

    // Employees
    if (combineEmployees) {
      if (data.minEmployees) params.minEmployees = data.minEmployees
      if (data.maxEmployees) params.maxEmployees = data.maxEmployees
    }

    if (data.headquarters) params.headquarters = true
    if (data.multiLocation) params.multiLocation = true

    setSearchParams(params)
    setSelectedTenant(null)
  }, [combineCity, combineIndustry, combineSpecs, combineEmployees, selectedSicCodes])

  const handleClear = () => {
    reset()
    setSelectedSicCodes([])
    setSearchParams(null)
    setSelectedTenant(null)
  }

  const results = searchData?.results || []
  const total = searchData?.total || 0

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="bg-navy-dark text-white px-4 py-3 flex items-center justify-between border-b border-navy-light flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Tenants</h2>
          <span className="text-xs text-gray-400">BuildingHawk.com</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Data Source Badges */}
          {DATA_SOURCES.map((ds) => (
            <span
              key={ds.label}
              className={`px-2 py-0.5 rounded text-[10px] font-medium ${ds.color}`}
              title={`Data source: ${ds.label}`}
            >
              {ds.label}
            </span>
          ))}
          {/* Close */}
          <button
            onClick={onClose}
            className="ml-2 p-1.5 hover:bg-white/10 rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Top Search Bar - Column Filter Inputs */}
      <form onSubmit={handleSubmit(onSearch)} className="flex-shrink-0">
        <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
          <div className="flex items-end gap-2">
            {/* Bus Name */}
            <div className="flex-1 min-w-[120px]">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Bus Name</label>
              <input
                {...register('q')}
                placeholder="Company..."
                className="input text-xs py-1.5 w-full"
              />
            </div>

            {/* Name (First / Last) */}
            <div className="flex-1 min-w-[140px]">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Name</label>
              <div className="flex gap-1">
                <input
                  {...register('firstName')}
                  placeholder="First"
                  className="input text-xs py-1.5 w-full"
                />
                <input
                  {...register('lastName')}
                  placeholder="Last"
                  className="input text-xs py-1.5 w-full"
                />
              </div>
            </div>

            {/* Address */}
            <div className="flex-1 min-w-[120px]">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Address</label>
              <input
                {...register('address')}
                placeholder="Address..."
                className="input text-xs py-1.5 w-full"
              />
            </div>

            {/* Industry (SIC) */}
            <div className="flex-1 min-w-[140px]">
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Industry</label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={combineIndustry}
                    onChange={(e) => setCombineIndustry(e.target.checked)}
                    className="w-3 h-3 rounded text-teal focus:ring-teal"
                  />
                  <span className="text-[9px] text-gray-400">combine</span>
                </label>
              </div>
              <SICCodeAutocomplete
                selected={selectedSicCodes}
                onChange={setSelectedSicCodes}
              />
            </div>

            {/* City */}
            <div className="w-[100px]">
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">City</label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={combineCity}
                    onChange={(e) => setCombineCity(e.target.checked)}
                    className="w-3 h-3 rounded text-teal focus:ring-teal"
                  />
                  <span className="text-[9px] text-gray-400">combine</span>
                </label>
              </div>
              <input
                {...register('city')}
                placeholder="City..."
                className="input text-xs py-1.5 w-full"
              />
            </div>

            {/* Specs */}
            <div className="w-[80px]">
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Specs</label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={combineSpecs}
                    onChange={(e) => setCombineSpecs(e.target.checked)}
                    className="w-3 h-3 rounded text-teal focus:ring-teal"
                  />
                  <span className="text-[9px] text-gray-400">combine</span>
                </label>
              </div>
              <div className="text-[10px] text-gray-400 py-1.5 px-2 bg-gray-100 rounded border border-gray-300 text-center">
                See Right Panel
              </div>
            </div>

            {/* Employees */}
            <div className="w-[100px]">
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Employees</label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={combineEmployees}
                    onChange={(e) => setCombineEmployees(e.target.checked)}
                    className="w-3 h-3 rounded text-teal focus:ring-teal"
                  />
                  <span className="text-[9px] text-gray-400">combine</span>
                </label>
              </div>
              <div className="flex gap-1">
                <input
                  type="number"
                  {...register('minEmployees', { valueAsNumber: true })}
                  placeholder="Min"
                  className="input text-xs py-1.5 w-full"
                />
                <input
                  type="number"
                  {...register('maxEmployees', { valueAsNumber: true })}
                  placeholder="Max"
                  className="input text-xs py-1.5 w-full"
                />
              </div>
            </div>

            {/* Search + Clear buttons */}
            <div className="flex gap-1 flex-shrink-0">
              <button
                type="submit"
                className="px-3 py-1.5 bg-teal text-white text-xs font-medium rounded hover:bg-teal/90 transition-colors"
              >
                Search
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="px-2 py-1.5 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Main Content Area: 3 columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left - LinkedIn + Detail Card */}
        <TenantDetailCard
          tenant={selectedTenant}
          onLocate={(lat, lng) => {
            // Could emit event to map
            console.log('Locate tenant on map:', lat, lng)
          }}
        />

        {/* Center - Results Table */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
          {/* Results Header */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {searchParams === null ? (
                  <>
                    {stats?.total_tenants?.toLocaleString() || '...'} tenants total
                    {stats?.total_occupied_sf ? ` | ${stats.total_occupied_sf.toLocaleString()} SF` : ''}
                  </>
                ) : (
                  <>
                    {total.toLocaleString()} results
                    {isFetching && ' (loading...)'}
                  </>
                )}
              </span>
            </div>
            {/* Drop down menu button */}
            <button
              type="button"
              className="p-1 hover:bg-gray-200 rounded transition-colors"
              title="Column options"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Results Table */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center h-32">
                <p className="text-sm text-gray-400">Searching...</p>
              </div>
            )}

            {searchParams === null && !isLoading && (
              <div className="flex items-center justify-center h-32">
                <div className="text-center">
                  <p className="text-sm text-gray-400 mb-1">Enter search criteria above</p>
                  <p className="text-xs text-gray-300">Use the top bar and right panel filters, then click Search</p>
                </div>
              </div>
            )}

            {searchParams !== null && !isLoading && results.length === 0 && (
              <div className="flex items-center justify-center h-32">
                <p className="text-sm text-gray-400">No tenants found matching your criteria</p>
              </div>
            )}

            {results.length > 0 && (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Company</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Address</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">City</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider text-[10px] text-right">SF</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Industry</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Contact</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Lease Exp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((tenant) => (
                    <tr
                      key={`${tenant.entity_id}-${tenant.occupancy_id}`}
                      onClick={() => setSelectedTenant(tenant)}
                      className={`cursor-pointer transition-colors ${
                        selectedTenant?.entity_id === tenant.entity_id && selectedTenant?.occupancy_id === tenant.occupancy_id
                          ? 'bg-teal/10'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900 truncate max-w-[140px]" title={tenant.entity_name}>
                          {tenant.entity_name}
                        </div>
                        {tenant.employee_count && (
                          <span className="text-[10px] text-gray-400">{tenant.employee_count.toLocaleString()} emp</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 truncate max-w-[120px]" title={tenant.street_address}>
                        {tenant.street_address}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{tenant.city}</td>
                      <td className="px-3 py-2 text-gray-600 text-right">
                        {tenant.unit_sf?.toLocaleString() || '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-500 truncate max-w-[100px]" title={tenant.sic_description || tenant.industry_sector || ''}>
                        {tenant.sic_code ? (
                          <span className="font-mono text-[10px]">{tenant.sic_code}</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 truncate max-w-[100px]" title={tenant.primary_contact_name || ''}>
                        {tenant.primary_contact_name || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {tenant.lease_expiration ? (
                          <span className={
                            new Date(tenant.lease_expiration) < new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                              ? 'text-red-500 font-medium'
                              : ''
                          }>
                            {new Date(tenant.lease_expiration).toLocaleDateString('en-US', {
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right - Filter Panel */}
        <FilterPanel
          register={register}
          setValue={setValue}
          watch={watch}
        />
      </div>
    </div>
  )
}
