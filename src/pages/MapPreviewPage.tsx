import { useState } from 'react'
import { PropertyMapPreview } from '@/components/Map/PropertyMapPreview'

interface Property {
  id: string
  address: string
  city: string
  state?: string
  zip?: string
  company?: string
  contact_name?: string
  phone?: string
  sqft?: number
  owner_name?: string
  landuse_category?: string
}

export default function MapPreviewPage() {
  const [_selectedProperty, setSelectedProperty] = useState<Property | null>(null)

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <img 
              src="/assets/logos/BUILDINGHAWKINC1f.png" 
              alt="Building Hawk" 
              className="h-10 w-auto"
            />
            <div>
              <h1 className="text-xl font-bold text-white">Building Hawk</h1>
              <p className="text-sm text-gray-400">Industrial Real Estate CRM</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-4">
            <a href="/" className="text-gray-300 hover:text-white text-sm">
              Dashboard
            </a>
            <a href="/properties" className="text-gray-300 hover:text-white text-sm">
              Properties
            </a>
            <a href="/map-preview" className="text-amber-400 font-medium text-sm">
              Map Preview
            </a>
          </nav>
        </div>
      </header>

      {/* Map */}
      <main className="p-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Property Map</h2>
              <p className="text-gray-400">
                Consolidated Orange County industrial properties
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600"
              >
                🔄 Refresh
              </button>
              <a 
                href="/data/building_hawk_geo.geojson"
                download
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700"
              >
                📥 Download GeoJSON
              </a>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden shadow-2xl">
            <PropertyMapPreview
              geojsonUrl="/data/building_hawk_geo.geojson"
              onPropertySelect={setSelectedProperty}
              height="calc(100vh - 200px)"
            />
          </div>

          {/* Stats bar */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard 
              label="Total Properties" 
              value="2,821" 
              icon="🏢"
            />
            <StatCard 
              label="With Coordinates" 
              value="417" 
              icon="📍"
              subtext="14.8%"
            />
            <StatCard 
              label="Cities Covered" 
              value="7" 
              icon="🌆"
            />
            <StatCard 
              label="Companies" 
              value="1,950" 
              icon="🏭"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 py-4 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          Building Hawk © 2025 • Industrial Real Estate Intelligence
        </div>
      </footer>
    </div>
  )
}

function StatCard({ 
  label, 
  value, 
  icon, 
  subtext 
}: { 
  label: string
  value: string
  icon: string
  subtext?: string
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wide">{label}</p>
          <p className="text-white text-xl font-bold">
            {value}
            {subtext && (
              <span className="text-amber-400 text-sm ml-2">({subtext})</span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
