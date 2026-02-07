import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { hotsheetApi, type HotsheetItem } from '@/api/client'

// Time filter options matching your wireframe
const TIME_FILTERS = [
  { label: '1 Day', value: '1d' },
  { label: '3 Days', value: '3d' },
  { label: '1 Week', value: '1w' },
  { label: '1 Month', value: '1m' },
  { label: '3 Months', value: '3m' },
  { label: '6 Months', value: '6m' },
  { label: '1 Year', value: '1y' },
  { label: '2+ Years', value: '2y' },
]

const TYPE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'New Listings', value: 'new_listing' },
  { label: 'Price Changes', value: 'price_change' },
  { label: 'Sold', value: 'sold' },
  { label: 'Leased', value: 'leased' },
  { label: 'New Comps', value: 'new_comp' },
  { label: 'In Escrow', value: 'escrow' },
  { label: 'Data Changes', value: 'data_change' },
]

interface HotsheetPanelProps {
  onClose: () => void
  onPropertySelect: (item: HotsheetItem) => void
}

export function HotsheetPanel({ onClose, onPropertySelect }: HotsheetPanelProps) {
  const [timeFilter, setTimeFilter] = useState('1w')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showMyListings, setShowMyListings] = useState(false)
  const [showMyPortfolio, setShowMyPortfolio] = useState(false)

  // Fetch hotsheet items from API
  const { data, isLoading } = useQuery({
    queryKey: ['hotsheet', timeFilter, typeFilter],
    queryFn: () => hotsheetApi.list({ timeFilter, typeFilter }),
  })
  const items = data?.items || []

  const getTypeIcon = (type: HotsheetItem['type']) => {
    switch (type) {
      case 'new_listing': return '🆕'
      case 'price_change': return '💰'
      case 'sold': return '✅'
      case 'leased': return '🤝'
      case 'new_comp': return '📊'
      case 'escrow': return '⏳'
      case 'data_change': return '📝'
      default: return '📋'
    }
  }

  const getTypeColor = (type: HotsheetItem['type']) => {
    switch (type) {
      case 'new_listing': return 'bg-green-100 text-green-800'
      case 'price_change': return 'bg-amber-100 text-amber-800'
      case 'sold': return 'bg-blue-100 text-blue-800'
      case 'leased': return 'bg-purple-100 text-purple-800'
      case 'new_comp': return 'bg-teal-100 text-teal-800'
      case 'escrow': return 'bg-orange-100 text-orange-800'
      case 'data_change': return 'bg-slate-100 text-slate-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatPrice = (price: number) => {
    if (price >= 1000000) return `$${(price / 1000000).toFixed(2)}M`
    if (price >= 1000) return `$${(price / 1000).toFixed(0)}K`
    return `$${price}`
  }

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / 86400000)
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return date.toLocaleDateString()
  }

  // Items are already filtered by API, but apply client-side filter as fallback
  const filteredItems = items.filter(item =>
    typeFilter === 'all' || item.type === typeFilter
  )

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-navy-dark text-white border-b border-navy-light">
        <div>
          <h2 className="font-bold text-lg">Hotsheet</h2>
          <p className="text-xs text-white/70">Recent Activity & New Listings</p>
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
        {/* Time Filter */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            How Recent
          </label>
          <div className="flex flex-wrap gap-1">
            {TIME_FILTERS.map(filter => (
              <button
                key={filter.value}
                onClick={() => setTimeFilter(filter.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  timeFilter === filter.value
                    ? 'bg-teal text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
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
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  typeFilter === filter.value
                    ? 'bg-gold text-navy-dark'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Filters */}
        <div className="flex gap-4 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showMyListings}
              onChange={(e) => setShowMyListings(e.target.checked)}
              className="w-4 h-4 rounded text-teal focus:ring-teal"
            />
            <span className="text-sm text-gray-700">My Listings</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showMyPortfolio}
              onChange={(e) => setShowMyPortfolio(e.target.checked)}
              className="w-4 h-4 rounded text-teal focus:ring-teal"
            />
            <span className="text-sm text-gray-700">My Portfolio</span>
          </label>
        </div>
      </div>

      {/* Results Count */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm text-gray-600">
          {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
        </span>
        <button className="text-xs text-teal hover:underline">Export</button>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <span className="text-3xl mb-2">📭</span>
            <span className="text-sm">No activity found</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredItems.map(item => (
              <button
                key={item.id}
                onClick={() => onPropertySelect(item)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <span className="text-xl">{getTypeIcon(item.type)}</span>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${getTypeColor(item.type)}`}>
                        {item.type.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-400">{formatTimestamp(item.timestamp)}</span>
                    </div>
                    
                    <div className="font-medium text-gray-900 truncate">
                      {item.address}
                    </div>
                    <div className="text-sm text-gray-500">{item.city}</div>
                    
                    {/* Details */}
                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-600">
                      {item.details.price && (
                        <span className="font-medium text-navy-dark">
                          {formatPrice(item.details.price)}
                          {item.details.priceChange && (
                            <span className={item.details.priceChange < 0 ? 'text-red-500' : 'text-green-500'}>
                              {' '}({item.details.priceChange < 0 ? '' : '+'}{formatPrice(item.details.priceChange)})
                            </span>
                          )}
                        </span>
                      )}
                      {item.details.sf && (
                        <span>{item.details.sf.toLocaleString()} SF</span>
                      )}
                      {item.details.broker && (
                        <span className="text-teal">• {item.details.broker}</span>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 flex gap-2">
        <button className="flex-1 px-4 py-2 bg-teal text-white text-sm font-medium rounded-lg hover:bg-teal/90 transition-colors">
          + Add Listing
        </button>
        <button className="flex-1 px-4 py-2 bg-navy-light text-white text-sm font-medium rounded-lg hover:bg-navy transition-colors">
          Import
        </button>
      </div>
    </div>
  )
}

export type { HotsheetItem }
