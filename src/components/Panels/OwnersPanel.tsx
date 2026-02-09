import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { crmApi } from '@/api/client'

interface OwnersPanelProps {
  onClose: () => void
  onOwnerSelect?: (entity: any) => void
}

export function OwnersPanel({ onClose, onOwnerSelect }: OwnersPanelProps) {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'owners', search],
    queryFn: () => crmApi.getAll(),
  })

  // Filter to owner-type entities (those with properties)
  const owners = (data || []).filter((e: any) => {
    const matchesSearch = !search ||
      (e.entity_name || e.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.address || '').toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (e.property_count || 0) > 0
  })

  return (
    <div className="h-full flex flex-col bg-navy-dark text-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy-light">
        <h2 className="text-lg font-bold text-gold">Owner-Users</h2>
        <button onClick={onClose} className="p-1 hover:bg-navy-light rounded">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-2">
        <input
          type="text"
          placeholder="Search owners..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded bg-navy-light border border-navy-light text-white placeholder-gray-400 text-sm"
        />
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && <div className="p-4 text-gray-400">Loading owners...</div>}
        {!isLoading && owners.length === 0 && (
          <div className="p-4 text-gray-400">No owner-users found</div>
        )}
        {owners.map((owner: any) => (
          <div
            key={owner.id}
            className="px-4 py-3 border-b border-navy-light hover:bg-navy-light cursor-pointer"
            onClick={() => onOwnerSelect?.(owner)}
          >
            <div className="font-semibold text-sm">{owner.entity_name || owner.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">{owner.address}, {owner.city}</div>
            <div className="flex gap-3 mt-1 text-xs text-gray-500">
              <span>{owner.property_count || 0} properties</span>
              {owner.primary_contact_name && <span>{owner.primary_contact_name}</span>}
              {owner.primary_contact_phone && <span>{owner.primary_contact_phone}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 text-xs text-gray-500 border-t border-navy-light">
        {owners.length} owner-user{owners.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
