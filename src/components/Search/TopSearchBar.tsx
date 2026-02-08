// TopSearchBar - Floating search bar with search mode dropdown
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parcelsApi, placesApi, crmPropertiesApi, tenantsApi, buildingSearchApi } from '@/api/client'
import type { TenantSearchResult, SICCode, BuildingSearchResult } from '@/api/client'
import { useDebounce } from '@/hooks/useDebounce'

export type SearchMode = 'address' | 'tenant' | 'industry' | 'sqft'

interface AutocompleteResult {
  type: string // 'crm' | 'parcel' | 'google' | 'tenant' | 'sic' | 'building'
  label: string
  sublabel: string
  lat?: number
  lng?: number
  place_id?: string
  centroid?: { coordinates: [number, number] }
  apn?: string
  entity_id?: string
  sic_code?: string
  building_sf?: number
}

export type QuickFilter = 'all' | 'sale' | 'lease' | 'sold' | 'leased' | 'escrow'

const SEARCH_MODES: { key: SearchMode; label: string; icon: string; desc: string; placeholder: string }[] = [
  { key: 'address',  label: 'Address',  icon: 'A',  desc: 'Property address',          placeholder: 'Search address, city, owner...' },
  { key: 'tenant',   label: 'Tenant',   icon: 'T',  desc: 'Company or tenant name',    placeholder: 'Search by tenant or company name...' },
  { key: 'industry', label: 'Industry', icon: 'I',  desc: 'SIC code or sector',        placeholder: 'Search industry or SIC code...' },
  { key: 'sqft',     label: 'Sq Ft',    icon: 'SF', desc: 'Building square footage',    placeholder: 'Enter SF range (e.g. 10000-50000)...' },
]

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
  const [searchMode, setSearchMode] = useState<SearchMode>('address')
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false)
  const [selectedSicCode, setSelectedSicCode] = useState<string | null>(null)
  const [sfSearchTrigger, setSfSearchTrigger] = useState<{ min: number; max: number } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const modeDropdownRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 300)

  const currentMode = SEARCH_MODES.find(m => m.key === searchMode)!

  // Reset all search state
  const resetSearch = useCallback(() => {
    setQuery('')
    setIsOpen(false)
    setHighlightedIndex(-1)
    setSelectedSicCode(null)
    setSfSearchTrigger(null)
    onSearchChange('')
  }, [onSearchChange])

  // ── Address mode queries ──
  const { data: dbResults, isLoading: dbLoading } = useQuery({
    queryKey: ['unified-search', debouncedQuery],
    queryFn: () => parcelsApi.search(debouncedQuery),
    enabled: searchMode === 'address' && debouncedQuery.length >= 2,
    staleTime: 1000 * 30,
  })

  const { data: placesResults, isLoading: placesLoading } = useQuery({
    queryKey: ['places-autocomplete', debouncedQuery],
    queryFn: () => placesApi.autocomplete(debouncedQuery),
    enabled: searchMode === 'address' && debouncedQuery.length >= 3,
    staleTime: 1000 * 60,
  })

  const { data: crmResults, isLoading: crmLoading } = useQuery({
    queryKey: ['crm-properties-search', debouncedQuery],
    queryFn: () => crmPropertiesApi.autocomplete(debouncedQuery, 15),
    enabled: searchMode === 'address' && debouncedQuery.length >= 2,
    staleTime: 1000 * 60,
  })

  // ── Tenant mode query ──
  const { data: tenantResults, isLoading: tenantLoading } = useQuery({
    queryKey: ['tenant-search', debouncedQuery],
    queryFn: () => tenantsApi.search({ q: debouncedQuery, limit: 20, currentOnly: true }),
    enabled: searchMode === 'tenant' && debouncedQuery.length >= 2,
    staleTime: 1000 * 30,
  })

  // ── Industry mode queries ──
  const { data: sicResults, isLoading: sicLoading } = useQuery({
    queryKey: ['sic-autocomplete', debouncedQuery],
    queryFn: () => tenantsApi.getSicCodes(debouncedQuery),
    enabled: searchMode === 'industry' && !selectedSicCode && debouncedQuery.length >= 1,
    staleTime: 1000 * 60 * 5,
  })

  const { data: sicTenantResults, isLoading: sicTenantLoading } = useQuery({
    queryKey: ['tenants-by-sic', selectedSicCode],
    queryFn: () => tenantsApi.search({ sicCode: selectedSicCode!, limit: 50, currentOnly: true }),
    enabled: searchMode === 'industry' && selectedSicCode !== null,
    staleTime: 1000 * 60,
  })

  // ── Square footage mode query ──
  const { data: sfResults, isLoading: sfLoading } = useQuery({
    queryKey: ['sf-search', sfSearchTrigger],
    queryFn: () => buildingSearchApi.execute({
      min_sf: sfSearchTrigger!.min,
      max_sf: sfSearchTrigger!.max,
      sort_by: 'building_sf',
      sort_dir: 'asc',
    }),
    enabled: searchMode === 'sqft' && sfSearchTrigger !== null,
    staleTime: 1000 * 30,
  })

  // ── Loading state ──
  const isLoading = searchMode === 'address'
    ? (dbLoading || placesLoading || crmLoading)
    : searchMode === 'tenant'
    ? tenantLoading
    : searchMode === 'industry'
    ? (selectedSicCode ? sicTenantLoading : sicLoading)
    : searchMode === 'sqft'
    ? sfLoading
    : false

  // ── Build autocomplete results ──
  const autocompleteResults = useMemo(() => {
    const results: AutocompleteResult[] = []

    if (searchMode === 'address') {
      // CRM results first
      if (crmResults) {
        crmResults.forEach((p: any) => {
          results.push({
            type: 'crm',
            label: p.label,
            sublabel: p.city || '',
            lat: p.latitude,
            lng: p.longitude,
          })
        })
      }
      // Parcel results (deduplicated)
      if (dbResults?.parcels) {
        dbResults.parcels.forEach((p: any) => {
          const isDupe = results.some(
            (r) => r.label.toLowerCase() === (p.situs_address || '').toLowerCase()
          )
          if (!isDupe) {
            results.push({
              type: 'parcel',
              label: p.situs_address || p.apn,
              sublabel: p.city || '',
              centroid: p.centroid,
              apn: p.apn,
            })
          }
        })
      }
      // Google Places last
      if (placesResults) {
        placesResults.forEach((p: any) => {
          results.push({
            type: 'google',
            label: p.description,
            sublabel: '',
            place_id: p.place_id,
          })
        })
      }
    } else if (searchMode === 'tenant') {
      if (tenantResults?.results) {
        tenantResults.results.forEach((t: TenantSearchResult) => {
          if (!t.lat && !t.lng) return // skip tenants without location
          results.push({
            type: 'tenant',
            label: t.entity_name,
            sublabel: [
              t.street_address,
              t.city,
              t.unit_sf ? t.unit_sf.toLocaleString() + ' SF' : null,
            ].filter(Boolean).join(' - '),
            lat: t.lat,
            lng: t.lng,
            entity_id: t.entity_id,
            apn: t.apn,
          })
        })
      }
    } else if (searchMode === 'industry') {
      if (selectedSicCode && sicTenantResults?.results) {
        // Step 2: show tenants matching the selected SIC code
        sicTenantResults.results.forEach((t: TenantSearchResult) => {
          if (!t.lat && !t.lng) return
          results.push({
            type: 'tenant',
            label: t.entity_name,
            sublabel: [
              t.street_address,
              t.city,
              t.unit_sf ? t.unit_sf.toLocaleString() + ' SF' : null,
            ].filter(Boolean).join(' - '),
            lat: t.lat,
            lng: t.lng,
            entity_id: t.entity_id,
            apn: t.apn,
          })
        })
      } else if (sicResults) {
        // Step 1: show SIC code autocomplete
        sicResults.forEach((s: SICCode) => {
          results.push({
            type: 'sic',
            label: `${s.code} - ${s.description}`,
            sublabel: s.division,
            sic_code: s.code,
          })
        })
      }
    } else if (searchMode === 'sqft') {
      if (sfResults?.results) {
        sfResults.results.forEach((b: BuildingSearchResult) => {
          results.push({
            type: 'building',
            label: b.address || b.apn,
            sublabel: [
              b.city,
              b.building_sf ? b.building_sf.toLocaleString() + ' SF' : null,
            ].filter(Boolean).join(' - '),
            lat: b.latitude,
            lng: b.longitude,
            building_sf: b.building_sf ?? undefined,
            apn: b.apn,
          })
        })
      }
    }

    return results
  }, [searchMode, crmResults, dbResults, placesResults, tenantResults, sicResults, selectedSicCode, sicTenantResults, sfResults])

  // ── Handle result selection ──
  const handleSelect = useCallback(
    async (result: AutocompleteResult) => {
      // SIC code selection -> trigger second step
      if (result.type === 'sic' && result.sic_code) {
        setSelectedSicCode(result.sic_code)
        setQuery(result.label)
        setHighlightedIndex(-1)
        // Keep dropdown open for tenant results
        return
      }

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

  // ── Keyboard navigation ──
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // SF mode: Enter triggers search
    if (searchMode === 'sqft' && e.key === 'Enter') {
      e.preventDefault()
      // If results are open and an item is highlighted, select it
      if (isOpen && highlightedIndex >= 0 && autocompleteResults[highlightedIndex]) {
        handleSelect(autocompleteResults[highlightedIndex])
        return
      }
      // Otherwise parse the range and search
      const cleaned = query.replace(/,/g, '')
      const rangeMatch = cleaned.match(/(\d+)\s*[-\u2013]\s*(\d+)/)
      if (rangeMatch) {
        setSfSearchTrigger({ min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) })
        setIsOpen(true)
      } else {
        const sf = parseInt(cleaned.replace(/[^0-9]/g, ''))
        if (sf > 0) {
          setSfSearchTrigger({ min: Math.floor(sf * 0.8), max: Math.ceil(sf * 1.2) })
          setIsOpen(true)
        }
      }
      return
    }

    if (!isOpen || autocompleteResults.length === 0) {
      if (e.key === 'Escape') {
        // Industry mode step 2: go back to SIC list
        if (searchMode === 'industry' && selectedSicCode) {
          setSelectedSicCode(null)
          setQuery('')
          setIsOpen(true)
          return
        }
      }
      return
    }

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
        // Industry mode step 2: go back to SIC codes
        if (searchMode === 'industry' && selectedSicCode) {
          setSelectedSicCode(null)
          setQuery('')
          setIsOpen(true)
        } else {
          setIsOpen(false)
          setHighlightedIndex(-1)
        }
        break
    }
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        !inputRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
      if (
        modeDropdownRef.current &&
        !modeDropdownRef.current.contains(target)
      ) {
        setModeDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Icon helper
  const typeIcon = (type: string) => {
    switch (type) {
      case 'crm': return '\u{1F3E2}'
      case 'parcel': return '\u{1F4CD}'
      case 'google': return '\u{1F310}'
      case 'tenant': return '\u{1F464}'
      case 'sic': return '\u{1F3ED}'
      case 'building': return '\u{1F4D0}'
      default: return '\u{1F4C4}'
    }
  }

  // Determine if we should show the dropdown
  const showDropdown = isOpen && (
    (searchMode === 'address' && query.length >= 2 && autocompleteResults.length > 0) ||
    (searchMode === 'tenant' && query.length >= 2 && autocompleteResults.length > 0) ||
    (searchMode === 'industry' && (autocompleteResults.length > 0 || selectedSicCode)) ||
    (searchMode === 'sqft' && sfSearchTrigger && autocompleteResults.length > 0)
  )

  // Industry mode: back button label
  const sicBackLabel = selectedSicCode
    ? `SIC ${selectedSicCode} -- ${sicTenantResults?.total ?? 0} tenants found`
    : null

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
      {/* Search mode selector */}
      <div className="relative flex-shrink-0" ref={modeDropdownRef}>
        <button
          onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
          className="search-mode-btn h-11 px-3 rounded-l-xl bg-[#1a2332]/95 text-white text-xs font-semibold border border-r-0 border-white/20 flex items-center gap-1.5 shadow-lg hover:bg-[#243040] transition-colors whitespace-nowrap backdrop-blur-sm"
        >
          <span className="search-mode-icon w-6 h-6 rounded-md bg-white/15 flex items-center justify-center text-[10px] font-bold leading-none">
            {currentMode.icon}
          </span>
          <span className="search-mode-label text-[11px]">{currentMode.label}</span>
          <svg className="w-3 h-3 ml-0.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Mode dropdown */}
        {modeDropdownOpen && (
          <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 z-[10001] min-w-[200px] py-1 overflow-hidden">
            {SEARCH_MODES.map((mode) => (
              <button
                key={mode.key}
                onClick={() => {
                  setSearchMode(mode.key)
                  setModeDropdownOpen(false)
                  resetSearch()
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
                className={`w-full px-3 py-2.5 text-left flex items-center gap-2.5 transition-colors ${
                  searchMode === mode.key
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold ${
                  searchMode === mode.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {mode.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{mode.label}</div>
                  <div className="text-[10px] text-gray-400">{mode.desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

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
            // Clear SIC selection when user types in industry mode
            if (searchMode === 'industry' && selectedSicCode) {
              setSelectedSicCode(null)
            }
            // Clear SF trigger when user types in sqft mode
            if (searchMode === 'sqft') {
              setSfSearchTrigger(null)
            }
            onSearchChange(e.target.value)
          }}
          onFocus={() => {
            if (searchMode === 'sqft' && sfSearchTrigger && autocompleteResults.length > 0) {
              setIsOpen(true)
            } else if (query.length >= 2) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={currentMode.placeholder}
          className="w-full h-11 pl-10 pr-10 border-0 rounded-r-xl text-sm font-medium bg-white shadow-lg focus:outline-none focus:ring-2 focus:ring-[#1565c0] focus:shadow-xl transition-all"
          autoComplete="off"
        />
        {/* Search icon */}
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            onClick={() => {
              setQuery('')
              setIsOpen(false)
              setSelectedSicCode(null)
              setSfSearchTrigger(null)
              onSearchChange('')
            }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
          >
            x
          </button>
        )}

        {/* SF mode hint */}
        {searchMode === 'sqft' && query && !sfSearchTrigger && (
          <div className="absolute left-0 right-0 top-full mt-1 px-3 py-1.5 text-[10px] text-gray-400 pointer-events-none">
            Press Enter to search
          </div>
        )}

        {/* Autocomplete dropdown */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 z-[9999] max-h-80 overflow-y-auto"
          >
            {/* Industry mode: back button when viewing tenants by SIC */}
            {searchMode === 'industry' && selectedSicCode && (
              <button
                onClick={() => {
                  setSelectedSicCode(null)
                  setQuery('')
                  setHighlightedIndex(-1)
                  inputRef.current?.focus()
                }}
                className="w-full px-4 py-2 text-left text-xs text-blue-600 bg-blue-50 border-b border-blue-100 hover:bg-blue-100 flex items-center gap-2"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {sicBackLabel || 'Back to industries'}
              </button>
            )}

            {autocompleteResults.length > 0 ? (
              <ul>
                {autocompleteResults.map((result, index) => (
                  <li key={`${result.type}-${result.entity_id || result.sic_code || result.apn || index}`}>
                    <button
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`w-full px-4 py-2.5 text-left border-b border-gray-100 last:border-0 flex items-center gap-3 ${
                        index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-base flex-shrink-0">{typeIcon(result.type)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-gray-900 truncate">{result.label}</div>
                        {result.sublabel && (
                          <div className="text-xs text-gray-500 truncate">{result.sublabel}</div>
                        )}
                      </div>
                      {/* SIC code: show arrow indicating drill-down */}
                      {result.type === 'sic' && (
                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              // Empty state for industry mode with selected SIC
              searchMode === 'industry' && selectedSicCode && !sicTenantLoading && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  No tenants found with this SIC code
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Quick filter pills */}
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
