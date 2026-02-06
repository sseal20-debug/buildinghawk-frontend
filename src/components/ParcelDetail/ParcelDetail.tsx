import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { parcelsApi, placesApi } from '@/api/client'
import type { Unit, Building, GooglePlace } from '@/types'
import { useState } from 'react'

interface ParcelDetailProps {
  apn: string
  onUnitSelect: (unit: Unit) => void
  onAddUnit: (buildingId: string) => void
  onClose: () => void
}

export function ParcelDetail({ apn, onUnitSelect, onAddUnit, onClose }: ParcelDetailProps) {
  const [showPlaces, setShowPlaces] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValues, setEditValues] = useState({
    land_sf: 0,
    zoning: '',
    owner_name: '',
    tenant_name: '',
  })
  const queryClient = useQueryClient()

  const { data: parcel, isLoading } = useQuery({
    queryKey: ['parcel', apn],
    queryFn: () => parcelsApi.getByApn(apn),
  })

  const centroid = parcel?.centroid as { coordinates: [number, number] } | undefined

  const { data: placesData, isLoading: placesLoading } = useQuery({
    queryKey: ['places-nearby', centroid?.coordinates],
    queryFn: () =>
      placesApi.findNearby(centroid!.coordinates[1], centroid!.coordinates[0]),
    enabled: showPlaces && !!centroid,
  })

  // Start editing - populate form with current values
  const startEditing = () => {
    setEditValues({
      land_sf: parcel?.land_sf || 0,
      zoning: parcel?.zoning || '',
      owner_name: parcel?.assessor_owner_name || '',
      tenant_name: '', // Will be populated from occupancy data when available
    })
    setIsEditing(true)
  }

  // Cancel editing
  const cancelEditing = () => {
    setIsEditing(false)
  }

  const updateMutation = useMutation({
    mutationFn: (data: { land_sf?: number; zoning?: string; assessor_owner_name?: string }) =>
      parcelsApi.updateByApn(apn, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parcel', apn] })
      setIsEditing(false)
    },
  })

  const saveChanges = () => {
    updateMutation.mutate({
      land_sf: editValues.land_sf || undefined,
      zoning: editValues.zoning || undefined,
      assessor_owner_name: editValues.owner_name || undefined,
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!parcel) {
    return <div className="text-center py-8 text-gray-500">Parcel not found</div>
  }

  const formatNumber = (n: number | undefined) =>
    n ? n.toLocaleString() : '—'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {parcel.situs_address || 'No Address'}
          </h2>
          <p className="text-sm text-gray-500">
            {parcel.city} | APN: {parcel.apn}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <button
              onClick={startEditing}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
              title="Edit"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          ) : (
            <>
              <button
                onClick={saveChanges}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Save
              </button>
              <button
                onClick={cancelEditing}
                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quick Stats - Editable */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          {isEditing ? (
            <input
              type="number"
              value={editValues.land_sf}
              onChange={(e) => setEditValues({ ...editValues, land_sf: parseInt(e.target.value) || 0 })}
              className="w-full text-center text-lg font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1"
            />
          ) : (
            <div className="text-lg font-semibold text-gray-900">
              {formatNumber(parcel.land_sf)}
            </div>
          )}
          <div className="text-xs text-gray-500">Land SF</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-lg font-semibold text-gray-900">
            {parcel.buildings?.length || 0}
          </div>
          <div className="text-xs text-gray-500">Buildings</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          {isEditing ? (
            <input
              type="text"
              value={editValues.zoning}
              onChange={(e) => setEditValues({ ...editValues, zoning: e.target.value })}
              className="w-full text-center text-lg font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1"
              placeholder="Zoning"
            />
          ) : (
            <div className="text-lg font-semibold text-gray-900">{parcel.zoning || '—'}</div>
          )}
          <div className="text-xs text-gray-500">Zoning</div>
        </div>
      </div>

      {/* Owner & Tenant Section - Editable */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="text-xs text-blue-600 font-medium mb-1">Owner</div>
          {isEditing ? (
            <input
              type="text"
              value={editValues.owner_name}
              onChange={(e) => setEditValues({ ...editValues, owner_name: e.target.value })}
              className="w-full text-sm text-gray-900 bg-white border border-gray-300 rounded px-2 py-1"
              placeholder="Owner name"
            />
          ) : (
            <div className="text-sm font-medium text-gray-900 truncate">
              {parcel.assessor_owner_name || '—'}
            </div>
          )}
        </div>
        <div className="bg-amber-50 rounded-lg p-3">
          <div className="text-xs text-amber-600 font-medium mb-1">Tenant</div>
          {isEditing ? (
            <input
              type="text"
              value={editValues.tenant_name}
              onChange={(e) => setEditValues({ ...editValues, tenant_name: e.target.value })}
              className="w-full text-sm text-gray-900 bg-white border border-gray-300 rounded px-2 py-1"
              placeholder="Tenant name"
            />
          ) : (
            <div className="text-sm font-medium text-gray-900 truncate">
              {/* TODO: Get tenant from occupancy data */}
              —
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (centroid) {
              window.open(
                `https://www.google.com/maps/@${centroid.coordinates[1]},${centroid.coordinates[0]},18z`,
                '_blank'
              )
            }
          }}
          className="flex-1 btn btn-secondary flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Google Maps
        </button>
        <button
          onClick={() => setShowPlaces(!showPlaces)}
          className="flex-1 btn btn-secondary flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Find Businesses
        </button>
      </div>

      {/* Google Places Results */}
      {showPlaces && (
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">Nearby Businesses</h3>
          {placesLoading ? (
            <p className="text-sm text-blue-700">Searching...</p>
          ) : placesData?.places && placesData.places.length > 0 ? (
            <ul className="space-y-2">
              {placesData.places.map((place: GooglePlace) => (
                <li key={place.place_id} className="text-sm">
                  <span className="font-medium text-gray-900">{place.name}</span>
                  <span className="text-gray-500 ml-2">{place.address}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-blue-700">No businesses found nearby</p>
          )}
        </div>
      )}

      {/* Buildings */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-gray-900">Buildings</h3>
          {(!parcel.buildings || parcel.buildings.length === 0) && (
            <button className="text-sm text-blue-600 hover:text-blue-700">
              + Add Building
            </button>
          )}
        </div>

        {parcel.buildings && parcel.buildings.length > 0 ? (
          <div className="space-y-3">
            {parcel.buildings.map((building: Building) => (
              <BuildingCard
                key={building.id}
                building={building}
                onUnitSelect={onUnitSelect}
                onAddUnit={() => onAddUnit(building.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-6 bg-gray-50 rounded-lg">
            <p className="text-gray-500 text-sm">No buildings documented</p>
            <button className="mt-2 text-blue-600 text-sm font-medium">
              + Add First Building
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface BuildingCardProps {
  building: Building
  onUnitSelect: (unit: Unit) => void
  onAddUnit: () => void
}

function BuildingCard({ building, onUnitSelect, onAddUnit }: BuildingCardProps) {
  const formatNumber = (n: number | undefined) =>
    n ? n.toLocaleString() : '—'

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Building Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900">
              {building.building_name || 'Building'}
            </h4>
            <p className="text-sm text-gray-500">
              {formatNumber(building.building_sf)} SF | {building.year_built || 'Year N/A'}
              {building.coverage_pct && ` | ${building.coverage_pct}% coverage`}
            </p>
          </div>
        </div>
      </div>

      {/* Units */}
      <div className="divide-y divide-gray-100">
        {building.units && building.units.length > 0 ? (
          <>
            {building.units.map((unit: Unit) => (
              <button
                key={unit.id}
                onClick={() => onUnitSelect(unit)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`status-dot ${
                      unit.unit_status === 'occupied'
                        ? 'occupied'
                        : unit.unit_status === 'vacant'
                        ? 'vacant'
                        : 'bg-gray-400'
                    }`}
                  />
                  <div>
                    <div className="font-medium text-gray-900">
                      {unit.unit_number || unit.street_address}
                    </div>
                    <div className="text-sm text-gray-500">
                      {formatNumber(unit.unit_sf)} SF
                      {unit.dock_doors > 0 && ` | ${unit.dock_doors} docks`}
                    </div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
            <button
              onClick={onAddUnit}
              className="w-full px-4 py-3 text-left text-blue-600 hover:bg-blue-50 text-sm font-medium"
            >
              + Add Unit
            </button>
          </>
        ) : (
          <button
            onClick={onAddUnit}
            className="w-full px-4 py-4 text-center text-blue-600 hover:bg-blue-50"
          >
            <span className="text-sm font-medium">+ Add First Unit</span>
          </button>
        )}
      </div>
    </div>
  )
}
