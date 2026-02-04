import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { occupancyApi, unitsApi } from '@/api/client'
import { EntitySearch } from '@/components/Entity/EntitySearch'
import { EntityForm } from '@/components/Entity/EntityForm'
import type { Entity, OccupantType, LeaseType, MarketStatus } from '@/types'

const occupancyFormSchema = z.object({
  entity_id: z.string().uuid('Please select a tenant'),
  occupant_type: z.enum(['owner_user', 'tenant', 'investor']),
  lease_start: z.string().optional().nullable(),
  lease_expiration: z.string().optional().nullable(),
  rent_psf_month: z.number().min(0).optional().nullable(),
  rent_total_month: z.number().min(0).optional().nullable(),
  lease_type: z.enum(['nnn', 'gross', 'modified_gross']).optional().nullable(),
  nnn_fees_month: z.number().min(0).optional().nullable(),
  market_status: z.enum(['stable', 'relocation', 'growth', 'expansion', 'contraction']).default('stable'),
  notes: z.string().optional().nullable(),
})

type OccupancyFormData = z.infer<typeof occupancyFormSchema>

interface OccupancyFormProps {
  unitId: string
  occupancyId?: string
  onBack: () => void
  onSuccess: () => void
}

const OCCUPANT_TYPES: { value: OccupantType; label: string }[] = [
  { value: 'tenant', label: 'Tenant' },
  { value: 'owner_user', label: 'Owner-User' },
  { value: 'investor', label: 'Investor' },
]

const LEASE_TYPES: { value: LeaseType; label: string }[] = [
  { value: 'nnn', label: 'NNN' },
  { value: 'gross', label: 'Gross' },
  { value: 'modified_gross', label: 'Modified Gross' },
]

const MARKET_STATUSES: { value: MarketStatus; label: string; color: string }[] = [
  { value: 'stable', label: 'Stable', color: 'gray' },
  { value: 'growth', label: 'Growth', color: 'green' },
  { value: 'expansion', label: 'Expansion', color: 'blue' },
  { value: 'relocation', label: 'Relocation', color: 'yellow' },
  { value: 'contraction', label: 'Contraction', color: 'red' },
]

