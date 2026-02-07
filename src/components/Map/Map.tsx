import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { parcelsApi, roadsApi, type PropertyMarker, type ParcelUnit, type RoadGeometry, type CompanyLabel } from '@/api/client'
import type { Parcel, ParcelFeature, CRMEntity } from '@/types'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
// leaflet.gridlayer.googlemutant loaded dynamically when user selects Google Satellite (HD)

interface MapProps {
  onParcelSelect: (parcel: Parcel) => void
  onParcelRightClick?: (parcel: Parcel, position: { x: number; y: number }) => void
  selectedApn?: string
  center?: { lat: number; lng: number } | null
  // When set, only show the parcel at this location (for search result selection)
  selectedSearchLocation?: { lat: number; lng: number } | null
  // GeoJSON FeatureCollection of parcels to highlight on map (from street search)
  highlightedParcels?: import('@/types').ParcelFeatureCollection | null
  crmMarkers?: CRMEntity[]
  onCRMMarkerClick?: (entity: CRMEntity) => void
  propertyMarkers?: PropertyMarker[]
  landMarkers?: PropertyMarker[]
  // Listing layer filters
  showForSale?: boolean
  showForLease?: boolean
  showRecentSold?: boolean
  showRecentLeased?: boolean
  // Callback when map is ready
  onMapReady?: (map: L.Map) => void
  // Company labels for tenant overlay (Layer 5)
  companyLabels?: CompanyLabel[]
  // Quick filter state — null = parcels hidden, 'all' = show all, etc.
  quickFilter?: string | null
  // Active layer name for badge display
  activeLayerName?: string
}

// Orange County bounds - expanded for better panning
const OC_BOUNDS: L.LatLngBoundsExpression = [
  [33.0, -118.5], // Southwest - expanded
  [34.2, -117.0], // Northeast - expanded
]

// North Orange County center (Anaheim/Fullerton industrial area)
const NORTH_OC_CENTER: L.LatLngExpression = [33.84, -117.89]
const DEFAULT_ZOOM = 13

type ImagerySource = 'esri' | 'google'

// Tile layer URLs — satellite only (Google HD via GoogleMutant plugin, ESRI as fallback)
const TILE_LAYERS = {
  esri: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
  },
}

// Street labels overlay - shows roads/freeways on top of satellite imagery
// Stadia Maps now hosts Stamen tiles (Stamen shut down their tile server)
const STAMEN_LABELS_URL = 'https://tiles.stadiamaps.com/tiles/stamen_toner_labels/{z}/{x}/{y}.png'
// CartoDB dark labels - better contrast on satellite
const CARTO_DARK_LABELS_URL = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png'
// CartoDB light labels
const CARTO_LABELS_URL = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'

// Minimum zoom to show street labels
const MIN_STREET_LABEL_ZOOM = 12

// ==============================================
// BRIGHT COLOR SCHEME FOR HIGHLIGHTING
// ==============================================
// Parcel colors (6 colors for different search categories)
const PARCEL_COLORS = {
  default: '#00D4FF',      // Aqua/Cyan Blue - default parcel outline (like reference image)
  forSale: '#FF3333',      // Bright Red - for sale
  forLease: '#00FF00',     // Bright Green - for lease
  recentSold: '#FF00FF',   // Bright Magenta - recently sold
  recentLeased: '#00FFFF', // Bright Cyan - recently leased
  subject: '#FF0000',      // Bright Red - subject property (like in image)
  highlighted: '#FFFF00',  // Yellow highlight with fill
  // Backup colors
  yellow: '#FFFF00',
  orange: '#FF8C00',
  purple: '#9932CC',
}

// Label/overlay colors
const LABEL_COLORS = {
  streets: '#FFFFFF',      // White for street names
  cities: '#FFFFFF',       // White for city names
  freeways: '#FFCC00',     // Gold/Yellow for freeway lines
}

// Subject property address to highlight in RED
const SUBJECT_PROPERTY_ADDRESS = '1193 N Blue Gum St'

// Road overlay colors by type - BRIGHT VIVID colors visible over satellite imagery
const ROAD_OVERLAY_STYLES = {
  freeway: { color: '#FF6600', weight: 8, opacity: 0.85 },        // Vivid orange - thick
  highway: { color: '#FF8800', weight: 5, opacity: 0.75 },        // Orange (ramps/links)
  primary: { color: '#00E5FF', weight: 4, opacity: 0.7 },         // Bright cyan/aqua
  secondary: { color: '#00BCD4', weight: 3, opacity: 0.6 },       // Teal
}

// Freeway name lookup for tooltip display
const FREEWAY_NAMES: Record<string, string> = {
  '91': 'Riverside Freeway',
  '57': 'Orange Freeway',
  '22': 'Garden Grove Freeway',
  '55': 'Costa Mesa Freeway',
  '5': 'Santa Ana Freeway',
  '405': 'San Diego Freeway',
  '241': 'Foothill/Eastern Toll Road',
  '261': 'Eastern Toll Road',
  '133': 'Laguna Freeway',
  '73': 'San Joaquin Hills Toll Road',
}

