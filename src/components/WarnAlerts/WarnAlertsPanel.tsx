import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { warnAlertsApi, type WarnAlert } from '../../api/client'

interface WarnAlertsPanelProps {
  onClose: () => void
}

const priorityColors = {
  HIGH: 'bg-red-500/20 text-red-300 border-red-500/30',
  MEDIUM: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  LOW: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
}

const priorityDots = {
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-orange-500',
  LOW: 'bg-yellow-500',
}

export function WarnAlertsPanel({ onClose }: WarnAlertsPanelProps) {
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('')

  const { data: statsData } = useQuery({
    queryKey: ['warn-stats'],
    queryFn: () => warnAlertsApi.getStats(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['warn-alerts', priorityFilter, typeFilter],
    queryFn: () => warnAlertsApi.getAll({
      priority: priorityFilter,
      property_type: typeFilter || undefined,
      sort: 'priority',
      limit: 100,
    }),
  })

  const alerts = data?.alerts || []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy-light">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <h2 className="text-white font-semibold text-base">WARN Layoff Alerts</h2>
        </div>
        <button
          onClick={onClose}
          className="text-white/50 hover:text-white transition-colors text-lg"
        >
          ✕
        </button>
      </div>

      {/* Stats Banner */}
      {statsData && (
        <div className="px-4 py-3 border-b border-navy-light bg-navy/50">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-xl font-bold text-white">{statsData.total}</div>
              <div className="text-[10px] text-white/50 uppercase">Total</div>
            </div>
            <div>
              <div className="text-xl font-bold text-red-400">{statsData.high_priority}</div>
              <div className="text-[10px] text-white/50 uppercase">High</div>
            </div>
            <div>
              <div className="text-xl font-bold text-orange-400">{statsData.total_employees.toLocaleString()}</div>
              <div className="text-[10px] text-white/50 uppercase">Employees</div>
            </div>
            <div>
              <div className="text-xl font-bold text-teal">{statsData.industrial_count}</div>
              <div className="text-[10px] text-white/50 uppercase">Industrial</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="px-4 py-2 border-b border-navy-light flex gap-2 flex-wrap">
        {['all', 'HIGH', 'MEDIUM', 'LOW'].map(p => (
          <button
            key={p}
            onClick={() => setPriorityFilter(p)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              priorityFilter === p
                ? 'bg-teal text-white'
                : 'bg-navy-light text-white/60 hover:text-white'
            }`}
          >
            {p === 'all' ? 'All' : p}
          </button>
        ))}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="ml-auto px-2 py-1 rounded text-xs bg-navy-light text-white/80 border-none"
        >
          <option value="">All Types</option>
          <option value="Industrial">Industrial</option>
          <option value="Office">Office</option>
          <option value="Retail">Retail</option>
          <option value="Flex">Flex</option>
        </select>
      </div>

      {/* Alert List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-white/50">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="p-4 text-center text-white/50">No alerts found</div>
        ) : (
          <div className="divide-y divide-navy-light">
            {alerts.map((alert: WarnAlert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-navy-light text-xs text-white/40 text-center">
        Source: California EDD WARN Act Reports
      </div>
    </div>
  )
}

function AlertCard({ alert }: { alert: WarnAlert }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="px-4 py-3 hover:bg-navy-light/50 cursor-pointer transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        {/* Priority dot */}
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${priorityDots[alert.priority]}`} />

        <div className="flex-1 min-w-0">
          {/* Company name */}
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm truncate">{alert.company}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityColors[alert.priority]}`}>
              {alert.priority}
            </span>
          </div>

          {/* Address */}
          <div className="text-white/60 text-xs mt-0.5">
            {alert.address}, {alert.city}
          </div>

          {/* Key stats */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-white/50">
            {alert.employees && (
              <span>{alert.employees.toLocaleString()} employees</span>
            )}
            {alert.est_sf && (
              <span>{alert.est_sf.toLocaleString()} SF</span>
            )}
            {alert.property_type && (
              <span className="text-teal/70">{alert.property_type}</span>
            )}
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-2 p-2 bg-navy/50 rounded text-xs space-y-1">
              {alert.layoff_type && (
                <div className="flex justify-between">
                  <span className="text-white/40">Type</span>
                  <span className="text-white/70">{alert.layoff_type}</span>
                </div>
              )}
              {alert.notice_date && (
                <div className="flex justify-between">
                  <span className="text-white/40">Notice Date</span>
                  <span className="text-white/70">{new Date(alert.notice_date).toLocaleDateString()}</span>
                </div>
              )}
              {alert.effective_date && (
                <div className="flex justify-between">
                  <span className="text-white/40">Effective Date</span>
                  <span className="text-white/70">{new Date(alert.effective_date).toLocaleDateString()}</span>
                </div>
              )}
              {alert.industry && (
                <div className="flex justify-between">
                  <span className="text-white/40">Industry</span>
                  <span className="text-white/70">{alert.industry}</span>
                </div>
              )}
              {alert.opportunity_notes && (
                <div className="mt-1 text-white/60 italic">{alert.opportunity_notes}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WarnAlertsPanel
