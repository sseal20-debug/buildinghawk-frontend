import { useState, useEffect } from 'react'
import type { LeaseComp, SaleComp } from '@/api/client'
import { compsApi } from '@/api/client'

type CompType = 'lease' | 'sale'
type ExportFormat = 'pdf' | 'email' | 'text' | 'clipboard'

interface CompsExportProps {
  comps: LeaseComp[] | SaleComp[]
  compType: CompType
  onClose: () => void
}

interface ExportOptions {
  includeAddress: boolean
  includeSize: boolean
  includeRent: boolean
  includePrice: boolean
  includeTenant: boolean
  includeBuyer: boolean
  includeDate: boolean
  includeNotes: boolean
  includeBuildingDetails: boolean
  includePhotos: boolean
  format: 'table' | 'detailed'
}

interface PhotoData {
  id: string
  url: string | null
  type: string
  source: string
  address?: string
}

const DEFAULT_OPTIONS: ExportOptions = {
  includeAddress: true,
  includeSize: true,
  includeRent: true,
  includePrice: true,
  includeTenant: true,
  includeBuyer: true,
  includeDate: true,
  includeNotes: false,
  includeBuildingDetails: true,
  includePhotos: true,
  format: 'detailed',
}

export function CompsExport({ comps, compType, onClose }: CompsExportProps) {
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf')
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_OPTIONS)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState(
    `${compType === 'lease' ? 'Lease' : 'Sale'} Comps Report - ${new Date().toLocaleDateString()}`
  )
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [photos, setPhotos] = useState<Record<string, PhotoData>>({})
  const [loadingPhotos, setLoadingPhotos] = useState(false)

  // Load photos when component mounts
  useEffect(() => {
    const loadPhotos = async () => {
      if (comps.length === 0 || !options.includePhotos) return

      setLoadingPhotos(true)
      try {
        const ids = comps.map(c => c.id)
        const photoData = await compsApi.getCompPhotos(compType, ids)
        const photoMap: Record<string, PhotoData> = {}
        photoData.forEach(p => {
          photoMap[p.id] = p
        })
        setPhotos(photoMap)
      } catch (err) {
        console.error('Failed to load photos:', err)
      } finally {
        setLoadingPhotos(false)
      }
    }
    loadPhotos()
  }, [comps, compType, options.includePhotos])

  const formatCurrency = (value?: number | string) => {
    if (value === undefined || value === null) return '-'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value))
  }

  const formatNumber = (value?: number | string) => {
    if (value === undefined || value === null) return '-'
    return new Intl.NumberFormat('en-US').format(Number(value))
  }

  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatPsf = (value?: number | string) => {
    if (value === undefined || value === null) return '-'
    return `$${Number(value).toFixed(2)}`
  }

  const generateTextContent = (): string => {
    const lines: string[] = []
    lines.push(`${compType === 'lease' ? 'LEASE' : 'SALE'} COMPARABLES REPORT`)
    lines.push(`Generated: ${new Date().toLocaleDateString()}`)
    lines.push(`Total: ${comps.length} comps`)
    lines.push('')
    lines.push('=' .repeat(60))
    lines.push('')

    if (compType === 'lease') {
      (comps as LeaseComp[]).forEach((comp, index) => {
        lines.push(`${index + 1}. ${comp.property_address}`)
        if (options.includeAddress) lines.push(`   ${comp.city}, ${comp.state || 'CA'} ${comp.zip || ''}`)
        lines.push(`   Market/Submarket: ${comp.submarket || '-'}`)
        if (options.includeSize) {
          lines.push(`   Lease SF: ${formatNumber(comp.leased_sf)}`)
          lines.push(`   Office SF: ${formatNumber(comp.office_sf)}`)
          lines.push(`   Building SF: ${formatNumber(comp.building_sf)}`)
        }
        if (options.includeRent) {
          lines.push(`   Rent PSF: ${formatPsf(comp.starting_rent_psf)}`)
          lines.push(`   Rent Type: ${comp.lease_structure || '-'}`)
        }
        if (options.includeBuildingDetails) {
          lines.push(`   Year Built: ${comp.year_built || '-'}`)
          lines.push(`   Term: ${comp.lease_term_months ? `${comp.lease_term_months} months` : '-'}`)
          lines.push(`   Free Rent: ${comp.free_rent_months ? `${comp.free_rent_months} months` : '-'}`)
          lines.push(`   TIs: ${comp.ti_allowance_psf ? formatPsf(comp.ti_allowance_psf) : '-'}`)
          lines.push(`   DH: ${(comp as any).dock_doors || '-'} | GL: ${(comp as any).gl_doors || '-'}`)
          lines.push(`   Clear Height: ${(comp as any).clear_height_ft ? `${(comp as any).clear_height_ft}'` : '-'}`)
        }
        if (options.includeTenant) lines.push(`   Tenant: ${comp.tenant_name || '-'}`)
        if (options.includeDate) lines.push(`   Lease Date: ${formatDate(comp.lease_date)}`)
        if (options.includeNotes && comp.notes) lines.push(`   Comments: ${comp.notes}`)
        lines.push('')
      })
    } else {
      (comps as SaleComp[]).forEach((comp, index) => {
        lines.push(`${index + 1}. ${comp.property_address}`)
        if (options.includeAddress) lines.push(`   ${comp.city}, ${comp.state || 'CA'} ${comp.zip || ''}`)
        if (options.includePrice) {
          lines.push(`   Sale Price: ${formatCurrency(comp.sale_price)}`)
          lines.push(`   Sale Price PSF: ${formatPsf(comp.price_psf)}`)
        }
        if (options.includeSize) {
          lines.push(`   Building SF: ${formatNumber(comp.building_sf)}`)
          lines.push(`   Land Area: ${comp.land_acres ? `${Number(comp.land_acres).toFixed(2)} acres` : '-'}`)
        }
        if (options.includeBuyer) {
          lines.push(`   Buyer: ${comp.buyer_name || '-'}`)
          lines.push(`   Seller: ${comp.seller_name || '-'}`)
        }
        if (options.includeDate) lines.push(`   Sale Date: ${formatDate(comp.sale_date)}`)
        if (options.includeNotes && comp.notes) lines.push(`   Comments: ${comp.notes}`)
        lines.push('')
      })
    }

    return lines.join('\n')
  }

  // Generate Google Street View URL for a given address
  const getStreetViewUrl = (address: string, city: string, state: string = 'CA', zip: string = '') => {
    const fullAddress = encodeURIComponent(`${address}, ${city}, ${state} ${zip}`)
    // Using a placeholder image with address text for demo - in production use actual Google API key
    return `https://maps.googleapis.com/maps/api/streetview?size=800x400&location=${fullAddress}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}`
  }

  // Generate HTML matching the PowerPoint template format - 1 comp per page with photo
  const generateHtmlContent = (): string => {
    const styles = `
      <style>
        @page {
          size: letter landscape;
          margin: 0.4in;
        }
        @media print {
          .page {
            page-break-after: always;
            page-break-inside: avoid;
          }
          .page:last-child {
            page-break-after: auto;
          }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
          background: white;
          color: #1e293b;
          font-size: 11px;
          line-height: 1.4;
        }
        .page {
          width: 10.5in;
          height: 7.5in;
          padding: 0.3in;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 10px;
          border-bottom: 3px solid #1a365d;
          margin-bottom: 15px;
        }
        .header-title {
          font-size: 20px;
          font-weight: 700;
          color: #1a365d;
        }
        .header-subtitle {
          font-size: 11px;
          color: #64748b;
        }
        .logo {
          font-size: 16px;
          font-weight: 700;
          color: #1a365d;
          letter-spacing: 1px;
        }
        .comp-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .photo-section {
          height: 220px;
          background: #f1f5f9;
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .photo-section img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .photo-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          gap: 8px;
        }
        .photo-placeholder svg {
          width: 48px;
          height: 48px;
        }
        .comp-content {
          flex: 1;
          display: flex;
          gap: 20px;
        }
        .comp-main {
          flex: 1;
        }
        .comp-sidebar {
          width: 280px;
        }
        .address-block {
          margin-bottom: 12px;
        }
        .address-title {
          font-size: 18px;
          font-weight: 700;
          color: #1a365d;
          margin-bottom: 2px;
        }
        .address-subtitle {
          font-size: 12px;
          color: #64748b;
        }
        .data-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .data-item {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 8px 10px;
        }
        .data-label {
          font-size: 9px;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }
        .data-value {
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
        }
        .data-value.highlight {
          color: #059669;
          font-size: 15px;
        }
        .sidebar-section {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 10px;
        }
        .sidebar-title {
          font-size: 10px;
          font-weight: 700;
          color: #1a365d;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid #e2e8f0;
        }
        .sidebar-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          font-size: 10px;
        }
        .sidebar-label {
          color: #64748b;
        }
        .sidebar-value {
          font-weight: 600;
          color: #1e293b;
        }
        .comments-section {
          margin-top: 10px;
          padding: 10px;
          background: #fef3c7;
          border: 1px solid #fcd34d;
          border-radius: 4px;
          font-size: 10px;
        }
        .comments-title {
          font-weight: 700;
          color: #92400e;
          margin-bottom: 4px;
        }
        .comments-text {
          color: #78350f;
          font-style: italic;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-top: 10px;
          border-top: 1px solid #e2e8f0;
          font-size: 8px;
          color: #94a3b8;
        }
        .footer-disclaimer {
          max-width: 65%;
          line-height: 1.3;
        }
        .footer-branding {
          text-align: right;
        }
        .footer-branding strong {
          color: #1a365d;
          font-size: 10px;
        }
        .page-number {
          position: absolute;
          bottom: 0.3in;
          right: 0.3in;
          font-size: 9px;
          color: #94a3b8;
        }
        /* Table format styles */
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10px; }
        th { background: #1a365d; color: white; padding: 8px 6px; text-align: left; font-weight: 600; }
        td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) { background: #f8fafc; }
        .text-right { text-align: right; }

        /* Excel-style Lease Comp Format */
        .comp-content-excel {
          display: flex;
          gap: 20px;
          flex: 1;
        }
        .comp-details-section {
          flex: 1;
          border: 2px solid #1a365d;
          border-radius: 4px;
          overflow: hidden;
        }
        .section-header {
          background: #1a365d;
          color: white;
          font-size: 14px;
          font-weight: 700;
          padding: 8px 12px;
          text-align: center;
        }
        .detail-row {
          display: flex;
          border-bottom: 1px solid #e2e8f0;
          font-size: 11px;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          width: 180px;
          padding: 6px 12px;
          background: #f8fafc;
          font-weight: 600;
          color: #475569;
          border-right: 1px solid #e2e8f0;
          flex-shrink: 0;
        }
        .detail-value {
          flex: 1;
          padding: 6px 12px;
          color: #1e293b;
        }
        .address-row .detail-label {
          font-weight: 700;
          color: #1a365d;
        }
        .address-row .detail-value {
          font-weight: 600;
          color: #1a365d;
        }
        .address-value {
          font-size: 12px;
        }
        .highlight-green {
          color: #059669;
          font-weight: 700;
        }
        .expiration-row .detail-value {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .remaining-badge {
          background: #fef3c7;
          color: #92400e;
          font-size: 9px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 3px;
          border: 1px solid #fcd34d;
        }
        .notes-row {
          background: #fefce8;
        }
        .notes-row .detail-label {
          background: #fef9c3;
          color: #854d0e;
        }
        .notes-value {
          font-style: italic;
          color: #78350f;
          font-size: 10px;
        }
        .comp-photo-section {
          width: 320px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .building-info-box {
          border: 2px solid #1a365d;
          border-radius: 4px;
          overflow: hidden;
        }
        .building-info-box .info-row {
          display: flex;
          justify-content: space-between;
          padding: 5px 10px;
          font-size: 10px;
          border-bottom: 1px solid #e2e8f0;
        }
        .building-info-box .info-row:last-child {
          border-bottom: none;
        }
        .building-info-box .info-label {
          color: #64748b;
        }
        .building-info-box .info-value {
          font-weight: 600;
          color: #1e293b;
        }
        .contact-box {
          border: 2px solid #1a365d;
          border-radius: 4px;
          padding: 12px;
          text-align: center;
          background: #f8fafc;
        }
        .contact-title {
          font-size: 9px;
          color: #64748b;
          margin-bottom: 8px;
        }
        .broker-contact {
          font-size: 11px;
          color: #1a365d;
          line-height: 1.5;
        }
        .broker-contact strong {
          font-size: 13px;
        }
      </style>
    `

    const title = compType === 'lease' ? 'Completed Leases' : 'Completed Sales'
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title} - ${dateStr}</title>
  ${styles}
</head>
<body>`

    if (options.format === 'detailed') {
      // Detailed format: 1 comp per page with photo
      comps.forEach((comp, index) => {
        const photo = photos[comp.id]
        const photoUrl = photo?.url || null

        html += `
        <div class="page">
          <div class="header">
            <div>
              <div class="header-title">${title}</div>
              <div class="header-subtitle">${dateStr} | Comparable ${index + 1} of ${comps.length}</div>
            </div>
            <div class="logo">BUILDING HAWK</div>
          </div>

          <div class="comp-container">`

        // Photo section
        if (options.includePhotos) {
          if (photoUrl) {
            html += `
            <div class="photo-section">
              <img src="${photoUrl}" alt="Property Photo" onerror="this.parentElement.innerHTML='<div class=\\'photo-placeholder\\'><svg fill=\\'none\\' stroke=\\'currentColor\\' viewBox=\\'0 0 24 24\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'1.5\\' d=\\'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z\\'></path></svg><span>Photo unavailable</span></div>'" />
            </div>`
          } else {
            html += `
            <div class="photo-section">
              <div class="photo-placeholder">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
                <span>Photo unavailable</span>
              </div>
            </div>`
          }
        }

        if (compType === 'lease') {
          const leaseComp = comp as LeaseComp
          html += generateLeaseCompContent(leaseComp)
        } else {
          const saleComp = comp as SaleComp
          html += generateSaleCompContent(saleComp)
        }

        html += `
          </div>

          <div class="footer">
            <div class="footer-disclaimer">
              No warranty, express or implied, is made as to the accuracy of the information contained herein.
              This information is submitted subject to errors, omissions, change of price, rental or other conditions, withdrawal without notice.
            </div>
            <div class="footer-branding">
              <strong>Building Hawk</strong><br>
              Commercial Real Estate Intelligence<br>
              Generated ${new Date().toLocaleDateString()}
            </div>
          </div>
          <div class="page-number">${index + 1} / ${comps.length}</div>
        </div>`
      })
    } else {
      // Simple table format
      html += `
      <div class="page">
        <div class="header">
          <div>
            <div class="header-title">${title}</div>
            <div class="header-subtitle">${dateStr} | ${comps.length} Comparables</div>
          </div>
          <div class="logo">BUILDING HAWK</div>
        </div>
        ${generateTableFormat()}
        <div class="footer">
          <div class="footer-disclaimer">
            No warranty, express or implied, is made as to the accuracy of the information contained herein.
          </div>
          <div class="footer-branding">
            <strong>Building Hawk</strong><br>
            Generated ${new Date().toLocaleDateString()}
          </div>
        </div>
      </div>`
    }

    html += `
</body>
</html>`

    return html
  }

  // Format term in months to years display (e.g., "120 Months" or "10 Years")
  const formatTerm = (months?: number | string) => {
    if (!months) return '-'
    const m = Number(months)
    if (m >= 12 && m % 12 === 0) {
      const years = m / 12
      return `${years} Year${years > 1 ? 's' : ''} (${m} Months)`
    }
    return `${m} Months`
  }

  // Calculate expiration date from commencement + term
  const calculateExpiration = (commencementDate?: string, termMonths?: number | string) => {
    if (!commencementDate || !termMonths) return null
    try {
      const start = new Date(commencementDate)
      start.setMonth(start.getMonth() + Number(termMonths))
      return start.toISOString().split('T')[0]
    } catch {
      return null
    }
  }

  // Calculate months remaining until expiration
  const getMonthsRemaining = (expirationDate?: string) => {
    if (!expirationDate) return null
    try {
      const exp = new Date(expirationDate)
      const now = new Date()
      const months = (exp.getFullYear() - now.getFullYear()) * 12 + (exp.getMonth() - now.getMonth())
      return months > 0 ? months : 0
    } catch {
      return null
    }
  }

  // Generate lease comp content matching Single Page Lease Comp Excel format
  const generateLeaseCompContent = (comp: LeaseComp): string => {
    // Calculate expiration if not set
    const expirationDate = comp.lease_expiration || calculateExpiration(comp.lease_start || comp.lease_date || undefined, comp.lease_term_months)
    const monthsRemaining = getMonthsRemaining(expirationDate || undefined)
    const yearsRemaining = monthsRemaining ? Math.floor(monthsRemaining / 12) : null
    const remainingDisplay = monthsRemaining !== null
      ? (yearsRemaining && yearsRemaining >= 1
          ? `${yearsRemaining} Year${yearsRemaining > 1 ? 's' : ''}, ${monthsRemaining % 12} Month${(monthsRemaining % 12) !== 1 ? 's' : ''} Remaining`
          : `${monthsRemaining} Month${monthsRemaining !== 1 ? 's' : ''} Remaining`)
      : null

    return `
            <div class="comp-content-excel">
              <!-- Left side: Comp Details -->
              <div class="comp-details-section">
                <div class="section-header">Comp Details</div>

                <div class="detail-row address-row">
                  <span class="detail-label">BUILDING ADDRESS</span>
                  <span class="detail-value address-value">${comp.property_address}, ${comp.city}, ${comp.state || 'CA'} ${comp.zip || ''}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Lessee:</span>
                  <span class="detail-value">${comp.tenant_name || '-'}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Lessor:</span>
                  <span class="detail-value">${comp.landlord_name || '-'}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Size:</span>
                  <span class="detail-value">${formatNumber(comp.leased_sf || comp.building_sf)} SF</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Commencement Date:</span>
                  <span class="detail-value">${formatDate(comp.lease_start || comp.lease_date)}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Start Rate:</span>
                  <span class="detail-value highlight-green">${formatPsf(comp.starting_rent_psf)} ${comp.lease_structure?.toUpperCase() || 'NNN'} PSF</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Operating Expenses/NNNs:</span>
                  <span class="detail-value">${comp.nnn_expenses_psf ? formatPsf(comp.nnn_expenses_psf) : '-'}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Effective Rate:</span>
                  <span class="detail-value">${comp.effective_rent_psf ? `${formatPsf(comp.effective_rent_psf)} ${comp.lease_structure?.toUpperCase() || 'NNN'} PSF` : '-'}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Term:</span>
                  <span class="detail-value">${formatTerm(comp.lease_term_months)}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Free Rent:</span>
                  <span class="detail-value">${comp.free_rent_months ? `${comp.free_rent_months} Month${Number(comp.free_rent_months) > 1 ? 's' : ''}` : '-'}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Increases:</span>
                  <span class="detail-value">${comp.annual_increases ? `${comp.annual_increases}% Annual` : '-'}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Tenant Improvements:</span>
                  <span class="detail-value">${comp.ti_allowance_psf ? `${formatPsf(comp.ti_allowance_psf)} PSF` : '-'}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Options:</span>
                  <span class="detail-value">${(comp as any).lease_options || '-'}</span>
                </div>

                <div class="detail-row expiration-row">
                  <span class="detail-label">Expiration Date:</span>
                  <span class="detail-value">${expirationDate ? formatDate(expirationDate) : '-'}${remainingDisplay ? ` <span class="remaining-badge">${remainingDisplay}</span>` : ''}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Lessee's Broker:</span>
                  <span class="detail-value">${comp.tenant_broker || '-'}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">Lessor's Broker:</span>
                  <span class="detail-value">${comp.listing_broker || '-'}</span>
                </div>

                ${comp.notes ? `
                <div class="detail-row notes-row">
                  <span class="detail-label">* Notes:</span>
                  <span class="detail-value notes-value">${comp.notes}</span>
                </div>` : ''}
              </div>

              <!-- Right side: Photo and Building Info -->
              <div class="comp-photo-section">
                <div class="building-info-box">
                  <div class="info-row">
                    <span class="info-label">Year Built:</span>
                    <span class="info-value">${comp.year_built || '-'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Clear Height:</span>
                    <span class="info-value">${(comp as any).clear_height_ft ? `${(comp as any).clear_height_ft}'` : '-'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Dock Doors:</span>
                    <span class="info-value">${(comp as any).dock_doors || '-'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">GL Doors:</span>
                    <span class="info-value">${(comp as any).gl_doors || '-'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Building SF:</span>
                    <span class="info-value">${formatNumber(comp.building_sf)}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Office SF:</span>
                    <span class="info-value">${formatNumber(comp.office_sf)}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Submarket:</span>
                    <span class="info-value">${comp.submarket || '-'}</span>
                  </div>
                </div>

                <div class="contact-box">
                  <div class="contact-title">For more information please contact us:</div>
                  <div class="broker-contact">
                    <strong>Building Hawk</strong><br>
                    Commercial Real Estate Intelligence<br>
                    buildinghawk.com
                  </div>
                </div>
              </div>
            </div>`
  }

  const generateSaleCompContent = (comp: SaleComp): string => {
    return `
            <div class="comp-content">
              <div class="comp-main">
                <div class="address-block">
                  <div class="address-title">${comp.property_address}</div>
                  <div class="address-subtitle">${comp.city}, ${comp.state || 'CA'} ${comp.zip || ''} | ${comp.submarket || 'N/A'}</div>
                </div>

                <div class="data-grid">
                  <div class="data-item">
                    <div class="data-label">Sale Price</div>
                    <div class="data-value highlight">${formatCurrency(comp.sale_price)}</div>
                  </div>
                  <div class="data-item">
                    <div class="data-label">Price PSF</div>
                    <div class="data-value highlight">${formatPsf(comp.price_psf)}</div>
                  </div>
                  <div class="data-item">
                    <div class="data-label">Sale Date</div>
                    <div class="data-value">${formatDate(comp.sale_date)}</div>
                  </div>
                  <div class="data-item">
                    <div class="data-label">Building SF</div>
                    <div class="data-value">${formatNumber(comp.building_sf)}</div>
                  </div>
                  <div class="data-item">
                    <div class="data-label">Land (Acres)</div>
                    <div class="data-value">${comp.land_acres ? Number(comp.land_acres).toFixed(2) : '-'}</div>
                  </div>
                  <div class="data-item">
                    <div class="data-label">Year Built</div>
                    <div class="data-value">${comp.year_built || '-'}</div>
                  </div>
                  <div class="data-item">
                    <div class="data-label">Cap Rate</div>
                    <div class="data-value">${comp.cap_rate ? `${Number(comp.cap_rate).toFixed(2)}%` : '-'}</div>
                  </div>
                  <div class="data-item">
                    <div class="data-label">Sale Type</div>
                    <div class="data-value">${comp.sale_type || '-'}</div>
                  </div>
                  <div class="data-item">
                    <div class="data-label">Clear Height</div>
                    <div class="data-value">${(comp as any).clear_height_ft ? `${(comp as any).clear_height_ft}'` : '-'}</div>
                  </div>
                </div>

                ${comp.notes ? `
                <div class="comments-section">
                  <div class="comments-title">Comments</div>
                  <div class="comments-text">${comp.notes}</div>
                </div>` : ''}
              </div>

              <div class="comp-sidebar">
                <div class="sidebar-section">
                  <div class="sidebar-title">Transaction Details</div>
                  <div class="sidebar-row">
                    <span class="sidebar-label">Sale Price:</span>
                    <span class="sidebar-value">${formatCurrency(comp.sale_price)}</span>
                  </div>
                  <div class="sidebar-row">
                    <span class="sidebar-label">Price/SF:</span>
                    <span class="sidebar-value">${formatPsf(comp.price_psf)}</span>
                  </div>
                  <div class="sidebar-row">
                    <span class="sidebar-label">Price/Land SF:</span>
                    <span class="sidebar-value">${comp.price_per_land_sf ? formatPsf(comp.price_per_land_sf) : '-'}</span>
                  </div>
                  <div class="sidebar-row">
                    <span class="sidebar-label">Cap Rate:</span>
                    <span class="sidebar-value">${comp.cap_rate ? `${Number(comp.cap_rate).toFixed(2)}%` : '-'}</span>
                  </div>
                  <div class="sidebar-row">
                    <span class="sidebar-label">NOI:</span>
                    <span class="sidebar-value">${comp.noi ? formatCurrency(comp.noi) : '-'}</span>
                  </div>
                  <div class="sidebar-row">
                    <span class="sidebar-label">Occupancy:</span>
                    <span class="sidebar-value">${(comp as any).occupancy_pct ? `${(comp as any).occupancy_pct}%` : '-'}</span>
                  </div>
                </div>

                <div class="sidebar-section">
                  <div class="sidebar-title">Parties</div>
                  <div class="sidebar-row">
                    <span class="sidebar-label">Buyer:</span>
                    <span class="sidebar-value">${comp.buyer_name || '-'}</span>
                  </div>
                  <div class="sidebar-row">
                    <span class="sidebar-label">Seller:</span>
                    <span class="sidebar-value">${comp.seller_name || '-'}</span>
                  </div>
                </div>

                <div class="sidebar-section">
                  <div class="sidebar-title">Building Features</div>
                  <div class="sidebar-row">
                    <span class="sidebar-label">Dock High Doors:</span>
                    <span class="sidebar-value">${(comp as any).dock_doors || '-'}</span>
                  </div>
                  <div class="sidebar-row">
                    <span class="sidebar-label">Grade Level Doors:</span>
                    <span class="sidebar-value">${(comp as any).gl_doors || '-'}</span>
                  </div>
                  <div class="sidebar-row">
                    <span class="sidebar-label">Building Class:</span>
                    <span class="sidebar-value">${comp.building_class || '-'}</span>
                  </div>
                </div>
              </div>
            </div>`
  }

  const generateTableFormat = (): string => {
    let html = '<table><thead><tr>'

    if (compType === 'lease') {
      html += `
        <th>Address</th>
        <th>City</th>
        ${options.includeSize ? '<th class="text-right">Lease SF</th>' : ''}
        ${options.includeRent ? '<th class="text-right">Rent PSF</th>' : ''}
        ${options.includeRent ? '<th>Type</th>' : ''}
        ${options.includeTenant ? '<th>Tenant</th>' : ''}
        ${options.includeDate ? '<th>Date</th>' : ''}`
    } else {
      html += `
        <th>Address</th>
        <th>City</th>
        ${options.includeSize ? '<th class="text-right">Building SF</th>' : ''}
        ${options.includePrice ? '<th class="text-right">Sale Price</th>' : ''}
        ${options.includePrice ? '<th class="text-right">Price PSF</th>' : ''}
        ${options.includeBuyer ? '<th>Buyer</th>' : ''}
        ${options.includeDate ? '<th>Date</th>' : ''}`
    }

    html += '</tr></thead><tbody>'

    if (compType === 'lease') {
      (comps as LeaseComp[]).forEach(comp => {
        html += `
          <tr>
            <td>${comp.property_address}</td>
            <td>${comp.city}, ${comp.state || 'CA'}</td>
            ${options.includeSize ? `<td class="text-right">${formatNumber(comp.leased_sf)}</td>` : ''}
            ${options.includeRent ? `<td class="text-right">${formatPsf(comp.starting_rent_psf)}</td>` : ''}
            ${options.includeRent ? `<td>${comp.lease_structure || '-'}</td>` : ''}
            ${options.includeTenant ? `<td>${comp.tenant_name || '-'}</td>` : ''}
            ${options.includeDate ? `<td>${formatDate(comp.lease_date)}</td>` : ''}
          </tr>`
      })
    } else {
      (comps as SaleComp[]).forEach(comp => {
        html += `
          <tr>
            <td>${comp.property_address}</td>
            <td>${comp.city}, ${comp.state || 'CA'}</td>
            ${options.includeSize ? `<td class="text-right">${formatNumber(comp.building_sf)}</td>` : ''}
            ${options.includePrice ? `<td class="text-right">${formatCurrency(comp.sale_price)}</td>` : ''}
            ${options.includePrice ? `<td class="text-right">${formatPsf(comp.price_psf)}</td>` : ''}
            ${options.includeBuyer ? `<td>${comp.buyer_name || '-'}</td>` : ''}
            ${options.includeDate ? `<td>${formatDate(comp.sale_date)}</td>` : ''}
          </tr>`
      })
    }

    html += '</tbody></table>'
    return html
  }

  const handleExport = async () => {
    setIsExporting(true)
    setExportSuccess(false)

    try {
      switch (exportFormat) {
        case 'pdf': {
          const html = generateHtmlContent()
          const printWindow = window.open('', '_blank')
          if (printWindow) {
            printWindow.document.write(html)
            printWindow.document.close()
            printWindow.focus()
            setTimeout(() => {
              printWindow.print()
            }, 500)
          }
          setExportSuccess(true)
          break
        }

        case 'email': {
          const textContent = generateTextContent()
          const mailtoLink = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(textContent)}`
          window.location.href = mailtoLink
          setExportSuccess(true)
          break
        }

        case 'text': {
          const textContent = generateTextContent()
          const smsBody = textContent.length > 1000
            ? textContent.substring(0, 1000) + '...\n\n[Message truncated - see full report via email]'
            : textContent
          const smsLink = `sms:${phoneNumber}?body=${encodeURIComponent(smsBody)}`
          window.location.href = smsLink
          setExportSuccess(true)
          break
        }

        case 'clipboard': {
          const textContent = generateTextContent()
          await navigator.clipboard.writeText(textContent)
          setExportSuccess(true)
          break
        }
      }
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Export {comps.length} {compType === 'lease' ? 'Lease' : 'Sale'} Comps
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Export Format */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Export Format</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 'pdf', label: 'PDF', icon: '📄' },
                { value: 'email', label: 'Email', icon: '📧' },
                { value: 'text', label: 'Text', icon: '💬' },
                { value: 'clipboard', label: 'Copy', icon: '📋' },
              ].map(format => (
                <button
                  key={format.value}
                  onClick={() => setExportFormat(format.value as ExportFormat)}
                  className={`flex flex-col items-center py-3 px-2 rounded-lg border-2 transition-colors ${
                    exportFormat === format.value
                      ? 'border-teal bg-teal/10 text-teal'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl mb-1">{format.icon}</span>
                  <span className="text-xs font-medium">{format.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* PDF Layout Options */}
          {exportFormat === 'pdf' && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Layout Style</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOptions({ ...options, format: 'detailed' })}
                  className={`p-3 rounded-lg border-2 text-left ${
                    options.format === 'detailed'
                      ? 'border-teal bg-teal/10'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">Detailed with Photos</div>
                  <div className="text-xs text-gray-500">1 comp per page with property photo</div>
                </button>
                <button
                  onClick={() => setOptions({ ...options, format: 'table' })}
                  className={`p-3 rounded-lg border-2 text-left ${
                    options.format === 'table'
                      ? 'border-teal bg-teal/10'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">Simple Table</div>
                  <div className="text-xs text-gray-500">Compact list view</div>
                </button>
              </div>

              {/* Photo option for detailed format */}
              {options.format === 'detailed' && (
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={options.includePhotos}
                      onChange={(e) => setOptions({ ...options, includePhotos: e.target.checked })}
                      className="rounded text-teal"
                    />
                    Include property photos (Street View)
                    {loadingPhotos && (
                      <span className="text-gray-400 text-xs">(Loading...)</span>
                    )}
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Email Options */}
          {exportFormat === 'email' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">To</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="recipient@email.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          )}

          {/* Text Options */}
          {exportFormat === 'text' && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="(555) 555-5555"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          )}

          {/* Success Message */}
          {exportSuccess && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium">
                {exportFormat === 'clipboard' ? 'Copied to clipboard!' : 'Export started!'}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || (exportFormat === 'email' && !emailTo) || (exportFormat === 'text' && !phoneNumber)}
            className="px-6 py-2 bg-teal text-white text-sm font-medium rounded-lg hover:bg-teal/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Exporting...
              </>
            ) : (
              `Export ${exportFormat === 'pdf' ? 'to PDF' : exportFormat === 'email' ? 'via Email' : exportFormat === 'text' ? 'via Text' : 'to Clipboard'}`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
