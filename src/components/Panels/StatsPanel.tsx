import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface MarketStats {
  avg_lease_rate: number
  avg_sale_price_psf: number
  vacancy_rate: number
  avg_cap_rate: number
  total_inventory_sf: number
  ytd_absorption_sf: number
  avg_days_on_market: number
  total_transactions: number
}

interface CityStats {
  city: string
  avg_lease_rate: number
  avg_sale_price_psf: number
  vacancy_rate: number
  inventory_sf: number
  recent_transactions: number
}

interface StatsPanelProps {
  onClose: () => void
}

const TIME_PERIODS = [
  { label: 'YTD', value: 'ytd' },
  { label: '1 Year', value: '1y' },
  { label: '2 Years', value: '2y' },
  { label: '5 Years', value: '5y' },
]

const CITIES = ['Anaheim', 'Orange', 'Fullerton', 'Brea', 'Placentia', 'La Habra', 'Yorba Linda']

export function StatsPanel({ onClose }: StatsPanelProps) {
  const [timePeriod, setTimePeriod] = useState('ytd')
  const [selectedCity, setSelectedCity] = useState<string | null>(null)

  // Fetch market stats from API
  const { data: marketData, isLoading: loadingMarket } = useQuery({
    queryKey: ['stats', 'market', timePeriod],
    queryFn: async () => {
      const res = await fetch(`/api/stats/market?period=${timePeriod}`)
      if (!res.ok) throw new Error('Failed to fetch market stats')
      return res.json() as Promise<MarketStats>
    },
  })

  // Fetch city stats from API
  const { data: cityData, isLoading: loadingCities } = useQuery({
    queryKey: ['stats', 'cities', timePeriod],
    queryFn: async () => {
      const res = await fetch(`/api/stats/cities?period=${timePeriod}`)
      if (!res.ok) throw new Error('Failed to fetch city stats')
      return res.json() as Promise<CityStats[]>
    },
  })

  const formatPercent = (val?: number) => val ? `${val.toFixed(1)}%` : '-'
  const formatRate = (val?: number) => val ? `$${val.toFixed(2)}` : '-'
  const formatSF = (val?: number) => val ? `${(val / 1000000).toFixed(2)}M SF` : '-'
  const formatNumber = (val?: number) => val ? val.toLocaleString() : '-'

  const isLoading = loadingMarket || loadingCities
  const cities = cityData || []

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#7c4dff] text-white border-b">
        <div>
          <h2 className="font-bold text-lg">Market Statistics</h2>
          <p className="text-xs opacity-80">North Orange County Industrial</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Time Period Filter */}
      <div className="p-4 border-b border-gray-200">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Time Period
        </label>
        <div className="flex gap-1">
          {TIME_PERIODS.map(period => (
            <button
              key={period.value}
              onClick={() => setTimePeriod(period.value)}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                timePeriod === period.value
                  ? 'bg-[#7c4dff] text-white font-medium'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-[#7c4dff] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {/* Market Overview */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#7c4dff]" />
                Market Overview
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Avg Lease Rate"
                  value={formatRate(marketData?.avg_lease_rate)}
                  unit="/SF/mo NNN"
                  color="green"
                />
                <StatCard
                  label="Avg Sale Price"
                  value={formatRate(marketData?.avg_sale_price_psf)}
                  unit="/SF"
                  color="blue"
                />
                <StatCard
                  label="Vacancy Rate"
                  value={formatPercent(marketData?.vacancy_rate)}
                  color="amber"
                />
                <StatCard
                  label="Avg Cap Rate"
                  value={formatPercent(marketData?.avg_cap_rate)}
                  color="purple"
                />
                <StatCard
                  label="Total Inventory"
                  value={formatSF(marketData?.total_inventory_sf)}
                  color="gray"
                />
                <StatCard
                  label="YTD Absorption"
                  value={formatSF(marketData?.ytd_absorption_sf)}
                  color="teal"
                />
                <StatCard
                  label="Avg Days on Market"
                  value={formatNumber(marketData?.avg_days_on_market)}
                  unit="days"
                  color="orange"
                />
                <StatCard
                  label="Transactions"
                  value={formatNumber(marketData?.total_transactions)}
                  color="indigo"
                />
              </div>
            </section>

            {/* City Breakdown */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#7c4dff]" />
                By City
              </h3>
              <div className="space-y-2">
                {cities.length === 0 ? (
                  <div className="text-center py-4 text-gray-400 text-sm">
                    City data not available
                  </div>
                ) : (
                  cities.map(city => (
                    <button
                      key={city.city}
                      onClick={() => setSelectedCity(selectedCity === city.city ? null : city.city)}
                      className={`w-full p-3 rounded-lg border transition-colors text-left ${
                        selectedCity === city.city
                          ? 'border-[#7c4dff] bg-[#7c4dff]/5'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">{city.city}</span>
                        <span className="text-xs text-gray-500">
                          {city.recent_transactions} transactions
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <div className="text-gray-500">Lease</div>
                          <div className="font-medium text-green-700">{formatRate(city.avg_lease_rate)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500">Sale</div>
                          <div className="font-medium text-blue-700">{formatRate(city.avg_sale_price_psf)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500">Vacancy</div>
                          <div className="font-medium text-amber-700">{formatPercent(city.vacancy_rate)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500">Inventory</div>
                          <div className="font-medium">{(city.inventory_sf / 1000000).toFixed(1)}M SF</div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            {/* Placeholder for Charts */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#7c4dff]" />
                Trends
              </h3>
              <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-400">
                <span className="text-3xl mb-2 block">📈</span>
                <span className="text-sm">Charts coming soon</span>
                <p className="text-xs mt-1">Lease rates, vacancy, and transaction trends</p>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 flex gap-2">
        <button className="flex-1 px-4 py-2 bg-[#7c4dff] text-white text-sm font-medium rounded-lg hover:bg-[#651fff] transition-colors">
          Export Report
        </button>
        <button className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">
          Refresh
        </button>
      </div>
    </div>
  )
}

// Stat Card Component
function StatCard({
  label,
  value,
  unit,
  color = 'gray',
}: {
  label: string
  value: string
  unit?: string
  color?: 'green' | 'blue' | 'amber' | 'purple' | 'gray' | 'teal' | 'orange' | 'indigo'
}) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
    amber: 'bg-amber-50 border-amber-200',
    purple: 'bg-purple-50 border-purple-200',
    gray: 'bg-gray-50 border-gray-200',
    teal: 'bg-teal-50 border-teal-200',
    orange: 'bg-orange-50 border-orange-200',
    indigo: 'bg-indigo-50 border-indigo-200',
  }

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="font-bold text-lg text-gray-900">
        {value}
        {unit && <span className="text-xs font-normal text-gray-500 ml-1">{unit}</span>}
      </div>
    </div>
  )
}

export type { MarketStats, CityStats }
