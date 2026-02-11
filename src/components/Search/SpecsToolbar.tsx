import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { buildingSearchApi } from '../../api/client'
import type { BuildingSearchCriteria, BuildingSearchResult, FilterOptions } from '../../api/client'

interface SpecsToolbarProps {
  sidebarOpen: boolean
  onSearchResults: (apns: string[], results: BuildingSearchResult[]) => void
  onNavigateToProperty: (lat: number, lng: number, apn: string) => void
  onClose: () => void
}

// --- Reused filter option constants from FullSearchPage ---
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
  { value: '', label: 'Any Size' },
  { value: '0-5000', label: '0 - 5,000' },
  { value: '5000-10000', label: '5K - 10K' },
  { value: '10000-25000', label: '10K - 25K' },
  { value: '25000-50000', label: '25K - 50K' },
  { value: '50000-100000', label: '50K - 100K' },
  { value: '100000-', label: '100K+' },
]

const TYPE_OPTIONS = [
  'Industrial',
  'Distribution',
  'Manufacturing',
  'Flex/R&D',
  'Cold Storage',
  'Office',
  'Retail',
  'Multi-family',
]

type DropdownKey = 'type' | 'location' | 'size' | 'office' | 'yard' | 'power' | 'clearance' | 'loading' | 'yearBuilt' | 'special' | null

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

