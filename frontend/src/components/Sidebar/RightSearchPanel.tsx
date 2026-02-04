import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parcelsApi, placesApi, crmPropertiesApi } from '@/api/client'
import { useDebounce } from '@/hooks/useDebounce'

type QuickFilter = 'all' | 'sale' | 'lease' | 'sold'

interface PropertyResult {
  id: string
  address: string
  city: string
  status: 'sale' | 'lease' | 'sold' | 'none'
  building_sf?: number
  year_built?: number
  price?: number
  lease_rate?: number
  lat?: number
  lng?: number
}

interface RightSearchPanelProps {
  properties: PropertyResult[]
  totalCount: number
  onPropertyClick: (property: PropertyResult) => void
  onSearch: (query: string) => void
  onFilterChange: (filter: QuickFilter) => void
  activeFilter: QuickFilter
}

export function RightSearchPanel({
  properties,
  totalCount,
  onPropertyClick,
  onSearch,
  onFilterChange,
  activeFilter,
}: RightSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const debouncedQuery = useDebounce(searchQuery, 300)

  // Database search (parcels, tenants, owners)
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

  const autocompleteResults: AutocompleteResult[] = []

  // CRM properties first
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

  // DB parcels
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

  // Google Places
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

  const handleAutocompleteSelect = useCallback(
    async (result: AutocompleteResult) => {
      setSearchQuery(result.label)
      setIsOpen(false)

      // Resolve coordinates
      if (result.lat && result.lng) {
        onPropertyClick({
          id: '',
          address: result.label,
          city: result.sublabel,
          status: 'none',
          lat: result.lat,
          lng: result.lng,
        })
      } else if (result.centroid) {
        onPropertyClick({
          id: result.apn || '',
          address: result.label,
          city: result.sublabel,
          status: 'none',
          lat: result.centroid.coordinates[1],
          lng: result.centroid.coordinates[0],
        })
      } else if (result.place_id) {
        try {
          const geo = await placesApi.geocode({ place_id: result.place_id })
          onPropertyClick({
            id: '',
            address: result.label,
            city: '',
            status: 'none',
            lat: geo.lat,
            lng: geo.lng,
          })
        } catch (err) {
          console.error('Geocode failed:', err)
        }
      }
    },
    [onPropertyClick]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || autocompleteResults.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < autocompleteResults.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && autocompleteResults[highlightedIndex]) {
          handleAutocompleteSelect(autocompleteResults[highlightedIndex])
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

  const formatNumber = (n?: number) => (n ? n.toLocaleString() : 'N/A')
  const formatCurrency = (n?: number) => {
    if (!n) return ''
    return n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : `$${n.toLocaleString()}`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sale':
        return (
          <span className="absolute top-3.5 right-3.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-red-50 text-red-800">
            For Sale
          </span>
        )
      case 'lease':
        return (
          <span className="absolute top-3.5 right-3.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-green-50 text-green-800">
            For Lease
          </span>
        )
      case 'sold':
        return (
          <span className="absolute top-3.5 right-3.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-blue-50 text-[#1565c0]">
            Sold
          </span>
        )
      default:
        return null
    }
  }

  return (
    <div className="w-[340px] bg-white border-l border-gray-200 flex flex-col z-[1000] flex-shrink-0">
      {/* Search Header */}
      <div className="p-4 bg-gray-50 border-b border-gray-200 relative">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setIsOpen(true)
            setHighlightedIndex(-1)
            onSearch(e.target.value)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="🔍 Search address, city, owner..."
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-[10px] text-sm font-normal focus:outline-none focus:border-[#1565c0] focus:shadow-[0_0_0_4px_rgba(21,101,192,0.1)] transition-all"
          autoComplete="off"
        />
        {isLoading && (
          <div className="absolute right-8 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-[#1565c0] border-t-transparent rounded-full" />
          </div>
        )}

        {/* Autocomplete Dropdown */}
        {isOpen && searchQuery.length >= 2 && autocompleteResults.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-4 right-4 top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 z-[9999] max-h-80 overflow-y-auto"
          >
            <ul ref={listRef}>
              {autocompleteResults.map((result, index) => (
                <li key={`${result.type}-${index}`}>
                  <button
                    onClick={() => handleAutocompleteSelect(result)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-0 ${
                      index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-900 truncate">
                      {result.label}
                    </div>
                    {result.sublabel && (
                      <div className="text-xs text-gray-500">{result.sublabel}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Quick Filters */}
      <div className="px-4 py-3 flex gap-2 flex-wrap border-b border-gray-200">
        {(['all', 'sale', 'lease', 'sold'] as QuickFilter[]).map((filter) => (
          <button
            key={filter}
            onClick={() => onFilterChange(filter)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              activeFilter === filter
                ? 'bg-[#1565c0] text-white border-[#1565c0]'
                : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
            }`}
          >
            {filter === 'all' ? 'All' : filter === 'sale' ? 'For Sale' : filter === 'lease' ? 'For Lease' : 'Sold'}
          </button>
        ))}
      </div>

      {/* Stats Bar */}
      <div className="px-4 py-2.5 bg-blue-50 text-[13px] font-semibold text-[#1565c0] border-b border-blue-200">
        Showing {properties.length} of {totalCount} properties
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
        {properties.length > 0 ? (
          properties.map((property) => (
            <div
              key={property.id || property.address}
              onClick={() => onPropertyClick(property)}
              className="bg-white border border-gray-200 rounded-[10px] p-3.5 mb-2.5 cursor-pointer transition-all relative hover:border-[#1565c0] hover:shadow-md hover:-translate-y-0.5"
            >
              {getStatusBadge(property.status)}
              <h4 className="text-sm font-semibold text-gray-900 mb-1 pr-[70px]">
                {property.address || 'Unknown'}
              </h4>
              <div className="text-xs text-gray-500 mb-2">
                {property.city}, CA
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="bg-gray-100 px-2 py-0.5 rounded text-[11px] text-gray-600 font-medium">
                  {formatNumber(property.building_sf)} SF
                </span>
                {property.year_built && (
                  <span className="bg-gray-100 px-2 py-0.5 rounded text-[11px] text-gray-600 font-medium">
                    {property.year_built}
                  </span>
                )}
                {property.price && (
                  <span className="bg-yellow-50 px-2 py-0.5 rounded text-[11px] text-yellow-800 font-bold">
                    {formatCurrency(property.price)}
                  </span>
                )}
                {property.lease_rate && (
                  <span className="bg-yellow-50 px-2 py-0.5 rounded text-[11px] text-yellow-800 font-bold">
                    ${property.lease_rate.toFixed(2)}/SF
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 py-6">
            No properties for this layer
          </p>
        )}
      </div>
    </div>
  )
}

export type { QuickFilter, PropertyResult }
export default RightSearchPanel
