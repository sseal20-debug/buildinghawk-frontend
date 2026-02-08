// LayerSidebar - Left panel with layer toggle buttons
// Mobile: collapses to 48px icon strip with hamburger toggle
// Desktop: always expanded at 240px
// All layers have toggle switches on the right side
// "New Listings/Updates" has 6 sub-toggles for listing types

import { useEffect } from 'react'

type LayerKey =
  | 'listings' | 'address' | 'specs' | 'type' | 'comps' | 'newdev' | 'vacant' | 'offmarket' | 'condos'
  | 'tenants' | 'owners' | 'buy-lease' | 'investor' | 'looking' | 'clients'
  | 'distressed' | 'news' | 'contaminated' | 'obituaries' | 'bankruptcy' | 'auctions' | 'mergers' | 'notes'
  | 'alerts' | 'social' | 'custom' | 'crm' | 'stats'

type ListingToggleKey = 'all' | 'sale' | 'escrow' | 'sold' | 'lease' | 'leased'

interface LayerConfig {
  key: LayerKey
  label: string
  number: number
  dotClass: string
  icon: string
  count?: number
}

interface ListingToggleConfig {
  key: ListingToggleKey
  label: string
  color: string // hex color for the toggle track when ON
}

interface LayerSidebarProps {
  activeLayer: LayerKey
  onLayerChange: (layer: LayerKey) => void
  onLoginClick?: () => void
  layerCounts?: Partial<Record<LayerKey, number>>
  isOpen: boolean
  onToggle: () => void
  // Layer toggle states
  enabledLayers: Set<string>
  onLayerToggle: (key: string) => void
  // Listing sub-toggle states
  listingToggles: Record<ListingToggleKey, boolean>
  onListingToggleChange: (key: ListingToggleKey, on: boolean) => void
}

const LISTING_TOGGLES: ListingToggleConfig[] = [
  { key: 'all', label: 'All', color: '#00D4FF' },
  { key: 'sale', label: 'For Sale', color: '#dc2626' },
  { key: 'escrow', label: 'Escrow', color: '#d97706' },
  { key: 'sold', label: 'Sold', color: '#2563eb' },
  { key: 'lease', label: 'For Lease', color: '#16a34a' },
  { key: 'leased', label: 'Leased', color: '#7c3aed' },
]

const PROPERTY_LAYERS: LayerConfig[] = [
  { key: 'listings', label: 'New Listings/Updates', number: 1, dotClass: 'bg-[#e91e63]', icon: '\u{1F4CB}' },
  { key: 'address', label: 'Address', number: 2, dotClass: 'bg-[#9c27b0]', icon: '\u{1F4CD}' },
  { key: 'specs', label: 'Specs', number: 3, dotClass: 'bg-[#673ab7]', icon: '\u{1F4D0}' },
  { key: 'type', label: 'Type', number: 4, dotClass: 'bg-[#3f51b5]', icon: '\u{1F3ED}' },
  { key: 'comps', label: 'Comps', number: 9, dotClass: 'bg-[#4caf50]', icon: '\u{1F4CA}' },
  { key: 'newdev', label: 'New Developments', number: 10, dotClass: 'bg-[#8bc34a]', icon: '\u{1F3D7}' },
  { key: 'vacant', label: 'Vacant', number: 11, dotClass: 'bg-[#cddc39]', icon: '\u{1F511}' },
  { key: 'condos', label: 'Condos', number: 27, dotClass: 'bg-[#00acc1]', icon: '\u{1F3E2}' },
  { key: 'offmarket', label: 'Off-Market', number: 13, dotClass: 'bg-[#ffc107]', icon: '\u{1F512}' },
]

const PEOPLE_LAYERS: LayerConfig[] = [
  { key: 'tenants', label: 'Tenants', number: 5, dotClass: 'bg-[#2196f3]', icon: '\u{1F464}' },
  { key: 'owners', label: 'Owner-Users', number: 6, dotClass: 'bg-[#03a9f4]', icon: '\u{1F3E0}' },
  { key: 'buy-lease', label: 'Users - Buy/Lease', number: 7, dotClass: 'bg-[#00bcd4]', icon: '\u{1F504}' },
  { key: 'investor', label: 'Investor - Buy/Sell', number: 8, dotClass: 'bg-[#009688]', icon: '\u{1F4B0}' },
  { key: 'looking', label: 'Looking', number: 12, dotClass: 'bg-[#ffeb3b]', icon: '\u{1F50D}' },
  { key: 'clients', label: 'Clients', number: 21, dotClass: 'bg-[#2196f3]', icon: '\u{1F91D}' },
]

