// LayerSidebar - Left panel with 28 layer buttons (26 original + Condos + Stats)
// Mobile: collapses to 48px icon strip with hamburger toggle
// Desktop: always expanded at 260px

import { useEffect } from 'react'

type LayerKey =
  | 'listings' | 'address' | 'specs' | 'type' | 'comps' | 'newdev' | 'vacant' | 'offmarket' | 'condos'
  | 'tenants' | 'owners' | 'buy-lease' | 'investor' | 'looking' | 'clients'
  | 'distressed' | 'news' | 'contaminated' | 'obituaries' | 'bankruptcy' | 'auctions' | 'mergers' | 'notes'
  | 'alerts' | 'social' | 'custom' | 'crm' | 'stats'

interface LayerConfig {
  key: LayerKey
  label: string
  number: number
  dotClass: string
  icon: string
  count?: number
}

interface LayerSidebarProps {
  activeLayer: LayerKey
  onLayerChange: (layer: LayerKey) => void
  onLoginClick?: () => void
  layerCounts?: Partial<Record<LayerKey, number>>
  isOpen: boolean
  onToggle: () => void
}

const PROPERTY_LAYERS: LayerConfig[] = [
  { key: 'listings', label: 'New Listings/Updates', number: 1, dotClass: 'bg-[#e91e63]', icon: '📋' },
  { key: 'address', label: 'Address', number: 2, dotClass: 'bg-[#9c27b0]', icon: '📍' },
  { key: 'specs', label: 'Specs', number: 3, dotClass: 'bg-[#673ab7]', icon: '📐' },
  { key: 'type', label: 'Type', number: 4, dotClass: 'bg-[#3f51b5]', icon: '🏭' },
  { key: 'comps', label: 'Comps', number: 9, dotClass: 'bg-[#4caf50]', icon: '📊' },
  { key: 'newdev', label: 'New Developments', number: 10, dotClass: 'bg-[#8bc34a]', icon: '🏗️' },
  { key: 'vacant', label: 'Vacant', number: 11, dotClass: 'bg-[#cddc39]', icon: '🔑' },
  { key: 'condos', label: 'Condos', number: 27, dotClass: 'bg-[#00acc1]', icon: '🏢' },
  { key: 'offmarket', label: 'Off-Market', number: 13, dotClass: 'bg-[#ffc107]', icon: '🔒' },
]

const PEOPLE_LAYERS: LayerConfig[] = [
  { key: 'tenants', label: 'Tenants', number: 5, dotClass: 'bg-[#2196f3]', icon: '👤' },
  { key: 'owners', label: 'Owner-Users', number: 6, dotClass: 'bg-[#03a9f4]', icon: '🏠' },
  { key: 'buy-lease', label: 'Users – Buy/Lease', number: 7, dotClass: 'bg-[#00bcd4]', icon: '🔄' },
  { key: 'investor', label: 'Investor – Buy/Sell', number: 8, dotClass: 'bg-[#009688]', icon: '💰' },
  { key: 'looking', label: 'Looking', number: 12, dotClass: 'bg-[#ffeb3b]', icon: '🔍' },
  { key: 'clients', label: 'Clients', number: 21, dotClass: 'bg-[#2196f3]', icon: '🤝' },
]

const MARKET_LAYERS: LayerConfig[] = [
  { key: 'distressed', label: 'Distressed', number: 14, dotClass: 'bg-[#ff9800]', icon: '⚠️' },
  { key: 'news', label: 'Business News', number: 15, dotClass: 'bg-[#ff5722]', icon: '📰' },
  { key: 'contaminated', label: 'Contaminated Sites', number: 16, dotClass: 'bg-[#795548]', icon: '☢️' },
  { key: 'obituaries', label: 'Obituaries', number: 17, dotClass: 'bg-[#607d8b]', icon: '🕊️' },
  { key: 'bankruptcy', label: 'Bankruptcy', number: 18, dotClass: 'bg-[#f44336]', icon: '📉' },
  { key: 'auctions', label: 'Auctions', number: 20, dotClass: 'bg-[#9c27b0]', icon: '🔨' },
  { key: 'mergers', label: 'Mergers & Acquisitions', number: 22, dotClass: 'bg-[#00bcd4]', icon: '🔗' },
  { key: 'notes', label: 'Note Buying', number: 24, dotClass: 'bg-[#4caf50]', icon: '📝' },
]

const TOOLS_LAYERS: LayerConfig[] = [
  { key: 'alerts', label: 'Alerts', number: 19, dotClass: 'bg-[#e91e63]', icon: '🔔' },
  { key: 'social', label: 'Social Media', number: 23, dotClass: 'bg-[#3f51b5]', icon: '📱' },
  { key: 'custom', label: 'Customization', number: 25, dotClass: 'bg-[#ff9800]', icon: '⚙️' },
  { key: 'crm', label: 'CRM', number: 26, dotClass: 'bg-[#607d8b]', icon: '💼' },
  { key: 'stats', label: 'Market Stats', number: 28, dotClass: 'bg-[#7c4dff]', icon: '📈' },
]

