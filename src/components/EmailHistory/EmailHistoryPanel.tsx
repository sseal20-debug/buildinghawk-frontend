import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { emailsApi } from '@/api/client'
import type { EmailSearchResult, EmailDetail } from '@/api/client'

interface EmailHistoryPanelProps {
  address: string | null
  contactName?: string | null
  onClose: () => void
}

export function EmailHistoryPanel({ address, contactName, onClose }: EmailHistoryPanelProps) {
  const [localSearch, setLocalSearch] = useState('')
  const [senderFilter, setSenderFilter] = useState('')
  const [expandedEmailId, setExpandedEmailId] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const pageSize = 25

  // Build the search query from address/contact + local filters
  const searchQuery = localSearch || address || contactName || ''

  const { data, isLoading, error } = useQuery({
    queryKey: ['email-search', searchQuery, senderFilter, page],
    queryFn: () =>
      emailsApi.search({
        q: searchQuery || undefined,
        from: senderFilter || undefined,
        limit: pageSize,
        offset: page * pageSize,
      }),
    enabled: searchQuery.length > 0,
    staleTime: 1000 * 60 * 2,
  })

  // Fetch full email body when expanded
  const { data: expandedEmail } = useQuery({
    queryKey: ['email-detail', expandedEmailId],
    queryFn: () => emailsApi.getById(expandedEmailId!),
    enabled: expandedEmailId !== null,
    staleTime: 1000 * 60 * 5,
  })

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      const now = new Date()
      const diffMs = now.getTime() - d.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      if (diffDays === 1) return 'Yesterday'
      if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
      if (d.getFullYear() === now.getFullYear()) {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return dateStr.slice(0, 10)
    }
  }

  const extractName = (addr: string) => {
    if (!addr) return ''
    // "Scott Seal <sseal@lee-associates.com>" → "Scott Seal"
    const match = addr.match(/^"?([^"<]+)"?\s*</)
    if (match) return match[1].trim()
    // Just email
    return addr.split('@')[0]
  }

  const extractEmail = (addr: string) => {
    if (!addr) return ''
    const match = addr.match(/<([^>]+)>/)
    return match ? match[1] : addr
  }

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900">Email History</h2>
            {data && (
              <span className="text-sm text-gray-500">
                ({data.total.toLocaleString()} {data.total === 1 ? 'email' : 'emails'})
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 pb-3 space-y-2">
          <div className="relative">
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={address ? `Searching "${address}"...` : 'Search emails...'}
              value={localSearch}
              onChange={(e) => { setLocalSearch(e.target.value); setPage(0) }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Filter by sender..."
              value={senderFilter}
              onChange={(e) => { setSenderFilter(e.target.value); setPage(0) }}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            {(localSearch || senderFilter) && (
              <button
                onClick={() => { setLocalSearch(''); setSenderFilter(''); setPage(0) }}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Email list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        {error && (
          <div className="p-4 m-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            Failed to load emails. Make sure the backend is running.
          </div>
        )}

        {!isLoading && data?.results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">No emails found</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        )}

        {data?.results.map((email: EmailSearchResult) => (
          <div
            key={email.id}
            className={`border-b border-gray-100 cursor-pointer transition-colors ${
              expandedEmailId === email.id ? 'bg-blue-50' : 'hover:bg-gray-50'
            }`}
            onClick={() => setExpandedEmailId(expandedEmailId === email.id ? null : email.id)}
          >
            <div className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* Sender */}
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900 truncate">
                      {extractName(email.from_addr)}
                    </span>
                    <span className="text-xs text-gray-400 truncate hidden sm:inline">
                      {extractEmail(email.from_addr)}
                    </span>
                  </div>
                  {/* Subject */}
                  <p className="text-sm text-gray-800 truncate mt-0.5 font-medium">
                    {email.subject || '(no subject)'}
                  </p>
                  {/* Snippet */}
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                    {email.body_snippet?.replace(/\r?\n/g, ' ').trim()}
                  </p>
                </div>
                {/* Date */}
                <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                  {formatDate(email.date)}
                </span>
              </div>

              {/* To line */}
              {email.to_addr && (
                <div className="mt-1 text-xs text-gray-400 truncate">
                  To: {extractName(email.to_addr) || email.to_addr}
                </div>
              )}
            </div>

            {/* Expanded email body */}
            {expandedEmailId === email.id && (
              <div className="px-4 pb-4 border-t border-gray-100 bg-white">
                <div className="mt-3 space-y-2">
                  {/* Full headers */}
                  <div className="text-xs text-gray-500 space-y-1 pb-2 border-b border-gray-100">
                    <div><span className="font-medium text-gray-600">From:</span> {email.from_addr}</div>
                    <div><span className="font-medium text-gray-600">To:</span> {email.to_addr}</div>
                    {email.cc && <div><span className="font-medium text-gray-600">Cc:</span> {email.cc}</div>}
                    <div><span className="font-medium text-gray-600">Date:</span> {email.date}</div>
                  </div>

                  {/* Body */}
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                    {expandedEmail?.body || email.body_snippet || 'Loading...'}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
