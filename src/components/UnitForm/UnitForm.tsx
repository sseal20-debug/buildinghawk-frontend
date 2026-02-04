import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unitsApi } from '@/api/client'
import type { PowerVolts, UnitStatus } from '@/types'
import { AddressAutocomplete } from '@/components/AddressAutocomplete/AddressAutocomplete'

const unitFormSchema = z.object({
  street_address: z.string().min(1, 'Address is required'),
  unit_number: z.string().optional(),
  unit_sf: z.number().int().positive().optional().nullable(),
  warehouse_sf: z.number().int().min(0).optional().nullable(),
  office_sf: z.number().int().min(0).optional().nullable(),
  clear_height_ft: z.number().positive().optional().nullable(),
  dock_doors: z.number().int().min(0).default(0),
  gl_doors: z.number().int().min(0).default(0),
  power_amps: z.number().int().positive().optional().nullable(),
  power_volts: z.enum(['120/240', '277/480', 'both', 'unknown']).default('unknown'),
  fenced_yard: z.boolean().default(false),
  yard_sf: z.number().int().min(0).optional().nullable(),
  unit_status: z.enum(['occupied', 'vacant', 'under_construction']).default('vacant'),
  for_sale: z.boolean().default(false),
  for_lease: z.boolean().default(false),
  asking_sale_price: z.number().positive().optional().nullable(),
  asking_lease_rate: z.number().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
})

type UnitFormData = z.infer<typeof unitFormSchema>

interface UnitFormProps {
  unitId?: string
  buildingId: string
  onBack: () => void
  onSuccess: () => void
}

export function UnitForm({ unitId, buildingId, onBack, onSuccess }: UnitFormProps) {
  const queryClient = useQueryClient()
  const isEditing = !!unitId

  const { data: existingUnit, isLoading } = useQuery({
    queryKey: ['unit', unitId],
    queryFn: () => unitsApi.get(unitId!),
    enabled: isEditing,
  })

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UnitFormData>({
    resolver: zodResolver(unitFormSchema),
    defaultValues: existingUnit || {
      dock_doors: 0,
      gl_doors: 0,
      power_volts: 'unknown' as PowerVolts,
      fenced_yard: false,
      unit_status: 'vacant' as UnitStatus,
      for_sale: false,
      for_lease: false,
    },
    values: existingUnit ? {
      ...existingUnit,
      unit_sf: existingUnit.unit_sf || null,
      warehouse_sf: existingUnit.warehouse_sf || null,
      office_sf: existingUnit.office_sf || null,
      clear_height_ft: existingUnit.clear_height_ft || null,
      power_amps: existingUnit.power_amps || null,
      yard_sf: existingUnit.yard_sf || null,
      asking_sale_price: existingUnit.asking_sale_price || null,
      asking_lease_rate: existingUnit.asking_lease_rate || null,
    } : undefined,
  })

  const fencedYard = watch('fenced_yard')
  const forSale = watch('for_sale')
  const forLease = watch('for_lease')

  const mutation = useMutation({
    mutationFn: (data: UnitFormData) => {
      if (isEditing) {
        return unitsApi.update(unitId, data)
      }
      return unitsApi.create({ ...data, building_id: buildingId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit'] })
      queryClient.invalidateQueries({ queryKey: ['parcel'] })
      onSuccess()
    },
  })

  const onSubmit = (data: UnitFormData) => {
    mutation.mutate(data)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Unit' : 'Add Unit'}
          </h2>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-primary"
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>

      {mutation.error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
          {(mutation.error as Error).message || 'Failed to save unit'}
        </div>
      )}

      {/* Address */}
      <div>
        <label className="label">Address *</label>
        <Controller
          name="street_address"
          control={control}
          render={({ field }) => (
            <AddressAutocomplete
              value={field.value}
              onChange={field.onChange}
              placeholder="Start typing an address..."
              error={errors.street_address?.message}
            />
          )}
        />
      </div>

      <div>
        <label className="label">Unit Number</label>
        <input
          type="text"
          {...register('unit_number')}
          className="input"
          placeholder="Suite A, Unit 100, etc."
        />
      </div>

      {/* Size */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-gray-900">Size (SF)</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Total</label>
            <input
              type="number"
              {...register('unit_sf', { valueAsNumber: true })}
              className="input input-sm"
            />
          </div>
          <div>
            <label className="label">Warehouse</label>
            <input
              type="number"
              {...register('warehouse_sf', { valueAsNumber: true })}
              className="input input-sm"
            />
          </div>
          <div>
            <label className="label">Office</label>
            <input
              type="number"
              {...register('office_sf', { valueAsNumber: true })}
              className="input input-sm"
            />
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-gray-900">Features</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Clear Height (ft)</label>
            <input
              type="number"
              step="0.5"
              {...register('clear_height_ft', { valueAsNumber: true })}
              className="input input-sm"
            />
          </div>
          <div>
            <label className="label">Dock Doors</label>
            <input
              type="number"
              {...register('dock_doors', { valueAsNumber: true })}
              className="input input-sm"
            />
          </div>
          <div>
            <label className="label">GL Doors</label>
            <input
              type="number"
              {...register('gl_doors', { valueAsNumber: true })}
              className="input input-sm"
            />
          </div>
          <div>
            <label className="label">Power Amps</label>
            <input
              type="number"
              {...register('power_amps', { valueAsNumber: true })}
              className="input input-sm"
            />
          </div>
        </div>

        <div>
          <label className="label">Power Volts</label>
          <div className="flex gap-4">
            {(['120/240', '277/480', 'both', 'unknown'] as PowerVolts[]).map((v) => (
              <label key={v} className="flex items-center gap-2">
                <input
                  type="radio"
                  value={v}
                  {...register('power_volts')}
                  className="text-blue-600"
                />
                <span className="text-sm">{v === 'unknown' ? 'Unknown' : v}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              {...register('fenced_yard')}
              className="rounded text-blue-600"
            />
            <span className="text-sm">Fenced Yard</span>
          </label>
          {fencedYard && (
            <div className="flex-1">
              <input
                type="number"
                {...register('yard_sf', { valueAsNumber: true })}
                className="input input-sm"
                placeholder="Yard SF"
              />
            </div>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-gray-900">Status</h3>

        <div>
          <label className="label">Occupancy Status</label>
          <div className="flex gap-4">
            {(['occupied', 'vacant', 'under_construction'] as UnitStatus[]).map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input
                  type="radio"
                  value={s}
                  {...register('unit_status')}
                  className="text-blue-600"
                />
                <span className="text-sm capitalize">{s.replace('_', ' ')}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-6">
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
        </div>

        {forSale && (
          <div>
            <label className="label">Asking Sale Price ($)</label>
            <input
              type="number"
              {...register('asking_sale_price', { valueAsNumber: true })}
              className="input"
            />
          </div>
        )}

        {forLease && (
          <div>
            <label className="label">Asking Lease Rate ($/SF/mo)</label>
            <input
              type="number"
              step="0.01"
              {...register('asking_lease_rate', { valueAsNumber: true })}
              className="input"
            />
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="label">Notes</label>
        <textarea
          {...register('notes')}
          className="input min-h-[100px]"
          placeholder="Additional notes..."
        />
      </div>

      {/* Submit */}
      <div className="pt-4 border-t border-gray-200 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 btn btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 btn btn-primary"
        >
          {isSubmitting ? 'Saving...' : 'Save Unit'}
        </button>
      </div>
    </form>
  )
}
