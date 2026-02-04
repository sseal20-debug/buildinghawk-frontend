import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { entitiesApi } from '@/api/client'
import type { EntityType } from '@/types'

const contactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  title: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  mobile: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  is_primary: z.boolean().default(false),
  notes: z.string().optional().nullable(),
})

const entityFormSchema = z.object({
  entity_name: z.string().min(1, 'Entity name is required'),
  entity_type: z.enum(['company', 'individual', 'trust', 'llc', 'partnership']).default('company'),
  website: z.string().url().optional().or(z.literal('')).nullable(),
  notes: z.string().optional().nullable(),
  contacts: z.array(contactSchema).default([]),
})

type EntityFormData = z.infer<typeof entityFormSchema>

interface EntityFormProps {
  entityId?: string
  initialName?: string
  onBack: () => void
  onSuccess: (entityId: string) => void
}

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'company', label: 'Company' },
  { value: 'llc', label: 'LLC' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'trust', label: 'Trust' },
  { value: 'individual', label: 'Individual' },
]

export function EntityForm({ entityId, initialName, onBack, onSuccess }: EntityFormProps) {
  const queryClient = useQueryClient()
  const isEditing = !!entityId

  const { data: existingEntity, isLoading } = useQuery({
    queryKey: ['entity', entityId],
    queryFn: () => entitiesApi.get(entityId!),
    enabled: isEditing,
  })

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<EntityFormData>({
    resolver: zodResolver(entityFormSchema),
    defaultValues: {
      entity_name: initialName || '',
      entity_type: 'company',
      contacts: [],
    },
    values: existingEntity ? {
      entity_name: existingEntity.entity_name,
      entity_type: existingEntity.entity_type,
      website: existingEntity.website || '',
      notes: existingEntity.notes || '',
      contacts: existingEntity.contacts || [],
    } : undefined,
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'contacts',
  })

  const contacts = watch('contacts')

  const setPrimary = (index: number) => {
    contacts.forEach((_, i) => {
      setValue(`contacts.${i}.is_primary`, i === index)
    })
  }

  const mutation = useMutation({
    mutationFn: async (data: EntityFormData) => {
      if (isEditing) {
        // Update entity
        const entity = await entitiesApi.update(entityId, {
          entity_name: data.entity_name,
          entity_type: data.entity_type,
          website: data.website || null,
          notes: data.notes || null,
        })

        // Handle contacts separately
        // For simplicity, we'll update/add contacts
        for (const contact of data.contacts) {
          if (contact.id) {
            await entitiesApi.updateContact(entityId, contact.id, contact)
          } else {
            await entitiesApi.addContact(entityId, contact)
          }
        }

        return entity
      } else {
        // Create entity
        const entity = await entitiesApi.create({
          entity_name: data.entity_name,
          entity_type: data.entity_type,
          website: data.website || undefined,
          notes: data.notes || undefined,
        })

        // Add contacts
        for (const contact of data.contacts) {
          await entitiesApi.addContact(entity.id, contact)
        }

        return entity
      }
    },
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: ['entity'] })
      queryClient.invalidateQueries({ queryKey: ['entities'] })
      onSuccess(entity.id)
    },
  })

  const onSubmit = (data: EntityFormData) => {
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
            {isEditing ? 'Edit Entity' : 'New Entity'}
          </h2>
        </div>
        <button type="submit" disabled={isSubmitting} className="btn btn-primary">
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>

      {mutation.error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
          {(mutation.error as Error).message || 'Failed to save entity'}
        </div>
      )}

      {/* Entity Details */}
      <div className="space-y-4">
        <div>
          <label className="label">Entity Name *</label>
          <input
            type="text"
            {...register('entity_name')}
            className="input"
            placeholder="Company or individual name"
          />
          {errors.entity_name && (
            <p className="mt-1 text-sm text-red-600">{errors.entity_name.message}</p>
          )}
        </div>

        <div>
          <label className="label">Entity Type</label>
          <div className="flex flex-wrap gap-3">
            {ENTITY_TYPES.map((type) => (
              <label key={type.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  value={type.value}
                  {...register('entity_type')}
                  className="text-blue-600"
                />
                <span className="text-sm">{type.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Website</label>
          <input
            type="url"
            {...register('website')}
            className="input"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea
            {...register('notes')}
            className="input min-h-[80px]"
            placeholder="Additional notes..."
          />
        </div>
      </div>

      {/* Contacts */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">Contacts</h3>
          <button
            type="button"
            onClick={() => append({
              name: '',
              title: '',
              email: '',
              mobile: '',
              phone: '',
              is_primary: fields.length === 0,
              notes: '',
            })}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            + Add Contact
          </button>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No contacts added yet
          </p>
        ) : (
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="bg-white rounded-lg p-4 border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={contacts[index]?.is_primary || false}
                      onChange={() => setPrimary(index)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-600">Primary Contact</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="label">Name *</label>
                    <input
                      type="text"
                      {...register(`contacts.${index}.name`)}
                      className="input input-sm"
                      placeholder="John Smith"
                    />
                    {errors.contacts?.[index]?.name && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.contacts[index]?.name?.message}
                      </p>
                    )}
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="label">Title</label>
                    <input
                      type="text"
                      {...register(`contacts.${index}.title`)}
                      className="input input-sm"
                      placeholder="Operations Manager"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="label">Email</label>
                    <input
                      type="email"
                      {...register(`contacts.${index}.email`)}
                      className="input input-sm"
                      placeholder="john@example.com"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="label">Mobile</label>
                    <input
                      type="tel"
                      {...register(`contacts.${index}.mobile`)}
                      className="input input-sm"
                      placeholder="(714) 555-1234"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="pt-4 border-t border-gray-200 flex gap-3">
        <button type="button" onClick={onBack} className="flex-1 btn btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting} className="flex-1 btn btn-primary">
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Entity' : 'Create Entity'}
        </button>
      </div>
    </form>
  )
}