export function OccupancyForm({ unitId, occupancyId, onBack, onSuccess }: OccupancyFormProps) {
  const queryClient = useQueryClient()
  const [showEntityForm, setShowEntityForm] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const isEditing = !!occupancyId

  // Get unit details for SF calculation
  const { data: unit } = useQuery({
    queryKey: ['unit', unitId],
    queryFn: () => unitsApi.get(unitId),
  })

  // Get existing occupancy if editing
  const { data: existingOccupancy, isLoading } = useQuery({
    queryKey: ['occupancy', occupancyId],
    queryFn: () => occupancyApi.get(occupancyId!),
    enabled: isEditing,
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OccupancyFormData>({
    resolver: zodResolver(occupancyFormSchema),
    defaultValues: {
      occupant_type: 'tenant',
      market_status: 'stable',
    },
    values: existingOccupancy ? {
      entity_id: existingOccupancy.entity_id,
      occupant_type: existingOccupancy.occupant_type,
      lease_start: existingOccupancy.lease_start || '',
      lease_expiration: existingOccupancy.lease_expiration || '',
      rent_psf_month: existingOccupancy.rent_psf_month || null,
      rent_total_month: existingOccupancy.rent_total_month || null,
      lease_type: existingOccupancy.lease_type || null,
      nnn_fees_month: existingOccupancy.nnn_fees_month || null,
      market_status: existingOccupancy.market_status,
      notes: existingOccupancy.notes || '',
    } : undefined,
  })

  const leaseType = watch('lease_type')
  const rentPsf = watch('rent_psf_month')
  const rentTotal = watch('rent_total_month')

  // Auto-calculate rent total from PSF
  const handleRentPsfChange = (value: number) => {
    setValue('rent_psf_month', value)
    if (unit?.unit_sf && value) {
      setValue('rent_total_month', Math.round(value * unit.unit_sf * 100) / 100)
    }
  }

  // Auto-calculate PSF from total
  const handleRentTotalChange = (value: number) => {
    setValue('rent_total_month', value)
    if (unit?.unit_sf && value) {
      setValue('rent_psf_month', Math.round((value / unit.unit_sf) * 100) / 100)
    }
  }

  const mutation = useMutation({
    mutationFn: (data: OccupancyFormData) => {
      if (isEditing) {
        return occupancyApi.update(occupancyId, data)
      }
      return occupancyApi.create({ ...data, unit_id: unitId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', unitId] })
      queryClient.invalidateQueries({ queryKey: ['occupancy'] })
      queryClient.invalidateQueries({ queryKey: ['parcel'] })
      onSuccess()
    },
  })

  const handleEntitySelect = (entity: Entity) => {
    setSelectedEntity(entity)
    setValue('entity_id', entity.id)
  }

  const handleEntityCreated = (entityId: string) => {
    setValue('entity_id', entityId)
    setShowEntityForm(false)
  }

  const onSubmit = (data: OccupancyFormData) => {
    mutation.mutate(data)
  }

  if (showEntityForm) {
    return (
      <EntityForm
        onBack={() => setShowEntityForm(false)}
        onSuccess={handleEntityCreated}
      />
    )
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
            {isEditing ? 'Edit Tenant' : 'Add Tenant'}
          </h2>
        </div>
        <button type="submit" disabled={isSubmitting} className="btn btn-primary">
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Unit Info */}
      {unit && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <span className="font-medium">{unit.street_address}</span>
          <span className="text-gray-500 ml-2">{unit.unit_sf?.toLocaleString()} SF</span>
        </div>
      )}

      {mutation.error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
          {(mutation.error as Error).message || 'Failed to save'}
        </div>
      )}

      {/* Entity Selection */}
      <div>
        <label className="label">Tenant / Occupant *</label>
        <EntitySearch
          onSelect={handleEntitySelect}
          onCreateNew={() => setShowEntityForm(true)}
          selectedEntity={selectedEntity}
        />
        {errors.entity_id && (
          <p className="mt-1 text-sm text-red-600">{errors.entity_id.message}</p>
        )}
      </div>

      {/* Occupant Type */}
      <div>
        <label className="label">Occupant Type</label>
        <div className="flex gap-4">
          {OCCUPANT_TYPES.map((type) => (
            <label key={type.value} className="flex items-center gap-2">
              <input
                type="radio"
                value={type.value}
                {...register('occupant_type')}
                className="text-blue-600"
              />
              <span className="text-sm">{type.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Lease Dates */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-gray-900">Lease Terms</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Lease Start</label>
            <input
              type="date"
              {...register('lease_start')}
              className="input"
            />
          </div>
          <div>
            <label className="label">Lease Expiration</label>
            <input
              type="date"
              {...register('lease_expiration')}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="label">Lease Type</label>
          <div className="flex gap-4">
            {LEASE_TYPES.map((type) => (
              <label key={type.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  value={type.value}
                  {...register('lease_type')}
                  className="text-blue-600"
                />
                <span className="text-sm">{type.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Rent */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-gray-900">Rent</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Rent ($/SF/Month)</label>
            <input
              type="number"
              step="0.01"
              {...register('rent_psf_month', { valueAsNumber: true })}
              onChange={(e) => handleRentPsfChange(parseFloat(e.target.value) || 0)}
              className="input"
              placeholder="1.25"
            />
          </div>
          <div>
            <label className="label">Rent ($/Month Total)</label>
            <input
              type="number"
              step="0.01"
              {...register('rent_total_month', { valueAsNumber: true })}
              onChange={(e) => handleRentTotalChange(parseFloat(e.target.value) || 0)}
              className="input"
              placeholder="25000"
            />
          </div>
        </div>

        {leaseType === 'nnn' && (
          <div>
            <label className="label">NNN Fees ($/Month)</label>
            <input
              type="number"
              step="0.01"
              {...register('nnn_fees_month', { valueAsNumber: true })}
              className="input"
              placeholder="5000"
            />
          </div>
        )}
      </div>

      {/* Market Status */}
      <div>
        <label className="label">Market Status</label>
        <p className="text-xs text-gray-500 mb-2">
          Is this tenant looking to relocate, grow, or contract?
        </p>
        <div className="flex flex-wrap gap-2">
          {MARKET_STATUSES.map((status) => (
            <label
              key={status.value}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                watch('market_status') === status.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                value={status.value}
                {...register('market_status')}
                className="sr-only"
              />
              <span className="text-sm">{status.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="label">Notes</label>
        <textarea
          {...register('notes')}
          className="input min-h-[80px]"
          placeholder="Additional notes about this tenancy..."
        />
      </div>

      {/* Submit */}
      <div className="pt-4 border-t border-gray-200 flex gap-3">
        <button type="button" onClick={onBack} className="flex-1 btn btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting} className="flex-1 btn btn-primary">
          {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Add Tenant'}
        </button>
      </div>
    </form>
  )
}
