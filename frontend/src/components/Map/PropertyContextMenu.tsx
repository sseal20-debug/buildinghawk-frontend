// PropertyContextMenu - Right-click data balloon for properties on map
// Shows comprehensive property intelligence + editable CRM fields
// Data can be kept private or shared to team/office

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Parcel } from '@/types'
import { parcelsApi } from '@/api/client'

interface PropertyContextMenuProps {
  parcel: Parcel
  position: { x: number; y: number }
  onClose: () => void
  onAction: (action: ContextMenuAction, parcel: Parcel) => void
}

export type ContextMenuAction =
  | 'street-view'
  | 'specs'
  | 'history'
  | 'crm'
  | 'comps'
  | 'owner'
  | 'tenant'
  | 'documents'
  | 'emails'
  | 'new-development'
  | 'distressed'
  | 'off-market'
  | 'add-prospect'
  | 'add-client'
  | 'export-pdf'
  | 'share'
  | 'edit-field'

// Editable field state — user-contributed data
interface UserFieldEdits {
  [fieldKey: string]: string
}

// Inline editable field
function EditableField({
  label,
  value,
  fieldKey,
  icon,
  suffix,
  edits,
  onEdit,
}: {
  label: string
  value?: string | number | null
  fieldKey: string
  icon: string
  suffix?: string
  edits: UserFieldEdits
  onEdit: (key: string, value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayValue = edits[fieldKey] || (value != null && value !== '' && value !== 0 ? String(value) : null)
  const isUserEdited = !!edits[fieldKey]
  const isEmpty = !displayValue

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 py-1 px-2 bg-yellow-50 rounded">
        <span className="text-xs w-4 text-center">{icon}</span>
        <span className="text-[10px] text-gray-500 w-16 shrink-0">{label}</span>
        <input
          ref={inputRef}
          className="flex-1 text-xs bg-white border border-yellow-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-yellow-400 min-w-0"
          defaultValue={displayValue || ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onEdit(fieldKey, (e.target as HTMLInputElement).value)
              setEditing(false)
            }
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={(e) => {
            if (e.target.value) onEdit(fieldKey, e.target.value)
            setEditing(false)
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer group transition-colors ${
        isEmpty ? 'hover:bg-yellow-50 opacity-60' : 'hover:bg-gray-100'
      }`}
      onClick={() => setEditing(true)}
      title={isEmpty ? `Click to add ${label}` : `Click to edit ${label}`}
    >
      <span className="text-xs w-4 text-center">{icon}</span>
      <span className="text-[10px] text-gray-500 w-16 shrink-0">{label}</span>
      <span className={`flex-1 text-xs truncate ${isEmpty ? 'italic text-gray-400' : 'text-gray-800 font-medium'}`}>
        {isEmpty ? `+ Add ${label.toLowerCase()}` : `${displayValue}${suffix || ''}`}
      </span>
      {isUserEdited && (
        <span className="text-[8px] bg-yellow-200 text-yellow-800 px-1 rounded-sm font-bold" title="User-contributed data">
          MY DATA
        </span>
      )}
      <span className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 transition-opacity">✏️</span>
    </div>
  )
}

// Section divider
function Section({ label, color }: { label: string; color: string }) {
  return (
    <div className={`px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider ${color} border-t border-gray-100 mt-0.5`}>
      {label}
    </div>
  )
}

export function PropertyContextMenu({ parcel, position, onClose, onAction }: PropertyContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [adjustedPosition, setAdjustedPosition] = useState(position)
  const [activeTab, setActiveTab] = useState<'info' | 'actions'>('info')
  const [edits, setEdits] = useState<UserFieldEdits>({})
  const [shareMode, setShareMode] = useState<'private' | 'team'>('private')
  const [fullParcel, setFullParcel] = useState<Parcel | null>(null)

  // Fetch full parcel data (with buildings + units) when menu opens
  useEffect(() => {
    if (parcel?.apn) {
      parcelsApi.getByApn(parcel.apn)
        .then(data => setFullParcel(data))
        .catch(() => {}) // Silently fail - show what we have
    }
  }, [parcel?.apn])

  // Load any saved edits for this parcel
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`bh_edits_${parcel.apn}`)
      if (saved) setEdits(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [parcel.apn])

  const handleEdit = useCallback((key: string, value: string) => {
    setEdits(prev => {
      const next = { ...prev, [key]: value }
      // Persist to localStorage
      localStorage.setItem(`bh_edits_${parcel.apn}`, JSON.stringify(next))
      return next
    })
  }, [parcel.apn])

  // Adjust position to keep menu on screen
  useEffect(() => {
    if (!menuRef.current) return
    const menu = menuRef.current
    const menuRect = menu.getBoundingClientRect()
    let newX = position.x
    let newY = position.y
    if (position.x + menuRect.width > window.innerWidth - 10) {
      newX = window.innerWidth - menuRect.width - 10
    }
    if (position.y + menuRect.height > window.innerHeight - 10) {
      newY = window.innerHeight - menuRect.height - 10
    }
    if (newX < 10) newX = 10
    if (newY < 10) newY = 10
    setAdjustedPosition({ x: newX, y: newY })
  }, [position])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Use fullParcel (with buildings+units from API) when available, fallback to parcel from map
  const dataParcel = fullParcel || parcel

  // Derived data from parcel + buildings + units
  const building = dataParcel.buildings?.[0]
  const units = building?.units || []
  const totalUnits = units.length
  const vacantUnits = units.filter(u => u.unit_status === 'vacant').length
  const forSaleUnits = units.filter(u => u.for_sale).length
  const forLeaseUnits = units.filter(u => u.for_lease).length
  const totalBuildingSf = building?.building_sf || 0
  const lotAcres = dataParcel.land_sf ? (dataParcel.land_sf / 43560).toFixed(2) : null
  const isMultiTenant = totalUnits > 1
  const firstUnit = units[0]
  const occupancy = firstUnit?.current_occupancy

  // Determine listing status
  const isForSale = forSaleUnits > 0
  const isForLease = forLeaseUnits > 0
  const isOnMarket = isForSale || isForLease

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        width: 340,
        maxHeight: 'min(80vh, 600px)',
      }}
    >
      {/* Header — Address + Status */}
      <div className="bg-gradient-to-r from-[#0d47a1] to-[#1565c0] text-white px-3 py-2.5">
        <div className="font-bold text-sm truncate">{parcel.situs_address}</div>
        <div className="flex items-center gap-2 text-[11px] opacity-90 mt-0.5">
          <span>{parcel.city}</span>
          <span>•</span>
          <span>APN: {parcel.apn}</span>
        </div>
        {/* Status badges */}
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          {isForSale && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">FOR SALE</span>
          )}
          {isForLease && (
            <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">FOR LEASE</span>
          )}
          {vacantUnits > 0 && !isOnMarket && (
            <span className="bg-yellow-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">VACANT</span>
          )}
          {isMultiTenant && (
            <span className="bg-blue-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">MULTI-TENANT ({totalUnits})</span>
          )}
          {!isMultiTenant && totalUnits === 1 && (
            <span className="bg-gray-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">SINGLE-TENANT</span>
          )}
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        <button
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'info' ? 'text-[#1565c0] border-b-2 border-[#1565c0] bg-white' : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('info')}
        >
          📋 Property Info
        </button>
        <button
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'actions' ? 'text-[#1565c0] border-b-2 border-[#1565c0] bg-white' : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('actions')}
        >
          ⚡ Actions
        </button>
      </div>

      {/* Content — scrollable */}
      <div className="overflow-y-auto" style={{ maxHeight: 'min(55vh, 420px)' }}>
        {activeTab === 'info' ? (
          <>
            {/* Building Specs */}
            <Section label="Building Specs" color="text-blue-600" />
            <div className="px-1">
              <EditableField label="Bldg SF" value={totalBuildingSf} fieldKey="building_sf" icon="📐" suffix=" SF" edits={edits} onEdit={handleEdit} />
              <EditableField label="Lot SF" value={dataParcel.land_sf} fieldKey="land_sf" icon="📏" suffix=" SF" edits={edits} onEdit={handleEdit} />
              <EditableField label="Lot Acres" value={lotAcres} fieldKey="lot_acres" icon="🌳" suffix=" ac" edits={edits} onEdit={handleEdit} />
              <EditableField label="Year Built" value={building?.year_built} fieldKey="year_built" icon="📅" edits={edits} onEdit={handleEdit} />
              <EditableField label="Zoning" value={dataParcel.zoning} fieldKey="zoning" icon="🏷️" edits={edits} onEdit={handleEdit} />
              <EditableField label="Clear Ht" value={firstUnit?.clear_height_ft} fieldKey="clear_height" icon="↕️" suffix="'" edits={edits} onEdit={handleEdit} />
              <EditableField label="Dock Doors" value={firstUnit?.dock_doors} fieldKey="dock_doors" icon="🚛" edits={edits} onEdit={handleEdit} />
              <EditableField label="GL Doors" value={firstUnit?.gl_doors} fieldKey="gl_doors" icon="🚪" edits={edits} onEdit={handleEdit} />
              <EditableField label="Power" value={firstUnit?.power_amps ? `${firstUnit.power_amps}A / ${firstUnit.power_volts}` : null} fieldKey="power" icon="⚡" edits={edits} onEdit={handleEdit} />
              <EditableField label="Sprinklers" value={building?.sprinklers ? 'Yes' : building?.sprinklers === false ? 'No' : null} fieldKey="sprinklers" icon="🔥" edits={edits} onEdit={handleEdit} />
              <EditableField label="Yard" value={firstUnit?.fenced_yard ? `Yes${firstUnit.yard_sf ? ` – ${firstUnit.yard_sf.toLocaleString()} SF` : ''}` : null} fieldKey="yard" icon="🔲" edits={edits} onEdit={handleEdit} />
            </div>

            {/* Listing Info (if on market) */}
            {isOnMarket && (
              <>
                <Section label="Listing Info" color="text-green-600" />
                <div className="px-1">
                  {isForSale && firstUnit?.asking_sale_price && (
                    <EditableField label="Sale Price" value={`$${firstUnit.asking_sale_price.toLocaleString()}`} fieldKey="sale_price" icon="💵" edits={edits} onEdit={handleEdit} />
                  )}
                  {isForSale && firstUnit?.asking_sale_price_psf && (
                    <EditableField label="Price/SF" value={`$${firstUnit.asking_sale_price_psf.toFixed(2)}`} fieldKey="sale_price_psf" icon="📊" suffix="/SF" edits={edits} onEdit={handleEdit} />
                  )}
                  {isForLease && firstUnit?.asking_lease_rate && (
                    <EditableField label="Lease Rate" value={`$${firstUnit.asking_lease_rate.toFixed(2)}`} fieldKey="lease_rate" icon="📊" suffix="/SF/Mo" edits={edits} onEdit={handleEdit} />
                  )}
                  <EditableField label="Brochure" value={null} fieldKey="brochure_url" icon="📄" edits={edits} onEdit={handleEdit} />
                </div>
              </>
            )}

            {/* Last Sale / Lease Comp */}
            <Section label="Last Transaction" color="text-purple-600" />
            <div className="px-1">
              <EditableField label="Last Sale" value={null} fieldKey="last_sale_date" icon="📅" edits={edits} onEdit={handleEdit} />
              <EditableField label="Sale Price" value={null} fieldKey="last_sale_price" icon="💰" edits={edits} onEdit={handleEdit} />
              <EditableField label="Last Lease" value={null} fieldKey="last_lease_date" icon="📅" edits={edits} onEdit={handleEdit} />
              <EditableField label="Lease Rate" value={null} fieldKey="last_lease_rate" icon="📊" edits={edits} onEdit={handleEdit} />
            </div>

            {/* Owner Info */}
            <Section label="Ownership" color="text-orange-600" />
            <div className="px-1">
              <EditableField label="Owner" value={dataParcel.assessor_owner_name} fieldKey="owner_name" icon="👤" edits={edits} onEdit={handleEdit} />
              <EditableField label="Phone" value={null} fieldKey="owner_phone" icon="📞" edits={edits} onEdit={handleEdit} />
              <EditableField label="Email" value={null} fieldKey="owner_email" icon="📧" edits={edits} onEdit={handleEdit} />
              <EditableField label="Company" value={null} fieldKey="owner_company" icon="🏢" edits={edits} onEdit={handleEdit} />
            </div>

            {/* Tenant Info */}
            <Section label="Tenant / Occupant" color="text-teal-600" />
            <div className="px-1">
              <EditableField label="Tenant" value={occupancy?.entity_name} fieldKey="tenant_name" icon="🏢" edits={edits} onEdit={handleEdit} />
              <EditableField label="Contact" value={null} fieldKey="tenant_contact" icon="👤" edits={edits} onEdit={handleEdit} />
              <EditableField label="Phone" value={null} fieldKey="tenant_phone" icon="📞" edits={edits} onEdit={handleEdit} />
              <EditableField label="Email" value={null} fieldKey="tenant_email" icon="📧" edits={edits} onEdit={handleEdit} />
              <EditableField label="Lease Exp" value={occupancy?.lease_expiration} fieldKey="lease_exp" icon="⏰" edits={edits} onEdit={handleEdit} />
              <EditableField label="Rent/SF" value={occupancy?.rent_psf_month ? `$${occupancy.rent_psf_month.toFixed(2)}` : null} fieldKey="rent_psf" icon="💲" edits={edits} onEdit={handleEdit} />
            </div>

            {/* Notes */}
            <Section label="Notes" color="text-gray-600" />
            <div className="px-2 py-1.5">
              <textarea
                className="w-full text-xs bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 min-h-[48px]"
                placeholder="Add private notes about this property..."
                rows={2}
                defaultValue={edits['notes'] || building?.notes || ''}
                onBlur={(e) => handleEdit('notes', e.target.value)}
              />
            </div>
          </>
        ) : (
          /* Actions Tab */
          <>
            <div className="p-1.5">
              {[
                { action: 'street-view' as const, label: 'Street View', icon: '🛣️', shortcut: 'V' },
                { action: 'specs' as const, label: 'Full Specs & Details', icon: '📋', shortcut: 'S' },
                { action: 'history' as const, label: 'Transaction History', icon: '📜', shortcut: 'H' },
                { action: 'comps' as const, label: 'View Comps', icon: '📊', shortcut: 'C' },
                { action: 'documents' as const, label: 'Documents (Dropbox)', icon: '📁', shortcut: 'D' },
                { action: 'emails' as const, label: 'Email History', icon: '📧', shortcut: 'E' },
              ].map(item => (
                <button
                  key={item.action}
                  onClick={() => { onAction(item.action, parcel); onClose() }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 hover:bg-blue-50 rounded-lg transition-colors text-gray-700"
                >
                  <span className="w-5 text-center">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{item.shortcut}</span>
                </button>
              ))}

              <div className="border-t border-gray-100 my-1.5" />
              <div className="px-3 py-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">CRM</div>

              {[
                { action: 'crm' as const, label: 'View in CRM', icon: '💼', color: '' },
                { action: 'add-prospect' as const, label: 'Add as Prospect', icon: '🎯', color: 'text-amber-600' },
                { action: 'add-client' as const, label: 'Add as Client', icon: '✅', color: 'text-green-600' },
              ].map(item => (
                <button
                  key={item.action}
                  onClick={() => { onAction(item.action, parcel); onClose() }}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 hover:bg-blue-50 rounded-lg transition-colors ${item.color || 'text-gray-700'}`}
                >
                  <span className="w-5 text-center">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                </button>
              ))}

              <div className="border-t border-gray-100 my-1.5" />
              <div className="px-3 py-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Status Flags</div>

              {[
                { action: 'new-development' as const, label: 'New Development', icon: '🏗️' },
                { action: 'distressed' as const, label: 'Flag Distressed', icon: '⚠️' },
                { action: 'off-market' as const, label: 'Flag Off-Market', icon: '🔒' },
              ].map(item => (
                <button
                  key={item.action}
                  onClick={() => { onAction(item.action, parcel); onClose() }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 hover:bg-blue-50 rounded-lg transition-colors text-gray-700"
                >
                  <span className="w-5 text-center">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                </button>
              ))}

              <div className="border-t border-gray-100 my-1.5" />

              {[
                { action: 'export-pdf' as const, label: 'Export PDF', icon: '📄' },
                { action: 'share' as const, label: 'Share Link', icon: '🔗' },
              ].map(item => (
                <button
                  key={item.action}
                  onClick={() => { onAction(item.action, parcel); onClose() }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 hover:bg-blue-50 rounded-lg transition-colors text-gray-700"
                >
                  <span className="w-5 text-center">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer — Share mode toggle */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShareMode('private')}
            className={`text-[10px] px-2 py-1 rounded-full font-semibold transition-colors ${
              shareMode === 'private' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
            }`}
          >
            🔒 Private
          </button>
          <button
            onClick={() => setShareMode('team')}
            className={`text-[10px] px-2 py-1 rounded-full font-semibold transition-colors ${
              shareMode === 'team' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
            }`}
          >
            👥 Share to Team
          </button>
        </div>
        {Object.keys(edits).length > 0 && (
          <span className="text-[10px] text-yellow-600 font-semibold">
            {Object.keys(edits).length} edits saved
          </span>
        )}
      </div>
    </div>
  )
}

export default PropertyContextMenu
