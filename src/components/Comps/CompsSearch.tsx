import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { compsApi, searchApi } from '@/api/client'
import type { LeaseComp, SaleComp, LeaseCompSearchParams, SaleCompSearchParams } from '@/api/client'
import { CompsExport } from './CompsExport'

type CompType = 'lease' | 'sale'

interface CompsSearchProps {
  onClose: () => void
}

interface LeaseSearchForm {
  minSf?: number
  maxSf?: number
  minRent?: number
  maxRent?: number
  city?: string
  submarket?: string
  startDate?: string
  endDate?: string
  leaseStructure?: string
  tenant?: string
}

interface SaleSearchForm {
  minSf?: number
  maxSf?: number
  minPrice?: number
  maxPrice?: number
  minPricePsf?: number
  maxPricePsf?: number
  city?: string
  submarket?: string
  startDate?: string
  endDate?: string
  saleType?: string
  buyer?: string
  seller?: string
}

const LEASE_STRUCTURES = [
  { value: '', label: 'Any' },
  { value: 'nnn', label: 'NNN' },
  { value: 'gross', label: 'Gross' },
  { value: 'modified_gross', label: 'Modified Gross' },
  { value: 'industrial_gross', label: 'Industrial Gross' },
]

const SALE_TYPES = [
  { value: '', label: 'Any' },
  { value: 'market', label: 'Market Sale' },
  { value: 'portfolio', label: 'Portfolio Sale' },
  { value: 'sale_leaseback', label: 'Sale-Leaseback' },
  { value: 'auction', label: 'Auction' },
  { value: 'foreclosure', label: 'Foreclosure' },
  { value: 'user', label: 'User Sale' },
]

