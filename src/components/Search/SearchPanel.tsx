import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { searchApi } from '@/api/client'
import type { SearchCriteria, PowerVolts } from '@/types'
import { CitySelector } from './CitySelector'

interface SearchPanelProps {
  onSearch: (criteria: SearchCriteria) => void
  onSave: (criteria: SearchCriteria) => void
  onClose: () => void
  initialCriteria?: SearchCriteria
}

const POWER_OPTIONS: { value: PowerVolts | ''; label: string }[] = [
  { value: '', label: 'Any' },
  { value: '277/480', label: '277/480v' },
  { value: '120/240', label: '120/240v' },
]

const CLEAR_HEIGHT_PRESETS = [24, 28, 32, 36]

export function SearchPanel({ onSearch, onSave, onClose, initialCriteria }: SearchPanelProps) {
  const [showCities, setShowCities] = useState(false)
  const [selectedCities, setSelectedCities] = useState<string[]>(initialCriteria?.cities || [])

  const { data: geographies } = useQuery({
    queryKey: ['geographies'],
    queryFn: searchApi.getGeographies,
  })

  const { register, handleSubmit, watch, setValue, reset } = useForm<SearchCriteria>({
    defaultValues: initialCriteria || {
      min_sf: undefined,
      max_sf: undefined,
      min_amps: undefined,
      power_volts: undefined,
      min_docks: undefined,
      min_clear_height: undefined,
      fenced_yard: undefined,
      cities: [],
      geography_id: undefined,
      for_sale: false,
      for_lease: false,
      vacant_only: false,
      in_market_only: false,
    },
  })

  const criteria = watch()

  const handleCitiesChange = (cities: string[]) => {
    setSelectedCities(cities)
    setValue('cities', cities)
  }

  const handleClear = () => {
    reset()
    setSelectedCities([])
  }

  const onSubmit = (data: SearchCriteria) => {
    // Clean up empty values
    const cleanedData: SearchCriteria = {}
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== false && !(Array.isArray(value) && value.length === 0)) {
        (cleanedData as Record<string, unknown>)[key] = value
      }
    })
    onSearch(cleanedData)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Property Search</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSave(criteria)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Location */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Location</h3>

          <div>
            <label className="label">Submarket</label>
            <select {...register('geography_id')} className="input">
              <option value="">All Areas</option>
              {geographies?.map((geo) => (
                <option key={geo.id} value={geo.id}>{geo.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Cities</label>
              <button
                type="button"
                onClick={() => setShowCities(true)}
                className="text-sm text-blue-600"
              >
                {selectedCities.length > 0 ? `${selectedCities.length} selected` : 'Select'}
              </button>
            </div>
            {selectedCities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedCities.slice(0, 3).map((city) => (
                  <span key={city} className="badge badge-blue">{city}</span>
                ))}
                {selectedCities.length > 3 && (
                  <span className="badge badge-gray">+{selectedCities.length - 3} more</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Size */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Size</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Min SF</label>
              <input
                type="number"
                {...register('min_sf', { valueAsNumber: true })}
                className="input"
                placeholder="10,000"
              />
            </div>
            <div>
              <label className="label">Max SF</label>
              <input
                type="number"
                {...register('max_sf', { valueAsNumber: true })}
                className="input"
                placeholder="50,000"
              />
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Features</h3>

          <div>
            <label className="label">Min Clear Height (ft)</label>
            <div className="flex gap-2">
              {CLEAR_HEIGHT_PRESETS.map((height) => (
                <button
                  key={height}
                  type="button"
                  onClick={() => setValue('min_clear_height', height)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    watch('min_clear_height') === height
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {height}'
                </button>
              ))}
              <input
                type="number"
                {...register('min_clear_height', { valueAsNumber: true })}
                className="input input-sm w-20"
                placeholder="Other"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Min Dock Doors</label>
              <input
                type="number"
                {...register('min_docks', { valueAsNumber: true })}
                className="input"
                placeholder="1"
              />
            </div>
            <div>
              <label className="label">Min GL Doors</label>
              <input
                type="number"
                {...register('min_gl_doors', { valueAsNumber: true })}
                className="input"
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Min Power (Amps)</label>
              <input
                type="number"
                {...register('min_amps', { valueAsNumber: true })}
                className="input"
                placeholder="400"
              />
            </div>
            <div>
              <label className="label">Voltage</label>
              <select {...register('power_volts')} className="input">
                {POWER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Fenced Yard</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value=""
                  {...register('fenced_yard')}
                  className="text-blue-600"
                />
                <span className="text-sm">Any</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="true"
                  {...register('fenced_yard')}
                  className="text-blue-600"
                />
                <span className="text-sm">Yes</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="false"
                  {...register('fenced_yard')}
                  className="text-blue-600"
                />
                <span className="text-sm">No</span>
              </label>
            </div>
          </div>
        </div>

        {/* Availability */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Availability</h3>

          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                {...register('for_sale')}
                className="rounded text-blue-600"
              />
              <span className="text-sm">For Sale</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                {...register('for_lease')}
                className="rounded text-blue-600"
              />
              <span className="text-sm">For Lease</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                {...register('vacant_only')}
                className="rounded text-blue-600"
              />
              <span className="text-sm">Vacant Only</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                {...register('in_market_only')}
                className="rounded text-blue-600"
              />
              <span className="text-sm">In Market</span>
            </label>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-gray-200">
          <button type="submit" className="w-full btn btn-primary">
            Search
          </button>
        </div>
      </form>

      {/* City Selector Modal */}
      {showCities && (
        <CitySelector
          selected={selectedCities}
          onChange={handleCitiesChange}
          onClose={() => setShowCities(false)}
        />
      )}
    </div>
  )
}
