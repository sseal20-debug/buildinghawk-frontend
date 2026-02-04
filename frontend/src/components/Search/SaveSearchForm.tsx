import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { searchApi } from '@/api/client'
import type { SearchCriteria } from '@/types'

const saveSearchSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  client_name: z.string().optional().nullable(),
  client_email: z.string().email().optional().or(z.literal('')).nullable(),
  client_phone: z.string().optional().nullable(),
  alert_enabled: z.boolean().default(false),
  notes: z.string().optional().nullable(),
})

type SaveSearchFormData = z.infer<typeof saveSearchSchema>

interface SaveSearchFormProps {
  criteria: SearchCriteria
  onSuccess: () => void
  onCancel: () => void
}

export function SaveSearchForm({ criteria, onSuccess, onCancel }: SaveSearchFormProps) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SaveSearchFormData>({
    resolver: zodResolver(saveSearchSchema),
    defaultValues: {
      alert_enabled: false,
    },
  })

  const mutation = useMutation({
    mutationFn: (data: SaveSearchFormData) =>
      searchApi.createSavedSearch({
        ...data,
        criteria,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
      onSuccess()
    },
  })

  const onSubmit = (data: SaveSearchFormData) => {
    mutation.mutate(data)
  }

  // Format criteria for display
  const formatCriteria = (): string => {
    const parts: string[] = []
    if (criteria.min_sf || criteria.max_sf) {
      const min = criteria.min_sf ? `${(criteria.min_sf / 1000).toFixed(0)}k` : ''
      const max = criteria.max_sf ? `${(criteria.max_sf / 1000).toFixed(0)}k` : ''
      parts.push(`${min}-${max} SF`.replace('-k', '+ SF').replace('k-', '<'))
    }
    if (criteria.min_amps) parts.push(`${criteria.min_amps}A+`)
    if (criteria.min_docks) parts.push(`${criteria.min_docks}+ docks`)
    if (criteria.fenced_yard) parts.push('Fenced yard')
    if (criteria.cities?.length) parts.push(criteria.cities.join(', '))
    return parts.join(' | ') || 'All properties'
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Save Search</h2>
        <p className="text-sm text-gray-500 mt-1">
          Save this search to quickly run it again or receive alerts
        </p>
      </div>

      {/* Criteria Summary */}
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Search Criteria</p>
        <p className="text-sm text-gray-700">{formatCriteria()}</p>
      </div>

      {mutation.error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
          {(mutation.error as Error).message || 'Failed to save search'}
        </div>
      )}

      <div>
        <label className="label">Search Name *</label>
        <input
          type="text"
          {...register('name')}
          className="input"
          placeholder="e.g., Acme Corp - Expansion Search"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-gray-900">Client Info (Optional)</h3>

        <div>
          <label className="label">Client Name</label>
          <input
            type="text"
            {...register('client_name')}
            className="input"
            placeholder="Company or contact name"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              {...register('client_email')}
              className="input"
              placeholder="client@example.com"
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              type="tel"
              {...register('client_phone')}
              className="input"
              placeholder="(714) 555-1234"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
        <input
          type="checkbox"
          {...register('alert_enabled')}
          className="rounded text-blue-600"
        />
        <div>
          <p className="font-medium text-blue-900">Enable Alerts</p>
          <p className="text-sm text-blue-700">
            Get notified when new properties match this search
          </p>
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea
          {...register('notes')}
          className="input min-h-[80px]"
          placeholder="Additional notes about this search..."
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 btn btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 btn btn-primary"
        >
          {isSubmitting ? 'Saving...' : 'Save Search'}
        </button>
      </div>
    </form>
  )
}