export function CompsSearch({ onClose }: CompsSearchProps) {
  const [compType, setCompType] = useState<CompType>('lease')
  const [results, setResults] = useState<LeaseComp[] | SaleComp[] | null>(null)
  const [selectedComps, setSelectedComps] = useState<Set<string>>(new Set())
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)

  // Get cities for dropdown
  const { data: geographies } = useQuery({
    queryKey: ['geographies'],
    queryFn: searchApi.getGeographies,
  })

  // Get comp statistics
  const { data: leaseStats } = useQuery({
    queryKey: ['comps', 'stats', 'lease'],
    queryFn: () => compsApi.getLeaseCompStats(),
  })

  const { data: saleStats } = useQuery({
    queryKey: ['comps', 'stats', 'sale'],
    queryFn: () => compsApi.getSaleCompStats(),
  })

  const leaseForm = useForm<LeaseSearchForm>({
    defaultValues: {
      startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 year ago
      endDate: new Date().toISOString().split('T')[0],
    }
  })

  const saleForm = useForm<SaleSearchForm>({
    defaultValues: {
      startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    }
  })

  const handleLeaseSearch = async (data: LeaseSearchForm) => {
    const params: LeaseCompSearchParams = {}
    if (data.minSf) params.minSf = data.minSf
    if (data.maxSf) params.maxSf = data.maxSf
    if (data.minRent) params.minRent = data.minRent
    if (data.maxRent) params.maxRent = data.maxRent
    if (data.city) params.city = data.city
    if (data.submarket) params.submarket = data.submarket
    if (data.startDate) params.startDate = data.startDate
    if (data.endDate) params.endDate = data.endDate
    if (data.leaseStructure) params.leaseStructure = data.leaseStructure
    if (data.tenant) params.tenant = data.tenant

    try {
      const comps = await compsApi.searchLeaseComps(params)
      setResults(comps)
      setSelectedComps(new Set())
    } catch (err) {
      console.error('Failed to search lease comps:', err)
    }
  }

  const handleSaleSearch = async (data: SaleSearchForm) => {
    const params: SaleCompSearchParams = {}
    if (data.minSf) params.minSf = data.minSf
    if (data.maxSf) params.maxSf = data.maxSf
    if (data.minPrice) params.minPrice = data.minPrice
    if (data.maxPrice) params.maxPrice = data.maxPrice
    if (data.minPricePsf) params.minPricePsf = data.minPricePsf
    if (data.maxPricePsf) params.maxPricePsf = data.maxPricePsf
    if (data.city) params.city = data.city
    if (data.submarket) params.submarket = data.submarket
    if (data.startDate) params.startDate = data.startDate
    if (data.endDate) params.endDate = data.endDate
    if (data.saleType) params.saleType = data.saleType
    if (data.buyer) params.buyer = data.buyer
    if (data.seller) params.seller = data.seller

    try {
      const comps = await compsApi.searchSaleComps(params)
      setResults(comps)
      setSelectedComps(new Set())
    } catch (err) {
      console.error('Failed to search sale comps:', err)
    }
  }

  const toggleCompSelection = (id: string) => {
    const newSelected = new Set(selectedComps)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedComps(newSelected)
  }

  const selectAllComps = () => {
    if (!results) return
    if (selectedComps.size === results.length) {
      setSelectedComps(new Set())
    } else {
      setSelectedComps(new Set(results.map(c => c.id)))
    }
  }

  const handleExport = () => {
    if (!results) return
    setShowExportMenu(false)
    setShowExportModal(true)
  }

  const getCompsToExport = (): LeaseComp[] | SaleComp[] => {
    if (!results) return compType === 'lease' ? [] as LeaseComp[] : [] as SaleComp[]
    if (selectedComps.size > 0) {
      return compType === 'lease'
        ? (results as LeaseComp[]).filter(c => selectedComps.has(c.id))
        : (results as SaleComp[]).filter(c => selectedComps.has(c.id))
    }
    return results
  }

  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return '-'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
  }

  const formatNumber = (value?: number) => {
    if (value === undefined || value === null) return '-'
    return new Intl.NumberFormat('en-US').format(value)
  }

  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-navy-dark text-white">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Comp Search</h2>
          <div className="flex rounded-lg overflow-hidden border border-navy-light">
            <button
              onClick={() => { setCompType('lease'); setResults(null) }}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                compType === 'lease'
                  ? 'bg-gold text-navy-dark'
                  : 'bg-navy-light text-white hover:bg-navy'
              }`}
            >
              Lease
            </button>
            <button
              onClick={() => { setCompType('sale'); setResults(null) }}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                compType === 'sale'
                  ? 'bg-gold text-navy-dark'
                  : 'bg-navy-light text-white hover:bg-navy'
              }`}
            >
              Sale
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Stats */}
          <span className="text-xs text-white/70">
            {compType === 'lease'
              ? `${leaseStats?.count || 0} comps`
              : `${saleStats?.count || 0} comps`}
          </span>
          <button onClick={onClose} className="p-2 text-white/70 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Search Form */}
        <div className="w-72 border-r border-gray-200 p-4 overflow-y-auto">
          {compType === 'lease' ? (
            <form onSubmit={leaseForm.handleSubmit(handleLeaseSearch)} className="space-y-4">
              {/* Date Range */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Date Range</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">From</label>
                    <input
                      type="date"
                      {...leaseForm.register('startDate')}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">To</label>
                    <input
                      type="date"
                      {...leaseForm.register('endDate')}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                    />
                  </div>
                </div>
              </div>

              {/* Size */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Size (SF)</h3>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    {...leaseForm.register('minSf', { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    {...leaseForm.register('maxSf', { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                </div>
              </div>

              {/* Rent */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Rent ($/SF/Mo)</h3>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Min"
                    {...leaseForm.register('minRent', { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Max"
                    {...leaseForm.register('maxRent', { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Location</h3>
                <input
                  type="text"
                  placeholder="City"
                  {...leaseForm.register('city')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2"
                />
                <select
                  {...leaseForm.register('submarket')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                >
                  <option value="">All Submarkets</option>
                  {geographies?.map((geo) => (
                    <option key={geo.id} value={geo.name}>{geo.name}</option>
                  ))}
                </select>
              </div>

              {/* Lease Structure */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Lease Type</h3>
                <select
                  {...leaseForm.register('leaseStructure')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                >
                  {LEASE_STRUCTURES.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Tenant */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tenant</h3>
                <input
                  type="text"
                  placeholder="Search tenant name..."
                  {...leaseForm.register('tenant')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-teal text-white font-medium rounded hover:bg-teal/90 transition-colors"
              >
                Search Lease Comps
              </button>
            </form>
          ) : (
            <form onSubmit={saleForm.handleSubmit(handleSaleSearch)} className="space-y-4">
              {/* Date Range */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Date Range</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">From</label>
                    <input
                      type="date"
                      {...saleForm.register('startDate')}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">To</label>
                    <input
                      type="date"
                      {...saleForm.register('endDate')}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                    />
                  </div>
                </div>
              </div>

              {/* Size */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Size (SF)</h3>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    {...saleForm.register('minSf', { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    {...saleForm.register('maxSf', { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                </div>
              </div>

              {/* Price */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sale Price</h3>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Min $"
                    {...saleForm.register('minPrice', { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                  <input
                    type="number"
                    placeholder="Max $"
                    {...saleForm.register('maxPrice', { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                </div>
              </div>

              {/* Price PSF */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Price/SF</h3>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="1"
                    placeholder="Min $/SF"
                    {...saleForm.register('minPricePsf', { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                  <input
                    type="number"
                    step="1"
                    placeholder="Max $/SF"
                    {...saleForm.register('maxPricePsf', { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Location</h3>
                <input
                  type="text"
                  placeholder="City"
                  {...saleForm.register('city')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2"
                />
                <select
                  {...saleForm.register('submarket')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                >
                  <option value="">All Submarkets</option>
                  {geographies?.map((geo) => (
                    <option key={geo.id} value={geo.name}>{geo.name}</option>
                  ))}
                </select>
              </div>

              {/* Sale Type */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sale Type</h3>
                <select
                  {...saleForm.register('saleType')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                >
                  {SALE_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Buyer/Seller */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Parties</h3>
                <input
                  type="text"
                  placeholder="Buyer name..."
                  {...saleForm.register('buyer')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mb-2"
                />
                <input
                  type="text"
                  placeholder="Seller name..."
                  {...saleForm.register('seller')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-teal text-white font-medium rounded hover:bg-teal/90 transition-colors"
              >
                Search Sale Comps
              </button>
            </form>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Results Header */}
          {results && (
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedComps.size === results.length && results.length > 0}
                    onChange={selectAllComps}
                    className="rounded text-teal"
                  />
                  <span className="text-gray-600">
                    {selectedComps.size > 0 ? `${selectedComps.size} selected` : `${results.length} results`}
                  </span>
                </label>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px] z-50">
                    <button
                      onClick={handleExport}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      Export to PDF
                    </button>
                    <button
                      onClick={handleExport}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Send via Email
                    </button>
                    <button
                      onClick={handleExport}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      Send via Text
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={handleExport}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy to Clipboard
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Results Table */}
          <div className="flex-1 overflow-auto">
            {!results ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-lg font-medium">Search for Comps</p>
                  <p className="text-sm mt-1">Use the filters to find {compType} comparables</p>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-lg font-medium">No Results Found</p>
                  <p className="text-sm mt-1">Try adjusting your search criteria</p>
                </div>
              </div>
            ) : compType === 'lease' ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs font-semibold text-gray-500 uppercase">
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3 text-right">SF</th>
                    <th className="px-4 py-3 text-right">$/SF/Mo</th>
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(results as LeaseComp[]).map((comp) => (
                    <tr key={comp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedComps.has(comp.id)}
                          onChange={() => toggleCompSelection(comp.id)}
                          className="rounded text-teal"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{comp.property_address}</td>
                      <td className="px-4 py-3 text-gray-600">{comp.city}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatNumber(comp.leased_sf)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">${comp.starting_rent_psf ? Number(comp.starting_rent_psf).toFixed(2) : '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{comp.tenant_name || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                          {comp.lease_structure || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(comp.lease_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs font-semibold text-gray-500 uppercase">
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3 text-right">SF</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">$/SF</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(results as SaleComp[]).map((comp) => (
                    <tr key={comp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedComps.has(comp.id)}
                          onChange={() => toggleCompSelection(comp.id)}
                          className="rounded text-teal"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{comp.property_address}</td>
                      <td className="px-4 py-3 text-gray-600">{comp.city}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatNumber(comp.building_sf)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(comp.sale_price)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(comp.price_psf)}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                          {comp.sale_type || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(comp.sale_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && results && (
        <CompsExport
          comps={getCompsToExport()}
          compType={compType}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  )
}
