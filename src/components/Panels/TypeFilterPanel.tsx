import { useQuery } from '@tanstack/react-query'
import { crmPropertiesApi } from '@/api/client'

interface TypeFilterPanelProps {
  onClose: () => void
  onTypeSelect?: (type: string) => void
}

export function TypeFilterPanel({ onClose, onTypeSelect }: TypeFilterPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['properties', 'stats'],
    queryFn: crmPropertiesApi.getStats,
  })

  const stats = data as any
  const byType = stats?.by_type || stats?.byType || {}
  const typeEntries = Object.entries(byType).sort((a: any, b: any) => b[1] - a[1])

  return (
    <div className="h-full flex flex-col bg-navy-dark text-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy-light">
        <h2 className="text-lg font-bold text-gold">Property Types</h2>
        <button onClick={onClose} className="p-1 hover:bg-navy-light rounded">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && <div className="p-4 text-gray-400">Loading property types...</div>}
        {!isLoading && typeEntries.length === 0 && (
          <div className="p-4 text-gray-400">No property type data available</div>
        )}
        {typeEntries.map(([type, count]: [string, any]) => (
          <div
            key={type}
            className="px-4 py-3 border-b border-navy-light hover:bg-navy-light cursor-pointer flex justify-between items-center"
            onClick={() => onTypeSelect?.(type)}
          >
            <span className="text-sm">{type || 'Unclassified'}</span>
            <span className="text-xs bg-navy-light px-2 py-1 rounded text-gold font-semibold">{count}</span>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 text-xs text-gray-500 border-t border-navy-light">
        {typeEntries.length} property type{typeEntries.length !== 1 ? 's' : ''}
        {stats?.total && ` -- ${stats.total.toLocaleString()} total properties`}
      </div>
    </div>
  )
}
