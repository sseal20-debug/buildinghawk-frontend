import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface BusinessPark {
  id: number
  park_name: string
  address: string
  city: string
  state: string
  zip?: string
  building_sf?: number
  acres?: number
  unit_type?: string  // Condo, Freestanding
  latitude?: number
  longitude?: number
  owner_name?: string
  owner_address?: string
  owner_city?: string
  tenant_name?: string
  lease_expiration?: string
  lease_psf?: number
  sale_date?: string
  sale_price?: number
  apn?: string
  description?: string  // Light Industrial, Flex/R&D, Incubator, etc.
  stories?: number
  clear_height?: number
  sprinklered?: boolean
  year_built?: number
  property_type?: string  // Multi-Tenant, Single-Tenant
  dock_doors?: number
  grade_doors?: number
  office_sf?: number
  rail_service?: boolean
  construction?: string
}

interface CondosPanelProps {
  onClose: () => void
  onCondoSelect?: (condo: BusinessPark) => void
}

const TYPE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Condos', value: 'condo' },
  { label: 'Freestanding', value: 'freestanding' },
  { label: 'Multi-Tenant', value: 'multi' },
  { label: 'Single-Tenant', value: 'single' },
]

const apiUrl = import.meta.env.VITE_API_URL || ''

export function CondosPanel({ onClose, onCondoSelect }: CondosPanelProps) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [cityFilter, setCityFilter] = useState('')

  // Fetch from real business_park table
  const { data, isLoading } = useQuery({
    queryKey: ['condos', typeFilter, searchQuery, cityFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.append('status', typeFilter)
      if (searchQuery) params.append('q', searchQuery)
      if (cityFilter) params.append('city', cityFilter)
      params.append('limit', '500')

      const apiKey = localStorage.getItem('buildingHawkUser') || ''
      const res = await fetch(`${apiUrl}/api/condos?${params}`, {
        headers: { 'x-api-key': apiKey },
      })
      if (!res.ok) throw new Error('Failed to fetch condos')
      return res.json() as Promise<{ condos: BusinessPark[]; count: number }>
    },
  })

  // Stats query
  const { data: stats } = useQuery({
    queryKey: ['condos-stats'],
    queryFn: async () => {
      const apiKey = localStorage.getItem('buildingHawkUser') || ''
      const res = await fetch(`${apiUrl}/api/condos/stats`, {
        headers: { 'x-api-key': apiKey },
      })
      if (!res.ok) return null
      return res.json()
    },
  })

  const condos = data?.condos || []

  const getTypeColor = (type?: string) => {
    if (type === 'Condo') return 'bg-cyan-100 text-cyan-800'
    if (type === 'Freestanding') return 'bg-amber-100 text-amber-800'
    return 'bg-gray-100 text-gray-600'
  }

  const getPropertyTypeColor = (type?: string) => {
    if (type === 'Multi-Tenant') return 'bg-purple-100 text-purple-800'
    if (type === 'Single-Tenant') return 'bg-blue-100 text-blue-800'
    return ''
  }

  const formatPrice = (price?: number) => {
    if (!price) return ''
    if (price >= 1000000) return `$${(price / 1000000).toFixed(2)}M`
    if (price >= 1000) return `$${(price / 1000).toFixed(0)}K`
    return `$${price}`
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#00acc1] text-white border-b">
        <div>
          <h2 className="font-bold text-lg">Business Parks</h2>
          <p className="text-xs opacity-80">
            {stats ? `${stats.total} properties | ${stats.condos} condos | ${stats.unique_parks} parks` : 'Industrial Condo & Park Inventory'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        {/* Search */}
        <div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search address, park, tenant, owner..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00acc1] focus:border-transparent"
          />
        </div>

        {/* Type Filter */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            Type
          </label>
          <div className="flex flex-wrap gap-1">
            {TYPE_FILTERS.map(filter => (
              <button
                key={filter.value}
                onClick={() => setTypeFilter(filter.value)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  typeFilter === filter.value
                    ? 'bg-[#00acc1] text-white font-medium'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* City Filter */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            City
          </label>
          <input
            type="text"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            placeholder="Filter by city..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00acc1] focus:border-transparent"
          />
        </div>
      </div>

      {/* Results Count */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm text-gray-600">
          {condos.length} {condos.length === 1 ? 'property' : 'properties'}
        </span>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-[#00acc1] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : condos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <span className="text-3xl mb-2">🏭</span>
            <span className="text-sm">No properties found</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {condos.map(item => (
              <button
                key={item.id}
                onClick={() => onCondoSelect?.(item)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-2">
                  {/* Type badge */}
                  <div className="flex flex-col gap-1 mt-0.5">
                    {item.unit_type && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${getTypeColor(item.unit_type)}`}>
                        {item.unit_type}
                      </span>
                    )}
                    {item.property_type && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${getPropertyTypeColor(item.property_type)}`}>
                        {item.property_type === 'Multi-Tenant' ? 'Multi' : 'Single'}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate text-sm">
                      {item.address}
                    </div>
                    <div className="text-xs text-teal-700 font-medium truncate">
                      {item.park_name}
                    </div>
                    <div className="text-xs text-gray-500">{item.city}, {item.state} {item.zip || ''}</div>

                    {/* Specs row */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-600">
                      {item.building_sf ? <span>{item.building_sf.toLocaleString()} SF</span> : null}
                      {item.clear_height ? <span>{item.clear_height}' clr</span> : null}
                      {item.dock_doors ? <span>{item.dock_doors} dock</span> : null}
                      {item.grade_doors ? <span>{item.grade_doors} GL</span> : null}
                      {item.year_built ? <span>Built {item.year_built}</span> : null}
                      {item.construction ? <span>{item.construction}</span> : null}
                      {item.description ? <span className="italic">{item.description}</span> : null}
                    </div>

                    {/* Owner / Tenant / Sale */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px]">
                      {item.tenant_name && (
                        <span className="text-green-700">Tenant: {item.tenant_name}</span>
                      )}
                      {item.owner_name && (
                        <span className="text-gray-500">Owner: {item.owner_name}</span>
                      )}
                    </div>
                    {(item.sale_price || item.lease_psf) ? (
                      <div className="flex gap-x-3 mt-0.5 text-[11px]">
                        {item.sale_price ? (
                          <span className="text-blue-700 font-medium">Sale: {formatPrice(item.sale_price)}</span>
                        ) : null}
                        {item.lease_psf ? (
                          <span className="text-green-700 font-medium">${item.lease_psf.toFixed(2)}/SF</span>
                        ) : null}
                        {item.sale_date ? (
                          <span className="text-gray-400">{item.sale_date}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-gray-400 mt-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export type { BusinessPark }