export function Map({
  onParcelSelect,
  onParcelRightClick,
  selectedApn,
  center,
  selectedSearchLocation,
  highlightedParcels,
  crmMarkers,
  onCRMMarkerClick,
  propertyMarkers,
  landMarkers,
  showForSale = false,
  showForLease = false,
  showRecentSold = false,
  showRecentLeased = false,
  companyLabels,
  quickFilter = null,
  onMapReady,
  activeLayerName = 'New Listings/Updates',
}: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const streetLabelsLayerRef = useRef<L.TileLayer | null>(null)
  const parcelLayerRef = useRef<L.GeoJSON | null>(null)
  const highlightedLayerRef = useRef<L.GeoJSON | null>(null)
  const localLayerRef = useRef<L.GeoJSON | null>(null)
  const crmLayerRef = useRef<L.LayerGroup | null>(null)
  const propertyLayerRef = useRef<L.LayerGroup | null>(null)
  const landLayerRef = useRef<L.LayerGroup | null>(null)
  const addressLabelLayerRef = useRef<L.LayerGroup | null>(null)
  const subjectPropertyLayerRef = useRef<L.LayerGroup | null>(null)
  const roadOverlayLayerRef = useRef<L.LayerGroup | null>(null)
  const roadNameLabelsLayerRef = useRef<L.LayerGroup | null>(null)
  const companyLabelLayerRef = useRef<L.LayerGroup | null>(null)
  const selectedParcelsLayerRef = useRef<L.LayerGroup | null>(null)
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const drawControlRef = useRef<L.Control.Draw | null>(null)
  const shieldContainerRef = useRef<HTMLDivElement | null>(null)
  const [shieldPaneReady, setShieldPaneReady] = useState(false)
  // Store freeway polyline coords for viewport-clamped shield positioning
  const freewayRoutesRef = useRef<Record<string, { coords: [number, number][][]; isInterstate: boolean }>>({})

  const [mapBounds, setMapBounds] = useState<{
    west: number
    south: number
    east: number
    north: number
  } | null>(null)
  const [localFileLoaded, setLocalFileLoaded] = useState(false)
  const [_localFeatureCount, setLocalFeatureCount] = useState(0)
  const [imagerySource, _setImagerySource] = useState<ImagerySource>('esri')
  const imagerySourceRef = useRef<ImagerySource>('esri')
  const setImagerySource = useCallback((source: ImagerySource) => {
    imagerySourceRef.current = source
    _setImagerySource(source)
  }, [])
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM)
  const [drawMode, setDrawMode] = useState<'none' | 'land' | 'building'>('none')
  const [_isDrawing, setIsDrawing] = useState(false)
  // Multi-select: individually clicked parcels (always visible regardless of quick filter)
  const [selectedParcelApns, setSelectedParcelApns] = useState<Set<string>>(new Set())
  const selectedParcelDataRef = useRef<globalThis.Map<string, { feature: any; parcel: Parcel }>>(new globalThis.Map())
  const [_classifyResult, setClassifyResult] = useState<{ count: number; classification: string } | null>(null)
  // 3D View state
  const [show3D, setShow3D] = useState(false)
  const map3dContainerRef = useRef<HTMLDivElement>(null)
  const map3dElementRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Mutation for classifying parcels by polygon
  const classifyMutation = useMutation({
    mutationFn: ({ polygon, classification }: { polygon: GeoJSON.Polygon; classification: 'land' | 'building' }) =>
      parcelsApi.classifyByPolygon(polygon, classification),
    onSuccess: (data) => {
      setClassifyResult({ count: data.count, classification: data.classification })
      // Invalidate queries to refresh the markers
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      queryClient.invalidateQueries({ queryKey: ['land'] })
      // Clear result after 5 seconds
      setTimeout(() => setClassifyResult(null), 5000)
    },
    onError: (error) => {
      console.error('Failed to classify parcels:', error)
      alert('Failed to classify parcels. Check console for details.')
    },
  })

  // Minimum zoom level to show parcel layers
  const MIN_PARCEL_ZOOM = 14

  // Fetch single parcel at search location (when selected)
  const { data: selectedParcelData } = useQuery({
    queryKey: ['parcel-at-point', selectedSearchLocation?.lat, selectedSearchLocation?.lng],
    queryFn: () => parcelsApi.getAtPoint(selectedSearchLocation!.lat, selectedSearchLocation!.lng),
    enabled: !!selectedSearchLocation,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Fetch parcels within bounds (only when zoomed in enough AND no specific location selected AND quick filter is active)
  const { data: boundsParcelsData } = useQuery({
    queryKey: ['parcels', mapBounds],
    queryFn: () => parcelsApi.getInBounds(mapBounds!),
    enabled: !!mapBounds && currentZoom >= MIN_PARCEL_ZOOM && !selectedSearchLocation && quickFilter !== null,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Fetch parcel units within bounds (for unit pins on multi-tenant properties)
  const MIN_UNIT_PIN_ZOOM = 17
  const { data: parcelUnitsData } = useQuery({
    queryKey: ['parcel-units', mapBounds],
    queryFn: () => parcelsApi.getUnitsInBounds(mapBounds!),
    enabled: !!mapBounds && currentZoom >= MIN_UNIT_PIN_ZOOM,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Fetch road geometry from OpenStreetMap (freeways, highways, major roads)
  const { data: roadGeometryData } = useQuery({
    queryKey: ['road-geometry'],
    queryFn: () => roadsApi.getAll(),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - roads don't change often
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
  })

  // Use selected parcel data if available, otherwise use bounds data
  const parcelsData = selectedSearchLocation ? selectedParcelData : boundsParcelsData

  // Parcel style function - AQUA BLUE with semi-transparent fill (like reference image)
  const _getParcelStyle = useCallback((_feature: any, zoom: number): L.PathOptions => {
    // Hide parcels when zoomed out
    if (zoom < MIN_PARCEL_ZOOM) {
      return { opacity: 0, fillOpacity: 0 }
    }

    return {
      color: PARCEL_COLORS.default, // Aqua/Cyan Blue outline
      weight: 3,
      opacity: 1,
      fillColor: PARCEL_COLORS.default,
      fillOpacity: 0.25, // Semi-transparent blue fill
    }
  }, []) // No dependencies - style is stable

  // Store callbacks in refs to avoid re-creating layers
  const onParcelSelectRef = useRef(onParcelSelect)
  const onParcelRightClickRef = useRef(onParcelRightClick)
  
  useEffect(() => {
    onParcelSelectRef.current = onParcelSelect
    onParcelRightClickRef.current = onParcelRightClick
  }, [onParcelSelect, onParcelRightClick])

  // Handle local GeoJSON file upload
  const _handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !mapRef.current) return

    try {
      const text = await file.text()
      const geojson = JSON.parse(text)

      // Clear existing local features
      if (localLayerRef.current) {
        localLayerRef.current.clearLayers()
      }

      // Create new layer with AQUA BLUE style
      const localLayer = L.geoJSON(geojson, {
        style: () => ({
          color: PARCEL_COLORS.default, // Aqua/Cyan Blue
          weight: 3,
          opacity: 1,
          fillColor: PARCEL_COLORS.default,
          fillOpacity: 0.25,
        }),
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {}
          const parcel: Parcel = {
            apn: props.APN || props.apn || props.PARCEL_ID || '',
            situs_address: props.PROP_ADDRESS || props.Address || props.address || '',
            city: props.PROP_CITY || props.city || props.CITY_NAME || '',
            zip: props.PROP_ZIP || props.zip || '',
            land_sf: props.LAND_SF || props.land_sf || props.LOT_SIZE || 0,
            zoning: props.ZONING || props.zoning || props.LAND_USE || '',
            building_count: props.building_count || 1,
            unit_count: props.unit_count || 0,
            vacant_count: props.vacant_count || 0,
          }
          
          // Left click - select parcel (use ref to avoid stale closure)
          layer.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e)
            onParcelSelectRef.current(parcel)
          })
          
          // Right click - context menu (use ref to avoid stale closure)
          layer.on('contextmenu', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e)
            L.DomEvent.preventDefault(e as unknown as Event)
            if (onParcelRightClickRef.current) {
              onParcelRightClickRef.current(parcel, { x: e.originalEvent.clientX, y: e.originalEvent.clientY })
            }
          })
        },
      })

      localLayer.addTo(mapRef.current)
      localLayerRef.current = localLayer

      const featureCount = geojson.features?.length || 1
      setLocalFeatureCount(featureCount)
      setLocalFileLoaded(true)

      // Fit map to loaded features
      const bounds = localLayer.getBounds()
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50] })
      }

      console.log(`Loaded ${featureCount} features from ${file.name}`)
    } catch (err) {
      console.error('Failed to load GeoJSON:', err)
      alert('Failed to load file. Make sure it\'s valid GeoJSON.')
    }
  }, []) // No dependencies - uses refs for callbacks

  // Clear local layer
  const _clearLocalLayer = useCallback(() => {
    if (localLayerRef.current) {
      localLayerRef.current.clearLayers()
      setLocalFileLoaded(false)
      setLocalFeatureCount(0)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // Switch imagery source (supports Google Maps Satellite HD via dynamic import)
  const switchImagery = useCallback((source: ImagerySource) => {
    const map = mapRef.current
    if (!map) return

    // Remove existing tile layer
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
      tileLayerRef.current = null
    }

    // Google Maps Satellite (HD) — dynamic import with safety check
    if (source === 'google') {
      if (typeof window !== 'undefined' && (window as any).google?.maps) {
        import('leaflet.gridlayer.googlemutant').then(() => {
          // After import, the plugin adds googleMutant to L.gridLayer
          const googleLayer = (L.gridLayer as any).googleMutant({
            type: 'satellite',
            maxZoom: 21,
          })
          googleLayer.addTo(map)
          tileLayerRef.current = googleLayer

          // Show labels on top of Google satellite
          if (streetLabelsLayerRef.current && map.getZoom() >= MIN_STREET_LABEL_ZOOM) {
            if (!map.hasLayer(streetLabelsLayerRef.current)) {
              streetLabelsLayerRef.current.addTo(map)
            }
            if (parcelLayerRef.current) parcelLayerRef.current.bringToFront()
          }

          setImagerySource('google')
        }).catch((err) => {
          console.warn('Failed to load GoogleMutant plugin, falling back to ESRI:', err)
          // Fall back to ESRI
          const { url, attribution } = TILE_LAYERS.esri
          const fallback = L.tileLayer(url, { attribution, maxNativeZoom: 19, maxZoom: 22, detectRetina: true })
          fallback.addTo(map)
          tileLayerRef.current = fallback
          setImagerySource('esri')
        })
      } else {
        console.warn('Google Maps API not loaded yet, falling back to ESRI')
        const { url, attribution } = TILE_LAYERS.esri
        const fallback = L.tileLayer(url, { attribution, maxNativeZoom: 19, maxZoom: 22, detectRetina: true })
        fallback.addTo(map)
        tileLayerRef.current = fallback
        setImagerySource('esri')
      }
      return
    }

    // ESRI satellite fallback (only non-Google satellite option)
    const { url, attribution } = TILE_LAYERS.esri
    const newTileLayer = L.tileLayer(url, {
      attribution,
      maxNativeZoom: 19,
      maxZoom: 22,
      detectRetina: true,
    })
    newTileLayer.addTo(map)
    tileLayerRef.current = newTileLayer

    // Re-add street labels on top (satellite imagery always needs labels)
    if (streetLabelsLayerRef.current && map.getZoom() >= MIN_STREET_LABEL_ZOOM) {
      if (!map.hasLayer(streetLabelsLayerRef.current)) {
        streetLabelsLayerRef.current.addTo(map)
      }
      if (parcelLayerRef.current) {
        parcelLayerRef.current.bringToFront()
      }
    }

    setImagerySource('esri')
  }, [])

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    // Create map with explicit handlers enabled — allow zoom up to 22 for satellite overzoom
    const map = L.map(mapContainerRef.current, {
      center: NORTH_OC_CENTER,
      zoom: DEFAULT_ZOOM,
      maxZoom: 22,
      maxBounds: OC_BOUNDS,
      maxBoundsViscosity: 0.5,
      zoomControl: true,
      scrollWheelZoom: true,
      dragging: true,
      doubleClickZoom: true,
      touchZoom: true,
    })

    mapRef.current = map

    // Notify parent that map is ready
    onMapReady?.(map)

    // Add ESRI satellite as default — always available, always works
    const { url: esriUrl, attribution: esriAttrib } = TILE_LAYERS.esri
    const esriLayer = L.tileLayer(esriUrl, { attribution: esriAttrib, maxNativeZoom: 19, maxZoom: 22, detectRetina: true })
    esriLayer.addTo(map)
    tileLayerRef.current = esriLayer
    setImagerySource('esri')
    console.log('ESRI Satellite loaded as default aerial imagery')

    // Create custom pane for bright street labels (higher z-index)
    map.createPane('labelsPane')
    map.getPane('labelsPane')!.style.zIndex = '650'
    map.getPane('labelsPane')!.style.pointerEvents = 'none'

    // Add street labels overlay - CartoDB light_only_labels
    // White text designed for dark/satellite backgrounds
    const streetLabelsLayer = L.tileLayer(CARTO_DARK_LABELS_URL, {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxNativeZoom: 18,
      maxZoom: 22,
      opacity: 1,
      pane: 'labelsPane',
    })
    streetLabelsLayer.addTo(map)
    streetLabelsLayerRef.current = streetLabelsLayer

    // Create empty parcel layer with AQUA BLUE style
    const parcelLayer = L.geoJSON(undefined, {
      style: () => ({
        color: PARCEL_COLORS.default, // Aqua/Cyan Blue
        weight: 3,
        opacity: 1,
        fillColor: PARCEL_COLORS.default,
        fillOpacity: 0.25,
      }),
    })
    parcelLayer.addTo(map)
    parcelLayerRef.current = parcelLayer

    // Create highlighted parcels layer (for street search highlighting)
    const highlightedLayer = L.geoJSON(undefined, {
      style: () => ({
        color: '#FF6B00',   // Bright orange for search highlights
        weight: 4,
        opacity: 1,
        fillColor: '#FF6B00',
        fillOpacity: 0.35,
      }),
    })
    highlightedLayer.addTo(map)
    highlightedLayerRef.current = highlightedLayer

    // Create CRM markers layer
    const crmLayer = L.layerGroup()
    crmLayer.addTo(map)
    crmLayerRef.current = crmLayer

    // Create property markers layer (light blue)
    const propertyLayer = L.layerGroup()
    propertyLayer.addTo(map)
    propertyLayerRef.current = propertyLayer

    // Create land markers layer (yellow)
    const landLayer = L.layerGroup()
    landLayer.addTo(map)
    landLayerRef.current = landLayer

    // Create address label layer (for unit/address pins)
    const addressLabelLayer = L.layerGroup()
    addressLabelLayer.addTo(map)
    addressLabelLayerRef.current = addressLabelLayer

    // Create subject property layer (for highlighting specific property in RED)
    const subjectPropertyLayer = L.layerGroup()
    subjectPropertyLayer.addTo(map)
    subjectPropertyLayerRef.current = subjectPropertyLayer

    // Create road overlay layer (semi-transparent white along freeways and major roads)
    // This will be populated dynamically when road geometry data is fetched
    map.createPane('roadOverlayPane')
    map.getPane('roadOverlayPane')!.style.zIndex = '420' // Below labels (650) but above tiles
    map.getPane('roadOverlayPane')!.style.pointerEvents = 'none'

    const roadOverlayLayer = L.layerGroup()
    roadOverlayLayer.addTo(map)
    roadOverlayLayerRef.current = roadOverlayLayer

    // Create pane for road name labels (above road overlays, below parcels)
    map.createPane('roadNameLabelsPane')
    map.getPane('roadNameLabelsPane')!.style.zIndex = '640' // Just below labels (650), above everything else
    map.getPane('roadNameLabelsPane')!.style.pointerEvents = 'none'

    // Create shield overlay container INSIDE the Leaflet container (same stacking context as map panes)
    // Appended directly to .leaflet-container, NOT inside .leaflet-map-pane (avoids pan transform)
    // z-index 645: above road overlays (420) and road name labels (640), below CartoDB labels (650)
    const shieldOverlay = document.createElement('div')
    shieldOverlay.style.position = 'absolute'
    shieldOverlay.style.inset = '0'
    shieldOverlay.style.zIndex = '645'
    shieldOverlay.style.pointerEvents = 'none'
    shieldOverlay.style.overflow = 'hidden'
    map.getContainer().appendChild(shieldOverlay)
    shieldContainerRef.current = shieldOverlay
    setShieldPaneReady(true)

    const roadNameLabelsLayer = L.layerGroup()
    roadNameLabelsLayer.addTo(map)
    roadNameLabelsLayerRef.current = roadNameLabelsLayer

    // Create company label layer (for tenant/business name overlay)
    const companyLabelLayer = L.layerGroup()
    companyLabelLayer.addTo(map)
    companyLabelLayerRef.current = companyLabelLayer

    // Create selected parcels layer (always visible, for individually clicked parcels)
    const selectedParcelsLayer = L.layerGroup()
    selectedParcelsLayer.addTo(map)
    selectedParcelsLayerRef.current = selectedParcelsLayer

    // Road overlays and labels will be added dynamically via useEffect when roadGeometryData loads

    // Initialize drawing layer and controls
    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    drawnItemsRef.current = drawnItems

    // Create draw control with no drawing buttons (we use custom UI buttons)
    // Only include edit controls for modifying/deleting drawn shapes
    const drawControl = new (L.Control as any).Draw({
      position: 'topleft',
      draw: false, // Disable default draw buttons, we use our own
      edit: {
        featureGroup: drawnItems,
        remove: true,
        edit: false, // Disable edit button too, only show remove
      },
    })
    map.addControl(drawControl)
    drawControlRef.current = drawControl

    // Handle polygon creation - this will be managed by a separate useEffect
    // to access the current drawMode state

    // Update bounds on map move
    const updateBounds = () => {
      const bounds = map.getBounds()
      setMapBounds({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      })
      setCurrentZoom(map.getZoom())
    }

    map.on('moveend', updateBounds)
    map.on('zoomend', updateBounds)
    updateBounds()

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, []) // Empty deps - only run once on mount

  // Show/hide street labels based on zoom level
  useEffect(() => {
    const map = mapRef.current
    const streetLabelsLayer = streetLabelsLayerRef.current
    if (!map || !streetLabelsLayer) return

    if (currentZoom >= MIN_STREET_LABEL_ZOOM) {
      if (!map.hasLayer(streetLabelsLayer)) {
        streetLabelsLayer.addTo(map)
      }
      // Keep parcels on top of labels
      if (parcelLayerRef.current) {
        parcelLayerRef.current.bringToFront()
      }
      if (localLayerRef.current) {
        localLayerRef.current.bringToFront()
      }
    } else {
      if (map.hasLayer(streetLabelsLayer)) {
        map.removeLayer(streetLabelsLayer)
      }
    }
  }, [currentZoom])

  // Render road overlays and freeway shields when geometry data loads from OpenStreetMap
  useEffect(() => {
    const roadOverlayLayer = roadOverlayLayerRef.current
    const roadNameLabelsLayer = roadNameLabelsLayerRef.current
    if (!roadOverlayLayer || !roadNameLabelsLayer || !roadGeometryData) return

    // Clear existing overlays, labels, and shields
    roadOverlayLayer.clearLayers()
    roadNameLabelsLayer.clearLayers()

    console.log(`Rendering ${roadGeometryData.features.length} road overlay segments`)

    // Collect freeway segments grouped by route number for shield placement
    const freewaySegments: Record<string, { coords: [number, number][][]; isInterstate: boolean }> = {}

    // Add polylines for each road segment
    roadGeometryData.features.forEach((feature) => {
      const roadType = feature.properties.roadType as keyof typeof ROAD_OVERLAY_STYLES
      const style = ROAD_OVERLAY_STYLES[roadType] || ROAD_OVERLAY_STYLES.secondary

      // Convert [lon, lat] to [lat, lon] for Leaflet
      const coords = feature.geometry.coordinates.map(
        ([lon, lat]) => [lat, lon] as L.LatLngExpression
      )

      // Add the road overlay polyline
      const polyline = L.polyline(coords, {
        color: style.color,
        weight: style.weight,
        opacity: (style as any).opacity || 0.8,
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'roadOverlayPane',
        interactive: false,
      })
      roadOverlayLayer.addLayer(polyline)

      // Collect freeway segments for shield placement
      if (roadType === 'freeway' && feature.properties.ref) {
        const refs = (feature.properties.ref as string).split(';')
        refs.forEach(rawRef => {
          const cleaned = rawRef.trim()
          const match = cleaned.match(/(\d+)/)
          if (!match) return
          const routeNum = match[1]
          // Only show shields for known OC freeways — skip routes outside our area (15, 60, 71, 105, 605, etc.)
          if (!FREEWAY_NAMES[routeNum]) return
          const isInterstate = cleaned.startsWith('I ') || cleaned.startsWith('I-')

          if (!freewaySegments[routeNum]) {
            freewaySegments[routeNum] = { coords: [], isInterstate }
          }
          freewaySegments[routeNum].coords.push(
            feature.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
          )
        })
      }
    })

    // Store freeway route data for viewport-clamped shield positioning
    // Shields are rendered as React DOM, not Leaflet markers — they stay visible at viewport edges
    freewayRoutesRef.current = freewaySegments

    console.log(`Road overlays rendered: ${roadGeometryData.features.length} segments, freeway routes stored: ${Object.keys(freewaySegments).sort().join(', ')}`)
  }, [roadGeometryData])

  // Viewport-clamped freeway shields — repositioned on every map move
  // Shields stick to the viewport edge when their freeway scrolls off-screen
  // EXACTLY 2 shields per freeway route (user requirement)
  interface ShieldPos { routeNum: string; x: number; y: number; isInterstate: boolean; name: string; clamped: boolean; idx: number }
  const [shieldPositions, setShieldPositions] = useState<ShieldPos[]>([])

  const updateShieldPositions = useCallback(() => {
    const map = mapRef.current
    const container = shieldContainerRef.current
    const routes = freewayRoutesRef.current
    if (!map || !container || !routes || Object.keys(routes).length === 0) return

    const mapSize = map.getSize()
    const W = mapSize.x
    const H = mapSize.y
    const MARGIN = 40 // Keep shields this far from edge
    const shields: ShieldPos[] = []

    Object.entries(routes).forEach(([routeNum, { coords: segments, isInterstate }]) => {
      // Collect all container-space points for this freeway
      const allScreenPts: { x: number; y: number }[] = []
      const allGeoPts: { lat: number; lng: number }[] = []

      segments.forEach(seg => {
        seg.forEach(([lat, lng]) => {
          allGeoPts.push({ lat, lng })
          const pt = map.latLngToContainerPoint([lat, lng])
          allScreenPts.push({ x: pt.x, y: pt.y })
        })
      })

      const name = FREEWAY_NAMES[routeNum] || `Route ${routeNum}`

      // Filter to points inside viewport
      const visiblePts = allScreenPts.filter(p => p.x >= -50 && p.x <= W + 50 && p.y >= -50 && p.y <= H + 50)

      if (visiblePts.length >= 2) {
        // Freeway IS visible — place 2 shields at ~33% and ~66% along the visible extent
        // Sort by combined x+y distance from top-left to get a rough ordering along the road
        const sorted = [...visiblePts].sort((a, b) => {
          const distA = Math.sqrt(a.x * a.x + a.y * a.y)
          const distB = Math.sqrt(b.x * b.x + b.y * b.y)
          return distA - distB
        })

        const i1 = Math.floor(sorted.length * 0.33)
        const i2 = Math.floor(sorted.length * 0.67)
        const p1 = sorted[i1]
        const p2 = sorted[i2]

        // Ensure minimum separation between 2 shields (at least 120px apart)
        const dx = p2.x - p1.x
        const dy = p2.y - p1.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist >= 120) {
          shields.push({
            routeNum, isInterstate, name, clamped: false, idx: 0,
            x: Math.max(MARGIN, Math.min(W - MARGIN, p1.x)),
            y: Math.max(MARGIN, Math.min(H - MARGIN, p1.y)),
          })
          shields.push({
            routeNum, isInterstate, name, clamped: false, idx: 1,
            x: Math.max(MARGIN, Math.min(W - MARGIN, p2.x)),
            y: Math.max(MARGIN, Math.min(H - MARGIN, p2.y)),
          })
        } else {
          // Too close — just place one at midpoint
          const mid = sorted[Math.floor(sorted.length / 2)]
          shields.push({
            routeNum, isInterstate, name, clamped: false, idx: 0,
            x: Math.max(MARGIN, Math.min(W - MARGIN, mid.x)),
            y: Math.max(MARGIN, Math.min(H - MARGIN, mid.y)),
          })
        }
      } else if (visiblePts.length === 1) {
        // Only one point visible — single shield, clamped to viewport
        const p = visiblePts[0]
        shields.push({
          routeNum, isInterstate, name, clamped: false, idx: 0,
          x: Math.max(MARGIN, Math.min(W - MARGIN, p.x)),
          y: Math.max(MARGIN, Math.min(H - MARGIN, p.y)),
        })
      } else if (allGeoPts.length > 0) {
        // Freeway is OFF-screen — clamp to nearest viewport edge
        const centerPt = map.getCenter()
        let closestPt = allGeoPts[0]
        let closestDist = Infinity
        allGeoPts.forEach(p => {
          const d = Math.abs(p.lat - centerPt.lat) + Math.abs(p.lng - centerPt.lng)
          if (d < closestDist) { closestDist = d; closestPt = p }
        })
        const containerPt = map.latLngToContainerPoint([closestPt.lat, closestPt.lng])
        shields.push({
          routeNum, isInterstate, name, clamped: true, idx: 0,
          x: Math.max(MARGIN, Math.min(W - MARGIN, containerPt.x)),
          y: Math.max(MARGIN, Math.min(H - MARGIN, containerPt.y)),
        })
      }
    })

    setShieldPositions(shields)
  }, [])

  // Hook into map move events to reposition shields
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Update immediately then on every move
    const handler = () => updateShieldPositions()
    map.on('move', handler)
    map.on('zoom', handler)
    map.on('moveend', handler)
    // Initial position
    updateShieldPositions()

    return () => {
      map.off('move', handler)
      map.off('zoom', handler)
      map.off('moveend', handler)
    }
  }, [updateShieldPositions, roadGeometryData])

  // Update parcels when data changes (but not on selection change)
  // Also hides bulk parcels when quickFilter is null
  useEffect(() => {
    if (!parcelLayerRef.current) return

    const parcelLayer = parcelLayerRef.current
    parcelLayer.clearLayers()

    // Clear subject property markers
    if (subjectPropertyLayerRef.current) {
      subjectPropertyLayerRef.current.clearLayers()
    }

    // If quickFilter is null, don't show bulk parcels
    if (quickFilter === null || !parcelsData) return

    // Add new features - AQUA BLUE default, RED for subject property
    parcelsData.features.forEach((feature: ParcelFeature) => {
      try {
        // Check if this is the subject property (1193 N Blue Gum St)
        const address = feature.properties.address || ''
        const isSubjectProperty = address.toLowerCase().includes('1193') &&
          address.toLowerCase().includes('blue gum')

        // Use RED for subject property, AQUA BLUE for others
        const parcelColor = isSubjectProperty ? PARCEL_COLORS.subject : PARCEL_COLORS.default
        const parcelWeight = isSubjectProperty ? 4 : 3
        const parcelFillOpacity = isSubjectProperty ? 0.35 : 0.25

        const layer = L.geoJSON({
          type: 'Feature',
          geometry: feature.geometry,
          properties: feature.properties,
        } as any, {
          style: () => ({
            color: parcelColor,
            weight: parcelWeight,
            opacity: 1,
            fillColor: parcelColor,
            fillOpacity: parcelFillOpacity,
          }),
          onEachFeature: (_f, l) => {
            const parcel: Parcel = {
              apn: feature.properties.apn,
              situs_address: feature.properties.address,
              city: feature.properties.city,
              zip: feature.properties.zip,
              land_sf: feature.properties.land_sf,
              zoning: feature.properties.zoning,
              building_count: feature.properties.building_count,
              unit_count: feature.properties.unit_count,
              vacant_count: feature.properties.vacant_count,
            }

            // Add "SUBJECT" label for subject property
            if (isSubjectProperty && subjectPropertyLayerRef.current) {
              const centroid = feature.properties.centroid as unknown as { coordinates: [number, number] } | undefined
              if (centroid && centroid.coordinates) {
                const [lng, lat] = centroid.coordinates
                const subjectIcon = L.divIcon({
                  className: 'subject-property-marker',
                  html: `<div class="subject-property-label">SUBJECT</div>`,
                  iconSize: [80, 40],
                  iconAnchor: [40, 50],
                })
                const subjectMarker = L.marker([lat, lng], { icon: subjectIcon })
                subjectPropertyLayerRef.current.addLayer(subjectMarker)
              }
            }

            // Left click - select parcel + toggle in selectedParcels set
            l.on('click', (e: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(e)
              onParcelSelectRef.current(parcel)

              // Also toggle in the selected parcels set
              const clickedApn = parcel.apn
              setSelectedParcelApns(prev => {
                const next = new Set(prev)
                if (next.has(clickedApn)) {
                  next.delete(clickedApn)
                  selectedParcelDataRef.current.delete(clickedApn)
                } else {
                  next.add(clickedApn)
                  selectedParcelDataRef.current.set(clickedApn, { feature, parcel })
                }
                return next
              })
            })

            // Right click - context menu (use ref)
            l.on('contextmenu', (e: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(e)
              L.DomEvent.preventDefault(e as unknown as Event)
              if (onParcelRightClickRef.current) {
                onParcelRightClickRef.current(parcel, { x: e.originalEvent.clientX, y: e.originalEvent.clientY })
              }
            })
          },
        })
        parcelLayer.addLayer(layer)
      } catch (e) {
        // Skip invalid geometries
      }
    })
  }, [parcelsData, quickFilter]) // Re-render when data or quick filter changes

  // Update styles when zoom changes (only visibility) - AQUA BLUE
  // Also hides when quickFilter is null (parcels hidden by default)
  useEffect(() => {
    const style = (currentZoom < MIN_PARCEL_ZOOM || quickFilter === null)
      ? { opacity: 0, fillOpacity: 0 }
      : {
          color: PARCEL_COLORS.default, // Aqua/Cyan Blue
          weight: 3,
          opacity: 1,
          fillColor: PARCEL_COLORS.default,
          fillOpacity: 0.25
        }

    if (parcelLayerRef.current) {
      parcelLayerRef.current.setStyle(() => style)
    }
    if (localLayerRef.current) {
      localLayerRef.current.setStyle(() => style)
    }
  }, [currentZoom, quickFilter])

  // Click-to-select: clicking on the map fetches the parcel at that point and toggles selection
  // Works even when quickFilter is null (bulk parcels hidden) — individually selected parcels always show
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const handleMapClick = async (e: L.LeafletMouseEvent) => {
      // Don't interfere with clicks on existing parcel layers (they handle their own click)
      // Only trigger for map clicks (not parcel polygon clicks)
      const lat = e.latlng.lat
      const lng = e.latlng.lng

      // Must be zoomed in enough to identify parcels
      if (map.getZoom() < MIN_PARCEL_ZOOM) return

      try {
        const result = await parcelsApi.getAtPoint(lat, lng)
        if (!result || !result.features || result.features.length === 0) return

        const feature = result.features[0]
        const apn = feature.properties?.apn
        if (!apn) return

        setSelectedParcelApns(prev => {
          const next = new Set(prev)
          if (next.has(apn)) {
            // Deselect
            next.delete(apn)
            selectedParcelDataRef.current.delete(apn)
          } else {
            // Select
            next.add(apn)
            selectedParcelDataRef.current.set(apn, {
              feature,
              parcel: {
                apn: feature.properties.apn,
                situs_address: feature.properties.address,
                city: feature.properties.city,
                zip: feature.properties.zip,
                land_sf: feature.properties.land_sf,
                zoning: feature.properties.zoning,
                building_count: feature.properties.building_count,
                unit_count: feature.properties.unit_count,
                vacant_count: feature.properties.vacant_count,
              } as Parcel,
            })
          }
          return next
        })
      } catch (err) {
        console.error('Failed to fetch parcel at point:', err)
      }
    }

    map.on('click', handleMapClick)
    return () => {
      map.off('click', handleMapClick)
    }
  }, []) // Stable — uses refs and state setters only

  // Render selected parcels in their own always-visible layer (yellow highlight)
  useEffect(() => {
    const layer = selectedParcelsLayerRef.current
    if (!layer) return

    layer.clearLayers()

    selectedParcelDataRef.current.forEach(({ feature, parcel }, apn) => {
      if (!selectedParcelApns.has(apn)) return

      try {
        const geoLayer = L.geoJSON({
          type: 'Feature',
          geometry: feature.geometry,
          properties: feature.properties,
        } as any, {
          style: () => ({
            color: '#FFFF00',      // Bright yellow
            weight: 4,
            opacity: 1,
            fillColor: '#FFFF00',
            fillOpacity: 0.35,
          }),
          onEachFeature: (_f, l) => {
            // Click on selected parcel → deselect it (toggle off) + open detail
            l.on('click', (e: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(e)
              onParcelSelectRef.current(parcel)
              // Toggle off — remove from selected set
              setSelectedParcelApns(prev => {
                const next = new Set(prev)
                if (next.has(apn)) {
                  next.delete(apn)
                  selectedParcelDataRef.current.delete(apn)
                } else {
                  next.add(apn)
                }
                return next
              })
            })
            l.on('contextmenu', (e: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(e)
              L.DomEvent.preventDefault(e as unknown as Event)
              if (onParcelRightClickRef.current) {
                onParcelRightClickRef.current(parcel, { x: e.originalEvent.clientX, y: e.originalEvent.clientY })
              }
            })
          },
        })
        layer.addLayer(geoLayer)
      } catch (e) {
        // Skip invalid geometries
      }
    })

    // Bring selected parcels above bulk parcels
    ;(layer as any).bringToFront?.()
  }, [selectedParcelApns])

  // Handle center prop changes
  useEffect(() => {
    if (center && mapRef.current) {
      mapRef.current.setView([center.lat, center.lng], 17)
    }
  }, [center])

  // Render highlighted parcels from street search
  useEffect(() => {
    const highlightedLayer = highlightedLayerRef.current
    const map = mapRef.current
    if (!highlightedLayer || !map) return

    highlightedLayer.clearLayers()

    if (!highlightedParcels || !highlightedParcels.features || highlightedParcels.features.length === 0) return

    // Add each matching parcel with bright orange highlighting
    highlightedParcels.features.forEach((feature: ParcelFeature) => {
      try {
        if (!feature.geometry) return
        const layer = L.geoJSON({
          type: 'Feature',
          geometry: feature.geometry,
          properties: feature.properties || {},
        } as GeoJSON.Feature, {
          style: () => ({
            color: '#FF6B00',      // Bright orange border
            weight: 4,
            opacity: 1,
            fillColor: '#FF6B00',  // Orange fill
            fillOpacity: 0.35,
          }),
        })

        // Add click handler to select the parcel
        layer.on('click', () => {
          const props = feature.properties
          if (props && onParcelSelectRef.current) {
            onParcelSelectRef.current({
              apn: feature.id as string || props.apn,
              situs_address: props.address,
              city: props.city,
              zip: props.zip,
              land_sf: props.land_sf,
              zoning: props.zoning,
            } as Parcel)
          }
        })

        // Add right-click handler
        layer.on('contextmenu', (e: L.LeafletEvent) => {
          const mouseEvent = e as L.LeafletMouseEvent
          const props = feature.properties
          if (props && onParcelRightClickRef.current) {
            onParcelRightClickRef.current(
              {
                apn: feature.id as string || props.apn,
                situs_address: props.address,
                city: props.city,
                zip: props.zip,
                land_sf: props.land_sf,
                zoning: props.zoning,
              } as Parcel,
              { x: mouseEvent.originalEvent.clientX, y: mouseEvent.originalEvent.clientY }
            )
          }
        })

        highlightedLayer.addLayer(layer)
      } catch (e) {
        // Skip invalid geometries
      }
    })

    // Fit map bounds to show all highlighted parcels
    const bounds = highlightedLayer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 17 })
    }
  }, [highlightedParcels])

  // Re-enable map handlers after potential focus loss and handle resize
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Invalidate map size to handle layout changes
    const invalidateSize = () => {
      map.invalidateSize({ animate: false })
    }

    // Listen for window resize
    window.addEventListener('resize', invalidateSize)

    // Periodically check and re-enable handlers if disabled
    const interval = setInterval(() => {
      if (map) {
        // Re-enable handlers if somehow disabled
        if (!map.dragging.enabled()) {
          map.dragging.enable()
        }
        if (!map.scrollWheelZoom.enabled()) {
          map.scrollWheelZoom.enable()
        }
        if (!map.doubleClickZoom.enabled()) {
          map.doubleClickZoom.enable()
        }
      }
    }, 500)

    // Initial invalidate after mount - multiple delays to handle sidebar layout
    setTimeout(invalidateSize, 100)
    setTimeout(invalidateSize, 500)
    setTimeout(invalidateSize, 1500)

    return () => {
      window.removeEventListener('resize', invalidateSize)
      clearInterval(interval)
    }
  }, [])

  // Handle CRM markers
  useEffect(() => {
    const crmLayer = crmLayerRef.current
    if (!crmLayer) return

    // Clear existing markers
    crmLayer.clearLayers()

    // Add new CRM markers
    if (crmMarkers && crmMarkers.length > 0) {
      crmMarkers.forEach((entity) => {
        if (entity.lat && entity.lng) {
          const isProspect = entity.crm_type === 'prospect'

          // Create custom icon
          const icon = L.divIcon({
            className: 'custom-crm-marker',
            html: `<div style="
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background-color: ${isProspect ? '#f59e0b' : '#22c55e'};
              border: 2px solid white;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 11px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">${isProspect ? 'P' : 'C'}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          })

          const marker = L.marker([entity.lat, entity.lng], { icon })
          marker.bindTooltip(entity.entity_name)
          marker.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e)
            onCRMMarkerClick?.(entity)
          })
          crmLayer.addLayer(marker)
        }
      })
    }
  }, [crmMarkers, onCRMMarkerClick])

  // Handle property markers (light blue)
  useEffect(() => {
    const propertyLayer = propertyLayerRef.current
    if (!propertyLayer) return

    // Clear existing markers
    propertyLayer.clearLayers()

    // Add new property markers (Buildings - GREEN)
    if (propertyMarkers && propertyMarkers.length > 0) {
      propertyMarkers.forEach((property) => {
        if (property.lat && property.lng) {
          // Create custom icon - GREEN for buildings
          const icon = L.divIcon({
            className: 'custom-property-marker',
            html: `<div style="
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background-color: #22c55e;
              border: 2px solid white;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 10px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">B</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          })

          const marker = L.marker([property.lat, property.lng], { icon })
          const tooltipContent = `${property.address}, ${property.city}${property.building_sf ? ` - ${property.building_sf.toLocaleString()} SF` : ''}`
          marker.bindTooltip(tooltipContent)
          marker.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e)
            // Create a parcel object for selection
            const parcel: Parcel = {
              apn: property.id,
              situs_address: property.address,
              city: property.city,
              zip: '',
              land_sf: property.land_sf || 0,
              zoning: '',
              building_count: property.building_count,
            }
            onParcelSelectRef.current(parcel)
          })
          propertyLayer.addLayer(marker)
        }
      })
    }
  }, [propertyMarkers]) // Only depends on data

  // Handle land markers (yellow)
  useEffect(() => {
    const landLayer = landLayerRef.current
    if (!landLayer) return

    // Clear existing markers
    landLayer.clearLayers()

    // Add new land markers
    if (landMarkers && landMarkers.length > 0) {
      landMarkers.forEach((land) => {
        if (land.lat && land.lng) {
          // Create custom icon - yellow color
          const icon = L.divIcon({
            className: 'custom-land-marker',
            html: `<div style="
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background-color: #fbbf24;
              border: 2px solid white;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #1e3a5f;
              font-weight: bold;
              font-size: 10px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">L</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          })

          const marker = L.marker([land.lat, land.lng], { icon })
          const tooltipContent = `${land.address}, ${land.city}${land.land_sf ? ` - ${(land.land_sf / 43560).toFixed(2)} acres` : ''}`
          marker.bindTooltip(tooltipContent)
          marker.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e)
            // Create a parcel object for selection
            const parcel: Parcel = {
              apn: land.id,
              situs_address: land.address,
              city: land.city,
              zip: '',
              land_sf: land.land_sf || 0,
              zoning: '',
              building_count: 0,
            }
            onParcelSelectRef.current(parcel)
          })
          landLayer.addLayer(marker)
        }
      })
    }
  }, [landMarkers]) // Only depends on data

  // Handle company labels (tenant business names from map logo import)
  const MIN_COMPANY_LABEL_ZOOM = 15
  useEffect(() => {
    const companyLabelLayer = companyLabelLayerRef.current
    if (!companyLabelLayer) return

    // Clear existing labels
    companyLabelLayer.clearLayers()

    // Only show at zoom >= 15 to prevent clutter
    if (currentZoom < MIN_COMPANY_LABEL_ZOOM) return

    if (companyLabels && companyLabels.length > 0) {
      companyLabels.forEach((label) => {
        if (label.lat && label.lng) {
          const icon = L.divIcon({
            className: 'company-label-marker',
            html: `<div class="company-label">${label.name}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 12],
          })

          const marker = L.marker([label.lat, label.lng], { icon })

          // Tooltip with full address on hover
          if (label.address) {
            marker.bindTooltip(`${label.name}<br/><span style="font-size:10px;opacity:0.8">${label.address}</span>`, {
              direction: 'top',
              offset: [0, -16],
              className: 'company-tooltip',
            })
          }

          // Click to select the parcel at this location
          marker.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e)
            const parcel: Parcel = {
              apn: String(label.id),
              situs_address: label.address,
              city: label.city,
              zip: '',
              land_sf: 0,
              zoning: '',
              building_count: 0,
            }
            onParcelSelectRef.current(parcel)
          })

          companyLabelLayer.addLayer(marker)
        }
      })
    }
  }, [companyLabels, currentZoom])

  // Handle address label pins - show precise unit locations from parcel_unit table
  // These are geocoded addresses for multi-tenant industrial parks
  useEffect(() => {
    const addressLabelLayer = addressLabelLayerRef.current
    if (!addressLabelLayer) return

    // Clear existing markers
    addressLabelLayer.clearLayers()

    // Only show at high zoom levels
    if (currentZoom < MIN_UNIT_PIN_ZOOM) return

    // Add pins from parcel_unit table (precise geocoded locations)
    if (parcelUnitsData && parcelUnitsData.length > 0) {
      parcelUnitsData.forEach((unit: ParcelUnit) => {
        const lat = unit.latitude
        const lng = unit.longitude

        // Extract unit number from address or use stored unit_number
        let unitNumber = unit.unit_number
        if (!unitNumber) {
          const match = unit.unit_address.match(/#\s*(\w+)|Ste\.?\s+(\w+)|Suite\s+(\w+)|Unit\s+(\w+)/i)
          if (match) {
            unitNumber = match[1] || match[2] || match[3] || match[4]
          }
        }

        // Create pin icon with unit number or street number
        const displayLabel = unitNumber || unit.unit_address.split(' ')[0] || '?'

        const icon = L.divIcon({
          className: 'address-label-pin',
          html: `<div style="
            background-color: #dc2626;
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            white-space: nowrap;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.4);
            transform: translate(-50%, -100%);
            position: relative;
          ">
            ${displayLabel}
            <div style="
              position: absolute;
              bottom: -8px;
              left: 50%;
              transform: translateX(-50%);
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 8px solid #dc2626;
            "></div>
          </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        })

        const marker = L.marker([lat, lng], { icon })

        // Full address tooltip on hover
        marker.bindTooltip(unit.unit_address, {
          direction: 'top',
          offset: [0, -20],
          className: 'address-tooltip'
        })

        // Click to navigate to parcel
        marker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e)
          // Create a parcel object for the click
          const parcel: Parcel = {
            apn: unit.parcel_apn,
            situs_address: unit.unit_address,
            city: unit.city || '',
            zip: '',
            land_sf: 0,
            zoning: '',
            building_count: 0,
          }
          onParcelSelectRef.current(parcel)
        })

        addressLabelLayer.addLayer(marker)
      })
    }

    // Also show pins for condos (parcels with unit numbers in the address)
    // These are separate APNs with their own centroid
    if (parcelsData && parcelsData.features.length > 0) {
      parcelsData.features.forEach((feature: ParcelFeature) => {
        const address = feature.properties.address || ''

        // ONLY show pins for addresses with unit numbers (condos)
        const unitMatch = address.match(/#\s*(\w+)|Ste\.?\s+(\w+)|Suite\s+(\w+)|Unit\s+(\w+)/i)
        if (!unitMatch) return

        // Get centroid coordinates
        const centroid = feature.properties.centroid as unknown as { coordinates: [number, number] } | undefined
        if (!centroid || !centroid.coordinates) return

        const [lng, lat] = centroid.coordinates
        const unitNumber = unitMatch[1] || unitMatch[2] || unitMatch[3] || unitMatch[4]

        const icon = L.divIcon({
          className: 'address-label-pin',
          html: `<div style="
            background-color: #7c3aed;
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            white-space: nowrap;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.4);
            transform: translate(-50%, -100%);
            position: relative;
          ">
            ${unitNumber}
            <div style="
              position: absolute;
              bottom: -8px;
              left: 50%;
              transform: translateX(-50%);
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 8px solid #7c3aed;
            "></div>
          </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        })

        const marker = L.marker([lat, lng], { icon })

        marker.bindTooltip(address, {
          direction: 'top',
          offset: [0, -20],
          className: 'address-tooltip'
        })

        marker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e)
          const parcel: Parcel = {
            apn: feature.properties.apn,
            situs_address: feature.properties.address,
            city: feature.properties.city,
            zip: feature.properties.zip,
            land_sf: feature.properties.land_sf,
            zoning: feature.properties.zoning,
            building_count: feature.properties.building_count,
            unit_count: feature.properties.unit_count,
            vacant_count: feature.properties.vacant_count,
          }
          onParcelSelectRef.current(parcel)
        })

        addressLabelLayer.addLayer(marker)
      })
    }
  }, [parcelUnitsData, parcelsData, currentZoom]) // Re-render when data or zoom changes

  // Handle polygon draw events with current drawMode
  useEffect(() => {
    const map = mapRef.current
    const drawnItems = drawnItemsRef.current
    if (!map || !drawnItems) return

    const handleDrawCreated = (event: any) => {
      const layer = event.layer

      // Get the polygon geometry in GeoJSON format
      const geoJson = layer.toGeoJSON()
      const polygon = geoJson.geometry as GeoJSON.Polygon

      // Set polygon color based on current draw mode
      const color = drawMode === 'building' ? '#22c55e' : '#fbbf24'
      layer.setStyle({
        color: color,
        fillColor: color,
        fillOpacity: 0.3,
      })

      drawnItems.addLayer(layer)

      // Call the classification API
      if (drawMode !== 'none') {
        classifyMutation.mutate({
          polygon,
          classification: drawMode,
        })
      }

      // Reset draw mode after drawing
      setDrawMode('none')
      setIsDrawing(false)
    }

    const handleDrawStart = () => {
      setIsDrawing(true)
    }

    const handleDrawStop = () => {
      setIsDrawing(false)
    }

    map.on(L.Draw.Event.CREATED, handleDrawCreated)
    map.on(L.Draw.Event.DRAWSTART, handleDrawStart)
    map.on(L.Draw.Event.DRAWSTOP, handleDrawStop)

    return () => {
      map.off(L.Draw.Event.CREATED, handleDrawCreated)
      map.off(L.Draw.Event.DRAWSTART, handleDrawStart)
      map.off(L.Draw.Event.DRAWSTOP, handleDrawStop)
    }
  }, [drawMode, classifyMutation])

  // Function to start drawing with specific mode
  const _startDrawing = useCallback((mode: 'land' | 'building') => {
    const map = mapRef.current
    if (!map) return

    setDrawMode(mode)

    // Trigger the polygon draw programmatically
    // Cast to any to work around leaflet-draw TypeScript type issues
    new (L.Draw as any).Polygon(map as any, {
      allowIntersection: false,
      showArea: true,
      shapeOptions: {
        color: mode === 'building' ? '#22c55e' : '#fbbf24',
        weight: 3,
        fillOpacity: 0.3,
      },
    }).enable()
  }, [])

  // Function to clear all drawn polygons
  const _clearDrawnPolygons = useCallback(() => {
    const drawnItems = drawnItemsRef.current
    if (drawnItems) {
      drawnItems.clearLayers()
    }
    setClassifyResult(null)
  }, [])

  // 3D View — create/destroy Google Maps satellite with tilt when show3D toggles
  // Uses standard Google Maps JS API (already loaded) — satellite + 45deg imagery + 3D buildings
  useEffect(() => {
    if (!show3D) {
      // Destroy 3D element if exists
      if (map3dElementRef.current && map3dContainerRef.current) {
        map3dContainerRef.current.innerHTML = ''
        map3dElementRef.current = null
      }
      return
    }

    if (!(window as any).google?.maps) {
      console.warn('Google Maps API not available for 3D view')
      alert('Google Maps API not loaded. Refresh the page and try again.')
      setShow3D(false)
      return
    }

    if (!map3dContainerRef.current || !mapRef.current) return

    // Get current map center and zoom from Leaflet
    const center = mapRef.current.getCenter()
    const zoom = mapRef.current.getZoom()

    try {
      // Create a standard Google Map with satellite + tilt for 3D buildings
      const gMap = new (window as any).google.maps.Map(map3dContainerRef.current, {
        center: { lat: center.lat, lng: center.lng },
        zoom: Math.min(Math.max(zoom, 15), 21),
        mapTypeId: 'satellite',
        tilt: 45,
        heading: 0,
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: (window as any).google.maps.MapTypeControlStyle.DROPDOWN_MENU,
          position: (window as any).google.maps.ControlPosition.TOP_RIGHT,
        },
        streetViewControl: true,
        fullscreenControl: false,
        zoomControl: true,
        rotateControl: true,
        gestureHandling: 'greedy',
      })

      map3dElementRef.current = gMap
      console.log('3D Satellite View initialized — Google Maps with 45-degree aerial imagery')
    } catch (err) {
      console.error('Failed to initialize 3D satellite view:', err)
      alert('Failed to load 3D view. Check the browser console for details.')
      setShow3D(false)
    }
  }, [show3D])

  return (
    <div className="relative w-full h-full" style={{ pointerEvents: 'auto' }}>
      {/* Leaflet 2D map — hidden when 3D is active */}
      <div ref={mapContainerRef} className="w-full h-full" style={{ pointerEvents: 'auto', display: show3D ? 'none' : 'block' }} />

      {/* Google Maps 3D container — shown when 3D is active */}
      <div
        ref={map3dContainerRef}
        className="w-full h-full"
        style={{ display: show3D ? 'block' : 'none' }}
      />

      {/* Viewport-Clamped Freeway Shields — portaled into Leaflet container for correct z-stacking */}
      {shieldPaneReady && shieldContainerRef.current && createPortal(
        <>
          {shieldPositions.map((s) => (
            <div
              key={`${s.routeNum}-${s.idx}`}
              className="absolute pointer-events-none"
              style={{
                left: s.x,
                top: s.y,
                transform: 'translate(-50%, -50%)',
                opacity: s.clamped ? 0.5 : 1,
              }}
            >
              {/* Freeway name label above shield */}
              <div className="freeway-name-label">{s.name}</div>
              {/* Shield icon */}
              <div className={`freeway-shield ${s.isInterstate ? 'interstate' : 'ca-state'}`}>
                <div className="shield-inner">{s.routeNum}</div>
              </div>
            </div>
          ))}
        </>,
        shieldContainerRef.current
      )}


      {/* 3D View toggle — always visible */}
      {!show3D && (
        <button
          onClick={() => setShow3D(true)}
          className="absolute top-20 right-4 z-[1000] px-4 py-3 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl shadow-lg text-base font-bold text-white hover:from-blue-500 hover:to-blue-700 transition-all border border-blue-400/30"
          title="Switch to Google Maps 3D satellite view with tilted aerial imagery"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
        >
          🌐 3D Aerial
        </button>
      )}

      {/* Back to 2D button — show when 3D is active */}
      {show3D && (
        <button
          onClick={() => setShow3D(false)}
          className="absolute top-4 left-16 z-[1000] px-5 py-3 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl shadow-xl text-base font-bold text-white hover:from-gray-600 hover:to-gray-800 transition-all flex items-center gap-2 border border-gray-500/30"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
        >
          <span>🛰️</span>
          <span>Back to Satellite</span>
        </button>
      )}

      {/* Active Layer Badge */}
      <div className="active-layer-badge">
        <span className="pulse-dot" />
        <span>{activeLayerName}</span>
      </div>

      {/* Property Status Legend */}
      <div className="map-legend">
        <h4>Property Status</h4>
        <div className="legend-item">
          <span className="legend-dot sale" />
          <span>For Sale</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot lease" />
          <span>For Lease</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot sold" />
          <span>Sold (Comps)</span>
        </div>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-white px-2 py-1 rounded shadow text-xs text-gray-600">
        Zoom: {currentZoom} {currentZoom < MIN_PARCEL_ZOOM && '(zoom in to see parcels)'}
      </div>

      {/* CLEAR button for selected parcels — only visible when parcels are selected */}
      {selectedParcelApns.size > 0 && (
        <button
          onClick={() => {
            setSelectedParcelApns(new Set())
            selectedParcelDataRef.current.clear()
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-full shadow-lg transition-all hover:scale-105"
        >
          <span>✕</span>
          <span>Clear ({selectedParcelApns.size} parcel{selectedParcelApns.size !== 1 ? 's' : ''})</span>
        </button>
      )}
    </div>
  )
}
