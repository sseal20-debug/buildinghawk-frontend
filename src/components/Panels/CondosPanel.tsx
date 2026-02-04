import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface Condo {
  id: string
  address: string
  city: string
  unit_number?: string
  building_name?: string
  sf?: number
  bedrooms?: number
  bathrooms?: number
  parking_spaces?: number
  year_built?: number
  for_sale: boolean
  for_lease: boolean
  sale_price?: number
  lease_rate?: number
  hoa_fee?: number
  owner_name?: string
  status: 'available' | 'pending' | 'sold' | 'leased'
}

interface CondosPanelProps {
  onClose: () => void
  onCondoSelect?: (condo: Condo) => void
}

const STATUS_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'For Sale', value: 'sale' },
  { label: 'For Lease', value: 'lease' },
  { label: 'Sold', value: 'sold' },
  { label: 'Leased', value: 'leased' },
]

export function CondosPanel({ onClose, onCondoSelect }: CondosPanelProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [cityFilter, setCityFilter] = useState('')

  // Fetch condos from API
  const { data, isLoading } = useQuery({
    queryKey: ['condos', statusFilter, searchQuery, cityFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (searchQuery) params.append('q', searchQuery)
      if (cityFilter) params.append('city', cityFilter)

      const res = await fetch(`/api/condos?${params}`)
      if (!res.ok) throw new Error('Failed to fetch condos')
      return res.json() as Promise<{ condos: Condo[]; count: number }>
    },
  })

  const condos = data?.condos || []

  const getStatusColor = (status: Condo['status']) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800'
      case 'pending': return 'bg-amber-100 text-amber-800'
      case 'sold': return 'bg-blue-100 text-blue-800'
      case 'leased': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatPrice = (price?: number) => {
    if (!price) return '-'
    if (price >= 1000000) return `$${(price / 1000000).toFixed(2)}M`
    if (price >= 1000) return `$${(price / 1000).toFixed(0)}K`
    return `$${price}`
  }

  const formatRate = (rate?: number) => rate ? `$${rate.toLocaleString()}/mo` : '-'

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#00acc1] text-white border-b">
        <div>
          <h2 className="font-bold text-lg">Condos</h2>
          <p className="text-xs opacity-80">Industrial Condo Inventory</p>
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
            placeholder="Search by address or building name..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00acc1] focus:border-transparent"
          />
        </div>

        {/* Status Filter */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            Status
          </label>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map(filter => (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  statusFilter === filter.value
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
          {condos.length} {condos.length === 1 ? 'condo' : 'condos'}
        </span>
        <button className="text-xs text-teal hover:underline">Export</button>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-[#00acc1] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : condos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <span className="text-3xl mb-2">🏬</span>
            <span className="text-sm">No condos found</span>
            <span className="text-xs mt-1">Condo data not yet imported</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {condos.map(condo => (
              <button
                key={condo.id}
                onClick={() => onCondoSelect?.(condo)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Status */}
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded mt-1 ${getStatusColor(condo.status)}`}>
                    {condo.status.toUpperCase()}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {condo.address}
                      {condo.unit_number && <span className="text-gray-500"> #{condo.unit_number}</span>}
                    </div>
                    {condo.building_name && (
                      <div className="text-sm text-gray-600">{condo.building_name}</div>
                    )}
                    <div className="text-sm text-gray-500">{condo.city}</div>

                    {/* Specs */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-600">
                      {condo.sf && <span>{condo.sf.toLocaleString()} SF</span>}
                      {condo.for_sale && condo.sale_price && (
                        <span className="text-blue-700 font-medium">{formatPrice(condo.sale_price)}</span>
                      )}
                      {condo.for_lease && condo.lease_rate && (
                        <span className="text-green-700 font-medium">{formatRate(condo.lease_rate)}</span>
                      )}
                      {condo.hoa_fee && <span>HOA: ${condo.hoa_fee}/mo</span>}
                      {condo.year_built && <span>Built {condo.year_built}</span>}
                    </div>

                    {/* Owner */}
                    {condo.owner_name && (
                      <div className="mt-1 text-xs text-gray-400">
                        Owner: {condo.owner_name}
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

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 flex gap-2">
        <button className="flex-1 px-4 py-2 bg-[#00acc1] text-white text-sm font-medium rounded-lg hover:bg-[#00838f] transition-colors">
          + Add Condo
        </button>
        <button className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">
          Import Data
        </button>
      </div>
    </div>
  )
}

export type { Condo }
