// PropertyCard - Blue header + white body popup (matching reference design)
// Shows when parcel is selected on map

import type { Parcel } from '@/types'

interface PropertyCardProps {
  parcel: Parcel
  onClose: () => void
  onViewDetails: () => void
  onRightClick: (e: React.MouseEvent) => void
}

export function PropertyCard({ parcel, onClose, onViewDetails, onRightClick }: PropertyCardProps) {
  const formatNumber = (n: number | undefined) =>
    n ? n.toLocaleString() : '--'

  const formatAcres = (sf: number | undefined) =>
    sf ? (sf / 43560).toFixed(2) : '--'

  const formatCurrency = (n: number | undefined) => {
    if (!n) return '--'
    return n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : `$${n.toLocaleString()}`
  }

  // Extended parcel props from CRM merge + unit spec aggregates
  const ext = parcel as any

  const formatPower = () => {
    const parts: string[] = []
    if (ext.power_amps) parts.push(`${ext.power_amps}A`)
    if (ext.power_volts) parts.push(ext.power_volts)
    return parts.length > 0 ? parts.join(' ') : null
  }

  const formatYard = () => {
    if (!ext.fenced_yard && !ext.yard_sf) return null
    if (ext.yard_sf) return `Yes - ${formatNumber(ext.yard_sf)} SF`
    return 'Yes'
  }

  return (
    <div
      data-property-card
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-sm"
      onContextMenu={onRightClick}
    >
      <div className="bg-white rounded-[14px] shadow-2xl overflow-hidden" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
        {/* Blue Gradient Header */}
        <div
          className="text-white px-4 py-3.5 flex items-start justify-between"
          style={{ background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)' }}
        >
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[15px] truncate">
              {parcel.situs_address || 'No Address'}
            </h3>
            <p className="text-[12px] opacity-90 mt-0.5">
              {parcel.city}{parcel.zip ? `, CA ${parcel.zip}` : ', CA'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-2 p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* White Body */}
        <div className="px-4 py-3">
          {/* Status Badge */}
          {ext.last_sale_price && (
            <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase mb-2"
              style={{ background: '#e3f2fd', color: '#1565c0' }}>
              Sold
            </span>
          )}

          {/* Price */}
          {ext.last_sale_price && (
            <div className="text-xl font-bold mb-2" style={{ color: '#0d47a1' }}>
              {formatCurrency(ext.last_sale_price)}
            </div>
          )}

          {/* Detail Rows */}
          <div className="space-y-0">
            {(ext.sqft || ext.building_sf) && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Building SF</span>
                <span className="font-semibold text-gray-900">{formatNumber(ext.sqft || ext.building_sf)} SF</span>
              </div>
            )}
            {parcel.land_sf > 0 && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Land SF</span>
                <span className="font-semibold text-gray-900">{formatNumber(parcel.land_sf)} ({formatAcres(parcel.land_sf)} ac)</span>
              </div>
            )}
            {ext.year_built && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Year Built</span>
                <span className="font-semibold text-gray-900">{ext.year_built}</span>
              </div>
            )}
            {parcel.zoning && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Zoning</span>
                <span className="font-semibold text-gray-900">{parcel.zoning}</span>
              </div>
            )}
            {ext.clear_height_ft > 0 && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Clear Height</span>
                <span className="font-semibold text-gray-900">{ext.clear_height_ft}' Clear</span>
              </div>
            )}
            {ext.dock_doors > 0 && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Dock Doors</span>
                <span className="font-semibold text-gray-900">{ext.dock_doors} DH</span>
              </div>
            )}
            {ext.gl_doors > 0 && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">GL Doors</span>
                <span className="font-semibold text-gray-900">{ext.gl_doors} GL</span>
              </div>
            )}
            {formatPower() && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Power</span>
                <span className="font-semibold text-gray-900">{formatPower()}</span>
              </div>
            )}
            {ext.sprinklers != null && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Sprinklers</span>
                <span className="font-semibold text-gray-900">{ext.sprinklers ? 'Yes' : 'No'}</span>
              </div>
            )}
            {ext.office_sf > 0 && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Office SF</span>
                <span className="font-semibold text-gray-900">{formatNumber(ext.office_sf)} SF</span>
              </div>
            )}
            {formatYard() && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Yard</span>
                <span className="font-semibold text-gray-900">{formatYard()}</span>
              </div>
            )}
            {ext.owner_name && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Owner</span>
                <span className="font-semibold text-gray-900 truncate ml-2">{ext.owner_name}</span>
              </div>
            )}
            {ext.land_use && (
              <div className="flex justify-between py-1.5 border-b border-gray-100 text-[12px]">
                <span className="text-gray-500">Land Use</span>
                <span className="font-semibold text-gray-900 truncate ml-2">{ext.land_use}</span>
              </div>
            )}
            {parcel.apn && (
              <div className="flex justify-between py-1.5 text-[12px]">
                <span className="text-gray-500">APN</span>
                <span className="font-semibold text-gray-900">{parcel.apn}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex divide-x divide-gray-100 border-t border-gray-100">
          <button
            onClick={() => {
              const q = encodeURIComponent(`${parcel.situs_address}, ${parcel.city}, CA`)
              window.open(`https://www.google.com/maps?q=${q}&layer=c`, '_blank')
            }}
            className="flex-1 px-3 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
          >
            Street View
          </button>
          <button
            onClick={onViewDetails}
            className="flex-1 px-3 py-2.5 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1"
            style={{ background: '#1565c0' }}
          >
            Details
          </button>
          <button
            onClick={onRightClick}
            className="flex-1 px-3 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
          >
            Actions
          </button>
        </div>
      </div>
    </div>
  )
}

export default PropertyCard
