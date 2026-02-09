import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
  owner_name?: string
  landuse_category?: string
}

interface PropertyMapPreviewProps {
  geojsonUrl: string
  onPropertySelect?: (property: Property) => void
  height?: string
}

export function PropertyMapPreview({ geojsonUrl, onPropertySelect, height = '600px' }: PropertyMapPreviewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [33.84, -117.93],
      zoom: 13,
    })
    mapRef.current = map

    // ESRI satellite tiles
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
      detectRetina: true,
    }).addTo(map)

    // Labels
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
      maxZoom: 19,
      opacity: 1,
    }).addTo(map)

    // Load GeoJSON
    fetch(geojsonUrl)
      .then((res) => res.json())
      .then((geojson) => {
        const layer = L.geoJSON(geojson, {
          pointToLayer: (_feature, latlng) =>
            L.circleMarker(latlng, {
              radius: 6,
              fillColor: '#22c55e',
              color: '#ffffff',
              weight: 2,
              fillOpacity: 0.8,
            }),
          onEachFeature: (feature, l) => {
            const props = feature.properties || {}
            l.bindTooltip(props.address || props.name || 'Unknown')
            l.on('click', () => {
              if (onPropertySelect) {
                onPropertySelect({
                  id: props.id || '',
                  address: props.address || '',
                  city: props.city || '',
                  state: props.state,
                  zip: props.zip,
                  company: props.company,
                  contact_name: props.contact_name,
                  phone: props.phone,
                  sqft: props.sqft,
                  owner_name: props.owner_name,
                  landuse_category: props.landuse_category,
                })
              }
            })
          },
        })
        layer.addTo(map)
        const bounds = layer.getBounds()
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50] })
        }
      })
      .catch((err) => console.error('Failed to load GeoJSON:', err))

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [geojsonUrl, onPropertySelect])

  return <div ref={mapContainerRef} style={{ width: '100%', height }} />
}
