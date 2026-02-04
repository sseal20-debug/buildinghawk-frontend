import { useQuery } from '@tanstack/react-query'
import { entitiesApi } from '@/api/client'
import type { Entity, PortfolioItem, Contact } from '@/types'
import { useState } from 'react'

interface EntityDetailProps {
  entityId: string
  onBack: () => void
  onEdit: () => void
  onPropertySelect: (buildingId: string, unitId?: string) => void
}

export function EntityDetail({ entityId, onBack, onEdit, onPropertySelect }: EntityDetailProps) {
  const [activeTab, setActiveTab] = useState<'owned' | 'occupied'>('owned')

  const { data: entity, isLoading } = useQuery({
    queryKey: ['entity', entityId],
    queryFn: () => entitiesApi.get(entityId),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!entity) {
    return <div className="text-center py-8 text-gray-500">Entity not found</div>
  }

  const ownedProperties = entity.portfolio?.filter(
    (p: PortfolioItem) => p.relationship_type === 'ownership' && p.is_current
  ) || []

  const occupiedProperties = entity.portfolio?.filter(
    (p: PortfolioItem) => p.relationship_type === 'occupancy' && p.is_current
  ) || []

  const primaryContact = entity.contacts?.find((c: Contact) => c.is_primary)

  const formatCurrency = (n: number | undefined | null) =>
    n ? `$${n.toLocaleString()}` : '—'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{entity.entity_name}</h2>
            <span className="badge badge-gray capitalize">{entity.entity_type}</span>
          </div>
        </div>
        <button onClick={onEdit} className="btn btn-secondary">Edit</button>
      </div>

      {/* Website */}
      {entity.website && (
        <a
          href={entity.website}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          {entity.website}
        </a>
      )}

      {/* Contacts */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-3">Contacts</h3>
        {entity.contacts && entity.contacts.length > 0 ? (
          <div className="space-y-3">
            {entity.contacts.map((contact: Contact) => (
              <div
                key={contact.id}
                className={`bg-white rounded-lg p-3 border ${
                  contact.is_primary ? 'border-blue-200' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      {contact.name}
                      {contact.is_primary && (
                        <span className="badge badge-blue text-xs">Primary</span>
                      )}
                    </div>
                    {contact.title && (
                      <div className="text-sm text-gray-500">{contact.title}</div>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {contact.mobile && (
                    <a
                      href={`tel:${contact.mobile}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm hover:bg-green-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {contact.mobile}
                    </a>
                  )}
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm hover:bg-blue-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Email
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No contacts added</p>
        )}
      </div>

      {/* Portfolio Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('owned')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'owned'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Owned ({ownedProperties.length})
          </button>
          <button
            onClick={() => setActiveTab('occupied')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'occupied'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Occupied ({occupiedProperties.length})
          </button>
        </nav>
      </div>

      {/* Portfolio List */}
      <div className="space-y-2">
        {activeTab === 'owned' ? (
          ownedProperties.length > 0 ? (
            ownedProperties.map((prop: PortfolioItem) => (
              <button
                key={`${prop.building_id}-${prop.unit_id || 'bldg'}`}
                onClick={() => onPropertySelect(prop.building_id, prop.unit_id)}
                className="w-full text-left p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-gray-900">{prop.address}</div>
                  <div className="text-sm text-gray-500">
                    {prop.city}
                    {prop.sf && ` · ${prop.sf.toLocaleString()} SF`}
                    {prop.purchase_price && ` · ${formatCurrency(prop.purchase_price)}`}
                  </div>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))
          ) : (
            <p className="text-center py-6 text-gray-500">No owned properties</p>
          )
        ) : (
          occupiedProperties.length > 0 ? (
            occupiedProperties.map((prop: PortfolioItem) => (
              <button
                key={`${prop.building_id}-${prop.unit_id || 'bldg'}`}
                onClick={() => onPropertySelect(prop.building_id, prop.unit_id)}
                className="w-full text-left p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-gray-900">{prop.address}</div>
                  <div className="text-sm text-gray-500">
                    {prop.city}
                    {prop.sf && ` · ${prop.sf.toLocaleString()} SF`}
                  </div>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))
          ) : (
            <p className="text-center py-6 text-gray-500">No occupied properties</p>
          )
        )}
      </div>

      {/* Actions */}
      <div className="pt-4 border-t border-gray-200 space-y-2">
        <button className="w-full btn btn-secondary flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          Set Alert
        </button>
      </div>

      {/* Notes */}
      {entity.notes && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">Notes</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{entity.notes}</p>
        </div>
      )}
    </div>
  )
}
