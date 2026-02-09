import { useQuery } from '@tanstack/react-query'
import { searchApi } from '@/api/client'

interface RequirementsPanelProps {
  onClose: () => void
  onRequirementSelect?: (search: any) => void
}

export function RequirementsPanel({ onClose, onRequirementSelect }: RequirementsPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['saved-searches'],
    queryFn: searchApi.getSavedSearches,
  })

  const searches = data || []

  const formatSf = (n?: number) => n ? n.toLocaleString() + ' SF' : '--'

  return (
    <div className="h-full flex flex-col bg-navy-dark text-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy-light">
        <h2 className="text-lg font-bold text-gold">Client Requirements</h2>
        <button onClick={onClose} className="p-1 hover:bg-navy-light rounded">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && <div className="p-4 text-gray-400">Loading requirements...</div>}
        {!isLoading && searches.length === 0 && (
          <div className="p-4 text-gray-400">No saved requirements. Use Specs search to create one.</div>
        )}
        {searches.map((s: any) => (
          <div
            key={s.id}
            className="px-4 py-3 border-b border-navy-light hover:bg-navy-light cursor-pointer"
            onClick={() => onRequirementSelect?.(s)}
          >
            <div className="font-semibold text-sm">{s.name || 'Unnamed Search'}</div>
            {s.client_name && <div className="text-xs text-gold mt-0.5">{s.client_name}</div>}
            <div className="flex flex-wrap gap-2 mt-1">
              {s.criteria?.min_sf && (
                <span className="text-xs bg-navy-light px-2 py-0.5 rounded">{formatSf(s.criteria.min_sf)}+</span>
              )}
              {s.criteria?.max_sf && (
                <span className="text-xs bg-navy-light px-2 py-0.5 rounded">up to {formatSf(s.criteria.max_sf)}</span>
              )}
              {s.criteria?.min_clear_height && (
                <span className="text-xs bg-navy-light px-2 py-0.5 rounded">{s.criteria.min_clear_height}' clear</span>
              )}
              {s.criteria?.min_amps && (
                <span className="text-xs bg-navy-light px-2 py-0.5 rounded">{s.criteria.min_amps}A power</span>
              )}
              {s.criteria?.cities?.length > 0 && (
                <span className="text-xs bg-navy-light px-2 py-0.5 rounded">{s.criteria.cities.join(', ')}</span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {s.criteria?.for_lease ? 'Lease' : ''}{s.criteria?.for_sale ? ' Sale' : ''}
              {s.updated_at && ` -- Updated ${new Date(s.updated_at).toLocaleDateString()}`}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 text-xs text-gray-500 border-t border-navy-light">
        {searches.length} saved requirement{searches.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
