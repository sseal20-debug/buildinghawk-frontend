import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ownershipApi, buildingsApi } from '@/api/client'
import { EntitySearch } from '@/components/Entity/EntitySearch'
import { EntityForm } from '@/components/Entity/EntityForm'
import type { Entity } from '@/types'

const ownershipFormSchema = z.object({
  entity_id: z.string().uuid('Please select an owner'),
  purchase_date: z.string().optional().nullable(),
  purchase_price: z.number().min(0).optional().nullable(),
  purchase_price_psf: z.number().min(0).optional().nullable(),
  land_price_psf: z.number().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
})

type OwnershipFormData = z.infer<typeof ownershipFormSchema>

interface OwnershipFormProps {
  buildingId: string
  ownershipId?: string
  onBack: () => void
  onSuccess: () => void
}

export function OwnershipForm({ buildingId, ownershipId, onBack, onSuccess }: OwnershipFormProps) {
  const queryClient = useQueryClient()
  const [showEntityForm, setShowEntityForm] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const isEditing = !!ownershipId

  // Get building details for calculations
  const { data: building } = useQuery({
    queryKey: ['building', buildingId],
    queryFn: () => buildingsApi.get(buildingId),
  })

  // Get existing ownership if editing
  const { data: existingOwnership, isLoading } = useQuery({
    queryKey: ['ownership', ownershipId],
    queryFn: () => ownershipApi.get(ownershipId!),
    enabled: isEditing,
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OwnershipFormData>({
    resolver: zodResolver(ownershipFormSchema),
    values: existingOwnership ? {
      entity_id: existingOwnership.entity_id,
      purchase_date: existingOwnership.purchase_date || '',
      purchase_price: existingOwnership.purchase_price || null,
      purchase_price_psf: existingOwnership.purchase_price_psf || null,
      land_price_psf: existingOwnership.land_price_psf || null,
      notes: existingOwnership.notes || '',
    } : undefined,
  })

  // Calculate coverage to determine if land price should show
  const coveragePct = building?.coverage_pct
  const showLandPrice = coveragePct !== undefined && coveragePct < 45

  // Auto-calculate PSF from total price
  const handlePriceChange = (value: number) => {
    setValue('purchase_price', value)
    if (building?.building_sf && value) {
      setValue('purchase_price_psf', Math.round((value / building.building_sf) * 100) / 100)
    }
  }

  // Auto-calculate total from PSF
  const handlePsfChange = (value: number) => {
    setValue('purchase_price_psf', value)
    if (building?.building_sf && value) {
      setValue('purchase_price', Math.round(value * building.building_sf))
    }
  }

  const mutation = useMutation({
    mutationFn: (data: OwnershipFormData) => {
      if (isEditing) {
        return ownershipApi.update(ownershipId, data)
      }
      return ownershipApi.create({ ...data, building_id: buildingId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['building', buildingId] })
      queryClient.invalidateQueries({ queryKey: ['ownership'] })
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

  const onSubmit = (data: OwnershipFormData) => {
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
            {isEditing ? 'Edit Ownership' : 'Record Sale'}
          </h2>
        </div>
        <button type="submit" disabled={isSubmitting} className="btn btn-primary">
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Building Info */}
      {building && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <span className="font-medium">{building.building_name || 'Building'}</span>
          <span className="text-gray-500 ml-2">
            {building.building_sf?.toLocaleString()} SF
            {coveragePct && ` · ${coveragePct}% coverage`}
          </span>
        </div>
      )}

      {mutation.error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
          {(mutation.error as Error).message || 'Failed to save'}
        </div>
      )}

      {/* Entity Selection */}
      <div>
        <label className="label">New Owner *</label>
        <EntitySearch
          onSelect={handleEntitySelect}
          onCreateNew={() => setShowEntityForm(true)}
          selectedEntity={selectedEntity}
          placeholder="Search buyer/owner..."
        />
        {errors.entity_id && (
          <p className="mt-1 text-sm text-red-600">{errors.entity_id.message}</p>
        )}
      </div>

      {/* Purchase Details */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-gray-900">Purchase Details</h3>

        <div>
          <label className="label">Purchase Date</label>
          <input
            type="date"
            {...register('purchase_date')}
            className="input"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Purchase Price ($)</label>
            <input
              type="number"
              step="1"
              {...register('purchase_price', { valueAsNumber: true })}
              onChange={(e) => handlePriceChange(parseFloat(e.target.value) || 0)}
              className="input"
              placeholder="4200000"
            />
          </div>
          <div>
            <label className="label">Price ($/SF)</label>
            <input
              type="number"
              step="0.01"
              {...register('purchase_price_psf', { valueAsNumber: true })}
              onChange={(e) => handlePsfChange(parseFloat(e.target.value) || 0)}
              className="input"
              placeholder="172.00"
            />
          </div>
        </div>

        {/* Land Price - only show if coverage < 45% */}
        {showLandPrice && (
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-yellow-700">
                Low coverage ({coveragePct}%) - land value may be significant
              </span>
            </div>
            <div>
              <label className="label">Land Price ($/SF of Land)</label>
              <input
                type="number"
                step="0.01"
                {...register('land_price_psf', { valueAsNumber: true })}
                className="input"
                placeholder="45.00"
              />
              <p className="text-xs text-gray-500 mt-1">
                Calculate: Purchase Price ÷ Land SF
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="label">Notes</label>
        <textarea
          {...register('notes')}
          className="input min-h-[80px]"
          placeholder="Additional notes about this sale..."
        />
      </div>

      {/* Submit */}
      <div className="pt-4 border-t border-gray-200 flex gap-3">
        <button type="button" onClick={onBack} className="flex-1 btn btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting} className="flex-1 btn btn-primary">
          {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Record Sale'}
        </button>
      </div>
    </form>
  )
}
