import express from 'express'

const router = express.Router()

// Cache for road geometry to avoid repeated API calls
let roadGeometryCache = null
let cacheTimestamp = null
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

// Orange County bounding box (expanded for North OC industrial areas)
const OC_BOUNDS = {
  south: 33.4,
  west: -118.2,
  north: 34.1,
  east: -117.4
}

/**
 * Fetch road geometry from OpenStreetMap Overpass API
 * Returns GeoJSON LineStrings for freeways and major roads
 */
async function fetchRoadGeometry() {
  // Check cache
  if (roadGeometryCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
    console.log('Returning cached road geometry')
    return roadGeometryCache
  }

  console.log('Fetching road geometry from OpenStreetMap...')

  const { south, west, north, east } = OC_BOUNDS

  // Overpass QL query for freeways and major roads in Orange County
  const query = `
[out:json][timeout:90];
(
  // Motorways (freeways like 91, 57, 22, 55, 5, 405)
  way["highway"="motorway"](${south},${west},${north},${east});
  way["highway"="motorway_link"](${south},${west},${north},${east});

  // Trunk roads (major highways)
  way["highway"="trunk"](${south},${west},${north},${east});
  way["highway"="trunk_link"](${south},${west},${north},${east});

  // Primary roads (major arterials like Beach Blvd, State College, Imperial Hwy)
  way["highway"="primary"](${south},${west},${north},${east});

  // Secondary roads (major streets like Kraemer, Tustin, Lakeview)
  way["highway"="secondary"](${south},${west},${north},${east});
);
out geom;
`

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `data=${encodeURIComponent(query)}`
    })

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`)
    }

    const data = await response.json()

    // Convert to GeoJSON
    const features = []

    data.elements.forEach(element => {
      if (element.type === 'way' && element.geometry) {
        const coordinates = element.geometry.map(node => [node.lon, node.lat])

        // Determine road type and properties
        const highway = element.tags?.highway || 'unknown'
        const ref = element.tags?.ref || ''
        const name = element.tags?.name || ''

        // Classify road type for styling
        let roadType = 'secondary'
        let strokeWidth = 6

        if (highway === 'motorway' || highway === 'motorway_link') {
          roadType = 'freeway'
          strokeWidth = 18
        } else if (highway === 'trunk' || highway === 'trunk_link') {
          roadType = 'highway'
          strokeWidth = 12
        } else if (highway === 'primary') {
          roadType = 'primary'
          strokeWidth = 8
        }

        features.push({
          type: 'Feature',
          properties: {
            id: element.id,
            highway,
            ref,
            name,
            roadType,
            strokeWidth
          },
          geometry: {
            type: 'LineString',
            coordinates
          }
        })
      }
    })

    const geojson = {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'OpenStreetMap',
        fetchedAt: new Date().toISOString(),
        bounds: OC_BOUNDS,
        featureCount: features.length
      }
    }

    // Cache the result
    roadGeometryCache = geojson
    cacheTimestamp = Date.now()

    console.log(`Fetched ${features.length} road segments from OpenStreetMap`)

    return geojson

  } catch (error) {
    console.error('Error fetching road geometry:', error)
    throw error
  }
}

/**
 * GET /api/roads
 * Returns GeoJSON of all freeways and major roads in Orange County
 */
router.get('/', async (req, res) => {
  try {
    const geojson = await fetchRoadGeometry()
    res.json(geojson)
  } catch (error) {
    console.error('Error in /api/roads:', error)
    res.status(500).json({ error: 'Failed to fetch road geometry' })
  }
})

/**
 * GET /api/roads/bounds
 * Returns road geometry within specified bounds
 * Query params: south, west, north, east
 */
router.get('/bounds', async (req, res) => {
  try {
    const { south, west, north, east } = req.query

    if (!south || !west || !north || !east) {
      return res.status(400).json({ error: 'Missing bounds parameters' })
    }

    // Get cached full geometry
    const fullGeojson = await fetchRoadGeometry()

    // Filter features within bounds
    const bounds = {
      south: parseFloat(south),
      west: parseFloat(west),
      north: parseFloat(north),
      east: parseFloat(east)
    }

    const filteredFeatures = fullGeojson.features.filter(feature => {
      // Check if any coordinate is within bounds
      return feature.geometry.coordinates.some(([lon, lat]) => {
        return lat >= bounds.south && lat <= bounds.north &&
               lon >= bounds.west && lon <= bounds.east
      })
    })

    res.json({
      type: 'FeatureCollection',
      features: filteredFeatures,
      metadata: {
        ...fullGeojson.metadata,
        filteredBounds: bounds,
        filteredCount: filteredFeatures.length
      }
    })

  } catch (error) {
    console.error('Error in /api/roads/bounds:', error)
    res.status(500).json({ error: 'Failed to fetch road geometry' })
  }
})

/**
 * GET /api/roads/clear-cache
 * Clears the road geometry cache (for testing)
 */
router.get('/clear-cache', (req, res) => {
  roadGeometryCache = null
  cacheTimestamp = null
  res.json({ message: 'Cache cleared' })
})

export default router
