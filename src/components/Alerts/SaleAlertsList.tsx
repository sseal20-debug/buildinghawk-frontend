import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { saleAlertsApi } from '@/api/client'
import type { SaleAlert } from '@/api/client'

interface SaleAlertsListProps {
  onClose: () => void
  onParcelSelect?: (apn: string) => void
}

export function SaleAlertsList({ onClose, onParcelSelect }: SaleAlertsListProps) {
  const queryClient = useQueryClient()

  const { data: summary } = useQuery({
    queryKey: ['sale-alerts', 'summary'],
    queryFn: saleAlertsApi.getSummary,
  })

  const { data: recentAlerts, isLoading } = useQuery({
    queryKey: ['sale-alerts', 'list'],
    queryFn: () => saleAlertsApi.list({ days: 90 }),
  })

  const acknowledgeMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      saleAlertsApi.acknowledge(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-alerts'] })
    },
  })

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num)
  }

  const SaleAlertCard = ({ alert }: { alert: SaleAlert }) => (
    <div className={`bg-white rounded-lg border p-4 ${
      alert.priority === 'high' ? 'border-red-300 bg-red-50' : 'border-gray-200'
    } ${alert.acknowledged ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${
          alert.priority === 'high' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
        }`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <button
                onClick={() => onParcelSelect?.(alert.apn)}
                className="font-medium text-gray-900 hover:text-blue-600 truncate"
              >
                {alert.address || alert.apn}
              </button>
              <p className="text-sm text-gray-500">{alert.city}</p>
            </div>
            <span className="text-sm text-gray-500 whitespace-nowrap ml-2">
              {formatDate(alert.sale_date)}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div>
              <span className="text-gray-500">Sale Price:</span>
              <span className="ml-1 font-semibold text-green-700">
                {formatCurrency(alert.sale_price)}
              </span>
            </div>
            {alert.price_per_sf && (
              <div>
                <span className="text-gray-500">PSF:</span>
                <span className="ml-1 font-medium">${alert.price_per_sf.toFixed(2)}</span>
              </div>
            )}
            {alert.building_sf && (
              <div>
                <span className="text-gray-500">Size:</span>
                <span className="ml-1">{formatNumber(alert.building_sf)} SF</span>
              </div>
            )}
            {alert.price_vs_assessed && (
              <div>
                <span className="text-gray-500">vs Assessed:</span>
                <span className={`ml-1 ${alert.price_vs_assessed > 1.5 ? 'text-green-600' : ''}`}>
                  {(alert.price_vs_assessed * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>

          <div className="mt-2 text-sm">
            <div className="text-gray-600">
              <span className="text-gray-500">Buyer:</span> {alert.buyer || 'Unknown'}
            </div>
            <div className="text-gray-600">
              <span className="text-gray-500">Seller:</span> {alert.seller || 'Unknown'}
            </div>
          </div>

          {!alert.acknowledged && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => acknowledgeMutation.mutate({ id: alert.id })}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Acknowledge
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Sale Alerts</h2>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Watched Parcels:</span>
              <span className="ml-1 font-semibold">{formatNumber(summary.total_watched_parcels)}</span>
            </div>
            <div>
              <span className="text-gray-500">Sales (7d):</span>
              <span className="ml-1 font-semibold text-green-600">{summary.sales_last_7_days}</span>
            </div>
            <div>
              <span className="text-gray-500">Sales (30d):</span>
              <span className="ml-1 font-semibold">{summary.sales_last_30_days}</span>
            </div>
            <div>
              <span className="text-gray-500">Volume (30d):</span>
              <span className="ml-1 font-semibold">{formatCurrency(summary.total_volume_30_days || 0)}</span>
            </div>
          </div>
          {summary.unacknowledged_alerts > 0 && (
            <div className="mt-2 text-sm text-red-600 font-medium">
              {summary.unacknowledged_alerts} unacknowledged alert{summary.unacknowledged_alerts !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : recentAlerts && recentAlerts.length > 0 ? (
          recentAlerts.map((alert) => (
            <SaleAlertCard key={alert.id} alert={alert} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium">No recent sales</p>
            <p className="text-sm">Sales from watched parcels will appear here</p>
          </div>
        )}
      </div>
    </div>
  )
}
