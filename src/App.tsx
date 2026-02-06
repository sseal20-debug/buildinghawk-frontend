import { useState, useCallback, useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { Map } from "./components/Map/Map"
import { SearchPanel } from "./components/Search/SearchPanel"
import { SearchResults } from "./components/Search/SearchResults"
import { SaveSearchForm } from "./components/Search/SaveSearchForm"
import { SavedSearchList } from "./components/Search/SavedSearchList"
import { AlertsList } from "./components/Alerts/AlertsList"
import { SaleAlertsList } from "./components/Alerts/SaleAlertsList"
import ParcelExplorer from "./components/ParcelExplorerClean"
import { ParcelClassifier } from "./components/ParcelClassifier"
import { LayerSidebar } from "./components/Sidebar"
import type { LayerKey } from "./components/Sidebar"
import { TopSearchBar } from "./components/Search/TopSearchBar"
import type { QuickFilter } from "./components/Search/TopSearchBar"
import L from 'leaflet'
import { DocumentDrawer } from "./components/DocumentDrawer"
import { CompsSearch } from "./components/Comps"
import { TenantsSearch } from "./components/Tenants"
import { HotsheetPanel } from "./components/Hotsheet"
import { WarnAlertsPanel } from "./components/WarnAlerts/WarnAlertsPanel"
import { EmailHistoryPanel } from "./components/EmailHistory"
import { VacantPanel, ClientsPanel, CondosPanel, StatsPanel } from "./components/Panels"
import { LoginView } from "./pages/LoginView"
import { PropertyContextMenu, type ContextMenuAction } from "./components/Map/PropertyContextMenu"
import { PropertyCard } from "./components/Map/PropertyCard"
import { searchApi, placesApi, crmApi, parcelsApi, crmPropertiesApi } from "./api/client"
import { useDebounce } from "./hooks/useDebounce"
import type { Parcel, SearchCriteria, SearchResultCollection, SavedSearch, CRMEntity } from "./types"
import type { UserSession } from "./styles/theme"

type ViewState =
  | { type: "map" }
  | { type: "parcel"; apn: string }
  | { type: "unit"; unitId: string }
  | { type: "unit-edit"; unitId: string; buildingId: string }
  | { type: "unit-new"; buildingId: string }

// Filter Tab types
type FilterTabId =
  | "address" | "owner" | "tenant" | "owner-users" | "lease-expiration"
  | "vacant" | "location" | "specs" | "history" | "crm"
  | "new-development" | "off-market" | "distressed"
  | "alerts" | "call" | "text" | "save-send" | "print" | null

// CRM filter state for prospects
type CRMProspectFilter = {
  looking: boolean
  recentlyAdded: "1week" | "4weeks" | "3months" | "6months" | "1year" | null
  listedBuilding: boolean
  companyName: string
  ownerName: string
  sfMin: number | null
  sfMax: number | null
  lotSizeMin: number | null
  lotSizeMax: number | null
  yrBuiltMin: number | null
  yrBuiltMax: number | null
  clearanceMin: number | null
  streetName: string
  city: string
  zip: string
  distressed: boolean
  offMarket: boolean
  multipleLocations: boolean
}

// Dropdown menu options for each filter
const filterMenuOptions: Record<string, string[]> = {
  address: ["Search by Address", "Search by APN", "Search by Street Name"],
  owner: ["Search by Owner Name", "Owner Portfolio", "Recent Purchases"],
  tenant: ["Search by Tenant", "Tenant Industry", "Multi-Location Tenants"],
  "owner-users": ["Owner-Occupied Only", "All Owner/Users"],
  "lease-expiration": ["Expiring 30 Days", "Expiring 90 Days", "Expiring 6 Months", "Expiring 1 Year"],
  vacant: ["All Vacant", "Vacant For Sale", "Vacant For Lease", "Recently Vacated"],
  location: ["By City", "By Zip Code", "By Submarket", "Draw on Map"],
  specs: ["Building SF", "Lot Size", "Clear Height", "Power", "Dock Doors", "Year Built"],
  history: ["Sale History", "Lease History", "Price Changes", "Listing History"],
  crm: [], // CRM has custom dropdown, not standard options
  "new-development": ["Under Construction", "Planned", "Recently Completed"],
  "off-market": ["Owner May Sell", "Off-Market Deals", "Pocket Listings"],
  distressed: ["Foreclosure", "Bank Owned", "Short Sale", "Deferred Maintenance"],
  alerts: ["Today's Alerts", "All Alerts", "Lease Expirations", "Search Matches"],
  call: ["Recent Calls", "Schedule Call", "Call Log"],
  text: ["Send Text", "Text Templates", "Text History"],
  "save-send": ["Save Search", "Email Results", "Share Link"],
  print: ["Print Map", "Print Property", "Print Comp Report", "Export PDF"],
}

// Filter Tab Component with Dropdown
function FilterTab({
  id,
  label,
  active,
  onClick,
  highlight,
  onSelect
}: {
  id: FilterTabId;
  label: string;
  active: boolean;
  onClick: () => void;
  highlight?: boolean;
  onSelect?: (option: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const options = id ? filterMenuOptions[id] || [] : []

  const handleClick = () => {
    if (options.length > 0) {
      // Calculate position based on button location
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        setDropdownPos({ top: rect.bottom + 4, left: rect.left })
      }
      setShowDropdown(!showDropdown)
    }
    onClick()
  }

  const handleOptionSelect = (option: string) => {
    setShowDropdown(false)
    onSelect?.(option)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!active && showDropdown) {
      setShowDropdown(false)
    }
  }, [active, showDropdown])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all ${
          active
            ? "bg-gold text-navy-dark"
            : highlight
            ? "bg-teal/80 text-white hover:bg-teal"
            : "bg-navy-light/50 text-white/80 hover:bg-navy-light hover:text-white"
        }`}
      >
        {label}
        {options.length > 0 && (
          <span className="ml-1 text-[10px]">▼</span>
        )}
      </button>

      {/* Dropdown Menu */}
      {active && showDropdown && options.length > 0 && (
        <div
          className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 py-1 min-w-[180px] z-[9999]"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {options.map((option) => (
            <button
              key={option}
              onClick={() => handleOptionSelect(option)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gold/20 hover:text-navy-dark transition-colors"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type PanelView = "none" | "search" | "results" | "save-search" | "saved-searches" | "alerts" | "sale-alerts" | "explorer" | "crm" | "comps" | "hotsheet" | "emails" | "tenants" | "warn" | "vacant" | "clients" | "condos" | "stats" | "owners" | "requirements" | "investors" | "address" | "type" | "offmarket"

// CRM Dropdown Panel with Prospects/Clients/Properties/Land checkboxes
function CRMDropdownPanel({
  showProspects,
  showClients,
  showProperties,
  showLand,
  onProspectsChange,
  onClientsChange,
  onPropertiesChange,
  onLandChange,
  onProspectRightClick,
  onClassifyClick,
  position,
}: {
  showProspects: boolean
  showClients: boolean
  showProperties: boolean
  showLand: boolean
  onProspectsChange: (checked: boolean) => void
  onClientsChange: (checked: boolean) => void
  onPropertiesChange: (checked: boolean) => void
  onLandChange: (checked: boolean) => void
  onProspectRightClick: (e: React.MouseEvent) => void
  onClassifyClick: () => void
  position: { top: number; left: number }
}) {
  return (
    <div className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 py-2 min-w-[200px] z-[9999]" style={{ top: position.top, left: position.left }}>
      <div className="px-4 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 mb-1">
        Show on Map
      </div>

      {/* Prospects checkbox */}
      <label
        className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gold/10 transition-colors"
        onContextMenu={onProspectRightClick}
      >
        <input
          type="checkbox"
          checked={showProspects}
          onChange={(e) => onProspectsChange(e.target.checked)}
          className="w-4 h-4 text-teal bg-gray-100 border-gray-300 rounded focus:ring-teal"
        />
        <span className="text-sm text-gray-700 font-medium">Prospects</span>
        <span className="ml-auto text-xs text-gray-400">(right-click to filter)</span>
      </label>

      {/* Clients checkbox */}
      <label className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gold/10 transition-colors">
        <input
          type="checkbox"
          checked={showClients}
          onChange={(e) => onClientsChange(e.target.checked)}
          className="w-4 h-4 text-teal bg-gray-100 border-gray-300 rounded focus:ring-teal"
        />
        <span className="text-sm text-gray-700 font-medium">Clients</span>
      </label>

      {/* Properties checkbox - light blue markers */}
      <label className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gold/10 transition-colors">
        <input
          type="checkbox"
          checked={showProperties}
          onChange={(e) => onPropertiesChange(e.target.checked)}
          className="w-4 h-4 text-teal bg-gray-100 border-gray-300 rounded focus:ring-teal"
        />
        <span className="text-sm text-gray-700 font-medium">Properties</span>
        <span className="ml-auto w-3 h-3 rounded-full bg-sky-400" title="Light blue markers" />
      </label>

      {/* Land checkbox - yellow markers */}
      <label className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gold/10 transition-colors">
        <input
          type="checkbox"
          checked={showLand}
          onChange={(e) => onLandChange(e.target.checked)}
          className="w-4 h-4 text-teal bg-gray-100 border-gray-300 rounded focus:ring-teal"
        />
        <span className="text-sm text-gray-700 font-medium">Land</span>
        <span className="ml-auto w-3 h-3 rounded-full bg-yellow-400" title="Yellow markers" />
      </label>

      <div className="border-t border-gray-100 mt-2 pt-2">
        <button className="w-full px-4 py-2 text-left text-sm text-teal hover:bg-teal/10 transition-colors">
          + Add New Prospect
        </button>
        <button className="w-full px-4 py-2 text-left text-sm text-teal hover:bg-teal/10 transition-colors">
          + Add New Client
        </button>
      </div>

      {/* Classify Parcels button */}
      <div className="border-t border-gray-100 mt-2 pt-2">
        <button
          onClick={onClassifyClick}
          className="w-full px-4 py-2 text-left text-sm font-medium text-orange-600 hover:bg-orange-50 transition-colors flex items-center gap-2"
        >
          <span className="w-5 h-5 rounded bg-orange-500 text-white text-xs flex items-center justify-center">C</span>
          Classify Parcels
        </button>
      </div>
    </div>
  )
}

// CRM Prospect Filter Menu (right-click menu)
function ProspectFilterMenu({
  position,
  onClose,
  onApplyFilter,
}: {
  position: { x: number; y: number }
  onClose: () => void
  onApplyFilter: (filter: Partial<CRMProspectFilter>) => void
}) {
  const [localFilter, setLocalFilter] = useState<Partial<CRMProspectFilter>>({})

  const handleApply = () => {
    onApplyFilter(localFilter)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[100]" onClick={onClose} />

      {/* Menu */}
      <div
        className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 py-2 w-[320px] z-[101] max-h-[500px] overflow-y-auto"
        style={{ left: position.x, top: position.y }}
      >
        <div className="px-4 py-2 bg-navy-dark text-white font-semibold text-sm flex items-center justify-between">
          <span>Filter Prospects</span>
          <button onClick={onClose} className="text-white/70 hover:text-white">✕</button>
        </div>

        {/* Looking for building */}
        <label className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
          <input
            type="checkbox"
            checked={localFilter.looking || false}
            onChange={(e) => setLocalFilter({ ...localFilter, looking: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-sm">In the market for building (Looking)</span>
        </label>

        {/* Recently Added */}
        <div className="px-4 py-2 border-t border-gray-100">
          <div className="text-xs font-semibold text-gray-500 mb-2">Recently Added</div>
          <div className="flex flex-wrap gap-1">
            {[
              { label: "1 week", value: "1week" as const },
              { label: "4 weeks", value: "4weeks" as const },
              { label: "3 mo", value: "3months" as const },
              { label: "6 mo", value: "6months" as const },
              { label: "1 yr", value: "1year" as const },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLocalFilter({ ...localFilter, recentlyAdded: localFilter.recentlyAdded === opt.value ? null : opt.value })}
                className={`px-2 py-1 text-xs rounded ${
                  localFilter.recentlyAdded === opt.value
                    ? "bg-teal text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Listed Building */}
        <label className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 border-t border-gray-100">
          <input
            type="checkbox"
            checked={localFilter.listedBuilding || false}
            onChange={(e) => setLocalFilter({ ...localFilter, listedBuilding: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-sm">Listed Building</span>
        </label>

        {/* Company/Owner Name */}
        <div className="px-4 py-2 border-t border-gray-100 grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">Company Name</label>
            <input
              type="text"
              value={localFilter.companyName || ""}
              onChange={(e) => setLocalFilter({ ...localFilter, companyName: e.target.value })}
              className="w-full px-2 py-1 text-sm border rounded"
              placeholder="Search..."
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Owner Name</label>
            <input
              type="text"
              value={localFilter.ownerName || ""}
              onChange={(e) => setLocalFilter({ ...localFilter, ownerName: e.target.value })}
              className="w-full px-2 py-1 text-sm border rounded"
              placeholder="Search..."
            />
          </div>
        </div>

        {/* SF Range */}
        <div className="px-4 py-2 border-t border-gray-100">
          <label className="text-xs text-gray-500">Building SF</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={localFilter.sfMin || ""}
              onChange={(e) => setLocalFilter({ ...localFilter, sfMin: e.target.value ? Number(e.target.value) : null })}
              className="w-full px-2 py-1 text-sm border rounded"
              placeholder="Min"
            />
            <span className="text-gray-400">-</span>
            <input
              type="number"
              value={localFilter.sfMax || ""}
              onChange={(e) => setLocalFilter({ ...localFilter, sfMax: e.target.value ? Number(e.target.value) : null })}
              className="w-full px-2 py-1 text-sm border rounded"
              placeholder="Max"
            />
          </div>
        </div>

        {/* Location */}
        <div className="px-4 py-2 border-t border-gray-100 grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-gray-500">Street</label>
            <input
              type="text"
              value={localFilter.streetName || ""}
              onChange={(e) => setLocalFilter({ ...localFilter, streetName: e.target.value })}
              className="w-full px-2 py-1 text-sm border rounded"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">City</label>
            <input
              type="text"
              value={localFilter.city || ""}
              onChange={(e) => setLocalFilter({ ...localFilter, city: e.target.value })}
              className="w-full px-2 py-1 text-sm border rounded"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Zip</label>
            <input
              type="text"
              value={localFilter.zip || ""}
              onChange={(e) => setLocalFilter({ ...localFilter, zip: e.target.value })}
              className="w-full px-2 py-1 text-sm border rounded"
            />
          </div>
        </div>

        {/* Flags */}
        <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-2">
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={localFilter.distressed || false}
              onChange={(e) => setLocalFilter({ ...localFilter, distressed: e.target.checked })}
              className="w-3 h-3"
            />
            Distressed
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={localFilter.offMarket || false}
              onChange={(e) => setLocalFilter({ ...localFilter, offMarket: e.target.checked })}
              className="w-3 h-3"
            />
            Off Market
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={localFilter.multipleLocations || false}
              onChange={(e) => setLocalFilter({ ...localFilter, multipleLocations: e.target.checked })}
              className="w-3 h-3"
            />
            Multiple Locations
          </label>
        </div>

        {/* Apply Button */}
        <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
          <button
            onClick={() => setLocalFilter({})}
            className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
          >
            Clear
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-3 py-2 text-sm text-white bg-teal rounded hover:bg-teal/90"
          >
            Apply Filter
          </button>
        </div>
      </div>
    </>
  )
}

export default function App() {
  // Auth state
  const [user, setUser] = useState<UserSession | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  // Check for existing session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('buildingHawkUser')
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('buildingHawkUser')
      }
    }
    setIsCheckingAuth(false)
  }, [])

  const handleLogin = useCallback((loggedInUser: UserSession) => {
    setUser(loggedInUser)
  }, [])

  const handleLogout = useCallback(() => {
    localStorage.removeItem('buildingHawkUser')
    setUser(null)
  }, [])

  // Show loading while checking auth
  if (isCheckingAuth) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-navy">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-navy-light border-t-gold rounded-full animate-spin" />
          <p className="text-white">Loading...</p>
        </div>
      </div>
    )
  }

  // Show login if not authenticated
  if (!user) {
    return <LoginView onLogin={handleLogin} />
  }

  // Show main app
  return <MainApp user={user} onLogout={handleLogout} />
}

