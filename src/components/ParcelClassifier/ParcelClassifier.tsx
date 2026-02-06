import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { parcelsApi } from '@/api/client'
import L from 'leaflet'

interface ParcelClassifierProps {
  isOpen: boolean
  onClose: () => void
  mapRef: React.RefObject<L.Map | null>
  onClassificationChange?: () => void
}

type Classification = 'building' | 'land' | 'deleted'

export function ParcelClassifier({
  isOpen,
  onClose,
  mapRef,
  onClassificationChange
}: ParcelClassifierProps) {
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set())
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const selectionRectRef = useRef<L.Rectangle | null>(null)

  // Fetch unclassified parcels
  const { data: unclassifiedData, isLoading, refetch } = useQuery({
    queryKey: ['parcels', 'unclassified'],
    queryFn: () => parcelsApi.getUnclassified(),
    enabled: isOpen,
    staleTime: 1000 * 30, // 30 seconds
  })

  // Fetch classification stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['parcels', 'classification-stats'],
    queryFn: () => parcelsApi.getClassificationStats(),
    enabled: isOpen,
    staleTime: 1000 * 30,
  })

  // Classify mutation
  const classifyMutation = useMutation({
    mutationFn: ({ ids, classification }: { ids: (number | string)[]; classification: Classification }) =>
      parcelsApi.classify(ids, classification),
    onSuccess: () => {
      // Clear selection
      setSelectedIds(new Set())
      // Refetch data
      refetch()
      refetchStats()
      // Notify parent
      onClassificationChange?.()
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      queryClient.invalidateQueries({ queryKey: ['land'] })
    },
  })

  // Create/update markers on map
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isOpen || !unclassifiedData?.parcels) return

    // Remove existing markers layer
    if (markersLayerRef.current) {
      map.removeLayer(markersLayerRef.current)
    }

    // Create new markers layer
    const markersLayer = L.layerGroup()
    markersLayerRef.current = markersLayer

    // Add markers for unclassified parcels
    unclassifiedData.parcels.forEach((parcel) => {
      const isSelected = selectedIds.has(parcel.id) || selectedIds.has(parcel.apn)

      const icon = L.divIcon({
        className: 'classification-marker',
        html: `<div style="
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background-color: ${isSelected ? '#f97316' : '#ef4444'};
          border: 2px solid ${isSelected ? '#fff' : '#991b1b'};
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: all 0.15s ease;
          transform: ${isSelected ? 'scale(1.3)' : 'scale(1)'};
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })

      const marker = L.marker([parcel.lat, parcel.lng], { icon })

      // Tooltip with parcel info
      marker.bindTooltip(
        `${parcel.address}<br/>
         ${parcel.city}<br/>
         ${parcel.sqft ? `${parcel.sqft.toLocaleString()} SF` : 'No SF data'}<br/>
         ${parcel.land_use || 'Unknown use'}`,
        { direction: 'top', offset: [0, -10] }
      )

      // Click to toggle selection
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        setSelectedIds((prev) => {
          const newSet = new Set(prev)
          if (newSet.has(parcel.id)) {
            newSet.delete(parcel.id)
          } else {
            newSet.add(parcel.id)
          }
          return newSet
        })
      })

      markersLayer.addLayer(marker)
    })

    markersLayer.addTo(map)

    return () => {
      if (markersLayerRef.current && map.hasLayer(markersLayerRef.current)) {
        map.removeLayer(markersLayerRef.current)
      }
    }
  }, [mapRef, isOpen, unclassifiedData, selectedIds])

  // Handle rectangle selection
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isOpen) return

    const handleMouseDown = (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.shiftKey) {
        // Start rectangle selection
        setIsSelecting(true)
        setSelectionStart({ x: e.latlng.lng, y: e.latlng.lat })
        setSelectionEnd({ x: e.latlng.lng, y: e.latlng.lat })
        map.dragging.disable()
      }
    }

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      if (isSelecting && selectionStart) {
        setSelectionEnd({ x: e.latlng.lng, y: e.latlng.lat })

        // Update selection rectangle
        if (selectionRectRef.current) {
          map.removeLayer(selectionRectRef.current)
        }

        const bounds = L.latLngBounds(
          [selectionStart.y, selectionStart.x],
          [e.latlng.lat, e.latlng.lng]
        )

        selectionRectRef.current = L.rectangle(bounds, {
          color: '#f97316',
          weight: 2,
          fillOpacity: 0.2,
          dashArray: '5, 5',
        })
        selectionRectRef.current.addTo(map)
      }
    }

    const handleMouseUp = (e: L.LeafletMouseEvent) => {
      if (isSelecting && selectionStart && selectionEnd && unclassifiedData?.parcels) {
        // Find parcels within selection rectangle
        const minLat = Math.min(selectionStart.y, e.latlng.lat)
        const maxLat = Math.max(selectionStart.y, e.latlng.lat)
        const minLng = Math.min(selectionStart.x, e.latlng.lng)
        const maxLng = Math.max(selectionStart.x, e.latlng.lng)

        const selected = unclassifiedData.parcels.filter((p) =>
          p.lat >= minLat && p.lat <= maxLat &&
          p.lng >= minLng && p.lng <= maxLng
        )

        // Add to selection
        setSelectedIds((prev) => {
          const newSet = new Set(prev)
          selected.forEach((p) => newSet.add(p.id))
          return newSet
        })
      }

      // Clean up
      setIsSelecting(false)
      setSelectionStart(null)
      setSelectionEnd(null)
      map.dragging.enable()

      if (selectionRectRef.current) {
        map.removeLayer(selectionRectRef.current)
        selectionRectRef.current = null
      }
    }

    map.on('mousedown', handleMouseDown)
    map.on('mousemove', handleMouseMove)
    map.on('mouseup', handleMouseUp)

    return () => {
      map.off('mousedown', handleMouseDown)
      map.off('mousemove', handleMouseMove)
      map.off('mouseup', handleMouseUp)
      map.dragging.enable()

      if (selectionRectRef.current) {
        map.removeLayer(selectionRectRef.current)
      }
    }
  }, [mapRef, isOpen, isSelecting, selectionStart, selectionEnd, unclassifiedData])

  // Handle classification
  const handleClassify = useCallback((classification: Classification) => {
    if (selectedIds.size === 0) return

    classifyMutation.mutate({
      ids: Array.from(selectedIds),
      classification,
    })
  }, [selectedIds, classifyMutation])

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Select all visible
  const handleSelectAll = useCallback(() => {
    if (!unclassifiedData?.parcels) return
    setSelectedIds(new Set(unclassifiedData.parcels.map((p) => p.id)))
  }, [unclassifiedData])

  if (!isOpen) return null

  return (
    <div className="fixed right-4 top-32 w-80 bg-white rounded-lg shadow-xl z-[1001] max-h-[calc(100vh-160px)] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg">Classify Parcels</h2>
          <p className="text-xs opacity-90">Hold SHIFT + drag to select multiple</p>
        </div>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white text-2xl leading-none"
        >
          &times;
        </button>
      </div>

      {/* Stats */}
      <div className="bg-gray-50 px-4 py-3 border-b grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <div className="font-bold text-gray-800">{stats?.unclassified || 0}</div>
          <div className="text-gray-500">Pending</div>
        </div>
        <div>
          <div className="font-bold text-green-600">{stats?.building || 0}</div>
          <div className="text-gray-500">Building</div>
        </div>
        <div>
          <div className="font-bold text-yellow-600">{stats?.land || 0}</div>
          <div className="text-gray-500">Land</div>
        </div>
        <div>
          <div className="font-bold text-red-600">{stats?.deleted || 0}</div>
          <div className="text-gray-500">Deleted</div>
        </div>
      </div>

      {/* Selection info */}
      <div className="px-4 py-3 border-b bg-orange-50">
        <div className="flex items-center justify-between">
          <span className="font-medium text-orange-800">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs text-orange-600 hover:text-orange-800"
            >
              Select All
            </button>
            <button
              onClick={handleClearSelection}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Drop zones */}
      <div className="p-4 space-y-3">
        <p className="text-xs text-gray-500 mb-3">
          Select parcels on the map, then click a category:
        </p>

        {/* Building */}
        <button
          onClick={() => handleClassify('building')}
          disabled={selectedIds.size === 0 || classifyMutation.isPending}
          className={`w-full p-4 rounded-lg border-2 border-dashed transition-all flex items-center gap-3
            ${selectedIds.size > 0
              ? 'border-green-400 bg-green-50 hover:bg-green-100 cursor-pointer'
              : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
            }`}
        >
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-lg">
            B
          </div>
          <div className="text-left">
            <div className="font-semibold text-green-800">Industrial Building</div>
            <div className="text-xs text-green-600">Keep in inventory</div>
          </div>
        </button>

        {/* Land */}
        <button
          onClick={() => handleClassify('land')}
          disabled={selectedIds.size === 0 || classifyMutation.isPending}
          className={`w-full p-4 rounded-lg border-2 border-dashed transition-all flex items-center gap-3
            ${selectedIds.size > 0
              ? 'border-yellow-400 bg-yellow-50 hover:bg-yellow-100 cursor-pointer'
              : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
            }`}
        >
          <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-white font-bold text-lg">
            L
          </div>
          <div className="text-left">
            <div className="font-semibold text-yellow-800">Vacant Land</div>
            <div className="text-xs text-yellow-600">Keep for development</div>
          </div>
        </button>

        {/* Delete */}
        <button
          onClick={() => handleClassify('deleted')}
          disabled={selectedIds.size === 0 || classifyMutation.isPending}
          className={`w-full p-4 rounded-lg border-2 border-dashed transition-all flex items-center gap-3
            ${selectedIds.size > 0
              ? 'border-red-400 bg-red-50 hover:bg-red-100 cursor-pointer'
              : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
            }`}
        >
          <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-lg">
            &times;
          </div>
          <div className="text-left">
            <div className="font-semibold text-red-800">Remove from App</div>
            <div className="text-xs text-red-600">Residential / multifamily</div>
          </div>
        </button>
      </div>

      {/* Loading indicator */}
      {(isLoading || classifyMutation.isPending) && (
        <div className="px-4 py-2 bg-blue-50 text-blue-600 text-sm text-center">
          {isLoading ? 'Loading parcels...' : 'Saving classification...'}
        </div>
      )}

      {/* Progress bar */}
      {stats && (
        <div className="px-4 py-3 bg-gray-100 border-t">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Classification Progress</span>
            <span>
              {stats.total - stats.unclassified} / {stats.total}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-green-500"
              style={{
                width: `${((stats.total - stats.unclassified) / stats.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default ParcelClassifier
