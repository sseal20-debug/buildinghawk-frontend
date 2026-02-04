// PropertyContextMenu - Right-click menu for properties on map
// Based on BuildingHawk wireframes (pages 3, 7, 15)

import { useState, useEffect, useRef } from 'react'
import type { Parcel } from '@/types'

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

interface MenuGroup {
  label?: string
  items: MenuItem[]
}

interface MenuItem {
  action: ContextMenuAction
  label: string
  icon: string
  shortcut?: string
  color?: string
}

const MENU_GROUPS: MenuGroup[] = [
  {
    items: [
      { action: 'street-view', label: 'Street View', icon: '🛣️', shortcut: 'V' },
      { action: 'specs', label: 'Specs & Details', icon: '📋', shortcut: 'S' },
      { action: 'history', label: 'History', icon: '📜', shortcut: 'H' },
    ]
  },
  {
    label: 'Data',
    items: [
      { action: 'owner', label: 'Owner', icon: '👤' },
      { action: 'tenant', label: 'Tenant', icon: '🏢' },
      { action: 'comps', label: 'Comps', icon: '📊', shortcut: 'C' },
      { action: 'documents', label: 'Documents', icon: '📁', shortcut: 'D' },
      { action: 'emails', label: 'Emails', icon: '📧', shortcut: 'E' },
    ]
  },
  {
    label: 'CRM',
    items: [
      { action: 'crm', label: 'View in CRM', icon: '💼' },
      { action: 'add-prospect', label: 'Add as Prospect', icon: '🎯', color: 'text-amber-600' },
      { action: 'add-client', label: 'Add as Client', icon: '✅', color: 'text-green-600' },
    ]
  },
  {
    label: 'Status',
    items: [
      { action: 'new-development', label: 'New Development', icon: '🏗️' },
      { action: 'distressed', label: 'Distressed', icon: '⚠️' },
      { action: 'off-market', label: 'Off-Market', icon: '🔒' },
    ]
  },
  {
    items: [
      { action: 'export-pdf', label: 'Export PDF', icon: '📄' },
      { action: 'share', label: 'Share', icon: '🔗' },
    ]
  },
]

export function PropertyContextMenu({ parcel, position, onClose, onAction }: PropertyContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [adjustedPosition, setAdjustedPosition] = useState(position)

  // Adjust position to keep menu on screen
  useEffect(() => {
    if (!menuRef.current) return

    const menu = menuRef.current
    const menuRect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let newX = position.x
    let newY = position.y

    // Adjust horizontal position
    if (position.x + menuRect.width > viewportWidth - 10) {
      newX = viewportWidth - menuRect.width - 10
    }

    // Adjust vertical position
    if (position.y + menuRect.height > viewportHeight - 10) {
      newY = viewportHeight - menuRect.height - 10
    }

    setAdjustedPosition({ x: newX, y: newY })
  }, [position])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    // Handle keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase()
      for (const group of MENU_GROUPS) {
        for (const item of group.items) {
          if (item.shortcut === key) {
            e.preventDefault()
            onAction(item.action, parcel)
            onClose()
            return
          }
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, onAction, parcel])

  const handleItemClick = (action: ContextMenuAction) => {
    onAction(action, parcel)
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white rounded-lg shadow-2xl border border-gray-200 py-1 min-w-[220px] overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      style={{ 
        left: adjustedPosition.x, 
        top: adjustedPosition.y,
      }}
    >
      {/* Property Header */}
      <div className="px-3 py-2 bg-navy-dark text-white border-b border-gray-200">
        <div className="font-semibold text-sm truncate">{parcel.situs_address}</div>
        <div className="text-xs text-white/70">{parcel.city} • APN: {parcel.apn}</div>
      </div>

      {/* Quick Stats */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex gap-3 text-xs text-gray-600">
        {parcel.land_sf > 0 && (
          <span title="Land SF">📐 {(parcel.land_sf / 43560).toFixed(2)} ac</span>
        )}
        {parcel.building_count !== undefined && parcel.building_count > 0 && (
          <span title="Buildings">🏢 {parcel.building_count}</span>
        )}
        {parcel.zoning && (
          <span title="Zoning">🏷️ {parcel.zoning}</span>
        )}
      </div>

      {/* Menu Items */}
      {MENU_GROUPS.map((group, groupIndex) => (
        <div key={groupIndex}>
          {groupIndex > 0 && <div className="border-t border-gray-100 my-1" />}
          
          {group.label && (
            <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {group.label}
            </div>
          )}

          {group.items.map((item) => (
            <button
              key={item.action}
              onClick={() => handleItemClick(item.action)}
              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gold/20 transition-colors ${
                item.color || 'text-gray-700'
              }`}
            >
              <span className="w-5 text-center">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

export default PropertyContextMenu
