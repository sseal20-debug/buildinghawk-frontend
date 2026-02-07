import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { alertsApi, saleAlertsApi } from '@/api/client'
import type { Alert } from '@/types'
import type { SaleAlert } from '@/api/client'

interface AlertsListProps {
  onClose: () => void
  onEntitySelect: (entityId: string) => void
  onUnitSelect: (unitId: string) => void
  onParcelSelect?: (apn: string) => void
}

export function AlertsList({ onClose, onEntitySelect, onUnitSelect, onParcelSelect }: AlertsListProps) {
  const [activeTab, setActiveTab] = useState<'crm' | 'sales'>('sales')
  const queryClient = useQueryClient()

  // CRM Alerts queries
  const { data: todayAlerts } = useQuery({
    queryKey: ['alerts', 'today'],
    queryFn: alertsApi.getToday,
  })

  const { data: upcomingAlerts } = useQuery({
    queryKey: ['alerts', 'upcoming'],
    queryFn: () => alertsApi.list({ upcoming_days: 30 }),
  })

  // Sale Alerts queries
  const { data: saleAlertsSummary } = useQuery({
    queryKey: ['sale-alerts', 'summary'],
    queryFn: saleAlertsApi.getSummary,
  })

  const { data: recentSaleAlerts, isLoading: salesLoading } = useQuery({
    queryKey: ['sale-alerts', 'list'],
    queryFn: () => saleAlertsApi.list({ days: 90 }),
  })

  // Mutations
  const completeMutation = useMutation({
    mutationFn: alertsApi.complete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const snoozeMutation = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) => {
      const newDate = new Date()
      newDate.setDate(newDate.getDate() + days)
      return alertsApi.snooze(id, newDate.toISOString())
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const acknowledgeMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      saleAlertsApi.acknowledge(id, notes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sale-alerts'] }),
  })

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'call':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        )
      case 'email':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )
      case 'lease_expiration':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        )
    }
  }

  // Sale alert unacknowledged count (for badge)
  const unacknowledgedCount = recentSaleAlerts?.filter((a: SaleAlert) => !a.acknowledged).length || 0

  const AlertCard = ({ alert }: { alert: Alert }) => (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${
          alert.alert_type === 'call' ? 'bg-green-100 text-green-600' :
          alert.alert_type === 'email' ? 'bg-blue-100 text-blue-600' :
          alert.alert_type === 'lease_expiration' ? 'bg-yellow-100 text-yellow-600' :
          'bg-gray-100 text-gray-600'
        }`}>
          {getAlertIcon(alert.alert_type)}
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              {alert.entity_name && (
                <button
                  onClick={() => alert.entity_id && onEntitySelect(alert.entity_id)}
                  className="font-medium text-gray-900 hover:text-blue-600"
                >
                  {alert.entity_name}
                </button>
              )}
              {alert.contact_name && (
                <p className="text-sm text-gray-500">{alert.contact_name}</p>
              )}
            </div>
            <span className="text-sm text-gray-500">{formatDate(alert.alert_date)}</span>
          </div>
          {alert.note && <p className="mt-1 text-sm text-gray-600">{alert.note}</p>}
          {alert.unit_address && (
            <button
              onClick={() => alert.unit_id && onUnitSelect(alert.unit_id)}
              className="mt-1 text-sm text-blue-600 hover:text-blue-700"
            >
              {alert.unit_address}
            </button>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {alert.contact_mobile && (
              <a href={`tel:${alert.contact_mobile}`} className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-sm hover:bg-green-100">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                Call
              </a>
            )}
            {alert.contact_email && (
              <a href={`mailto:${alert.contact_email}`} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm hover:bg-blue-100">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                Email
              </a>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => completeMutation.mutate(alert.id)} className="text-sm text-green-600 hover:text-green-700 font-medium">Complete</button>
            <span className="text-gray-300">|</span>
            <button onClick={() => snoozeMutation.mutate({ id: alert.id, days: 1 })} className="text-sm text-gray-500 hover:text-gray-700">+1 day</button>
            <button onClick={() => snoozeMutation.mutate({ id: alert.id, days: 7 })} className="text-sm text-gray-500 hover:text-gray-700">+1 week</button>
          </div>
        </div>
      </div>
    </div>
  )

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
                {alert.sale_price ? formatCurrency(alert.sale_price) : 'N/A'}
              </span>
            </div>
            {alert.price_per_sf && (
              <div>
                <span className="text-gray-500">$/SF:</span>
                <span className="ml-1 font-medium">{formatCurrency(alert.price_per_sf)}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">Seller:</span>
              <span className="ml-1 text-gray-700 truncate">{alert.seller || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-gray-500">Buyer:</span>
              <span className="ml-1 text-gray-700 truncate">{alert.buyer || 'Unknown'}</span>
            </div>
            {alert.building_sf && (
              <div>
                <span className="text-gray-500">Size:</span>
                <span className="ml-1">{new Intl.NumberFormat('en-US').format(alert.building_sf)} SF</span>
              </div>
            )}
            {alert.price_vs_assessed && (
              <div>
                <span className="text-gray-500">vs Assessed:</span>
                <span className={`ml-1 font-medium ${alert.price_vs_assessed > 1.5 ? 'text-red-600' : 'text-gray-700'}`}>
                  {alert.price_vs_assessed}x
                </span>
              </div>
            )}
          </div>

          {!alert.acknowledged && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => acknowledgeMutation.mutate({ id: alert.id })}
                className="text-sm text-green-600 hover:text-green-700 font-medium"
              >
                Acknowledge
              </button>
              <button
                onClick={() => {
                  const notes = prompt('Add notes about this sale:')
                  if (notes !== null) {
                    acknowledgeMutation.mutate({ id: alert.id, notes })
                  }
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                + Note
              </button>
            </div>
          )}
          {alert.notes && (
            <p className="mt-2 text-xs text-gray-500 italic">Note: {alert.notes}</p>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Alerts</h2>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('sales')}
          className={`flex-1 py-3 text-sm font-medium text-center relative ${
            activeTab === 'sales'
              ? 'text-red-600 border-b-2 border-red-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Deed Sales
          {unacknowledgedCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold text-white bg-red-500 rounded-full">
              {unacknowledgedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('crm')}
          className={`flex-1 py-3 text-sm font-medium text-center ${
            activeTab === 'crm'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          CRM Alerts
          {todayAlerts && todayAlerts.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold text-white bg-blue-500 rounded-full">
              {todayAlerts.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'sales' && (
          <>
            {/* Summary Dashboard */}
            {saleAlertsSummary && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{Number(saleAlertsSummary.total_watched_parcels || 0).toLocaleString()}</p>
                  <p className="text-xs text-blue-600">Parcels Watched</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{saleAlertsSummary.unacknowledged_alerts || 0}</p>
                  <p className="text-xs text-red-600">Unread Alerts</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{saleAlertsSummary.sales_last_30_days || 0}</p>
                  <p className="text-xs text-green-600">Sales (30d)</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">
                    {saleAlertsSummary.total_volume_30_days ? formatCurrency(Number(saleAlertsSummary.total_volume_30_days)) : '$0'}
                  </p>
                  <p className="text-xs text-purple-600">Volume (30d)</p>
                </div>
              </div>
            )}

            {/* Last Monitor Run */}
            {saleAlertsSummary?.last_successful_run && (
              <p className="text-xs text-gray-400 text-center mb-2">
                Last scan: {new Date(saleAlertsSummary.last_successful_run).toLocaleString()}
              </p>
            )}

            {/* Sale Alert Cards */}
            {salesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : recentSaleAlerts && recentSaleAlerts.length > 0 ? (
              <div className="space-y-3">
                {recentSaleAlerts.map((alert: SaleAlert) => (
                  <SaleAlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-medium">No recent sales detected</p>
                <p className="text-sm">Monitoring 3,493 industrial parcels in North OC</p>
                <p className="text-xs text-gray-400 mt-2">Scans run daily at 6:00 AM</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'crm' && (
          <>
            {todayAlerts && todayAlerts.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-600 uppercase tracking-wide mb-3">
                  Due Today ({todayAlerts.length})
                </h3>
                <div className="space-y-3">
                  {todayAlerts.map((alert) => (
                    <AlertCard key={alert.id} alert={alert} />
                  ))}
                </div>
              </div>
            )}

            {upcomingAlerts && upcomingAlerts.filter(a =>
              !todayAlerts?.some(t => t.id === a.id)
            ).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide mb-3">
                  Upcoming
                </h3>
                <div className="space-y-3">
                  {upcomingAlerts
                    .filter(a => !todayAlerts?.some(t => t.id === a.id))
                    .map((alert) => (
                      <AlertCard key={alert.id} alert={alert} />
                    ))}
                </div>
              </div>
            )}

            {(!todayAlerts || todayAlerts.length === 0) &&
             (!upcomingAlerts || upcomingAlerts.length === 0) && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-medium">All caught up!</p>
                <p className="text-sm">No pending alerts</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