const MARKET_LAYERS: LayerConfig[] = [
  { key: 'distressed', label: 'Distressed', number: 14, dotClass: 'bg-[#ff9800]', icon: '\u{26A0}' },
  { key: 'contaminated', label: 'Contaminated Sites', number: 16, dotClass: 'bg-[#795548]', icon: '\u{2622}' },
  { key: 'obituaries', label: 'Obituaries', number: 17, dotClass: 'bg-[#607d8b]', icon: '\u{1F54A}' },
  { key: 'bankruptcy', label: 'Bankruptcy', number: 18, dotClass: 'bg-[#f44336]', icon: '\u{1F4C9}' },
  { key: 'auctions', label: 'Auctions', number: 20, dotClass: 'bg-[#9c27b0]', icon: '\u{1F528}' },
  { key: 'mergers', label: 'Mergers & Acquisitions', number: 22, dotClass: 'bg-[#00bcd4]', icon: '\u{1F517}' },
  { key: 'notes', label: 'Note Buying', number: 24, dotClass: 'bg-[#4caf50]', icon: '\u{1F4DD}' },
]

const TOOLS_LAYERS: LayerConfig[] = [
  { key: 'alerts', label: 'Alerts', number: 19, dotClass: 'bg-[#e91e63]', icon: '\u{1F514}' },
  { key: 'social', label: 'Social Media', number: 23, dotClass: 'bg-[#3f51b5]', icon: '\u{1F4F1}' },
  { key: 'custom', label: 'Customization', number: 25, dotClass: 'bg-[#ff9800]', icon: '\u{2699}' },
  { key: 'crm', label: 'CRM', number: 26, dotClass: 'bg-[#607d8b]', icon: '\u{1F4BC}' },
]

// Non-searchable layers at bottom
const BOTTOM_LAYERS: LayerConfig[] = [
  { key: 'stats', label: 'Market Stats', number: 28, dotClass: 'bg-[#7c4dff]', icon: '\u{1F4C8}' },
  { key: 'news', label: 'Business News', number: 15, dotClass: 'bg-[#ff5722]', icon: '\u{1F4F0}' },
]

// Toggle switch component
function ToggleSwitch({
  isOn,
  onToggle,
  color = '#1565c0',
  size = 'sm',
}: {
  isOn: boolean
  onToggle: () => void
  color?: string
  size?: 'sm' | 'xs'
}) {
  const w = size === 'xs' ? 28 : 32
  const h = size === 'xs' ? 16 : 18
  const dot = size === 'xs' ? 12 : 14
  const offset = size === 'xs' ? 2 : 2

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className="flex-shrink-0 rounded-full transition-colors duration-200"
      style={{
        width: w,
        height: h,
        backgroundColor: isOn ? color : '#d1d5db',
        position: 'relative',
      }}
    >
      <div
        className="rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{
          width: dot,
          height: dot,
          position: 'absolute',
          top: offset,
          left: isOn ? w - dot - offset : offset,
        }}
      />
    </button>
  )
}

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="px-2 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5 border-t border-gray-200">
      <span>{icon}</span> {label}
    </div>
  )
}

function LayerButton({
  layer,
  isActive,
  isEnabled,
  onClick,
  onToggle,
  count,
}: {
  layer: LayerConfig
  isActive: boolean
  isEnabled: boolean
  onClick: () => void
  onToggle: () => void
  count?: number
}) {
  return (
    <div
      onClick={onClick}
      className={`w-full px-2 py-1.5 mb-0.5 rounded-md text-[12px] font-medium flex items-center gap-1.5 text-left transition-all duration-150 cursor-pointer ${
        isActive
          ? 'bg-[#1565c0]/10 text-[#1565c0] border border-[#1565c0]/30'
          : 'bg-gray-50 text-gray-600 border border-transparent hover:bg-blue-50 hover:text-[#1565c0]'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${layer.dotClass}`} />
      <span className="flex-1 truncate text-[11px]">
        {layer.label}
      </span>
      {count !== undefined && count > 0 && (
        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-black/[0.06]">
          {count}
        </span>
      )}
      <ToggleSwitch isOn={isEnabled} onToggle={onToggle} size="sm" />
    </div>
  )
}

