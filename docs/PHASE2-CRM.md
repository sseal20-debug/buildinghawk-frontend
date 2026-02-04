# Phase 2: CRM Core Implementation

## Overview

Phase 2 adds full CRM functionality: entity management, tenant tracking, ownership records, and the ability to see an entity's complete portfolio across all properties.

---

## New Components Needed

### 1. EntitySearch Component

Quick search/select for entities when adding tenant or owner.

```tsx
// frontend/src/components/EntitySearch.tsx

interface EntitySearchProps {
  onSelect: (entity: Entity) => void;
  onCreateNew: () => void;
}

Features:
- Autocomplete search for existing entities
- Shows # of properties owned/occupied
- "Create New" option at bottom
- Recent entities shown when focused
```

### 2. EntityForm Component

Create/edit entity with contacts.

```tsx
// frontend/src/components/EntityForm/EntityForm.tsx

Fields:
- Entity name
- Entity type (Company, Individual, Trust, LLC, Partnership)
- Website
- Notes

Contact subform (repeatable):
- Name
- Title
- Email
- Mobile
- Phone
- Is Primary (checkbox)
- Notes
```

### 3. EntityDetail Component

Full entity view with portfolio.

```tsx
// frontend/src/components/EntityDetail/EntityDetail.tsx

Sections:
1. Header: Entity name, type, website
2. Contacts list with call/email buttons
3. Portfolio tabs:
   - "Owned" - properties this entity owns
   - "Occupied" - properties this entity occupies
4. History/notes
5. Actions: Add alert, Edit
```

### 4. OccupancyForm Component

Add/edit tenant for a unit.

```tsx
// frontend/src/components/OccupancyForm/OccupancyForm.tsx

Fields:
- Entity (EntitySearch component)
- Occupant Type: Owner-User / Tenant / Investor (radio)
- Lease Start (date picker)
- Lease Expiration (date picker)
- Rent PSF/Month ($)
- Rent Total/Month (auto-calculate or manual)
- Lease Type: NNN / Gross / Modified Gross
- NNN Fees/Month (shown if NNN selected)
- Market Status: Stable / Relocation / Growth / Expansion / Contraction
- Notes
```

### 5. OwnershipForm Component

Record building ownership/sale.

```tsx
// frontend/src/components/OwnershipForm/OwnershipForm.tsx

Fields:
- Entity (EntitySearch component)
- Purchase Date
- Purchase Price (total)
- Purchase Price PSF (auto-calculate from building SF)
- Land Price PSF (shown only if building coverage < 45%)
- Notes

Validation:
- Auto-calculate PSF from total / building_sf
- Flag if coverage < 45% to prompt for land price
```

---

## Updated Screens

### UnitDetail Screen Updates

Add these sections:

```
┌─────────────────────────────────────────┐
│ Current Tenant                          │
│ ─────────────────────────────────────── │
│ ABC Logistics                     [→]   │
│ Tenant since Jan 2022                   │
│ Lease expires: Dec 2025                 │
│ Rent: $1.25/SF ($25,000/mo) NNN         │
│ Status: 🔵 Expansion                    │
│ ─────────────────────────────────────── │
│ Primary Contact:                        │
│ John Smith - Ops Manager                │
│ [📞 Call] [📧 Email]                    │
├─────────────────────────────────────────┤
│ [+ Set Follow-up Alert]                 │
│ [View Lease History]                    │
│ [Mark as Vacating]                      │
└─────────────────────────────────────────┘
```

### BuildingDetail Screen (New)

```
┌─────────────────────────────────────────┐
│ ← Back                        [Edit]    │
│ Building A - 1420 Main St               │
│ 80,000 SF | 1985 | 51% coverage         │
├─────────────────────────────────────────┤
│ Current Owner                           │
│ ─────────────────────────────────────── │
│ Pacific Industrial LLC            [→]   │
│ Purchased: Aug 2019                     │
│ Price: $4.2M ($172/SF)                  │
│ ─────────────────────────────────────── │
│ Primary Contact:                        │
│ Jane Doe - Asset Manager                │
│ [📞 Call] [📧 Email]                    │
├─────────────────────────────────────────┤
│ Units (4)                               │
│ ┌─────────────────────────────────────┐ │
│ │ List of units...                    │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ Ownership History                       │
│ ┌─────────────────────────────────────┐ │
│ │ Aug 2019 - Pacific Industrial LLC   │ │
│ │           $4.2M ($172/SF)           │ │
│ │ Mar 2010 - Johnson Family Trust     │ │
│ │           $2.1M ($86/SF)            │ │
│ │ 1995     - Original Developer       │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## New API Endpoints Used

### Entity Management
```
GET    /api/entities?q=search
POST   /api/entities
GET    /api/entities/:id
PUT    /api/entities/:id
POST   /api/entities/:id/contacts
PUT    /api/entities/:entityId/contacts/:contactId
```

### Occupancy
```
POST   /api/occupancy          # Add tenant
PUT    /api/occupancy/:id      # Update lease terms
POST   /api/occupancy/:id/vacate  # Tenant leaves
```

### Ownership
```
POST   /api/ownership          # Record sale
GET    /api/ownership/building/:buildingId  # Get history
PUT    /api/ownership/:id      # Update details
```

---

## User Flows

### Flow 1: Add Tenant to Vacant Unit

1. User taps vacant unit
2. Taps "Add Tenant" button
3. OccupancyForm opens
4. User searches for entity or creates new
5. Fills in lease details
6. Saves → Unit marked as occupied
7. Returns to unit detail with tenant info shown

### Flow 2: Record Property Sale

1. User views building detail
2. Taps "Record Sale" button
3. OwnershipForm opens
4. Previous owner auto-marked as historical
5. User selects new owner entity
6. Enters sale details
7. Saves → Ownership updated, history preserved

### Flow 3: View Entity Portfolio

1. User taps entity name anywhere in app
2. EntityDetail opens
3. Shows "Owned" tab: 3 buildings
4. Shows "Occupied" tab: 2 units (as tenant)
5. User can tap any property to navigate there

---

## Data Model Relationships

```
Entity ─────┬───── Ownership ───── Building
            │
            └───── Occupancy ───── Unit
            │
            └───── Contact (1:many)

An entity can:
- Own multiple buildings
- Occupy multiple units
- Have multiple contacts
```

---

## Implementation Order

1. **EntitySearch** - needed by other forms
2. **EntityForm** - create/edit entities
3. **OccupancyForm** - add tenants
4. **OwnershipForm** - record sales
5. **EntityDetail** - view entity portfolio
6. **BuildingDetail** - view building ownership
7. Update **UnitDetail** with occupancy section

---

## Validation Rules

### Occupancy
- Lease expiration must be after lease start
- If NNN lease, NNN fees should be provided
- Rent total auto-calculates: rent_psf × unit_sf

### Ownership
- Purchase price PSF auto-calculates: price / building_sf
- If building coverage < 45%, prompt for land price PSF
- Only one "current" owner per building

### Entity
- Entity name is required
- At least one contact recommended (warning, not error)
- Primary contact flag auto-toggles (only one primary)
