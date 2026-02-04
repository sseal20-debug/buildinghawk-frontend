import { useState } from 'react'
import type { SearchResultCollection, SearchResultFeature } from '@/types'

interface SearchResultsProps {
  results: SearchResultCollection
  onPropertySelect: (unitId: string) => void
  onExportPdf: () => void
  onExportExcel: () => void
  onBack: () => void
}

type ViewMode = 'list' | 'map'

export function SearchResults({
  results,
  onPropertySelect,
  onExportPdf,
  onExportExcel,
  onBack,
}: SearchResultsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(results.features.map((f) => f.properties.id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const formatNumber = (n: number | undefined | null) =>
    n ? n.toLocaleString() : '—'

  const formatCurrency = (n: number | undefined | null) =>
    n ? `$${n.toFixed(2)}` : '—'

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="font-semibold text-gray-900">
            {results.count} Results
          </h2>
        </div>

        {/* View Toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-sm ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`px-3 py-1.5 text-sm border-l border-gray-200 ${
              viewMode === 'map'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Map
          </button>
        </div>
      </div>

      {/* Selection Actions */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selectedIds.size === results.features.length && results.features.length > 0}
            onChange={(e) => e.target.checked ? selectAll() : clearSelection()}
            className="rounded text-blue-600"
          />
          <span className="text-sm text-gray-600">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onExportPdf}
            disabled={selectedIds.size === 0}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
          >
            Export PDF
          </button>
          <button
            onClick={onExportExcel}
            disabled={selectedIds.size === 0}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
          >
            Export Excel
          </button>
        </div>
      </div>

      {/* Results */}
      {viewMode === 'list' ? (
        <div className="flex-1 overflow-y-auto">
          {results.features.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-medium">No properties found</p>
              <p className="text-sm">Try adjusting your search criteria</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {results.features.map((feature: SearchResultFeature) => {
                const props = feature.properties
                return (
                  <div
                    key={props.id}
                    className="flex items-start gap-3 p-4 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(props.id)}
                      onChange={() => toggleSelect(props.id)}
                      className="mt-1 rounded text-blue-600"
                    />
                    <button
                      onClick={() => onPropertySelect(props.id)}
                      className="flex-1 text-left"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-gray-900">
                            {props.street_address}
                          </div>
                          <div className="text-sm text-gray-500">
                            {props.city}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-gray-900">
                            {formatNumber(props.unit_sf)} SF
                          </div>
                          <span
                            className={`badge ${
                              props.unit_status === 'vacant'
                                ? 'badge-red'
                                : props.unit_status === 'occupied'
                                ? 'badge-green'
                                : 'badge-gray'
                            }`}
                          >
                            {props.unit_status}
                          </span>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                        {props.clear_height_ft && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {props.clear_height_ft}' clear
                          </span>
                        )}
                        {props.dock_doors > 0 && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {props.dock_doors} docks
                          </span>
                        )}
                        {props.power_amps && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {props.power_amps}A
                          </span>
                        )}
                        {props.fenced_yard && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            Fenced
                          </span>
                        )}
                        {props.for_sale && (
                          <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">
                            For Sale
                          </span>
                        )}
                        {props.for_lease && (
                          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                            For Lease {formatCurrency(props.asking_lease_rate)}/SF
                          </span>
                        )}
                      </div>

                      {/* Tenant Info */}
                      {props.current_tenant && (
                        <div className="mt-2 text-sm">
                          <span className="text-gray-500">Tenant:</span>{' '}
                          <span className="text-gray-900">{props.current_tenant}</span>
                          {props.market_status && props.market_status !== 'stable' && (
                            <span className="ml-2 badge badge-blue capitalize">
                              {props.market_status}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 bg-gray-200 flex items-center justify-center">
          <p className="text-gray-500">Map view - integrate with main map component</p>
        </div>
      )}
    </div>
  )
}
