import { useState } from 'react'

interface ListingLayerTogglesProps {
  showForSale: boolean
  showForLease: boolean
  showRecentSold: boolean
  showRecentLeased: boolean
  onForSaleChange: (checked: boolean) => void
  onForLeaseChange: (checked: boolean) => void
  onRecentSoldChange: (checked: boolean) => void
  onRecentLeasedChange: (checked: boolean) => void
}

export function ListingLayerToggles({
  showForSale,
  showForLease,
  showRecentSold,
  showRecentLeased,
  onForSaleChange,
  onForLeaseChange,
  onRecentSoldChange,
  onRecentLeasedChange,
}: ListingLayerTogglesProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-navy-dark text-white hover:bg-navy transition-colors"
      >
        <span className="text-xs font-semibold uppercase tracking-wider">Listings</span>
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Toggles */}
      {isExpanded && (
        <div className="p-2 space-y-1">
          {/* For Sale */}
          <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={showForSale}
              onChange={(e) => onForSaleChange(e.target.checked)}
              className="w-4 h-4 rounded text-green-600 focus:ring-green-500"
            />
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm text-gray-700 font-medium">For Sale</span>
          </label>

          {/* For Lease */}
          <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={showForLease}
              onChange={(e) => onForLeaseChange(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm text-gray-700 font-medium">For Lease</span>
          </label>

          <div className="border-t border-gray-200 my-1" />

          {/* Recent Sold */}
          <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={showRecentSold}
              onChange={(e) => onRecentSoldChange(e.target.checked)}
              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
            />
            <span className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-sm text-gray-700">Recent Sold (12 mo)</span>
          </label>

          {/* Recent Leased */}
          <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={showRecentLeased}
              onChange={(e) => onRecentLeasedChange(e.target.checked)}
              className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500"
            />
            <span className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-sm text-gray-700">Recent Leased (12 mo)</span>
          </label>
        </div>
      )}
    </div>
  )
}
