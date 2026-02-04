import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchApi } from '@/api/client'

interface CitySelectorProps {
  selected: string[]
  onChange: (cities: string[]) => void
  onClose: () => void
}

export function CitySelector({ selected, onChange, onClose }: CitySelectorProps) {
  const [localSelected, setLocalSelected] = useState<string[]>(selected)
  const [filter, setFilter] = useState('')

  const { data: cities, isLoading } = useQuery({
    queryKey: ['cities'],
    queryFn: searchApi.getCities,
  })

  const filteredCities = cities?.filter((c) =>
    c.city.toLowerCase().includes(filter.toLowerCase())
  ) || []

  const toggleCity = (city: string) => {
    setLocalSelected((prev) =>
      prev.includes(city)
        ? prev.filter((c) => c !== city)
        : [...prev, city]
    )
  }

  const selectAll = () => {
    setLocalSelected(cities?.map((c) => c.city) || [])
  }

  const clearAll = () => {
    setLocalSelected([])
  }

  const handleApply = () => {
    onChange(localSelected)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-t-xl sm:rounded-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Select Cities</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter cities..."
            className="input"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
          <span className="text-sm text-gray-500">
            {localSelected.length} selected
          </span>
          <div className="flex gap-3">
            <button
              onClick={selectAll}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Select All
            </button>
            <button
              onClick={clearAll}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
        </div>

        {/* City List */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCities.map((city) => (
                <label
                  key={city.city}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={localSelected.includes(city.city)}
                      onChange={() => toggleCity(city.city)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-gray-900">{city.city}</span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {city.unit_count} units
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex-1 btn btn-primary"
          >
            Apply ({localSelected.length})
          </button>
        </div>
      </div>
    </div>
  )
}
