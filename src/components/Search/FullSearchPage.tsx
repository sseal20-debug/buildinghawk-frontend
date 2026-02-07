import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { buildingSearchApi } from '../../api/client'
import type { BuildingSearchCriteria, BuildingSearchResult, FilterOptions } from '../../api/client'

interface FullSearchPageProps {
  sidebarOpen: boolean
  onNavigateToProperty: (lat: number, lng: number, apn: string) => void
  onClose: () => void
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'for_sale', label: 'For Sale' },
  { value: 'for_lease', label: 'For Lease' },
  { value: 'sold', label: 'Sold' },
  { value: 'leased', label: 'Leased' },
  { value: 'escrow', label: 'Escrow' },
]

const CLEAR_HEIGHT_OPTIONS = [
  { value: '', label: 'Any' },
  { value: '24', label: "24'+" },
  { value: '28', label: "28'+" },
  { value: '32', label: "32'+" },
  { value: '36', label: "36'+" },
]

const DOCK_OPTIONS = [
  { value: '', label: 'Any' },
  { value: '1', label: '1+' },
  { value: '2', label: '2+' },
  { value: '4', label: '4+' },
  { value: '6', label: '6+' },
]

const GL_OPTIONS = [
  { value: '', label: 'Any' },
  { value: '1', label: '1+' },
  { value: '2', label: '2+' },
]

const POWER_OPTIONS = [
  { value: '', label: 'Any' },
  { value: '200', label: '200A+' },
  { value: '400', label: '400A+' },
  { value: '600', label: '600A+' },
  { value: '800', label: '800A+' },
  { value: '1200', label: '1200A+' },
  { value: '2000', label: '2000A+' },
]

const SF_PRESETS = [
  { value: '', label: 'Any' },
  { value: '0-5000', label: '0 - 5,000' },
  { value: '5000-10000', label: '5,000 - 10,000' },
  { value: '10000-25000', label: '10,000 - 25,000' },
  { value: '25000-50000', label: '25,000 - 50,000' },
  { value: '50000-100000', label: '50,000 - 100,000' },
  { value: '100000-', label: '100,000+' },
]

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '--'
  return n.toLocaleString()
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '--'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

type SortKey = 'address' | 'city' | 'building_sf' | 'lot_sf' | 'year_built'

