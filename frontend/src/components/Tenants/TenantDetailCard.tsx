import type { TenantSearchResult } from '@/api/client'

interface TenantDetailCardProps {
  tenant: TenantSearchResult | null
  onLocate?: (lat: number, lng: number) => void
}

export function TenantDetailCard({ tenant, onLocate }: TenantDetailCardProps) {
  if (!tenant) {
    return (
      <div className="w-[220px] border-r border-gray-200 flex-shrink-0 flex flex-col bg-white">
        {/* LinkedIn placeholder */}
        <div className="p-4 flex flex-col items-center text-center border-b border-gray-100">
          <div className="w-14 h-14 bg-[#0A66C2] rounded-lg flex items-center justify-center mb-3">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Link to LinkedIn page for employees & company
          </p>
        </div>

        {/* Empty detail card placeholder */}
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-gray-400 text-center">
            Click a tenant to view details
          </p>
        </div>
      </div>
    )
  }

  const linkedinCompanyUrl = tenant.linkedin_url ||
    `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(tenant.entity_name)}`
  const linkedinPeopleUrl =
    `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(tenant.entity_name)}`

  const officePct = tenant.unit_sf && tenant.office_sf
    ? Math.round((tenant.office_sf / tenant.unit_sf) * 100)
    : null

  return (
    <div className="w-[220px] border-r border-gray-200 flex-shrink-0 flex flex-col bg-white overflow-y-auto">
      {/* LinkedIn Link */}
      <div className="p-3 flex items-center gap-2 border-b border-gray-100">
        <a
          href={linkedinCompanyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 bg-[#0A66C2] rounded flex items-center justify-center flex-shrink-0 hover:bg-[#004182] transition-colors"
        >
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
        </a>
        <div className="flex-1 min-w-0">
          <a
            href={linkedinPeopleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#0A66C2] hover:underline leading-tight block"
          >
            Link to LinkedIn page for employees & company
          </a>
        </div>
      </div>

      {/* Tenant Detail Card */}
      <div className="p-3 border border-gray-200 rounded-lg m-3 shadow-sm">
        {/* Company Name */}
        <h3 className="text-sm font-bold text-navy-dark mb-1 leading-tight">
          {tenant.entity_name}
        </h3>
        {tenant.sic_description && (
          <p className="text-[10px] text-gray-500 mb-2">{tenant.sic_code} - {tenant.sic_description}</p>
        )}

        {/* Contact */}
        <div className="mb-2">
          <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Contact</h4>
          {tenant.primary_contact_name ? (
            <div className="space-y-0.5">
              <p className="text-xs text-gray-700 font-medium">{tenant.primary_contact_name}</p>
              {tenant.primary_contact_title && (
                <p className="text-[10px] text-gray-500">{tenant.primary_contact_title}</p>
              )}
              {tenant.primary_contact_email && (
                <p className="text-[10px] text-teal truncate">{tenant.primary_contact_email}</p>
              )}
              {(tenant.primary_contact_mobile || tenant.primary_contact_phone) && (
                <p className="text-[10px] text-gray-500">
                  {tenant.primary_contact_mobile || tenant.primary_contact_phone}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-gray-400 italic">No contact on file</p>
          )}
        </div>

        {/* Specs */}
        <div className="mb-2">
          <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Specs</h4>
          <div className="space-y-0.5 text-[10px] text-gray-600">
            <p>{tenant.street_address}, {tenant.city}</p>
            {tenant.unit_sf && <p>{tenant.unit_sf.toLocaleString()} SF</p>}
            {tenant.clear_height_ft && <p>{tenant.clear_height_ft}' Clear</p>}
            {tenant.dock_doors != null && tenant.dock_doors > 0 && <p>{tenant.dock_doors} Dock Doors</p>}
            {tenant.gl_doors != null && tenant.gl_doors > 0 && <p>{tenant.gl_doors} GL Doors</p>}
            {tenant.power_amps && <p>{tenant.power_amps} Amps</p>}
            {officePct != null && <p>{officePct}% Office</p>}
            {tenant.year_built && <p>Built {tenant.year_built}</p>}
            {tenant.lot_acres && <p>{tenant.lot_acres} Acres</p>}
          </div>
        </div>

        {/* Lease */}
        {(tenant.lease_start || tenant.lease_expiration || tenant.rent_psf_month) && (
          <div className="mb-2">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Lease</h4>
            <div className="space-y-0.5 text-[10px] text-gray-600">
              {tenant.lease_type && <p className="uppercase">{tenant.lease_type}</p>}
              {tenant.rent_psf_month && <p>${tenant.rent_psf_month.toFixed(2)} PSF/mo</p>}
              {tenant.lease_start && <p>Start: {new Date(tenant.lease_start).toLocaleDateString()}</p>}
              {tenant.lease_expiration && <p>Exp: {new Date(tenant.lease_expiration).toLocaleDateString()}</p>}
              {tenant.market_status && tenant.market_status !== 'stable' && (
                <p className="text-amber-600 font-medium capitalize">{tenant.market_status}</p>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {tenant.entity_notes && (
          <div className="mb-2">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Notes</h4>
            <p className="text-[10px] text-gray-600 leading-relaxed">{tenant.entity_notes}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1 pt-2 border-t border-gray-100">
          {/* Email */}
          {tenant.primary_contact_email && (
            <a
              href={`mailto:${tenant.primary_contact_email}`}
              className="w-7 h-7 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 transition-colors"
              title="Email"
            >
              <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </a>
          )}

          {/* LinkedIn */}
          <a
            href={linkedinCompanyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-7 h-7 flex items-center justify-center rounded bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 transition-colors"
            title="LinkedIn"
          >
            <svg className="w-3.5 h-3.5 text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>

          {/* Locate on Map */}
          {tenant.lat && tenant.lng && onLocate && (
            <button
              type="button"
              onClick={() => onLocate(tenant.lat!, tenant.lng!)}
              className="w-7 h-7 flex items-center justify-center rounded bg-teal/10 hover:bg-teal/20 transition-colors"
              title="View on Map"
            >
              <svg className="w-3.5 h-3.5 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}

          {/* Website */}
          {tenant.website && (
            <a
              href={tenant.website.startsWith('http') ? tenant.website : `https://${tenant.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-7 h-7 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 transition-colors"
              title="Website"
            >
              <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Employee & Data Source info */}
      {(tenant.employee_count || tenant.data_source) && (
        <div className="px-3 pb-3 space-y-1">
          {tenant.employee_count && (
            <p className="text-[10px] text-gray-500">
              <span className="font-medium">{tenant.employee_count.toLocaleString()}</span> employees
            </p>
          )}
          {tenant.data_source && (
            <p className="text-[10px] text-gray-400">
              Source: {tenant.data_source}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
