import { useQuery } from '@tanstack/react-query'
import { unitsApi } from '@/api/client'
import type { Unit } from '@/types'

interface UnitDetailProps {
  unitId: string
  onBack: () => void
  onEdit: (unit: Unit) => void
}

export function UnitDetail({ unitId, onBack, onEdit }: UnitDetailProps) {
  const { data: unit, isLoading } = useQuery({
    queryKey: ['unit', unitId],
    queryFn: () => unitsApi.get(unitId),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!unit) {
    return <div className="text-center py-8 text-gray-500">Unit not found</div>
  }

  const formatNumber = (n: number | undefined | null) =>
    n ? n.toLocaleString() : '—'

  const formatCurrency = (n: number | undefined | null) =>
    n ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

  const occupancy = unit.current_occupancy

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {unit.street_address}
            </h2>
            <div className="flex items-center gap-2">
              <span
                className={`badge ${
                  unit.unit_status === 'occupied'
                    ? 'badge-green'
                    : unit.unit_status === 'vacant'
                    ? 'badge-red'
                    : 'badge-gray'
                }`}
              >
                {unit.unit_status.charAt(0).toUpperCase() + unit.unit_status.slice(1)}
              </span>
              {occupancy && (
                <span className="text-sm text-gray-500">{occupancy.entity_name}</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => onEdit(unit)}
          className="btn btn-primary"
        >
          Edit
        </button>
      </div>

      {/* Size Section */}
      <Section title="Size">
        <DataRow label="Total SF" value={formatNumber(unit.unit_sf)} />
        <DataRow label="Warehouse SF" value={formatNumber(unit.warehouse_sf)} />
        <DataRow label="Office SF" value={formatNumber(unit.office_sf)} />
      </Section>

      {/* Features Section */}
      <Section title="Features">
        <DataRow label="Clear Height" value={unit.clear_height_ft ? `${unit.clear_height_ft}'` : '—'} />
        <DataRow label="Dock Doors" value={unit.dock_doors?.toString() || '0'} />
        <DataRow label="GL Doors" value={unit.gl_doors?.toString() || '0'} />
        <DataRow label="Power" value={unit.power_amps ? `${unit.power_amps}A @ ${unit.power_volts}` : '—'} />
        <DataRow
          label="Fenced Yard"
          value={
            unit.fenced_yard
              ? unit.yard_sf
                ? `Yes (${formatNumber(unit.yard_sf)} SF)`
                : 'Yes'
              : 'No'
          }
        />
      </Section>

      {/* Availability Section */}
      <Section title="Availability">
        <DataRow label="For Sale" value={unit.for_sale ? 'Yes' : 'No'} />
        <DataRow label="For Lease" value={unit.for_lease ? 'Yes' : 'No'} />
        {unit.for_sale && (
          <DataRow label="Asking Price" value={formatCurrency(unit.asking_sale_price)} />
        )}
        {unit.for_lease && (
          <DataRow label="Asking Lease Rate" value={unit.asking_lease_rate ? `${formatCurrency(unit.asking_lease_rate)}/SF/mo` : '—'} />
        )}
      </Section>

      {/* Current Occupancy */}
      {occupancy && (
        <Section title="Current Occupancy">
          <DataRow label="Tenant" value={occupancy.entity_name || '—'} />
          <DataRow
            label="Type"
            value={
              occupancy.occupant_type === 'owner_user'
                ? 'Owner-User'
                : occupancy.occupant_type === 'tenant'
                ? 'Tenant'
                : 'Investor'
            }
          />
          <DataRow
            label="Market Status"
            value={occupancy.market_status ? occupancy.market_status.charAt(0).toUpperCase() + occupancy.market_status.slice(1) : '—'}
            highlight={occupancy.market_status !== 'stable'}
          />
          <DataRow label="Lease Expiration" value={occupancy.lease_expiration || '—'} />
          <DataRow label="Rent (PSF/mo)" value={formatCurrency(occupancy.rent_psf_month)} />
          <DataRow label="Rent (Total/mo)" value={formatCurrency(occupancy.rent_total_month)} />
          <DataRow
            label="Lease Type"
            value={
              occupancy.lease_type === 'nnn'
                ? 'NNN'
                : occupancy.lease_type === 'gross'
                ? 'Gross'
                : occupancy.lease_type === 'modified_gross'
                ? 'Modified Gross'
                : '—'
            }
          />
          {occupancy.lease_type === 'nnn' && occupancy.nnn_fees_month && (
            <DataRow label="NNN Fees/mo" value={formatCurrency(occupancy.nnn_fees_month)} />
          )}
        </Section>
      )}

      {/* Notes */}
      {unit.notes && (
        <Section title="Notes">
          <p className="text-gray-700 text-sm whitespace-pre-wrap">{unit.notes}</p>
        </Section>
      )}

      {/* Actions */}
      <div className="pt-4 border-t border-gray-200 space-y-2">
        {!occupancy && unit.unit_status === 'vacant' && (
          <button className="w-full btn btn-primary">+ Add Tenant</button>
        )}
        <button className="w-full btn btn-secondary">View History</button>
        <button className="w-full btn btn-secondary">Set Alert</button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="font-medium text-gray-900 mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DataRow({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <span
        className={`text-sm font-medium ${
          highlight ? 'text-blue-600' : 'text-gray-900'
        }`}
      >
        {value}
      </span>
    </div>
  )
}
