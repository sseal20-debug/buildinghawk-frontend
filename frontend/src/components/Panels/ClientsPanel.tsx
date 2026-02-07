import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface Client {
  id: string
  name: string
  company?: string
  email?: string
  phone?: string
  property_count: number
  total_sf?: number
  cities: string[]
  last_contact?: string
  type: 'owner' | 'tenant' | 'investor' | 'broker'
  notes?: string
}

interface ClientsPanelProps {
  onClose: () => void
  onClientSelect?: (client: Client) => void
}

const CLIENT_TYPES = [
  { label: 'All', value: 'all' },
  { label: 'Owners', value: 'owner' },
  { label: 'Tenants', value: 'tenant' },
  { label: 'Investors', value: 'investor' },
  { label: 'Brokers', value: 'broker' },
]

export function ClientsPanel({ onClose, onClientSelect }: ClientsPanelProps) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch clients from API
  const { data, isLoading } = useQuery({
    queryKey: ['clients', typeFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.append('type', typeFilter)
      if (searchQuery) params.append('q', searchQuery)

      const res = await fetch(`/api/crm/clients?${params}`)
      if (!res.ok) throw new Error('Failed to fetch clients')
      return res.json() as Promise<{ clients: Client[]; count: number }>
    },
  })

  const clients = data?.clients || []

  const getTypeColor = (type: Client['type']) => {
    switch (type) {
      case 'owner': return 'bg-blue-100 text-blue-800'
      case 'tenant': return 'bg-green-100 text-green-800'
      case 'investor': return 'bg-purple-100 text-purple-800'
      case 'broker': return 'bg-amber-100 text-amber-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / 86400000)

    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#2196f3] text-white border-b">
        <div>
          <h2 className="font-bold text-lg">Clients</h2>
          <p className="text-xs opacity-80">Relationships with 2+ Properties</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        {/* Search */}
        <div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search clients by name, company, or email..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2196f3] focus:border-transparent"
          />
        </div>

        {/* Type Filter */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            Client Type
          </label>
          <div className="flex flex-wrap gap-1">
            {CLIENT_TYPES.map(filter => (
              <button
                key={filter.value}
                onClick={() => setTypeFilter(filter.value)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  typeFilter === filter.value
                    ? 'bg-[#2196f3] text-white font-medium'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm text-gray-600">
          {clients.length} {clients.length === 1 ? 'client' : 'clients'}
        </span>
        <div className="flex gap-2">
          <button className="text-xs text-teal hover:underline">Export</button>
          <button className="text-xs text-[#2196f3] hover:underline font-medium">+ Add Client</button>
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-[#2196f3] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <span className="text-3xl mb-2">👥</span>
            <span className="text-sm">No clients found</span>
            <span className="text-xs mt-1">Clients are entities with 2+ properties</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {clients.map(client => (
              <button
                key={client.id}
                onClick={() => onClientSelect?.(client)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-[#2196f3] text-white flex items-center justify-center font-bold text-sm">
                    {client.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-gray-900 truncate">{client.name}</span>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${getTypeColor(client.type)}`}>
                        {client.type.toUpperCase()}
                      </span>
                    </div>

                    {client.company && (
                      <div className="text-sm text-gray-600 truncate">{client.company}</div>
                    )}

                    {/* Stats */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                      <span className="font-medium text-[#2196f3]">
                        {client.property_count} {client.property_count === 1 ? 'property' : 'properties'}
                      </span>
                      {client.total_sf && (
                        <span>{client.total_sf.toLocaleString()} SF total</span>
                      )}
                      {client.cities.length > 0 && (
                        <span>{client.cities.slice(0, 2).join(', ')}{client.cities.length > 2 ? ` +${client.cities.length - 2}` : ''}</span>
                      )}
                    </div>

                    {/* Contact info */}
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      {client.phone && <span>📞 {client.phone}</span>}
                      {client.email && <span>✉️ {client.email}</span>}
                    </div>

                    {/* Last contact */}
                    <div className="mt-1 text-xs text-gray-400">
                      Last contact: {formatDate(client.last_contact)}
                    </div>
                  </div>

                  {/* Arrow */}
                  <svg className="w-5 h-5 text-gray-400 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 flex gap-2">
        <button className="flex-1 px-4 py-2 bg-[#2196f3] text-white text-sm font-medium rounded-lg hover:bg-[#1976d2] transition-colors">
          + Add New Client
        </button>
        <button className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">
          Import
        </button>
      </div>
    </div>
  )
}

export type { Client }