// Layer name lookup
const LAYER_NAMES: Record<string, string> = {
  listings: 'New Listings/Updates',
  address: 'Address',
  specs: 'Specs',
  type: 'Type',
  comps: 'Comps',
  newdev: 'New Developments',
  vacant: 'Vacant',
  condos: 'Condos',
  offmarket: 'Off-Market',
  tenants: 'Tenants',
  owners: 'Owner-Users',
  'buy-lease': 'Users – Buy/Lease',
  investor: 'Investor – Buy/Sell',
  looking: 'Looking',
  clients: 'Clients',
  distressed: 'Distressed',
  news: 'Business News',
  contaminated: 'Contaminated Sites',
  obituaries: 'Obituaries',
  bankruptcy: 'Bankruptcy',
  auctions: 'Auctions',
  mergers: 'Mergers & Acquisitions',
  notes: 'Note Buying',
  alerts: 'Alerts',
  social: 'Social Media',
  custom: 'Customization',
  crm: 'CRM',
  stats: 'Market Stats',
}

// Main application component (after login)
function MainApp({ user: _user, onLogout }: { user: UserSession; onLogout: () => void }) {
  const [viewState, setViewState] = useState<ViewState>({ type: "map" })
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null)
  const [, setSheetHeight] = useState<"collapsed" | "half" | "full">("collapsed")
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedSearchLocation, setSelectedSearchLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [panelView, setPanelView] = useState<PanelView>("none")
  const [searchCriteria, setSearchCriteria] = useState<SearchCriteria | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResultCollection | null>(null)
  const [docDrawerAddress, setDocDrawerAddress] = useState<string | null>(null)
  const [isDocDrawerOpen, setIsDocDrawerOpen] = useState(false)
  const [emailSearchQuery, setEmailSearchQuery] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_activeFilterTab, _setActiveFilterTab] = useState<FilterTabId>(null)

  // Sidebar state
  const [activeLayer, setActiveLayer] = useState<LayerKey>('listings')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Context menu state
  const [contextMenuParcel, setContextMenuParcel] = useState<Parcel | null>(null)
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)

  // CRM state
  const [showProspects, setShowProspects] = useState(false)
  const [showClients, setShowClients] = useState(false)
  const [showProperties, setShowProperties] = useState(false)  // Off until click/search
  const [showLand, setShowLand] = useState(false)  // Off until click/search
  const [showClassifier, setShowClassifier] = useState(false)
  const [showTenantLabels, setShowTenantLabels] = useState(false)
  const mapComponentRef = useRef<{ getMap: () => L.Map | null } | null>(null)
  const [prospectFilter, setProspectFilter] = useState<Partial<CRMProspectFilter>>({})
  const [prospectFilterMenuPos, setProspectFilterMenuPos] = useState<{ x: number; y: number } | null>(null)
  // (CRM dropdown removed - now in sidebar)

  // Apply prospect filter
  const handleApplyProspectFilter = useCallback((filter: Partial<CRMProspectFilter>) => {
    setProspectFilter(filter)
    console.log("Applying prospect filter:", filter)
    // TODO: Fetch filtered prospects and show on map
  }, [])

  // (Filter option select removed - now in sidebar)

  // Query for CRM prospects when checkbox is checked
  const { data: prospectsData } = useQuery({
    queryKey: ["crm", "prospects", prospectFilter],
    queryFn: () => crmApi.getProspects(prospectFilter),
    enabled: showProspects,
  })

  // Query for CRM clients when checkbox is checked
  const { data: clientsData } = useQuery({
    queryKey: ["crm", "clients"],
    queryFn: crmApi.getClients,
    enabled: showClients,
  })

  // Query for properties (buildings) when checkbox is checked
  const { data: propertiesData } = useQuery({
    queryKey: ["properties", "all"],
    queryFn: parcelsApi.getAllProperties,
    enabled: showProperties,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Query for land-only parcels when checkbox is checked
  const { data: landData } = useQuery({
    queryKey: ["parcels", "land"],
    queryFn: parcelsApi.getLandOnly,
    enabled: showLand,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Query for company labels (tenant overlay) when Layer 5 is active
  const { data: companyLabelsData } = useQuery({
    queryKey: ["properties", "company-labels"],
    queryFn: crmPropertiesApi.getCompanyLabels,
    enabled: showTenantLabels,
    staleTime: 1000 * 60 * 10, // 10 minutes
  })

  // Debounce the search query for street parcel highlighting (avoid hammering API)
  const debouncedStreetQuery = useDebounce(searchQuery, 400)

  // Query for street parcels to highlight on map while typing in search
  const { data: streetParcels } = useQuery({
    queryKey: ['street-parcels', debouncedStreetQuery],
    queryFn: () => parcelsApi.searchStreet(debouncedStreetQuery),
    enabled: debouncedStreetQuery.length >= 3,
    staleTime: 1000 * 30,
  })

  // Combine CRM markers to show on map
  const crmMarkers: CRMEntity[] = [
    ...(showProspects && prospectsData ? prospectsData : []),
    ...(showClients && clientsData ? clientsData : []),
  ]

  // Handle CRM marker click
  const handleCRMMarkerClick = useCallback((entity: CRMEntity) => {
    console.log("CRM marker clicked:", entity)
    // TODO: Open CRM entity detail panel
    setPanelView("crm")
  }, [])

  // Handle right-click on parcel - show context menu
  const handleParcelRightClick = useCallback((parcel: Parcel, position: { x: number; y: number }) => {
    setContextMenuParcel(parcel)
    setContextMenuPosition(position)
  }, [])

  // Handle context menu action
  const handleContextMenuAction = useCallback((action: ContextMenuAction, parcel: Parcel) => {
    console.log(`Context menu action: ${action}`, parcel)
    
    switch (action) {
      case 'street-view':
        // Open Google Street View
        if (parcel.situs_address && parcel.city) {
          const query = encodeURIComponent(`${parcel.situs_address}, ${parcel.city}, CA`)
          window.open(`https://www.google.com/maps?q=${query}&layer=c`, '_blank')
        }
        break
      case 'specs':
        // Select the parcel and show details
        setSelectedParcel(parcel)
        setViewState({ type: "parcel", apn: parcel.apn })
        setSheetHeight("half")
        break
      case 'history':
        // Open history panel
        setSelectedParcel(parcel)
        setViewState({ type: "parcel", apn: parcel.apn })
        setSheetHeight("full")
        break
      case 'owner':
        // Navigate to owner/ownership info
        setSelectedParcel(parcel)
        setViewState({ type: "parcel", apn: parcel.apn })
        setSheetHeight("half")
        break
      case 'tenant':
        // Navigate to tenant info
        setSelectedParcel(parcel)
        setViewState({ type: "parcel", apn: parcel.apn })
        setSheetHeight("half")
        break
      case 'comps':
        // Open comps panel
        setPanelView("comps")
        break
      case 'documents':
        // Open document drawer
        setDocDrawerAddress(parcel.situs_address)
        setIsDocDrawerOpen(true)
        break
      case 'emails':
        // Open email history panel for this property
        setEmailSearchQuery(parcel.situs_address || '')
        setPanelView("emails")
        break
      case 'crm':
        // Open CRM panel
        setSelectedParcel(parcel)
        setPanelView("crm")
        break
      case 'add-prospect':
        // TODO: Add parcel as prospect
        console.log('Add as prospect:', parcel)
        alert(`Added ${parcel.situs_address} as Prospect`)
        break
      case 'add-client':
        // TODO: Add parcel as client
        console.log('Add as client:', parcel)
        alert(`Added ${parcel.situs_address} as Client`)
        break
      case 'new-development':
        // Flag as new development
        console.log('Flag as new development:', parcel)
        break
      case 'distressed':
        // Flag as distressed
        console.log('Flag as distressed:', parcel)
        break
      case 'off-market':
        // Flag as off-market
        console.log('Flag as off-market:', parcel)
        break
      case 'export-pdf':
        // Export property to PDF
        console.log('Export PDF:', parcel)
        alert('PDF export coming soon!')
        break
      case 'share':
        // Copy share link
        const shareUrl = `${window.location.origin}?apn=${parcel.apn}`
        navigator.clipboard.writeText(shareUrl)
        alert('Link copied to clipboard!')
        break
    }
    
    // Close context menu
    setContextMenuParcel(null)
    setContextMenuPosition(null)
  }, [])

  const handleParcelSelect = useCallback((parcel: Parcel) => {
    console.log("Parcel selected:", parcel.apn, parcel.situs_address)
    setSelectedParcel(parcel)
    // Don't auto-open bottom sheet - it causes freeze when backend is down
    // Just update state, show property card on map instead
    setViewState({ type: "map" })
    setPanelView("none")
    setIsDocDrawerOpen(false)
  }, [])

  // (BottomSheet handlers removed - using sidebar UI now)

  // Extended search result type to handle all sources
  type SearchResult = {
    apn: string
    centroid?: { coordinates: [number, number] }
    place_id?: string
    situs_address?: string
    type?: string
    doc_count?: number
    latitude?: number   // Direct lat/lng for CRM properties
    longitude?: number
  }

  const handleSearchSelect = useCallback(async (result: SearchResult) => {
    // If we have direct lat/lng (CRM properties), use them
    if (result.latitude && result.longitude) {
      const location = {
        lat: result.latitude,
        lng: result.longitude
      }
      setMapCenter(location)
      // Set the search location to show only this parcel
      setSelectedSearchLocation(location)
      return
    }

    // If we have centroid coordinates, use them directly
    if (result.centroid) {
      const location = {
        lng: result.centroid.coordinates[0],
        lat: result.centroid.coordinates[1]
      }
      setMapCenter(location)
      // Set the search location to show only this parcel
      setSelectedSearchLocation(location)
      return
    }

    // For Google Places, geocode using place_id
    if (result.place_id) {
      try {
        const geo = await placesApi.geocode({ place_id: result.place_id })
        setMapCenter({ lat: geo.lat, lng: geo.lng })
        // Set the search location to show only this parcel
        setSelectedSearchLocation({ lat: geo.lat, lng: geo.lng })
      } catch (err) {
        console.error("Failed to geocode place:", err)
      }
      return
    }

    // For Dropbox docs or other address-only results, geocode the address
    if (result.situs_address && !result.centroid) {
      try {
        const geo = await placesApi.geocode({ address: result.situs_address })
        setMapCenter({ lat: geo.lat, lng: geo.lng })
      } catch (err) {
        console.error("Failed to geocode address:", err)
      }
    }
  }, [])

  // Search handlers
  const handleSearch = useCallback(async (criteria: SearchCriteria) => {
    setSearchCriteria(criteria)
    try {
      const results = await searchApi.execute(criteria)
      setSearchResults(results)
      setPanelView("results")
    } catch (error) {
      console.error("Search failed:", error)
    }
  }, [])

  const handleSaveSearch = useCallback((criteria: SearchCriteria) => {
    setSearchCriteria(criteria)
    setPanelView("save-search")
  }, [])

  const handleRunSavedSearch = useCallback(async (savedSearch: SavedSearch) => {
    setSearchCriteria(savedSearch.criteria)
    try {
      const results = await searchApi.execute(savedSearch.criteria)
      setSearchResults(results)
      setPanelView("results")
    } catch (error) {
      console.error("Search failed:", error)
    }
  }, [])

  const handleEditSavedSearch = useCallback((savedSearch: SavedSearch) => {
    setSearchCriteria(savedSearch.criteria)
    setPanelView("search")
  }, [])

  const handleEntitySelect = useCallback((entityId: string) => {
    console.log("Entity selected:", entityId)
    setPanelView("none")
  }, [])

  const handleAlertUnitSelect = useCallback((unitId: string) => {
    setViewState({ type: "unit", unitId })
    setSheetHeight("full")
    setPanelView("none")
  }, [])

  const closePanel = useCallback(() => {
    setPanelView("none")
  }, [])

  // Handle top search bar result - fly to location
  const handleTopSearchSelect = useCallback((result: { lat: number; lng: number; address: string }) => {
    setMapCenter({ lat: result.lat, lng: result.lng })
    setSelectedSearchLocation({ lat: result.lat, lng: result.lng })
  }, [])

  return (
    <div className="h-full w-full flex relative" style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Left Sidebar - Layer Buttons */}
      <LayerSidebar
        activeLayer={activeLayer}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onLayerChange={(layer) => {
          setActiveLayer(layer)
          // Enable properties/land automatically based on layer
          if (layer === 'listings' || layer === 'address' || layer === 'specs' || layer === 'type' || layer === 'comps' || layer === 'vacant' || layer === 'offmarket' || layer === 'newdev' || layer === 'condos') {
            setShowProperties(true)
          }
          if (layer === 'crm') {
            setShowProperties(true)
            setShowLand(true)
          }
          // Toggle tenant labels for Layer 5
          setShowTenantLabels(layer === 'tenants')
          // Open corresponding panel
          const layerPanelMap: Partial<Record<LayerKey, PanelView>> = {
            // Property Layers
            listings: 'hotsheet',
            address: 'address',
            specs: 'search',
            type: 'type',
            comps: 'comps',
            vacant: 'vacant',
            condos: 'condos',
            offmarket: 'offmarket',
            // People & Entities
            tenants: 'tenants',
            owners: 'owners',
            'buy-lease': 'requirements',
            investor: 'investors',
            looking: 'requirements',
            clients: 'clients',
            // Market Intelligence
            distressed: 'warn',
            // Tools & Settings
            alerts: 'alerts',
            crm: 'explorer',
            stats: 'stats',
          }
          const panel = layerPanelMap[layer]
          if (panel) {
            setPanelView(panel)
          } else {
            setPanelView('none')
          }
        }}
        onLoginClick={onLogout}
        layerCounts={{
          listings: propertiesData?.length || 0,
          comps: 0,
          vacant: 0,
        }}
      />

      {/* Top Search Bar + Quick Filters */}
      <TopSearchBar
        onSelect={handleTopSearchSelect}
        onSearchChange={setSearchQuery}
        sidebarOpen={sidebarOpen}
        activeFilter={quickFilter}
        onFilterChange={setQuickFilter}
      />

      {/* Center - Map */}
      <div className="flex-1 relative z-0 min-w-0 h-full overflow-hidden">
        {/* Map */}
        <div className="absolute inset-0">
          <Map
            onParcelSelect={handleParcelSelect}
            onParcelRightClick={handleParcelRightClick}
            selectedApn={selectedParcel?.apn}
            center={mapCenter}
            selectedSearchLocation={selectedSearchLocation}
            highlightedParcels={streetParcels}
            crmMarkers={crmMarkers}
            onCRMMarkerClick={handleCRMMarkerClick}
            propertyMarkers={showProperties ? propertiesData : undefined}
            landMarkers={showLand ? landData : undefined}
            companyLabels={showTenantLabels ? companyLabelsData : undefined}
            quickFilter={quickFilter}
            onMapReady={(map) => {
              mapComponentRef.current = { getMap: () => map }
            }}
            activeLayerName={LAYER_NAMES[activeLayer] || activeLayer}
          />
        </div>

        {/* Parcel Classifier - for classifying parcels as Building/Land/Delete */}
        <ParcelClassifier
          isOpen={showClassifier}
          onClose={() => setShowClassifier(false)}
          mapRef={{ current: mapComponentRef.current?.getMap() ?? null }}
          onClassificationChange={() => {
            // Refresh any queries that depend on classification
          }}
        />

        {/* Property Card - shows when parcel is selected */}
        {selectedParcel && viewState.type === "map" && (
          <PropertyCard
            parcel={selectedParcel}
            onClose={() => setSelectedParcel(null)}
            onViewDetails={() => {
              handleParcelRightClick(selectedParcel, {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2 - 100
              })
            }}
            onRightClick={(e) => {
              e.preventDefault()
              handleParcelRightClick(selectedParcel, { x: e.clientX, y: e.clientY })
            }}
          />
        )}

        {/* Map Controls - top right */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          {/* Satellite / Streets toggle buttons */}
          <button
            className="w-11 h-11 bg-white border border-gray-300 rounded-[10px] cursor-pointer flex items-center justify-center text-xl shadow-md hover:bg-gray-50"
            title="Fit All"
            onClick={() => {
              const map = mapComponentRef.current?.getMap()
              if (map) map.setView([33.84, -117.89], 13)
            }}
          >
            ⊡
          </button>
        </div>

        {/* Side Panel (overlays from right) */}
        {panelView !== "none" && (
          <div className={`absolute top-0 right-0 bottom-0 bg-navy-dark shadow-xl z-20 flex flex-col border-l border-navy-light ${
            panelView === "explorer" || panelView === "comps" || panelView === "tenants" ? "w-full sm:w-[900px]" : "w-full sm:w-96"
          }`}>
            {panelView === "search" && (
              <SearchPanel
                onSearch={handleSearch}
                onSave={handleSaveSearch}
                onClose={closePanel}
                initialCriteria={searchCriteria || undefined}
              />
            )}

            {panelView === "results" && searchResults && (
              <SearchResults
                results={searchResults}
                onPropertySelect={(unitId) => {
                  setViewState({ type: "unit", unitId })
                  setSheetHeight("full")
                  setPanelView("none")
                }}
                onExportPdf={() => console.log("Export PDF")}
                onExportExcel={() => console.log("Export Excel")}
                onBack={() => setPanelView("search")}
              />
            )}

            {panelView === "save-search" && searchCriteria && (
              <SaveSearchForm
                criteria={searchCriteria}
                onSuccess={() => setPanelView("saved-searches")}
                onCancel={() => setPanelView("results")}
              />
            )}

            {panelView === "saved-searches" && (
              <SavedSearchList
                onRun={handleRunSavedSearch}
                onEdit={handleEditSavedSearch}
                onClose={closePanel}
              />
            )}

            {panelView === "alerts" && (
              <AlertsList
                onClose={closePanel}
                onEntitySelect={handleEntitySelect}
                onUnitSelect={handleAlertUnitSelect}
                onParcelSelect={(apn) => {
                  handleSearchSelect({ apn, centroid: undefined })
                }}
              />
            )}

            {panelView === "sale-alerts" && (
              <SaleAlertsList
                onClose={closePanel}
                onParcelSelect={(apn) => {
                  handleSearchSelect({ apn, centroid: undefined })
                }}
              />
            )}

            {panelView === "explorer" && (
              <div className="h-full overflow-auto relative bg-white">
                <button
                  onClick={closePanel}
                  className="absolute top-4 right-4 z-10 p-2 bg-white rounded-full shadow hover:bg-gray-100"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <ParcelExplorer />
              </div>
            )}

            {panelView === "comps" && (
              <CompsSearch onClose={closePanel} />
            )}

            {panelView === "hotsheet" && (
              <HotsheetPanel
                onClose={closePanel}
                onPropertySelect={(item) => {
                  console.log('Hotsheet property selected:', item)
                  setPanelView("none")
                }}
              />
            )}

            {panelView === "warn" && (
              <WarnAlertsPanel onClose={closePanel} />
            )}

            {panelView === "emails" && (
              <EmailHistoryPanel
                address={emailSearchQuery}
                onClose={closePanel}
              />
            )}

            {panelView === "tenants" && (
              <TenantsSearch onClose={closePanel} />
            )}

            {panelView === "vacant" && (
              <VacantPanel
                onClose={closePanel}
                onPropertySelect={(unit) => {
                  console.log('Vacant unit selected:', unit)
                  setPanelView("none")
                }}
              />
            )}

            {panelView === "clients" && (
              <ClientsPanel
                onClose={closePanel}
                onClientSelect={(client) => {
                  console.log('Client selected:', client)
                  setPanelView("none")
                }}
              />
            )}

            {panelView === "condos" && (
              <CondosPanel
                onClose={closePanel}
                onCondoSelect={(condo) => {
                  console.log('Condo selected:', condo)
                  setPanelView("none")
                }}
              />
            )}

            {panelView === "stats" && (
              <StatsPanel onClose={closePanel} />
            )}
          </div>
        )}

        {/* Document Drawer */}
        <DocumentDrawer
          address={docDrawerAddress}
          isOpen={isDocDrawerOpen}
          onClose={() => setIsDocDrawerOpen(false)}
        />

        {/* Prospect Filter Right-Click Menu */}
        {prospectFilterMenuPos && (
          <ProspectFilterMenu
            position={prospectFilterMenuPos}
            onClose={() => setProspectFilterMenuPos(null)}
            onApplyFilter={handleApplyProspectFilter}
          />
        )}

        {/* Property Context Menu (right-click on parcel) */}
        {contextMenuParcel && contextMenuPosition && (
          <PropertyContextMenu
            parcel={contextMenuParcel}
            position={contextMenuPosition}
            onClose={() => {
              setContextMenuParcel(null)
              setContextMenuPosition(null)
            }}
            onAction={handleContextMenuAction}
          />
        )}
      </div>

    </div>
  )
}
