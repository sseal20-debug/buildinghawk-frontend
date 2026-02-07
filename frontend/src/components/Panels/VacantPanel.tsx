import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface VacantUnit {
  id: string
  address: string
  city: string
  unit_number?: string
  building_sf?: number
  available_sf?: number
  lease_rate?: number
  sale_price?: number
  for_lease: boolean
  for_sale: boolean
  clear_height?: number
  dock_doors?: number
  grade_doors?: number
  year_built?: number
  last_tenant?: string
  vacated_date?: string
}

interface VacantPanelProps {
  onClose: () => void
  onPropertySelect?: (unit: VacantUnit) => void
}

const AVAILABILITY_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'For Lease', value: 'lease' },
  { label: 'For Sale', value: 'sale' },
]

const SF_RANGES = [
  { label: 'Any', value: 'any' },
  { label: '< 5,000 SF', value: '0-5000' },
  { label: '5K - 10K SF', value: '5000-10000' },
  { label: '10K - 25K SF', value: '10000-25000' },
  { label: '25K - 50K SF', value: '25000-50000' },
  { label: '50K+ SF', value: '50000-999999' },
]

export function VacantPanel({ onClose, onPropertySelect }: VacantPanelProps) {
  const [availability, setAvailability] = useState('all')
  const [sfRange, setSfRange] = useState('any')
  const [searchCity, setSearchCity] = useState('')

  // Fetch vacant units from API
  const { data, isLoading } = useQuery({
    queryKey: ['vacant', availability, sfRange, searchCity],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (availability !== 'all') params.append('availability', availability)
      if (sfRange !== 'any') params.append('sf_range', sfRange)
      if (searchCity) params.append('city', searchCity)

      const res = await fetch(`/api/vacant?${params}`)
      if (!res.ok) throw new Error('Failed to fetch vacant units')
      return res.json() as Promise<{ units: VacantUnit[]; count: number }>
    },
  })

  const units = data?.units || []

  const formatSF = (sf?: number) => sf ? `${sf.toLocaleString()} SF` : '-'
  const formatPrice = (price?: number) => {
    if (!price) return '-'
    if (price >= 1000000) return `$${(price / 1000000).toFixed(2)}M`
    if (price >= 1000) return `$${(price / 1000).toFixed(0)}K`
    return `$${price}`
  }
  const formatRate = (rate?: number) => rate ? `$${rate.toFixed(2)}/SF/mo` : '-'

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#cddc39] text-gray-900 border-b">
        <div>
          <h2 className="font-bold text-lg">Vacant Properties</h2>
          <p className="text-xs opacity-70">Available Now - Immediate Occupancy</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-black/10 rounded transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        {/* Availability Filter */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            Availability
          </label>
          <div className="flex gap-1">
            {AVAILABILITY_FILTERS.map(filter => (
              <button
                key={filter.value}
                onClick={() => setAvailability(filter.value)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  availability === filter.value
                    ? 'bg-[#cddc39] text-gray-900 font-medium'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Size Filter */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            Size
          </label>
          <div className="flex flex-wrap gap-1">
            {SF_RANGES.map(range => (
              <button
                key={range.value}
                onClick={() => setSfRange(range.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  sfRange === range.value
                    ? 'bg-[#cddc39] text-gray-900 font-medium'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* City Search */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            City
          </label>
          <input
            type="text"
            value={searchCity}
            onChange={(e) => setSearchCity(e.target.value)}
            placeholder="Filter by city..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#cddc39] focus:border-transparent"
          />
        </div>
      </div>

      {/* Results Count */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm text-gray-600">
          {units.length} vacant {units.length === 1 ? 'property' : 'properties'}
        </span>
        <button className="text-xs text-teal hover:underline">Export List</button>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-[#cddc39] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : units.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <span className="text-3xl mb-2">🏢</span>
            <span className="text-sm">No vacant properties found</span>
            <span className="text-xs mt-1">Try adjusting your filters</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {units.map(unit => (
              <button
                key={unit.id}
                onClick={() => onPropertySelect?.(unit)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Status indicator */}
                  <div className="flex flex-col gap-1 mt-1">
                    {unit.for_lease && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-800 rounded">
                        LEASE
                      </span>
                    )}
                    {unit.for_sale && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-800 rounded">
                        SALE
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {unit.address}
                      {unit.unit_number && <span className="text-gray-500"> #{unit.unit_number}</span>}
                    </div>
                    <div className="text-sm text-gray-500">{unit.city}</div>

                    {/* Specs */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-600">
                      <span className="font-medium">{formatSF(unit.available_sf || unit.building_sf)}</span>
                      {unit.for_lease && unit.lease_rate && (
                        <span className="text-green-700">{formatRate(unit.lease_rate)}</span>
                      )}
                      {unit.for_sale && unit.sale_price && (
                        <span className="text-blue-700">{formatPrice(unit.sale_price)}</span>
                      )}
                      {unit.clear_height && <span>{unit.clear_height}' clear</span>}
                      {unit.dock_doors && <span>{unit.dock_doors} docks</span>}
                    </div>

                    {/* Last tenant info */}
                    {unit.last_tenant && (
                      <div className="mt-1 text-xs text-gray-400">
                        Last: {unit.last_tenant}
                        {unit.vacated_date && ` (vacated ${new Date(unit.vacated_date).toLocaleDateString()})`}
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  <svg className="w-5 h-5 text-gray-400 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

export type { VacantUnit }