export function SpecsToolbar({ sidebarOpen, onSearchResults, onNavigateToProperty, onClose }: SpecsToolbarProps) {
  // Dropdown state
  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [sfPreset, setSfPreset] = useState('')
  const [minSf, setMinSf] = useState('')
  const [maxSf, setMaxSf] = useState('')
  const [minOfficeSf, setMinOfficeSf] = useState('')
  const [fencedYard, setFencedYard] = useState(false)
  const [power, setPower] = useState('')
  const [clearHeight, setClearHeight] = useState('')
  const [dockDoors, setDockDoors] = useState('')
  const [glDoors, setGlDoors] = useState('')
  const [yearBuiltMin, setYearBuiltMin] = useState('')
  const [yearBuiltMax, setYearBuiltMax] = useState('')
  const [sprinkler, setSprinkler] = useState(false)
  const [rail, setRail] = useState(false)
  const [ownerOccupied, setOwnerOccupied] = useState(false)

  // Results
  const [results, setResults] = useState<BuildingSearchResult[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [showResultsList, setShowResultsList] = useState(false)

  // Sort
  const [sortBy, setSortBy] = useState<string>('address')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Fetch filter options
  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ['filter-options'],
    queryFn: buildingSearchApi.getFilterOptions,
    staleTime: 5 * 60 * 1000,
  })

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null)
      // Tab triggers search
      if (e.key === 'Tab' && openDropdown !== null) {
        e.preventDefault()
        setOpenDropdown(null)
        handleSearch()
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openDropdown])

  const toggleDropdown = (key: DropdownKey) => {
    setOpenDropdown(prev => prev === key ? null : key)
  }

  const buildCriteria = useCallback((): BuildingSearchCriteria => {
    const criteria: BuildingSearchCriteria = {
      sort_by: sortBy,
      sort_dir: sortDir,
    }
    if (selectedCities.length > 0) criteria.cities = selectedCities
    if (minSf) criteria.min_sf = parseInt(minSf)
    if (maxSf) criteria.max_sf = parseInt(maxSf)
    if (selectedTypes.length === 1) criteria.property_type = selectedTypes[0]
    if (yearBuiltMin) criteria.year_built_min = parseInt(yearBuiltMin)
    if (yearBuiltMax) criteria.year_built_max = parseInt(yearBuiltMax)
    if (clearHeight) criteria.min_clear_height = parseInt(clearHeight)
    if (dockDoors) criteria.min_docks = parseInt(dockDoors)
    if (glDoors) criteria.min_gl_doors = parseInt(glDoors)
    if (power) criteria.min_amps = parseInt(power)
    if (fencedYard) criteria.fenced_yard = true
    // Special filters
    if (sprinkler) criteria.sprinkler = true
    if (ownerOccupied) criteria.owner_occupied = true
    if (minOfficeSf) criteria.min_office_sf = parseInt(minOfficeSf)
    if (rail) criteria.rail = true
    return criteria
  }, [selectedCities, minSf, maxSf, selectedTypes, yearBuiltMin, yearBuiltMax, clearHeight, dockDoors, glDoors, power, fencedYard, sprinkler, ownerOccupied, minOfficeSf, rail, sortBy, sortDir])

  const handleSearch = useCallback(async () => {
    console.log('[SpecsToolbar] handleSearch called')
    setIsSearching(true)
    try {
      const criteria = buildCriteria()
      console.log('[SpecsToolbar] criteria:', JSON.stringify(criteria))
      const data = await buildingSearchApi.execute(criteria)
      console.log('[SpecsToolbar] results:', data.count, 'buildings')
      setResults(data.results)
      setResultCount(data.count)
      // Extract APNs and emit to parent for map highlighting
      const apns = [...new Set(data.results.map(r => r.apn).filter(Boolean))]
      console.log('[SpecsToolbar] emitting', apns.length, 'APNs to parent')
      onSearchResults(apns, data.results)
    } catch (err) {
      console.error('[SpecsToolbar] search failed:', err)
    } finally {
      setIsSearching(false)
    }
  }, [buildCriteria, onSearchResults])

  const handleClear = () => {
    setSelectedTypes([])
    setSelectedCities([])
    setSfPreset('')
    setMinSf('')
    setMaxSf('')
    setMinOfficeSf('')
    setFencedYard(false)
    setPower('')
    setClearHeight('')
    setDockDoors('')
    setGlDoors('')
    setYearBuiltMin('')
    setYearBuiltMax('')
    setSprinkler(false)
    setRail(false)
    setOwnerOccupied(false)
    setResults([])
    setResultCount(0)
    onSearchResults([], [])
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

  const toggleCity = (city: string) => {
    setSelectedCities(prev =>
      prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]
    )
  }

  const toggleType = (t: string) => {
    setSelectedTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    )
  }

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  const sortArrow = (col: string) => {
    if (sortBy !== col) return ''
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  // Helper: does a filter have a non-default value?
  const hasFilter = (key: DropdownKey): boolean => {
    switch (key) {
      case 'type': return selectedTypes.length > 0
      case 'location': return selectedCities.length > 0
      case 'size': return !!(minSf || maxSf)
      case 'office': return !!minOfficeSf
      case 'yard': return fencedYard
      case 'power': return !!power
      case 'clearance': return !!clearHeight
      case 'loading': return !!(dockDoors || glDoors)
      case 'yearBuilt': return !!(yearBuiltMin || yearBuiltMax)
      case 'special': return sprinkler || rail || ownerOccupied
      default: return false
    }
  }

  const filterBtnClass = (key: DropdownKey) => {
    const base = 'specs-toolbar-btn'
    const active = openDropdown === key ? ' active' : ''
    const filtered = hasFilter(key) ? ' has-filter' : ''
    return `${base}${active}${filtered}`
  }

  return (
    <>
      {/* Toolbar bar */}
      <div className="specs-toolbar" ref={toolbarRef}>
        {/* Filter buttons */}
        <div className="specs-toolbar-filters">
          {/* Type */}
          <div className="specs-toolbar-item">
            <button className={filterBtnClass('type')} onClick={() => toggleDropdown('type')}>
              Type {'\u25BE'}
            </button>
            {openDropdown === 'type' && (
              <div className="specs-dropdown">
                <div className="specs-dropdown-title">Property Type</div>
                {TYPE_OPTIONS.map(t => (
                  <label key={t} className="specs-checkbox-row">
                    <input type="checkbox" checked={selectedTypes.includes(t)} onChange={() => toggleType(t)} />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Location */}
          <div className="specs-toolbar-item">
            <button className={filterBtnClass('location')} onClick={() => toggleDropdown('location')}>
              Location {'\u25BE'}
            </button>
            {openDropdown === 'location' && (
              <div className="specs-dropdown specs-dropdown-wide">
                <div className="specs-dropdown-title">City</div>
                {selectedCities.length > 0 && (
                  <button className="specs-clear-link" onClick={() => setSelectedCities([])}>Clear All</button>
                )}
                <div className="specs-city-grid">
                  {(filterOptions?.cities || []).map(c => (
                    <label key={c.city} className="specs-checkbox-row">
                      <input type="checkbox" checked={selectedCities.includes(c.city)} onChange={() => toggleCity(c.city)} />
                      <span>{c.city}</span>
                      <span className="specs-count">({c.count})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Size */}
          <div className="specs-toolbar-item">
            <button className={filterBtnClass('size')} onClick={() => toggleDropdown('size')}>
              Size {'\u25BE'}
            </button>
            {openDropdown === 'size' && (
              <div className="specs-dropdown">
                <div className="specs-dropdown-title">Building Size (SF)</div>
                <div className="specs-preset-grid">
                  {SF_PRESETS.map(p => (
                    <button
                      key={p.value}
                      className={`specs-preset-btn ${sfPreset === p.value ? 'active' : ''}`}
                      onClick={() => handleSfPresetChange(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="specs-range-row">
                  <input type="number" placeholder="Min SF" value={minSf} onChange={e => { setMinSf(e.target.value); setSfPreset('') }} className="specs-input" />
                  <span className="specs-range-sep">-</span>
                  <input type="number" placeholder="Max SF" value={maxSf} onChange={e => { setMaxSf(e.target.value); setSfPreset('') }} className="specs-input" />
                </div>
              </div>
            )}
          </div>

          {/* Office */}
          <div className="specs-toolbar-item">
            <button className={filterBtnClass('office')} onClick={() => toggleDropdown('office')}>
              Office {'\u25BE'}
            </button>
            {openDropdown === 'office' && (
              <div className="specs-dropdown">
                <div className="specs-dropdown-title">Office SF (min)</div>
                <input type="number" placeholder="Min Office SF" value={minOfficeSf} onChange={e => setMinOfficeSf(e.target.value)} className="specs-input specs-input-full" />
              </div>
            )}
          </div>

          {/* Yard */}
          <div className="specs-toolbar-item">
            <button className={filterBtnClass('yard')} onClick={() => toggleDropdown('yard')}>
              Yard {'\u25BE'}
            </button>
            {openDropdown === 'yard' && (
              <div className="specs-dropdown">
                <div className="specs-dropdown-title">Yard</div>
                <label className="specs-checkbox-row">
                  <input type="checkbox" checked={fencedYard} onChange={e => setFencedYard(e.target.checked)} />
                  <span>Fenced Yard</span>
                </label>
              </div>
            )}
          </div>

          {/* Power */}
          <div className="specs-toolbar-item">
            <button className={filterBtnClass('power')} onClick={() => toggleDropdown('power')}>
              Power {'\u25BE'}
            </button>
            {openDropdown === 'power' && (
              <div className="specs-dropdown">
                <div className="specs-dropdown-title">Power (Amps)</div>
                {POWER_OPTIONS.map(o => (
                  <label key={o.value} className="specs-radio-row">
                    <input type="radio" name="power" checked={power === o.value} onChange={() => setPower(o.value)} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Clearance */}
          <div className="specs-toolbar-item">
            <button className={filterBtnClass('clearance')} onClick={() => toggleDropdown('clearance')}>
              Clearance {'\u25BE'}
            </button>
            {openDropdown === 'clearance' && (
              <div className="specs-dropdown">
                <div className="specs-dropdown-title">Clear Height</div>
                {CLEAR_HEIGHT_OPTIONS.map(o => (
                  <label key={o.value} className="specs-radio-row">
                    <input type="radio" name="clearHeight" checked={clearHeight === o.value} onChange={() => setClearHeight(o.value)} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Loading */}
          <div className="specs-toolbar-item">
            <button className={filterBtnClass('loading')} onClick={() => toggleDropdown('loading')}>
              Loading {'\u25BE'}
            </button>
            {openDropdown === 'loading' && (
              <div className="specs-dropdown">
                <div className="specs-dropdown-title">Loading</div>
                <div className="specs-select-row">
                  <label>Dock Doors</label>
                  <select value={dockDoors} onChange={e => setDockDoors(e.target.value)} className="specs-select">
                    {DOCK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="specs-select-row">
                  <label>GL Doors</label>
                  <select value={glDoors} onChange={e => setGlDoors(e.target.value)} className="specs-select">
                    {GL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Yr Built */}
          <div className="specs-toolbar-item">
            <button className={filterBtnClass('yearBuilt')} onClick={() => toggleDropdown('yearBuilt')}>
              Yr Built {'\u25BE'}
            </button>
            {openDropdown === 'yearBuilt' && (
              <div className="specs-dropdown">
                <div className="specs-dropdown-title">Year Built</div>
                <div className="specs-range-row">
                  <input type="number" placeholder="From" value={yearBuiltMin} onChange={e => setYearBuiltMin(e.target.value)} className="specs-input" />
                  <span className="specs-range-sep">-</span>
                  <input type="number" placeholder="To" value={yearBuiltMax} onChange={e => setYearBuiltMax(e.target.value)} className="specs-input" />
                </div>
              </div>
            )}
          </div>

          {/* Special */}
          <div className="specs-toolbar-item">
            <button className={filterBtnClass('special')} onClick={() => toggleDropdown('special')}>
              Special {'\u25BE'}
            </button>
            {openDropdown === 'special' && (
              <div className="specs-dropdown">
                <div className="specs-dropdown-title">Special Features</div>
                <label className="specs-checkbox-row">
                  <input type="checkbox" checked={sprinkler} onChange={e => setSprinkler(e.target.checked)} />
                  <span>Sprinkler</span>
                </label>
                <label className="specs-checkbox-row">
                  <input type="checkbox" checked={rail} onChange={e => setRail(e.target.checked)} />
                  <span>Rail Served</span>
                </label>
                <label className="specs-checkbox-row">
                  <input type="checkbox" checked={ownerOccupied} onChange={e => setOwnerOccupied(e.target.checked)} />
                  <span>Owner Occupied</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="specs-toolbar-actions">
          <button className="specs-search-btn" onClick={handleSearch} disabled={isSearching}>
            {isSearching ? '...' : 'Search'}
          </button>
          <button className="specs-clear-btn" onClick={handleClear}>Clear</button>
          {resultCount > 0 && (
            <span className="specs-result-count">{resultCount.toLocaleString()} results</span>
          )}
          {results.length > 0 && (
            <button
              className={`specs-list-btn ${showResultsList ? 'active' : ''}`}
              onClick={() => setShowResultsList(!showResultsList)}
            >
              List
            </button>
          )}
          <button className="specs-close-btn" onClick={onClose} title="Close Specs">&times;</button>
        </div>
      </div>

      {/* Results panel (slides in from right) */}
      {showResultsList && results.length > 0 && (
        <div className="specs-results-panel">
          <div className="specs-results-header">
            <span className="specs-results-title">{resultCount.toLocaleString()} Properties</span>
            <button className="specs-results-close" onClick={() => setShowResultsList(false)}>&times;</button>
          </div>
          <table className="specs-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('address')} className="specs-th-sort">Address{sortArrow('address')}</th>
                <th onClick={() => handleSort('city')} className="specs-th-sort">City{sortArrow('city')}</th>
                <th onClick={() => handleSort('building_sf')} className="specs-th-sort specs-th-r">SF{sortArrow('building_sf')}</th>
                <th className="specs-th-r">Clr Ht</th>
                <th className="specs-th-r">Docks</th>
                <th className="specs-th-r">GL</th>
                <th className="specs-th-r">Power</th>
                <th>Yard</th>
                <th className="specs-th-r">Rate/Price</th>
                <th>Owner</th>
                <th onClick={() => handleSort('year_built')} className="specs-th-sort specs-th-r">Year{sortArrow('year_built')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr
                  key={r.building_id}
                  className="specs-row"
                  onClick={() => {
                    if (r.latitude && r.longitude) {
                      onNavigateToProperty(r.latitude, r.longitude, r.apn)
                    }
                  }}
                >
                  <td className="specs-td-addr">{r.address || '--'}</td>
                  <td>{r.city || '--'}</td>
                  <td className="specs-td-r">{formatNumber(r.building_sf)}</td>
                  <td className="specs-td-r">{r.clear_height_ft ? `${r.clear_height_ft}'` : '--'}</td>
                  <td className="specs-td-r">{r.dock_doors || '--'}</td>
                  <td className="specs-td-r">{r.gl_doors || '--'}</td>
                  <td className="specs-td-r">{r.power_amps ? `${r.power_amps}A` : '--'}</td>
                  <td>{r.fenced_yard ? 'Yes' : '--'}</td>
                  <td className="specs-td-r">
                    {r.listing_rate ? `$${r.listing_rate}/SF` : r.listing_price ? formatCurrency(r.listing_price) : r.last_sale_price ? formatCurrency(r.last_sale_price) : '--'}
                  </td>
                  <td className="specs-td-owner">{r.owner_name || '--'}</td>
                  <td className="specs-td-r">{r.year_built || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
