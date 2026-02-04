import { useEffect, useRef, useState, useMemo } from 'react'
import { Loader } from '@googlemaps/js-api-loader'

interface Property {
  id: string
  address: string
  city: string
  state?: string
  zip?: string
  company?: string
  contact_name?: string
  phone?: string
  sqft?: number
  land_sf?: number
  year_built?: number
  owner_name?: string
  landuse_category?: string
  landuse_desc?: string
  source_type?: string
  geo_source?: string
}

interface GeoJSONFeature {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: Property
}

interface GeoJSONData {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

interface PropertyMapPreviewProps {
  geojsonUrl?: string
  geojsonData?: GeoJSONData
  onPropertySelect?: (property: Property) => void
  height?: string
  initialCenter?: { lat: number; lng: number }
  initialZoom?: number
}

// Color palette for property types
const PROPERTY_COLORS: Record<string, string> = {
  INDUSTRIAL: '#f59e0b',    // amber
  COMMERCIAL: '#3b82f6',    // blue
  RESIDENTIAL: '#10b981',   // green
  PUBLIC: '#8b5cf6',        // purple
  inventory: '#f97316',     // orange
  parcel: '#06b6d4',        // cyan
  tenant: '#ec4899',        // pink
  default: '#6b7280'        // gray
}

// Orange County center
const OC_CENTER = { lat: 33.7879, lng: -117.8531 }

export function PropertyMapPreview({
  geojsonUrl,
  geojsonData,
  onPropertySelect,
  height = '600px',
  initialCenter = OC_CENTER,
  initialZoom = 11
}: PropertyMapPreviewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  
  const [data, setData] = useState<GeoJSONData | null>(geojsonData || null)
  const [loading, setLoading] = useState(!geojsonData)
  const [error, setError] = useState<string | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [filterCity, setFilterCity] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Load GeoJSON data
  useEffect(() => {
    if (geojsonData) {
      setData(geojsonData)
      setLoading(false)
      return
    }

    if (!geojsonUrl) {
      // Try loading from default location
      fetch('/data/building_hawk_geo.geojson')
        .then(res => res.json())
        .then(setData)
        .catch(() => {
          // Try backend data folder
          fetch('/api/properties/geojson')
            .then(res => res.json())
            .then(setData)
            .catch(err => setError('Failed to load property data'))
        })
        .finally(() => setLoading(false))
      return
    }

    fetch(geojsonUrl)
      .then(res => res.json())
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [geojsonUrl, geojsonData])

  // Get unique cities and types for filters
  const { cities, types } = useMemo(() => {
    if (!data) return { cities: [], types: [] }
    
    const citySet = new Set<string>()
    const typeSet = new Set<string>()
    
    data.features.forEach(f => {
      if (f.properties.city) citySet.add(f.properties.city)
      if (f.properties.landuse_category) typeSet.add(f.properties.landuse_category)
      if (f.properties.source_type) typeSet.add(f.properties.source_type)
    })
    
    return {
      cities: Array.from(citySet).sort(),
      types: Array.from(typeSet).sort()
    }
  }, [data])

  // Filter features
  const filteredFeatures = useMemo(() => {
    if (!data) return []
    
    return data.features.filter(f => {
      const props = f.properties
      
      if (filterCity && props.city !== filterCity) return false
      if (filterType) {
        if (props.landuse_category !== filterType && props.source_type !== filterType) {
          return false
        }
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const searchFields = [
          props.address,
          props.company,
          props.contact_name,
          props.owner_name
        ].filter(Boolean).join(' ').toLowerCase()
        
        if (!searchFields.includes(query)) return false
      }
      
      return true
    })
  }, [data, filterCity, filterType, searchQuery])

  // Initialize map
  useEffect(() => {
    const loader = new Loader({
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
      version: 'weekly',
      libraries: ['marker']
    })

    loader.load().then(async () => {
      if (!mapRef.current) return

      const { Map } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary
      const { AdvancedMarkerElement } = await google.maps.importLibrary('marker') as google.maps.MarkerLibrary

      const map = new Map(mapRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        mapId: 'building-hawk-preview',
        mapTypeId: 'hybrid',
        mapTypeControl: true,
        mapTypeControlOptions: {
          position: google.maps.ControlPosition.TOP_RIGHT,
          style: google.maps.MapTypeControlStyle.DROPDOWN_MENU
        },
        fullscreenControl: true,
        streetViewControl: false,
        zoomControl: true
      })

      mapInstanceRef.current = map
      infoWindowRef.current = new google.maps.InfoWindow()

      // Update markers when data changes
      updateMarkers()
    })

    return () => {
      // Cleanup markers
      markersRef.current.forEach(m => m.map = null)
      markersRef.current = []
    }
  }, [])

  // Update markers when filtered features change
  useEffect(() => {
    updateMarkers()
  }, [filteredFeatures])

  const updateMarkers = () => {
    const map = mapInstanceRef.current
    if (!map || !filteredFeatures.length) return

    // Clear existing markers
    markersRef.current.forEach(m => m.map = null)
    markersRef.current = []

    // Add new markers
    const bounds = new google.maps.LatLngBounds()

    filteredFeatures.forEach(feature => {
      const [lng, lat] = feature.geometry.coordinates
      const props = feature.properties
      const position = { lat, lng }

      bounds.extend(position)

      // Create marker element
      const markerDiv = document.createElement('div')
      markerDiv.className = 'property-marker'
      
      const color = PROPERTY_COLORS[props.landuse_category || props.source_type || 'default'] || PROPERTY_COLORS.default
      
      markerDiv.innerHTML = `
        <div style="
          width: 24px;
          height: 24px;
          background: ${color};
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: white;
          font-weight: bold;
        ">
          ${props.sqft ? Math.round(props.sqft / 1000) + 'K' : '•'}
        </div>
      `

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position,
        content: markerDiv,
        title: props.address
      })

      marker.addListener('click', () => {
        setSelectedProperty(props)
        onPropertySelect?.(props)

        const content = `
          <div style="padding: 8px; max-width: 300px; font-family: system-ui, sans-serif;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #1f2937;">
              ${props.address || 'Unknown Address'}
            </h3>
            <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280;">
              ${props.city || ''}${props.city && props.state ? ', ' : ''}${props.state || ''} ${props.zip || ''}
            </p>
            ${props.company ? `
              <p style="margin: 8px 0 4px 0; font-size: 12px;">
                <strong>Company:</strong> ${props.company}
              </p>
            ` : ''}
            ${props.contact_name ? `
              <p style="margin: 4px 0; font-size: 12px;">
                <strong>Contact:</strong> ${props.contact_name}
                ${props.phone ? ` • ${props.phone}` : ''}
              </p>
            ` : ''}
            ${props.sqft ? `
              <p style="margin: 4px 0; font-size: 12px;">
                <strong>Size:</strong> ${props.sqft.toLocaleString()} SF
              </p>
            ` : ''}
            ${props.owner_name ? `
              <p style="margin: 4px 0; font-size: 12px;">
                <strong>Owner:</strong> ${props.owner_name}
              </p>
            ` : ''}
            ${props.landuse_category || props.landuse_desc ? `
              <p style="margin: 4px 0; font-size: 12px;">
                <strong>Type:</strong> ${props.landuse_desc || props.landuse_category}
              </p>
            ` : ''}
            <p style="margin: 8px 0 0 0; font-size: 10px; color: #9ca3af;">
              Source: ${props.source_type || 'N/A'} • Geo: ${props.geo_source || 'N/A'}
            </p>
          </div>
        `

        infoWindowRef.current?.setContent(content)
        infoWindowRef.current?.open(map, marker)
      })

      markersRef.current.push(marker)
    })

