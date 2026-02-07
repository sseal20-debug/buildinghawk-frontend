import { useQuery } from '@tanstack/react-query'
import { addressDocumentsApi } from '@/api/client'

interface AddressDocumentsProps {
  address: string | null
}

const DOC_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  brochure: { label: 'Brochure', color: 'bg-blue-100 text-blue-700' },
  loi: { label: 'LOI', color: 'bg-purple-100 text-purple-700' },
  floor_plan: { label: 'Floor Plan', color: 'bg-indigo-100 text-indigo-700' },
  site_plan: { label: 'Site Plan', color: 'bg-teal-100 text-teal-700' },
  contract: { label: 'Contract', color: 'bg-amber-100 text-amber-700' },
  lease: { label: 'Lease', color: 'bg-green-100 text-green-700' },
  deed: { label: 'Deed', color: 'bg-red-100 text-red-700' },
  appraisal: { label: 'Appraisal', color: 'bg-orange-100 text-orange-700' },
  photos: { label: 'Photos', color: 'bg-pink-100 text-pink-700' },
  budget: { label: 'Budget', color: 'bg-yellow-100 text-yellow-700' },
  tax: { label: 'Tax', color: 'bg-gray-100 text-gray-700' },
  environmental: { label: 'Enviro', color: 'bg-emerald-100 text-emerald-700' },
  insurance: { label: 'Insurance', color: 'bg-cyan-100 text-cyan-700' },
  invoice: { label: 'Invoice', color: 'bg-slate-100 text-slate-700' },
  unknown: { label: 'Document', color: 'bg-gray-100 text-gray-500' },
}

function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AddressDocuments({ address }: AddressDocumentsProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['address-documents', address],
    queryFn: () => addressDocumentsApi.getByAddress(address!),
    enabled: !!address,
    staleTime: 1000 * 60 * 5,
  })

  if (!address) return null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
        <span className="ml-2 text-sm text-gray-500">Loading documents...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 text-sm text-red-500">
        Failed to load documents
      </div>
    )
  }

  const files = data?.files || []
  const fileCount = data?.file_count || 0

  if (fileCount === 0) {
    return (
      <div className="text-center py-8">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm text-gray-500">No archived documents for this address</p>
      </div>
    )
  }

  // Group files by document type
  const grouped = files.reduce((acc, file) => {
    const type = file.document_type || 'unknown'
    if (!acc[type]) acc[type] = []
    acc[type].push(file)
    return acc
  }, {} as Record<string, typeof files>)

  const openPdf = (archivePath: string) => {
    const url = addressDocumentsApi.getFileUrl(archivePath)
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Archived Documents</span>
          <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
            {fileCount}
          </span>
        </div>
        {data?.display && (
          <span className="text-xs text-gray-400">{data.display}</span>
        )}
      </div>

      {/* File list grouped by type */}
      {Object.entries(grouped)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([type, typeFiles]) => {
          const meta = DOC_TYPE_LABELS[type] || DOC_TYPE_LABELS.unknown
          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${meta.color}`}>
                  {meta.label}
                </span>
                <span className="text-xs text-gray-400">({typeFiles.length})</span>
              </div>
              <div className="space-y-0.5">
                {typeFiles.map((file, idx) => (
                  <button
                    key={idx}
                    onClick={() => openPdf(file.archive_path)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-left group transition-colors"
                  >
                    {/* PDF icon */}
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate group-hover:text-blue-600">
                        {file.filename.replace(/_/g, ' ').replace(/\.pdf$/i, '')}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatFileSize(file.file_size)}
                      </p>
                    </div>
                    {/* Open icon */}
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )
        })}

      {/* Fuzzy match alternatives */}
      {data?.fuzzy_match && data?.alternatives && data.alternatives.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">Similar addresses:</p>
          {data.alternatives.map((alt, idx) => (
            <p key={idx} className="text-xs text-gray-500 py-0.5">
              {alt.display} {alt.city && `(${alt.city})`} — {alt.file_count} files
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
