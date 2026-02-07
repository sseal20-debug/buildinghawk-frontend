import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  notificationsApi,
  type NotificationConfig,
  type NotificationLogEntry,
} from '../../api/client'

const ALERT_TYPES = [
  { value: 'new_listing', label: 'New Listing' },
  { value: 'price_change', label: 'Price Change' },
  { value: 'sold', label: 'Sold' },
  { value: 'leased', label: 'Leased' },
  { value: 'escrow', label: 'Escrow' },
  { value: 'lease_expiration', label: 'Lease Expiration' },
] as const

const alertTypeBadgeColors: Record<string, string> = {
  new_listing: 'bg-green-500/20 text-green-300 border-green-500/30',
  price_change: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  sold: 'bg-red-500/20 text-red-300 border-red-500/30',
  leased: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  escrow: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  lease_expiration: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
}

interface NotificationSettingsProps {
  onClose: () => void
}

export function NotificationSettings({ onClose }: NotificationSettingsProps) {
  const queryClient = useQueryClient()
  const [logOpen, setLogOpen] = useState(false)
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // --- New config form state ---
  const [newChannel, setNewChannel] = useState<'email' | 'sms'>('email')
  const [newDestination, setNewDestination] = useState('')
  const [newAlertTypes, setNewAlertTypes] = useState<string[]>([])

  // --- Queries ---
  const { data: configsData, isLoading: configsLoading } = useQuery({
    queryKey: ['notification-configs'],
    queryFn: notificationsApi.getConfigs,
  })

  const { data: logData, isLoading: logLoading } = useQuery({
    queryKey: ['notification-log'],
    queryFn: () => notificationsApi.getLog(20),
    enabled: logOpen,
  })

  const configs = configsData?.configs || []
  const logEntries = logData?.log || []

  // --- Mutations ---
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NotificationConfig> }) =>
      notificationsApi.updateConfig(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-configs'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.deleteConfig(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-configs'] }),
  })

  const createMutation = useMutation({
    mutationFn: (data: Partial<NotificationConfig>) => notificationsApi.createConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-configs'] })
      setNewDestination('')
      setNewAlertTypes([])
      setNewChannel('email')
    },
  })

  const testMutation = useMutation({
    mutationFn: () => notificationsApi.sendTest(),
    onSuccess: () => {
      setTestMessage({ type: 'success', text: 'Test notification sent successfully.' })
      setTimeout(() => setTestMessage(null), 4000)
    },
    onError: () => {
      setTestMessage({ type: 'error', text: 'Failed to send test notification.' })
      setTimeout(() => setTestMessage(null), 4000)
    },
  })

  // --- Handlers ---
  const toggleAlertType = (value: string) => {
    setNewAlertTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    )
  }

  const handleCreate = () => {
    if (!newDestination.trim() || newAlertTypes.length === 0) return
    createMutation.mutate({
      channel: newChannel,
      destination: newDestination.trim(),
      alert_types: newAlertTypes,
      is_enabled: true,
    })
  }

  const handleToggleEnabled = (config: NotificationConfig) => {
    updateMutation.mutate({ id: config.id, data: { is_enabled: !config.is_enabled } })
  }

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  // --- Render ---
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy-light">
        <div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <h2 className="text-white font-semibold text-base">Notification Settings</h2>
          </div>
          <p className="text-white/40 text-xs mt-1 pl-7">
            Get alerts for new listings, price changes, and status updates
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-white/50 hover:text-white transition-colors text-lg"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6">
        {/* ===== Active Configurations ===== */}
        <section>
          <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-2">
            Active Configurations
          </h3>

          {configsLoading && (
            <p className="text-white/40 text-sm">Loading...</p>
          )}

          {!configsLoading && configs.length === 0 && (
            <p className="text-white/40 text-sm">No notification configs yet. Add one below.</p>
          )}

          <div className="space-y-2">
            {configs.map((cfg) => (
              <div
                key={cfg.id}
                className="bg-navy-light/50 rounded-lg p-3 border border-navy-light flex items-start gap-3"
              >
                {/* Channel icon */}
                <div className="mt-0.5 shrink-0">
                  {cfg.channel === 'email' ? (
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">
                    {cfg.destination}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {cfg.alert_types.map((at) => (
                      <span
                        key={at}
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${alertTypeBadgeColors[at] || 'bg-white/10 text-white/60 border-white/10'}`}
                      >
                        {at.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => handleToggleEnabled(cfg)}
                  className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${
                    cfg.is_enabled ? 'bg-teal' : 'bg-white/20'
                  }`}
                  title={cfg.is_enabled ? 'Enabled - click to disable' : 'Disabled - click to enable'}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      cfg.is_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>

                {/* Delete */}
                <button
                  onClick={() => deleteMutation.mutate(cfg.id)}
                  className="shrink-0 text-white/30 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ===== Add New ===== */}
        <section>
          <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-2">
            Add New
          </h3>

          <div className="bg-navy-light/50 rounded-lg p-3 border border-navy-light space-y-3">
            {/* Channel + destination row */}
            <div className="flex gap-2">
              <select
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value as 'email' | 'sms')}
                className="bg-navy border border-navy-light rounded px-2 py-1.5 text-white text-sm outline-none focus:border-teal"
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
              <input
                type={newChannel === 'email' ? 'email' : 'tel'}
                value={newDestination}
                onChange={(e) => setNewDestination(e.target.value)}
                placeholder={newChannel === 'email' ? 'you@example.com' : '+1 555-123-4567'}
                className="flex-1 bg-navy border border-navy-light rounded px-2 py-1.5 text-white text-sm placeholder-white/30 outline-none focus:border-teal"
              />
            </div>

            {/* Alert type checkboxes */}
            <div>
              <p className="text-white/50 text-xs mb-1.5">Alert types:</p>
              <div className="flex flex-wrap gap-2">
                {ALERT_TYPES.map((at) => {
                  const checked = newAlertTypes.includes(at.value)
                  return (
                    <label
                      key={at.value}
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded cursor-pointer border transition-colors ${
                        checked
                          ? alertTypeBadgeColors[at.value] || 'bg-teal/20 text-teal border-teal/30'
                          : 'bg-navy border-navy-light text-white/50 hover:text-white/70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAlertType(at.value)}
                        className="sr-only"
                      />
                      {at.label}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleCreate}
              disabled={!newDestination.trim() || newAlertTypes.length === 0 || createMutation.isPending}
              className="w-full bg-teal hover:bg-teal/80 disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-medium rounded py-1.5 transition-colors"
            >
              {createMutation.isPending ? 'Adding...' : 'Add Configuration'}
            </button>
          </div>
        </section>

        {/* ===== Test Notifications ===== */}
        <section>
          <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-2">
            Test Notifications
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-medium rounded px-4 py-1.5 transition-colors"
            >
              {testMutation.isPending ? 'Sending...' : 'Send Test'}
            </button>
            {testMessage && (
              <span
                className={`text-xs ${
                  testMessage.type === 'success' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {testMessage.text}
              </span>
            )}
          </div>
        </section>

        {/* ===== Recent Activity (collapsible) ===== */}
        <section>
          <button
            onClick={() => setLogOpen((prev) => !prev)}
            className="flex items-center gap-1.5 text-white/70 text-xs font-semibold uppercase tracking-wider hover:text-white transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${logOpen ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Recent Activity
          </button>

          {logOpen && (
            <div className="mt-2">
              {logLoading && <p className="text-white/40 text-sm">Loading log...</p>}

              {!logLoading && logEntries.length === 0 && (
                <p className="text-white/40 text-sm">No recent notifications.</p>
              )}

              {!logLoading && logEntries.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-white/40 text-left border-b border-navy-light">
                        <th className="pb-1.5 pr-2 font-medium">Time</th>
                        <th className="pb-1.5 pr-2 font-medium">Channel</th>
                        <th className="pb-1.5 pr-2 font-medium">Type</th>
                        <th className="pb-1.5 pr-2 font-medium">Destination</th>
                        <th className="pb-1.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-light/50">
                      {logEntries.map((entry: NotificationLogEntry) => (
                        <tr key={entry.id} className="text-white/70">
                          <td className="py-1.5 pr-2 whitespace-nowrap">
                            {entry.sent_at ? formatTimestamp(entry.sent_at) : formatTimestamp(entry.created_at)}
                          </td>
                          <td className="py-1.5 pr-2 capitalize">{entry.channel}</td>
                          <td className="py-1.5 pr-2">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded border text-[10px] ${
                                alertTypeBadgeColors[entry.alert_type] || 'bg-white/10 text-white/60 border-white/10'
                              }`}
                            >
                              {entry.alert_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 truncate max-w-[120px]">{entry.destination}</td>
                          <td className="py-1.5">
                            {entry.status === 'sent' ? (
                              <span className="text-green-400 font-medium">sent</span>
                            ) : entry.status === 'failed' ? (
                              <span className="text-red-400 font-medium" title={entry.error_message || undefined}>
                                failed
                              </span>
                            ) : (
                              <span className="text-white/40">{entry.status}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
