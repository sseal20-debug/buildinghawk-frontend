import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { alertsApi } from '@/api/client'
import type { Alert } from '@/types'

interface AlertsListProps {
  onClose: () => void
  onEntitySelect: (entityId: string) => void
  onUnitSelect: (unitId: string) => void
}

export function AlertsList({ onClose, onEntitySelect, onUnitSelect }: AlertsListProps) {
  const queryClient = useQueryClient()

  const { data: todayAlerts } = useQuery({
    queryKey: ['alerts', 'today'],
    queryFn: alertsApi.getToday,
  })

  const { data: upcomingAlerts } = useQuery({
    queryKey: ['alerts', 'upcoming'],
    queryFn: () => alertsApi.list({ upcoming_days: 30 }),
  })

  const completeMutation = useMutation({
    mutationFn: alertsApi.complete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
  })

  const snoozeMutation = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) => {
      const newDate = new Date()
      newDate.setDate(newDate.getDate() + days)
      return alertsApi.snooze(id, newDate.toISOString())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
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

          {alert.note && (
            <p className="mt-1 text-sm text-gray-600">{alert.note}</p>
          )}

          {alert.unit_address && (
            <button
              onClick={() => alert.unit_id && onUnitSelect(alert.unit_id)}
              className="mt-1 text-sm text-blue-600 hover:text-blue-700"
            >
              {alert.unit_address}
            </button>
          )}

          {/* Contact Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {alert.contact_mobile && (
              <a
                href={`tel:${alert.contact_mobile}`}
                className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-sm hover:bg-green-100"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call
              </a>
            )}
            {alert.contact_email && (
              <a
                href={`mailto:${alert.contact_email}`}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm hover:bg-blue-100"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email
              </a>
            )}
          </div>

          {/* Alert Actions */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => completeMutation.mutate(alert.id)}
              className="text-sm text-green-600 hover:text-green-700 font-medium"
            >
              Complete
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => snoozeMutation.mutate({ id: alert.id, days: 1 })}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              +1 day
            </button>
            <button
              onClick={() => snoozeMutation.mutate({ id: alert.id, days: 7 })}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              +1 week
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Alerts</h2>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Today's Alerts */}
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

        {/* Upcoming Alerts */}
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

        {/* Empty State */}
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
      </div>
    </div>
  )
}