function SectionHeader({ icon, label, collapsed }: { icon: string; label: string; collapsed: boolean }) {
  if (collapsed) return null
  return (
    <div className="px-3 py-2.5 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2 border-t border-gray-200">
      <span>{icon}</span> {label}
    </div>
  )
}

function LayerButton({
  layer,
  isActive,
  onClick,
  count,
  collapsed,
}: {
  layer: LayerConfig
  isActive: boolean
  onClick: () => void
  count?: number
  collapsed: boolean
}) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={`${layer.number}. ${layer.label}`}
        className={`w-full p-2 flex items-center justify-center transition-all duration-150 rounded-md mb-0.5 ${
          isActive
            ? 'bg-[#1565c0] text-white shadow-md'
            : 'text-gray-500 hover:bg-blue-50 hover:text-[#1565c0]'
        }`}
      >
        <span className="text-base">{layer.icon}</span>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2 mb-0.5 rounded-lg text-[13px] font-medium flex items-center gap-2 text-left transition-all duration-150 border-2 ${
        isActive
          ? 'bg-[#1565c0] text-white border-[#0d47a1] shadow-md shadow-blue-500/30'
          : 'bg-gray-50 text-gray-600 border-transparent hover:bg-blue-50 hover:border-blue-200 hover:text-[#1565c0]'
      }`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${layer.dotClass}`} />
      <span className="flex-1 truncate">
        {layer.number}. {layer.label}
      </span>
      {(count !== undefined || layer.count !== undefined) && (
        <span
          className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            isActive ? 'bg-white/20' : 'bg-black/[0.06]'
          }`}
        >
          {count ?? layer.count ?? 0}
        </span>
      )}
    </button>
  )
}

export function LayerSidebar({ activeLayer, onLayerChange, onLoginClick, layerCounts = {}, isOpen, onToggle }: LayerSidebarProps) {
  // Close sidebar on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onToggle()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onToggle])

  return (
    <>
      {/* Collapsed strip — always visible when sidebar closed */}
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
          🦅
        </div>
      </div>

      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onToggle}
        />
      )}

      {/* Sidebar panel */}
      <div className={`sidebar-panel ${isOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        {/* Header */}
        <div className="px-4 py-4 bg-gradient-to-br from-[#1565c0] to-[#0d47a1] text-white flex items-center gap-3">
          <div className="w-[42px] h-[42px] bg-gradient-to-br from-[#ffc107] to-[#ff9800] rounded-[10px] flex items-center justify-center text-2xl shadow-md flex-shrink-0">
            🦅
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-extrabold">Building Hawk</div>
            <div className="text-[10px] opacity-85 uppercase tracking-[1.5px] mt-0.5">
              North Orange County Industrial CRE
            </div>
          </div>
          <button
            onClick={onToggle}
            className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
            title="Close Sidebar"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

      {/* Layers */}
      <div className="flex-1 overflow-y-auto p-2">
        <SectionHeader icon="🏢" label="Property Layers" collapsed={false} />
        {PROPERTY_LAYERS.map((layer) => (
          <LayerButton
            key={layer.key}
            layer={layer}
            isActive={activeLayer === layer.key}
            onClick={() => onLayerChange(layer.key)}
            count={layerCounts[layer.key]}
            collapsed={false}
          />
        ))}

        <SectionHeader icon="👥" label="People & Entities" collapsed={false} />
        {PEOPLE_LAYERS.map((layer) => (
          <LayerButton
            key={layer.key}
            layer={layer}
            isActive={activeLayer === layer.key}
            onClick={() => onLayerChange(layer.key)}
            count={layerCounts[layer.key]}
            collapsed={false}
          />
        ))}

        <SectionHeader icon="📊" label="Market Intelligence" collapsed={false} />
        {MARKET_LAYERS.map((layer) => (
          <LayerButton
            key={layer.key}
            layer={layer}
            isActive={activeLayer === layer.key}
            onClick={() => onLayerChange(layer.key)}
            count={layerCounts[layer.key]}
            collapsed={false}
          />
        ))}

        <SectionHeader icon="⚙️" label="Tools & Settings" collapsed={false} />
        {TOOLS_LAYERS.map((layer) => (
          <LayerButton
            key={layer.key}
            layer={layer}
            isActive={activeLayer === layer.key}
            onClick={() => onLayerChange(layer.key)}
            count={layerCounts[layer.key]}
            collapsed={false}
          />
        ))}
      </div>

      {/* Login */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <button
          onClick={onLoginClick}
          className="w-full py-3 bg-gradient-to-br from-[#1565c0] to-[#0d47a1] text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/30 transition-all"
        >
          🔐 Log In / Register
        </button>
      </div>
    </div>
    </>
  )
}

export type { LayerKey }
export default LayerSidebar
