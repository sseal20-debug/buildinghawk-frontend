import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { searchApi } from '@/api/client'
import type { SavedSearch } from '@/types'

interface SavedSearchListProps {
  onRun: (search: SavedSearch) => void
  onEdit: (search: SavedSearch) => void
  onClose: () => void
}

export function SavedSearchList({ onRun, onEdit, onClose }: SavedSearchListProps) {
  const queryClient = useQueryClient()

  const { data: savedSearches, isLoading } = useQuery({
    queryKey: ['saved-searches'],
    queryFn: searchApi.getSavedSearches,
  })

  const deleteMutation = useMutation({
    mutationFn: searchApi.deleteSavedSearch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
    },
  })

  const toggleAlertMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      searchApi.updateSavedSearch(id, { alert_enabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
    },
  })

  const formatCriteria = (search: SavedSearch): string => {
    const parts: string[] = []
    const c = search.criteria

    if (c.min_sf || c.max_sf) {
      if (c.min_sf && c.max_sf) {
        parts.push(`${(c.min_sf / 1000).toFixed(0)}-${(c.max_sf / 1000).toFixed(0)}k SF`)
      } else if (c.min_sf) {
        parts.push(`${(c.min_sf / 1000).toFixed(0)}k+ SF`)
      } else if (c.max_sf) {
        parts.push(`<${(c.max_sf / 1000).toFixed(0)}k SF`)
      }
    }

    if (c.min_amps) parts.push(`${c.min_amps}A+`)
    if (c.min_docks) parts.push(`${c.min_docks}+ docks`)
    if (c.fenced_yard) parts.push('Fenced')
    if (c.cities?.length) parts.push(c.cities.slice(0, 2).join(', '))
    if (c.for_sale) parts.push('For Sale')
    if (c.for_lease) parts.push('For Lease')

    return parts.join(' | ')
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Client Requirements</h2>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : savedSearches && savedSearches.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {savedSearches.map((search) => (
              <div key={search.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-medium text-gray-900">{search.name}</h3>
                    {search.client_name && (
                      <p className="text-sm text-gray-500">{search.client_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="badge badge-blue">{search.match_count} matches</span>
                    <button
                      onClick={() =>
                        toggleAlertMutation.mutate({
                          id: search.id,
                          enabled: !search.alert_enabled,
                        })
                      }
                      className={`p-1.5 rounded ${
                        search.alert_enabled
                          ? 'text-yellow-600 bg-yellow-50'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                      title={search.alert_enabled ? 'Alerts enabled' : 'Enable alerts'}
                    >
                      <svg className="w-5 h-5" fill={search.alert_enabled ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </button>
                  </div>
                </div>

                <p className="text-sm text-gray-600 mb-3">
                  {formatCriteria(search)}
                </p>

                {search.last_sent_at && (
                  <p className="text-xs text-gray-400 mb-3">
                    Last sent: {new Date(search.last_sent_at).toLocaleDateString()}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => onRun(search)}
                    className="flex-1 btn btn-primary py-1.5 text-sm"
                  >
                    Run Search
                  </button>
                  <button
                    onClick={() => onEdit(search)}
                    className="btn btn-secondary py-1.5 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this saved search?')) {
                        deleteMutation.mutate(search.id)
                      }
                    }}
                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <p className="font-medium">No saved searches</p>
            <p className="text-sm">Run a search and save it for a client</p>
          </div>
        )}
      </div>
    </div>
  )
}