    // Fit bounds if we have markers
    if (markersRef.current.length > 0) {
      map.fitBounds(bounds, { padding: 50 })
      
      // Don't zoom in too much for single markers
      const listener = google.maps.event.addListener(map, 'idle', () => {
        if (map.getZoom()! > 16) map.setZoom(16)
        google.maps.event.removeListener(listener)
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-gray-900" style={{ height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading properties...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-gray-900 text-red-400" style={{ height }}>
        <div className="text-center">
          <p className="text-xl mb-2">⚠️ Error</p>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ height }}>
      {/* Header with logo and stats */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-gray-900 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/assets/logos/BUILDINGHAWKINC1f.png" 
              alt="Building Hawk" 
              className="h-10 w-auto"
            />
            <div>
              <h2 className="text-white font-bold text-lg">Building Hawk</h2>
              <p className="text-gray-400 text-sm">
                {filteredFeatures.length.toLocaleString()} properties
                {data && filteredFeatures.length !== data.features.length && 
                  ` (of ${data.features.length.toLocaleString()})`
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and filters */}
      <div className="absolute top-20 left-4 z-10 bg-gray-800/90 backdrop-blur rounded-lg p-3 shadow-xl">
        <div className="flex flex-col gap-2">
          {/* Search */}
          <input
            type="text"
            placeholder="Search address, company..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-56 px-3 py-2 bg-gray-700 text-white rounded-lg text-sm 
                     placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          
          {/* City filter */}
          <select
            value={filterCity}
            onChange={e => setFilterCity(e.target.value)}
            className="w-56 px-3 py-2 bg-gray-700 text-white rounded-lg text-sm 
                     focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Cities</option>
            {cities.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          
          {/* Type filter */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="w-56 px-3 py-2 bg-gray-700 text-white rounded-lg text-sm 
                     focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Types</option>
            {types.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          {/* Clear filters */}
          {(filterCity || filterType || searchQuery) && (
            <button
              onClick={() => {
                setFilterCity('')
                setFilterType('')
                setSearchQuery('')
              }}
              className="w-full px-3 py-2 bg-amber-600 text-white rounded-lg text-sm 
                       hover:bg-amber-700 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-gray-800/90 backdrop-blur rounded-lg p-3 shadow-xl">
        <p className="text-xs text-gray-400 mb-2 font-medium">Property Types</p>
        <div className="flex flex-col gap-1">
          {Object.entries(PROPERTY_COLORS).filter(([k]) => k !== 'default').map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-gray-300 capitalize">
                {type.toLowerCase().replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected property panel */}
      {selectedProperty && (
        <div className="absolute top-20 right-4 z-10 bg-gray-800/95 backdrop-blur rounded-lg p-4 shadow-xl max-w-xs">
          <button
            onClick={() => setSelectedProperty(null)}
            className="absolute top-2 right-2 text-gray-400 hover:text-white"
          >
            ✕
          </button>
          <h3 className="text-white font-semibold mb-2 pr-6">
            {selectedProperty.address}
          </h3>
          <p className="text-gray-400 text-sm mb-3">
            {selectedProperty.city}, {selectedProperty.state} {selectedProperty.zip}
          </p>
          
          <div className="space-y-2 text-sm">
            {selectedProperty.company && (
              <div>
                <span className="text-gray-500">Company:</span>
                <span className="text-white ml-2">{selectedProperty.company}</span>
              </div>
            )}
            {selectedProperty.sqft && (
              <div>
                <span className="text-gray-500">Size:</span>
                <span className="text-amber-400 ml-2 font-medium">
                  {selectedProperty.sqft.toLocaleString()} SF
                </span>
              </div>
            )}
            {selectedProperty.contact_name && (
              <div>
                <span className="text-gray-500">Contact:</span>
                <span className="text-white ml-2">{selectedProperty.contact_name}</span>
              </div>
            )}
            {selectedProperty.phone && (
              <div>
                <span className="text-gray-500">Phone:</span>
                <a 
                  href={`tel:${selectedProperty.phone}`}
                  className="text-amber-400 ml-2 hover:underline"
                >
                  {selectedProperty.phone}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Map container */}
      <div ref={mapRef} className="w-full h-full" />
    </div>
  )
}

export default PropertyMapPreview
