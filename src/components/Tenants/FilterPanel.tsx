import { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import type { TenantFilterForm } from './TenantsSearch'

interface FilterPanelProps {
  register: UseFormRegister<TenantFilterForm>
  setValue: UseFormSetValue<TenantFilterForm>
  watch: UseFormWatch<TenantFilterForm>
}

const SF_RANGES = [
  { label: '0 - 5,000', min: 0, max: 5000 },
  { label: '5,000 - 10,000', min: 5000, max: 10000 },
  { label: '10,000 - 20,000', min: 10000, max: 20000 },
  { label: '20,000 - 40,000', min: 20000, max: 40000 },
  { label: '40,000 - 70,000', min: 40000, max: 70000 },
  { label: '70,000 - 150,000', min: 70000, max: 150000 },
  { label: '150,000+', min: 150000, max: undefined },
]

const LOT_RANGES = [
  { label: '0 - \u00BD', min: 0, max: 0.5 },
  { label: '\u00BD - 1', min: 0.5, max: 1 },
  { label: '1 - 2', min: 1, max: 2 },
  { label: '2 - 3', min: 2, max: 3 },
  { label: '3 - 4', min: 3, max: 4 },
  { label: '4 - 6', min: 4, max: 6 },
  { label: '6+', min: 6, max: undefined },
]

const PROPERTY_TYPES = [
  'Industrial',
  'Retail',
  'Office',
  'Multi-family',
  'Freestanding',
]

export function FilterPanel({ register, setValue, watch }: FilterPanelProps) {
  const minSf = watch('minSf')
  const maxSf = watch('maxSf')
  const minLotAcres = watch('minLotAcres')
  const maxLotAcres = watch('maxLotAcres')

  const handleSfRange = (min: number, max?: number) => {
    setValue('minSf', min || undefined)
    setValue('maxSf', max || undefined)
  }

  const handleLotRange = (min: number, max?: number) => {
    setValue('minLotAcres', min || undefined)
    setValue('maxLotAcres', max || undefined)
  }

  const isSfActive = (rMin: number, rMax?: number) =>
    minSf === rMin && maxSf === rMax

  const isLotActive = (rMin: number, rMax?: number) =>
    minLotAcres === rMin && maxLotAcres === rMax

  return (
    <div className="w-[260px] border-l border-gray-200 overflow-y-auto p-3 space-y-5 bg-gray-50 flex-shrink-0">

      {/* Facility Year Built */}
      <section>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Facility Yr Built
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            {...register('minYearBuilt', { valueAsNumber: true })}
            className="input text-xs py-1.5"
          />
          <input
            type="number"
            placeholder="Max"
            {...register('maxYearBuilt', { valueAsNumber: true })}
            className="input text-xs py-1.5"
          />
        </div>
        <div className="mt-2 space-y-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              {...register('multiLocation')}
              className="w-3.5 h-3.5 rounded text-teal focus:ring-teal"
            />
            <span className="text-xs text-gray-600">multiple locations</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              {...register('headquarters')}
              className="w-3.5 h-3.5 rounded text-teal focus:ring-teal"
            />
            <span className="text-xs text-gray-600">headquarters</span>
          </label>
        </div>
      </section>

      {/* Type */}
      <section>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Type
        </h4>
        <div className="space-y-1">
          {PROPERTY_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                value={type.toLowerCase()}
                {...register('propertyTypes')}
                className="w-3.5 h-3.5 rounded text-teal focus:ring-teal"
              />
              <span className="text-xs text-gray-600">{type}</span>
            </label>
          ))}
        </div>
      </section>

      {/* SF Occupied */}
      <section>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          SF Occupied
        </h4>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input
            type="number"
            placeholder="Min"
            {...register('minSf', { valueAsNumber: true })}
            className="input text-xs py-1.5"
          />
          <input
            type="number"
            placeholder="Max"
            {...register('maxSf', { valueAsNumber: true })}
            className="input text-xs py-1.5"
          />
        </div>
        <div className="space-y-0.5">
          {SF_RANGES.map((range) => (
            <label
              key={range.label}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="sfRange"
                checked={isSfActive(range.min, range.max)}
                onChange={() => handleSfRange(range.min, range.max)}
                className="w-3 h-3 text-teal focus:ring-teal"
              />
              <span className="text-xs text-gray-600">{range.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Lot Size */}
      <section>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Lot Size
        </h4>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="number"
            step="0.1"
            placeholder="Min"
            {...register('minLotAcres', { valueAsNumber: true })}
            className="input text-xs py-1.5 flex-1"
          />
          <span className="text-xs text-gray-400">-</span>
          <input
            type="number"
            step="0.1"
            placeholder="Max"
            {...register('maxLotAcres', { valueAsNumber: true })}
            className="input text-xs py-1.5 flex-1"
          />
          <span className="text-xs text-gray-500 font-medium">Acres</span>
        </div>
        <div className="space-y-0.5">
          {LOT_RANGES.map((range) => (
            <label
              key={range.label}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="lotRange"
                checked={isLotActive(range.min, range.max)}
                onChange={() => handleLotRange(range.min, range.max)}
                className="w-3 h-3 text-teal focus:ring-teal"
              />
              <span className="text-xs text-gray-600">{range.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Clearance */}
      <section>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Clearance (Min)
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            {...register('minClearance', { valueAsNumber: true })}
            className="input text-xs py-1.5"
          />
          <input
            type="number"
            placeholder="Max"
            {...register('maxClearance', { valueAsNumber: true })}
            className="input text-xs py-1.5"
          />
        </div>
      </section>

      {/* Power */}
      <section>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Power (min)
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            {...register('minPower', { valueAsNumber: true })}
            className="input text-xs py-1.5"
          />
          <input
            type="number"
            placeholder="Max"
            {...register('maxPower', { valueAsNumber: true })}
            className="input text-xs py-1.5"
          />
        </div>
      </section>

      {/* Office */}
      <section>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Office
        </h4>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 w-6">SF</span>
            <input
              type="number"
              placeholder="Min"
              {...register('minOfficeSf', { valueAsNumber: true })}
              className="input text-xs py-1 flex-1"
            />
            <span className="text-xs text-gray-400">-</span>
            <input
              type="number"
              placeholder="Max"
              {...register('maxOfficeSf', { valueAsNumber: true })}
              className="input text-xs py-1 flex-1"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 w-6">%</span>
            <input
              type="number"
              placeholder="Min"
              {...register('minOfficePct', { valueAsNumber: true })}
              className="input text-xs py-1 flex-1"
            />
            <span className="text-xs text-gray-400">-</span>
            <input
              type="number"
              placeholder="Max"
              {...register('maxOfficePct', { valueAsNumber: true })}
              className="input text-xs py-1 flex-1"
            />
          </div>
        </div>
      </section>

    </div>
  )
}
