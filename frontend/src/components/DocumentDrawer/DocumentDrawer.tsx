import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { documentsApi } from '@/api/client'

interface DocumentDrawerProps {
  address: string | null
  isOpen: boolean
  onClose: () => void
}

interface DocumentFile {
  path: string
  filename: string
  size?: number
  modified?: string
}

export function DocumentDrawer({ address, isOpen, onClose }: DocumentDrawerProps) {
  const [drawerHeight, setDrawerHeight] = useState<'peek' | 'half' | 'full'>('half')

  // Fetch documents for the address
  const { data: docsData, isLoading, error } = useQuery({
    queryKey: ['documents', address],
    queryFn: () => documentsApi.getFiles(address!),
    enabled: !!address && isOpen,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Reset drawer height when address changes
  useEffect(() => {
    if (address) {
      setDrawerHeight('half')
    }
  }, [address])

  if (!isOpen || !address) return null

  const files = docsData?.files || []
  const fileCount = docsData?.count || 0

  // Group files by folder/type
  const groupedFiles = files.reduce((acc, file) => {
    // Extract folder from path (e.g., "Leases", "Photos", etc.)
    const parts = file.path.split(/[/\\]/)
    const folder = parts.length > 2 ? parts[parts.length - 2] : 'Documents'
    if (!acc[folder]) acc[folder] = []
    acc[folder].push(file)
    return acc
  }, {} as Record<string, DocumentFile[]>)

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'pdf':
        return (
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        )
      case 'doc':
      case 'docx':
        return (
          <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        )
      case 'xls':
      case 'xlsx':
        return (
          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        )
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return (
          <svg className="w-5 h-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        )
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const openFile = (path: string) => {
    // Open file in Windows Explorer / default app
    // For web, we'd need a download endpoint
    window.open(`file:///${path.replace(/\\/g, '/')}`, '_blank')
  }

  const heightClasses = {
    peek: 'h-24',
    half: 'h-1/2',
    full: 'h-[85vh]',
  }

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-30 transition-all duration-300 ${heightClasses[drawerHeight]}`}
    >
      {/* Drag handle */}
      <div
        className="flex justify-center py-3 cursor-grab active:cursor-grabbing"
        onClick={() => {
          // Cycle through heights
          if (drawerHeight === 'peek') setDrawerHeight('half')
          else if (drawerHeight === 'half') setDrawerHeight('full')
          else setDrawerHeight('half')
        }}
      >
        <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
      </div>

      {/* Header */}
      <div className="px-4 pb-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
            <p className="text-sm text-gray-500">{address}</p>
          </div>
          <div className="flex items-center gap-2">
            {fileCount > 0 && (
              <span className="px-2 py-1 text-sm font-medium bg-amber-100 text-amber-700 rounded-full">
                {fileCount} files
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="overflow-y-auto h-[calc(100%-6rem)] px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">
            Failed to load documents
          </div>
        ) : fileCount === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500">No documents found for this address</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedFiles).map(([folder, folderFiles]) => (
              <div key={folder}>
                <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                  {folder}
                  <span className="text-gray-400 font-normal">({folderFiles.length})</span>
                </h3>
                <div className="space-y-1">
                  {folderFiles.map((file, idx) => (
                    <button
                      key={idx}
                      onClick={() => openFile(file.path)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-left group"
                    >
                      {getFileIcon(file.filename)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
                          {file.filename}
                        </p>
                        {(file.size || file.modified) && (
                          <p className="text-xs text-gray-400">
                            {formatFileSize(file.size)}
                            {file.size && file.modified && ' · '}
                            {file.modified}
                          </p>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
