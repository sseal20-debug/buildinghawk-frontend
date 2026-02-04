import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parcelsApi, placesApi, documentsApi, crmPropertiesApi, emailsApi } from '@/api/client'
import { useDebounce } from '@/hooks/useDebounce'

interface SearchResult {
  apn: string
  situs_address?: string
  street_address?: string
  city: string
  centroid?: { coordinates: [number, number] }
  entity_name?: string
  entity_id?: string
  type: 'parcel' | 'tenant' | 'owner' | 'google_place' | 'dropbox_doc' | 'crm_property'
  place_id?: string
  doc_count?: number  // Number of Dropbox documents for this address
  email_count?: number  // Number of Outlook emails mentioning this address
  latitude?: number   // Direct lat/lng for CRM properties
  longitude?: number
}

interface SearchBarProps {
  onSelect: (result: SearchResult) => void
  onQueryChange?: (query: string) => void
}

export function SearchBar({ onSelect, onQueryChange }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const debouncedQuery = useDebounce(query, 300)

  // Notify parent of debounced query changes (for street parcel highlighting)
  useEffect(() => {
    onQueryChange?.(debouncedQuery)
  }, [debouncedQuery, onQueryChange])

  // Database search (parcels, tenants, owners)
  const { data: dbResults, isLoading: dbLoading } = useQuery({
    queryKey: ['unified-search', debouncedQuery],
    queryFn: () => parcelsApi.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 30,
  })

  // Google Places autocomplete for addresses
  const { data: placesResults, isLoading: placesLoading } = useQuery({
    queryKey: ['places-autocomplete', debouncedQuery],
    queryFn: () => placesApi.autocomplete(debouncedQuery),
    enabled: debouncedQuery.length >= 3,
    staleTime: 1000 * 60,
  })

  // Dropbox document search (addresses with files)
  const { data: docsResults, isLoading: docsLoading } = useQuery({
    queryKey: ['docs-search', debouncedQuery],
    queryFn: () => documentsApi.search(debouncedQuery, 10),
    enabled: debouncedQuery.length >= 3,
    staleTime: 1000 * 60,
  })

  // CRM Properties search (from Excel import - 6,000+ properties)
  const { data: crmResults, isLoading: crmLoading } = useQuery({
    queryKey: ['crm-properties-search', debouncedQuery],
    queryFn: () => crmPropertiesApi.autocomplete(debouncedQuery, 15),
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 60,
  })

  // Email search (Outlook archive - get count of matching emails)
  const { data: emailResults, isLoading: emailLoading } = useQuery({
    queryKey: ['email-count-search', debouncedQuery],
    queryFn: () => emailsApi.search({ q: debouncedQuery, limit: 1 }),
    enabled: debouncedQuery.length >= 3,
    staleTime: 1000 * 60,
  })

  const isLoading = dbLoading || placesLoading || docsLoading || crmLoading || emailLoading

  // Build a map of addresses to doc counts for enrichment
  const docCountMap = new Map<string, number>()
  if (docsResults?.results) {
    docsResults.results.forEach(d => {
      // Normalize address for matching
      const normalized = d.address.toLowerCase().trim()
      docCountMap.set(normalized, d.file_count)
    })
  }

  // Helper to find doc count for an address
  const getDocCount = (address: string | undefined): number => {
    if (!address) return 0
    const normalized = address.toLowerCase().trim()
    // Try exact match first
    if (docCountMap.has(normalized)) return docCountMap.get(normalized)!
    // Try partial match (address might be formatted differently)
    for (const [key, count] of docCountMap.entries()) {
      if (key.includes(normalized) || normalized.includes(key)) return count
    }
    return 0
  }

  // Global email count for the current search query
  const globalEmailCount = emailResults?.total || 0

  // Combine all results into a flat list with sections
  const allResults: SearchResult[] = []

  // Add Dropbox document results FIRST (addresses with files)
  if (docsResults?.results) {
    docsResults.results.forEach(d => {
      // Check if this address is already in database results to avoid dupes
      const isDupe = dbResults?.parcels?.some(p =>
        p.situs_address?.toLowerCase().includes(d.address.toLowerCase()) ||
        d.address.toLowerCase().includes(p.situs_address?.toLowerCase() || '')
      )
      if (!isDupe) {
        allResults.push({
          type: 'dropbox_doc',
          apn: '',
          situs_address: d.address,
          city: '',
          doc_count: d.file_count,
        })
      }
    })
  }

  // Add database parcels (enriched with doc count)
  if (dbResults?.parcels) {
    dbResults.parcels.forEach((p) => {
      allResults.push({
        type: 'parcel',
        apn: p.apn,
        situs_address: p.situs_address,
        city: p.city,
        centroid: p.centroid,
        doc_count: getDocCount(p.situs_address),
      })
    })
  }

  // Add tenants
  if (dbResults?.tenants) {
    dbResults.tenants.forEach(t => {
      allResults.push({
        type: 'tenant',
        apn: t.apn,
        entity_id: t.entity_id,
        entity_name: t.entity_name,
        street_address: t.street_address,
        city: t.city,
        centroid: t.centroid,
        doc_count: getDocCount(t.street_address),
      })
    })
  }

  // Add owners
  if (dbResults?.owners) {
    dbResults.owners.forEach(o => {
      allResults.push({
        type: 'owner',
        apn: o.apn,
        entity_id: o.entity_id,
        entity_name: o.entity_name,
        street_address: o.street_address,
        city: o.city,
        centroid: o.centroid,
        doc_count: getDocCount(o.street_address),
      })
    })
  }

  // Add CRM Properties (from Excel import - high priority)
  if (crmResults) {
    crmResults.forEach(p => {
      // Check if this address is already in results to avoid dupes
      const isDupe = allResults.some(r =>
        r.situs_address?.toLowerCase() === p.label.toLowerCase()
      )
      if (!isDupe) {
        allResults.push({
          type: 'crm_property',
          apn: '',
          situs_address: p.label,
          city: p.city,
          latitude: p.latitude,
          longitude: p.longitude,
          doc_count: getDocCount(p.label),
        })
      }
    })
  }

  // Add Google Places results
  if (placesResults) {
    placesResults.forEach(p => {
      allResults.push({
        type: 'google_place',
        apn: '',
        situs_address: p.description,
        city: '',
        place_id: p.place_id,
        doc_count: getDocCount(p.description),
      })
    })
  }

  // Attach global email count to the first result (regardless of type)
  if (allResults.length > 0 && globalEmailCount > 0) {
    allResults[0].email_count = globalEmailCount
  }

  const handleSelect = useCallback((result: SearchResult) => {
    onSelect(result)
    setQuery(result.entity_name || result.situs_address || result.street_address || result.apn)
    setIsOpen(false)
    setHighlightedIndex(-1)
  }, [onSelect])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || allResults.length === 0) {
      if (e.key === 'ArrowDown' && allResults.length > 0) {
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => (prev < allResults.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && allResults[highlightedIndex]) {
          handleSelect(allResults[highlightedIndex])
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

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'parcel': return 'Address'
      case 'tenant': return 'Tenant'
      case 'owner': return 'Owner'
      case 'google_place': return 'New Address'
      case 'dropbox_doc': return 'Has Docs'
      case 'crm_property': return 'CRM Property'
      default: return type
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'parcel': return 'bg-blue-100 text-blue-700'
      case 'tenant': return 'bg-green-100 text-green-700'
      case 'owner': return 'bg-purple-100 text-purple-700'
      case 'google_place': return 'bg-orange-100 text-orange-700'
      case 'dropbox_doc': return 'bg-amber-100 text-amber-700'
      case 'crm_property': return 'bg-sky-100 text-sky-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'parcel':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )
      case 'tenant':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        )
      case 'owner':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )
      case 'google_place':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )
      case 'dropbox_doc':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )
      case 'crm_property':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
            setHighlightedIndex(-1)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search address, tenant, owner, city..."
          className="w-full px-4 py-3 pl-10 bg-white rounded-xl shadow-lg border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          autoComplete="off"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {isLoading && (
          <div className="absolute right-10 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        )}
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setIsOpen(false)
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && query.length >= 2 && (
        <div
          ref={dropdownRef}
          className="fixed left-1/2 -translate-x-1/2 mt-2 bg-white rounded-xl shadow-2xl overflow-hidden z-[9999] w-full max-w-md" style={{ top: '60px' }}
        >
          {isLoading && allResults.length === 0 ? (
            <div className="px-4 py-3 text-gray-500 text-sm">Searching...</div>
          ) : allResults.length > 0 ? (
            <ul ref={listRef} className="max-h-[70vh] overflow-y-auto">
              {allResults.map((result, index) => (
                <li key={`${result.type}-${result.apn || result.place_id}-${index}`}>
                  <button
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-0 ${
                      index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-gray-400 mt-0.5">
                        {getTypeIcon(result.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        {result.entity_name ? (
                          <>
                            <div className="font-medium text-gray-900 truncate">
                              {result.entity_name}
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                              {result.street_address || result.situs_address}
                              {result.city && `, ${result.city}`}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium text-gray-900 truncate">
                              {result.situs_address || result.street_address || 'No address'}
                            </div>
                            <div className="text-sm text-gray-500">
                              {result.city && `${result.city} `}
                              {result.apn && `| APN: ${result.apn}`}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Email count badge */}
                        {result.email_count && result.email_count > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            {result.email_count > 999 ? `${Math.floor(result.email_count / 1000)}k` : result.email_count}
                          </span>
                        )}
                        {/* Document count badge */}
                        {result.doc_count && result.doc_count > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {result.doc_count}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeColor(result.type)}`}>
                          {getTypeLabel(result.type)}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-3 text-gray-500 text-sm">No results found</div>
          )}
        </div>
      )}
    </div>
  )
}
