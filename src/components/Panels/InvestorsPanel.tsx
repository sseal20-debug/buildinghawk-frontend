import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { entitiesApi } from '@/api/client'

interface InvestorsPanelProps {
  onClose: () => void
  onInvestorSelect?: (entity: any) => void
}

export function InvestorsPanel({ onClose, onInvestorSelect }: InvestorsPanelProps) {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['entities', 'investors', search],
    queryFn: () => entitiesApi.list(search || undefined),
  })

  // Filter to entities that own 2+ properties (investor-like)
  const investors = (data || []).filter((e: any) => {
    return (e.properties_owned || 0) >= 2
  })

  return (
    <div className="h-full flex flex-col bg-navy-dark text-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy-light">
        <h2 className="text-lg font-bold text-gold">Investors</h2>
        <button onClick={onClose} className="p-1 hover:bg-navy-light rounded">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-2">
        <input
          type="text"
          placeholder="Search investors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded bg-navy-light border border-navy-light text-white placeholder-gray-400 text-sm"
        />
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && <div className="p-4 text-gray-400">Loading investors...</div>}
        {!isLoading && investors.length === 0 && (
          <div className="p-4 text-gray-400">No investors found. Entities owning 2+ properties appear here.</div>
        )}
        {investors.map((inv: any) => (
          <div
            key={inv.id}
            className="px-4 py-3 border-b border-navy-light hover:bg-navy-light cursor-pointer"
            onClick={() => onInvestorSelect?.(inv)}
          >
            <div className="font-semibold text-sm">{inv.entity_name}</div>
            <div className="text-xs text-gray-400 mt-0.5">{inv.entity_type}</div>
            <div className="flex gap-3 mt-1 text-xs text-gray-500">
              <span className="text-gold">{inv.properties_owned || 0} owned</span>
              <span>{inv.properties_occupied || 0} occupied</span>
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 text-xs text-gray-500 border-t border-navy-light">
        {investors.length} investor{investors.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
