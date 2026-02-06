// TopSearchBar - Floating search bar on top of the map
import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parcelsApi, placesApi, crmPropertiesApi } from '@/api/client'
import { useDebounce } from '@/hooks/useDebounce'

interface AutocompleteResult {
  type: string
  label: string
  sublabel: string
  lat?: number
  lng?: number
  place_id?: string
  centroid?: { coordinates: [number, number] }
  apn?: string
}

export type QuickFilter = 'all' | 'sale' | 'lease' | 'sold' | 'leased' | 'escrow'

interface TopSearchBarProps {
  onSelect: (result: { lat: number; lng: number; address: string }) => void
  onSearchChange: (query: string) => void
  sidebarOpen: boolean
  activeFilter: QuickFilter | null
  onFilterChange: (filter: QuickFilter | null) => void
}

export function TopSearchBar({ onSelect, onSearchChange, sidebarOpen, activeFilter, onFilterChange }: TopSearchBarProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 300)

  // Database search
  const { data: dbResults, isLoading: dbLoading } = useQuery({
    queryKey: ['unified-search', debouncedQuery],
    queryFn: () => parcelsApi.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 30,
  })

  // Google Places autocomplete
  const { data: placesResults, isLoading: placesLoading } = useQuery({
    queryKey: ['places-autocomplete', debouncedQuery],
    queryFn: () => placesApi.autocomplete(debouncedQuery),
    enabled: debouncedQuery.length >= 3,
    staleTime: 1000 * 60,
  })

  // CRM Properties search
  const { data: crmResults, isLoading: crmLoading } = useQuery({
    queryKey: ['crm-properties-search', debouncedQuery],
    queryFn: () => crmPropertiesApi.autocomplete(debouncedQuery, 15),
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 60,
  })

  const isLoading = dbLoading || placesLoading || crmLoading

  // Build autocomplete results
  const autocompleteResults: AutocompleteResult[] = []

  if (crmResults) {
    crmResults.forEach((p: any) => {
      autocompleteResults.push({
        type: 'crm',
        label: p.label,
        sublabel: p.city || '',
        lat: p.latitude,
        lng: p.longitude,
      })
    })
  }
  if (dbResults?.parcels) {
    dbResults.parcels.forEach((p: any) => {
      const isDupe = autocompleteResults.some(
        (r) => r.label.toLowerCase() === (p.situs_address || '').toLowerCase()
      )
      if (!isDupe) {
        autocompleteResults.push({
          type: 'parcel',
          label: p.situs_address || p.apn,
          sublabel: p.city || '',
          centroid: p.centroid,
          apn: p.apn,
        })
      }
    })
  }
  if (placesResults) {
    placesResults.forEach((p: any) => {
      autocompleteResults.push({
        type: 'google',
        label: p.description,
        sublabel: '',
        place_id: p.place_id,
      })
    })
  }

  const handleSelect = useCallback(
    async (result: AutocompleteResult) => {
      setQuery(result.label)
      setIsOpen(false)
      onSearchChange(result.label)

      if (result.lat && result.lng) {
        onSelect({ lat: result.lat, lng: result.lng, address: result.label })
      } else if (result.centroid) {
        onSelect({
          lat: result.centroid.coordinates[1],
          lng: result.centroid.coordinates[0],
          address: result.label,
        })
      } else if (result.place_id) {
        try {
          const geo = await placesApi.geocode({ place_id: result.place_id })
          onSelect({ lat: geo.lat, lng: geo.lng, address: result.label })
        } catch (err) {
          console.error('Geocode failed:', err)
        }
      }
    },
    [onSelect, onSearchChange]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || autocompleteResults.length === 0) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < autocompleteResults.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && autocompleteResults[highlightedIndex]) {
          handleSelect(autocompleteResults[highlightedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Icon helper
  const typeIcon = (type: string) => {
    switch (type) {
      case 'crm': return '🏢'
      case 'parcel': return '📍'
      case 'google': return '🌐'
      default: return '📄'
    }
  }

  const filters: { key: QuickFilter; label: string; color: string; activeColor: string }[] = [
    { key: 'all',    label: 'All',       color: 'bg-gray-100 text-gray-600 border-gray-300', activeColor: 'bg-[#1565c0] text-white border-[#1565c0]' },
    { key: 'sale',   label: 'For Sale',  color: 'bg-red-50 text-red-700 border-red-200',     activeColor: 'bg-red-600 text-white border-red-600' },
    { key: 'lease',  label: 'For Lease', color: 'bg-green-50 text-green-700 border-green-200', activeColor: 'bg-green-600 text-white border-green-600' },
    { key: 'sold',   label: 'Sold',      color: 'bg-blue-50 text-blue-700 border-blue-200',  activeColor: 'bg-blue-600 text-white border-blue-600' },
    { key: 'leased', label: 'Leased',    color: 'bg-purple-50 text-purple-700 border-purple-200', activeColor: 'bg-purple-600 text-white border-purple-600' },
    { key: 'escrow', label: 'Escrow',    color: 'bg-amber-50 text-amber-700 border-amber-200', activeColor: 'bg-amber-600 text-white border-amber-600' },
  ]

  return (
    <div
      className="top-search-bar"
      style={{ left: sidebarOpen ? 296 : 56 }}
    >
      {/* Search input */}
      <div className="relative flex-shrink-0" style={{ width: 'min(400px, 40%)' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
            setHighlightedIndex(-1)
            onSearchChange(e.target.value)
          }}
          onFocus={() => { if (query.length >= 2) setIsOpen(true) }}
          onKeyDown={handleKeyDown}
          placeholder="Search address, city, owner, tenant..."
          className="w-full h-11 pl-11 pr-10 border-0 rounded-xl text-sm font-medium bg-white shadow-lg focus:outline-none focus:ring-2 focus:ring-[#1565c0] focus:shadow-xl transition-all"
          autoComplete="off"
        />
        {/* Search icon */}
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        {/* Spinner */}
        {isLoading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-[#1565c0] border-t-transparent rounded-full" />
          </div>
        )}

        {/* Clear button */}
        {query && !isLoading && (
          <button
            onClick={() => { setQuery(''); setIsOpen(false); onSearchChange('') }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}

        {/* Autocomplete dropdown */}
        {isOpen && query.length >= 2 && autocompleteResults.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 z-[9999] max-h-80 overflow-y-auto"
          >
            <ul>
              {autocompleteResults.map((result, index) => (
                <li key={`${result.type}-${index}`}>
                  <button
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full px-4 py-2.5 text-left border-b border-gray-100 last:border-0 flex items-center gap-3 ${
                      index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-base flex-shrink-0">{typeIcon(result.type)}</span>
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">{result.label}</div>
                      {result.sublabel && (
                        <div className="text-xs text-gray-500">{result.sublabel}</div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Quick filter pills — inline right of search */}
      <div className="quick-filter-row flex items-center gap-1.5 ml-3 flex-shrink-0 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => onFilterChange(activeFilter === f.key ? null : f.key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold border shadow-sm whitespace-nowrap transition-all hover:scale-105 ${
              activeFilter === f.key ? f.activeColor : f.color
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export type { QuickFilter as TopQuickFilter }
export default TopSearchBar