export function FullSearchPage({ sidebarOpen, onNavigateToProperty, onClose }: FullSearchPageProps) {
  // Filter state
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [sfPreset, setSfPreset] = useState('')
  const [minSf, setMinSf] = useState('')
  const [maxSf, setMaxSf] = useState('')
  const [status, setStatus] = useState('all')
  const [propertyType, setPropertyType] = useState('')
  const [yearBuiltMin, setYearBuiltMin] = useState('')
  const [yearBuiltMax, setYearBuiltMax] = useState('')
  const [clearHeight, setClearHeight] = useState('')
  const [dockDoors, setDockDoors] = useState('')
  const [glDoors, setGlDoors] = useState('')
  const [power, setPower] = useState('')
  const [fencedYard, setFencedYard] = useState(false)

  // Sort state
  const [sortBy, setSortBy] = useState<SortKey>('address')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Results state
  const [results, setResults] = useState<BuildingSearchResult[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // City dropdown open
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false)

  // Fetch filter options
  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ['filter-options'],
    queryFn: buildingSearchApi.getFilterOptions,
    staleTime: 5 * 60 * 1000,
  })

  // Auto-search on mount (show all results)
  useEffect(() => {
    handleSearch()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const buildCriteria = useCallback((): BuildingSearchCriteria => {
    const criteria: BuildingSearchCriteria = {
      sort_by: sortBy,
      sort_dir: sortDir,
    }
    if (selectedCities.length > 0) criteria.cities = selectedCities
    if (minSf) criteria.min_sf = parseInt(minSf)
    if (maxSf) criteria.max_sf = parseInt(maxSf)
    if (status !== 'all') criteria.listing_status = status
    if (propertyType) criteria.property_type = propertyType
    if (yearBuiltMin) criteria.year_built_min = parseInt(yearBuiltMin)
    if (yearBuiltMax) criteria.year_built_max = parseInt(yearBuiltMax)
    if (clearHeight) criteria.min_clear_height = parseInt(clearHeight)
    if (dockDoors) criteria.min_docks = parseInt(dockDoors)
    if (glDoors) criteria.min_gl_doors = parseInt(glDoors)
    if (power) criteria.min_amps = parseInt(power)
    if (fencedYard) criteria.fenced_yard = true
    return criteria
  }, [selectedCities, minSf, maxSf, status, propertyType, yearBuiltMin, yearBuiltMax, clearHeight, dockDoors, glDoors, power, fencedYard, sortBy, sortDir])

  const handleSearch = useCallback(async () => {
    setIsSearching(true)
    setHasSearched(true)
    try {
      const criteria = buildCriteria()
      const data = await buildingSearchApi.execute(criteria)
      setResults(data.results)
      setResultCount(data.count)
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setIsSearching(false)
    }
  }, [buildCriteria])

  const handleClear = () => {
    setSelectedCities([])
    setSfPreset('')
    setMinSf('')
    setMaxSf('')
    setStatus('all')
    setPropertyType('')
    setYearBuiltMin('')
    setYearBuiltMax('')
    setClearHeight('')
    setDockDoors('')
    setGlDoors('')
    setPower('')
    setFencedYard(false)
  }

  const handleSfPresetChange = (preset: string) => {
    setSfPreset(preset)
    if (!preset) {
      setMinSf('')
      setMaxSf('')
    } else {
      const [min, max] = preset.split('-')
      setMinSf(min || '')
      setMaxSf(max || '')
    }
  }

  const handleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  const toggleCity = (city: string) => {
    setSelectedCities(prev =>
      prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]
    )
  }

  const sortArrow = (col: SortKey) => {
    if (sortBy !== col) return ''
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  return (
    <div className="full-search-page">
      <div className="fsp-inner">
        {/* Header */}
        <div className="fsp-header">
          <button className="fsp-back-btn" onClick={onClose}>
            &larr; Back to Map
          </button>
          <h1 className="fsp-title">Property Search</h1>
          <div className="fsp-result-count">
            {hasSearched && !isSearching && `${resultCount.toLocaleString()} results`}
            {isSearching && 'Searching...'}
          </div>
        </div>

        {/* Filters */}
        <div className="fsp-filters">
          {/* Section: Location & Size */}
          <div className="fsp-section">
            <div className="fsp-section-label">Location & Size</div>
            <div className="fsp-filter-row">
              <div className="fsp-filter-group">
                <label>City</label>
                <div className="fsp-city-dropdown" onClick={() => setCityDropdownOpen(!cityDropdownOpen)}>
                  <div className="fsp-city-display">
                    {selectedCities.length === 0 ? 'All Cities' : selectedCities.join(', ')}
                  </div>
                  <span className="fsp-dropdown-arrow">{'\u25BC'}</span>
                  {cityDropdownOpen && (
                    <div className="fsp-city-list" onClick={e => e.stopPropagation()}>
                      {selectedCities.length > 0 && (
                        <div className="fsp-city-item fsp-city-clear" onClick={() => { setSelectedCities([]); setCityDropdownOpen(false) }}>
                          Clear All
                        </div>
                      )}
                      {(filterOptions?.cities || []).map(c => (
                        <div
                          key={c.city}
                          className={`fsp-city-item ${selectedCities.includes(c.city) ? 'selected' : ''}`}
                          onClick={() => toggleCity(c.city)}
                        >
                          <span>{c.city}</span>
                          <span className="fsp-city-count">{c.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="fsp-filter-group">
                <label>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className="fsp-select">
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div className="fsp-filter-group">
                <label>Property Type</label>
                <select value={propertyType} onChange={e => setPropertyType(e.target.value)} className="fsp-select">
                  <option value="">All Types</option>
                  {(filterOptions?.property_types || []).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="fsp-filter-group">
                <label>Size (SF)</label>
                <select value={sfPreset} onChange={e => handleSfPresetChange(e.target.value)} className="fsp-select">
                  {SF_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              <div className="fsp-filter-group fsp-filter-range">
                <label>Custom SF</label>
                <input type="number" placeholder="Min" value={minSf} onChange={e => { setMinSf(e.target.value); setSfPreset('') }} className="fsp-input fsp-input-sm" />
                <span className="fsp-range-sep">-</span>
                <input type="number" placeholder="Max" value={maxSf} onChange={e => { setMaxSf(e.target.value); setSfPreset('') }} className="fsp-input fsp-input-sm" />
              </div>

              <div className="fsp-filter-group fsp-filter-range">
                <label>Year Built</label>
                <input type="number" placeholder="From" value={yearBuiltMin} onChange={e => setYearBuiltMin(e.target.value)} className="fsp-input fsp-input-sm" />
                <span className="fsp-range-sep">-</span>
                <input type="number" placeholder="To" value={yearBuiltMax} onChange={e => setYearBuiltMax(e.target.value)} className="fsp-input fsp-input-sm" />
              </div>
            </div>
          </div>

          {/* Section: Building Specs */}
          <div className="fsp-section">
            <div className="fsp-section-label">Building Specs</div>
            <div className="fsp-filter-row">
              <div className="fsp-filter-group">
                <label>Clear Height</label>
                <select value={clearHeight} onChange={e => setClearHeight(e.target.value)} className="fsp-select">
                  {CLEAR_HEIGHT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div className="fsp-filter-group">
                <label>Dock Doors</label>
                <select value={dockDoors} onChange={e => setDockDoors(e.target.value)} className="fsp-select">
                  {DOCK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div className="fsp-filter-group">
                <label>GL Doors</label>
                <select value={glDoors} onChange={e => setGlDoors(e.target.value)} className="fsp-select">
                  {GL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div className="fsp-filter-group">
                <label>Power (Amps)</label>
                <select value={power} onChange={e => setPower(e.target.value)} className="fsp-select">
                  {POWER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div className="fsp-filter-group fsp-filter-checkbox">
                <label>
                  <input type="checkbox" checked={fencedYard} onChange={e => setFencedYard(e.target.checked)} />
                  Fenced Yard
                </label>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="fsp-actions">
            <button className="fsp-btn fsp-btn-primary" onClick={handleSearch} disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
            <button className="fsp-btn fsp-btn-secondary" onClick={handleClear}>Clear Filters</button>
          </div>
        </div>

        {/* Results Table */}
        <div className="fsp-results">
          {!hasSearched && (
            <div className="fsp-empty">Click Search to find properties</div>
          )}
          {hasSearched && results.length === 0 && !isSearching && (
            <div className="fsp-empty">No properties match your criteria</div>
          )}
          {results.length > 0 && (
            <table className="fsp-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('address')} className="fsp-th-sortable">Address{sortArrow('address')}</th>
                  <th onClick={() => handleSort('city')} className="fsp-th-sortable">City{sortArrow('city')}</th>
                  <th onClick={() => handleSort('building_sf')} className="fsp-th-sortable fsp-th-right">Bldg SF{sortArrow('building_sf')}</th>
                  <th onClick={() => handleSort('lot_sf')} className="fsp-th-sortable fsp-th-right">Lot SF{sortArrow('lot_sf')}</th>
                  <th>Status</th>
                  <th className="fsp-th-right">Rate / Price</th>
                  <th>Owner</th>
                  <th>Type</th>
                  <th onClick={() => handleSort('year_built')} className="fsp-th-sortable fsp-th-right">Year{sortArrow('year_built')}</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr
                    key={r.building_id}
                    className="fsp-row"
                    onClick={() => {
                      if (r.latitude && r.longitude) {
                        onNavigateToProperty(r.latitude, r.longitude, r.apn)
                      }
                    }}
                  >
                    <td className="fsp-td-address">{r.address || '--'}</td>
                    <td>{r.city || '--'}</td>
                    <td className="fsp-td-right">{formatNumber(r.building_sf)}</td>
                    <td className="fsp-td-right">{formatNumber(r.lot_sf)}</td>
                    <td>
                      {r.listing_type ? (
                        <span className={`fsp-status fsp-status-${r.listing_status || r.listing_type}`}>
                          {r.listing_type === 'lease' ? 'For Lease' : r.listing_type === 'sale' ? 'For Sale' : (r.listing_status || '--')}
                        </span>
                      ) : '--'}
                    </td>
                    <td className="fsp-td-right">
                      {r.listing_rate ? `$${r.listing_rate}/SF` : r.listing_price ? formatCurrency(r.listing_price) : r.last_sale_price ? formatCurrency(r.last_sale_price) : '--'}
                    </td>
                    <td className="fsp-td-owner">{r.owner_name || '--'}</td>
                    <td className="fsp-td-type">{r.land_use || '--'}</td>
                    <td className="fsp-td-right">{r.year_built || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