export function LayerSidebar({
  activeLayer,
  onLayerChange,
  onLoginClick,
  layerCounts = {},
  isOpen,
  onToggle,
  enabledLayers,
  onLayerToggle,
  listingToggles,
  onListingToggleChange,
}: LayerSidebarProps) {
  // Close sidebar on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onToggle()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onToggle])

  const renderLayerList = (layers: LayerConfig[]) =>
    layers.map((layer) => (
      <LayerButton
        key={layer.key}
        layer={layer}
        isActive={activeLayer === layer.key}
        isEnabled={enabledLayers.has(layer.key)}
        onClick={() => onLayerChange(layer.key)}
        onToggle={() => onLayerToggle(layer.key)}
        count={layerCounts[layer.key]}
      />
    ))

  return (
    <>
      {/* Collapsed strip */}
      <div
        className={`sidebar-collapsed-strip ${isOpen ? 'sidebar-strip-hidden' : ''}`}
        style={{
          width: 48,
          background: 'linear-gradient(180deg, #1565c0 0%, #0d47a1 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
          flexShrink: 0,
          zIndex: 1001,
          position: 'relative',
        }}
      >
        <button
          onClick={onToggle}
          className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/20 rounded-lg transition-colors mb-2"
          title="Open Sidebar"
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="w-9 h-9 bg-gradient-to-br from-[#ffc107] to-[#ff9800] rounded-lg flex items-center justify-center text-lg shadow-md">
          {'\u{1F985}'}
        </div>
      </div>

      {/* Mobile overlay backdrop */}
      {isOpen && <div className="sidebar-backdrop" onClick={onToggle} />}

      {/* Sidebar panel */}
      <div className={`sidebar-panel ${isOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        {/* Header */}
        <div className="px-3 py-3 bg-gradient-to-br from-[#1565c0] to-[#0d47a1] text-white flex items-center gap-2">
          <div className="w-9 h-9 bg-gradient-to-br from-[#ffc107] to-[#ff9800] rounded-lg flex items-center justify-center text-xl shadow-md flex-shrink-0">
            {'\u{1F985}'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-extrabold">Building Hawk</div>
            <div className="text-[9px] opacity-85 uppercase tracking-[1.2px]">
              NOC Industrial CRE
            </div>
          </div>
          <button
            onClick={onToggle}
            className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
            title="Close Sidebar"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Layers */}
        <div className="flex-1 overflow-y-auto p-1.5">
          <SectionHeader icon={'\u{1F3E2}'} label="Property Layers" />

          {/* First layer: New Listings/Updates with sub-toggles */}
          {(() => {
            const listingsLayer = PROPERTY_LAYERS[0]
            return (
              <>
                <LayerButton
                  layer={listingsLayer}
                  isActive={activeLayer === listingsLayer.key}
                  isEnabled={enabledLayers.has(listingsLayer.key)}
                  onClick={() => onLayerChange(listingsLayer.key)}
                  onToggle={() => onLayerToggle(listingsLayer.key)}
                  count={layerCounts[listingsLayer.key]}
                />
                {/* Listing sub-toggles */}
                <div className="ml-4 mb-1 border-l-2 border-gray-200 pl-2">
                  {LISTING_TOGGLES.map((t) => (
                    <div
                      key={t.key}
                      className="flex items-center justify-between py-1 px-1.5 rounded text-[11px] text-gray-600 hover:bg-gray-50 cursor-pointer"
                      onClick={() => onListingToggleChange(t.key, !listingToggles[t.key])}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: t.color }}
                        />
                        <span className={listingToggles[t.key] ? 'font-semibold' : ''}>{t.label}</span>
                      </div>
                      <ToggleSwitch
                        isOn={listingToggles[t.key]}
                        onToggle={() => onListingToggleChange(t.key, !listingToggles[t.key])}
                        color={t.color}
                        size="xs"
                      />
                    </div>
                  ))}
                </div>
              </>
            )
          })()}

          {/* Rest of property layers (skip first which is listings) */}
          {renderLayerList(PROPERTY_LAYERS.slice(1))}

          <SectionHeader icon={'\u{1F465}'} label="People & Entities" />
          {renderLayerList(PEOPLE_LAYERS)}

          <SectionHeader icon={'\u{1F4CA}'} label="Market Intelligence" />
          {renderLayerList(MARKET_LAYERS)}

          <SectionHeader icon={'\u{2699}'} label="Tools & Settings" />
          {renderLayerList(TOOLS_LAYERS)}

          {/* Non-searchable layers at bottom */}
          <SectionHeader icon={'\u{1F4C8}'} label="Info (Read-Only)" />
          {renderLayerList(BOTTOM_LAYERS)}
        </div>

        {/* Login */}
        <div className="p-3 bg-gray-50 border-t border-gray-200">
          <button
            onClick={onLoginClick}
            className="w-full py-2.5 bg-gradient-to-br from-[#1565c0] to-[#0d47a1] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/30 transition-all"
          >
            {'\u{1F510}'} Log In / Register
          </button>
        </div>
      </div>
    </>
  )
}

export type { LayerKey, ListingToggleKey }
export { LISTING_TOGGLES }
export default LayerSidebar
