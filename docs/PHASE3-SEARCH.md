# Phase 3: Search & Query Implementation

## Overview

Phase 3 adds powerful property search capabilities: a query builder, geographic filtering, saved searches for clients, and export functionality.

---

## New Components

### 1. SearchPanel Component

Main search interface, either full-screen or slide-in panel.

```tsx
// frontend/src/components/Search/SearchPanel.tsx

┌─────────────────────────────────────────────────────────────┐
│ 🔍 Property Search                           [Save] [Clear] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ LOCATION                                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Area: [North OC ▼]                                      │ │
│ │ Cities: [Anaheim] [Brea] [+2 more]          [Edit]      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ SIZE                                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Building SF: [20,000] to [30,000]                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ FEATURES                                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Clear Height: [24] ft min                               │ │
│ │ Dock Doors:   [1] min      GL Doors: [  ] min           │ │
│ │ Power Amps:   [800] min    Volts: [277/480 ▼]           │ │
│ │ Fenced Yard:  ● Yes  ○ No  ○ Any                        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ AVAILABILITY                                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ☐ For Sale    ☐ For Lease                               │ │
│ │ ☐ Vacant Only ☐ In Market (relocation/growth/etc)       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│              [ Search: 12 matches → ]                       │
└─────────────────────────────────────────────────────────────┘
```

### 2. CitySelector Component

Multi-select city picker.

```tsx
// frontend/src/components/Search/CitySelector.tsx

Features:
- Checkbox list of all OC cities
- Shows property count per city
- "Select All" / "Clear" buttons
- Search filter for long list
```

### 3. GeographySelector Component

Submarket/area picker with optional map drawing.

```tsx
// frontend/src/components/Search/GeographySelector.tsx

Options:
- Preset submarkets (North OC, South OC, Airport, etc.)
- Custom polygon drawing on map
- Radius from address
```

### 4. SearchResults Component

Results display with map and list views.

```tsx
// frontend/src/components/Search/SearchResults.tsx

┌─────────────────────────────────────────────────────────────┐
│ 12 Results for "20-30k SF, 800A, North OC"    [Map] [List]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Map View:                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │          ◆ Brea                                     │    │
│  │    ◆           ◆                                    │    │
│  │        ◆ Fullerton                                  │    │
│  │              ◆     ◆ Anaheim                        │    │
│  │        ◆         ◆                                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  List View (scrollable):                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ☐ 1420 Main St, Anaheim          24,500 SF         │    │
│  │   1,200A | 2 docks | Fenced | VACANT               │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ ☐ 890 State College, Brea        22,000 SF         │    │
│  │   800A | 1 dock | Fenced | For Sale $5.2M          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [Select All]   [Export PDF]   [Export Excel]               │
└─────────────────────────────────────────────────────────────┘
```

### 5. SavedSearchForm Component

Save search as client requirement.

```tsx
// frontend/src/components/Search/SavedSearchForm.tsx

Fields:
- Search Name ("Acme Corp - Expansion")
- Client Name
- Client Email
- Client Phone
- Enable Alerts (toggle)
- Notes
```

### 6. SavedSearchList Component

View and manage saved searches.

```tsx
// frontend/src/components/Search/SavedSearchList.tsx

┌─────────────────────────────────────────────────────────────┐
│ 👤 Client Requirements                                      │
├─────────────────────────────────────────────────────────────┤
│ Acme Corp - Expansion                    12 matches   [🔔]  │
│ 20-30k SF | 800A+ | North OC | Fenced                       │
│ Last checked: Today                              [Run] [✏️] │
├─────────────────────────────────────────────────────────────┤
│ Johnson Holdings - Acquisition            4 matches   [🔔]  │
│ 50k+ SF | Owner-user | South OC                             │
│ Last checked: Yesterday                          [Run] [✏️] │
├─────────────────────────────────────────────────────────────┤
│ [+ New Saved Search]                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Search Criteria Fields

### Location
| Field | Type | UI |
|-------|------|-----|
| `geography_id` | UUID | Dropdown of submarkets |
| `cities` | string[] | Multi-select checkboxes |

### Size
| Field | Type | UI |
|-------|------|-----|
| `min_sf` | number | Text input |
| `max_sf` | number | Text input |

### Features
| Field | Type | UI |
|-------|------|-----|
| `min_clear_height` | number | Text input |
| `min_docks` | number | Text input |
| `min_gl_doors` | number | Text input |
| `min_amps` | number | Text input |
| `power_volts` | enum | Radio/dropdown |
| `fenced_yard` | boolean | Radio (Yes/No/Any) |

### Availability
| Field | Type | UI |
|-------|------|-----|
| `for_sale` | boolean | Checkbox |
| `for_lease` | boolean | Checkbox |
| `vacant_only` | boolean | Checkbox |
| `in_market_only` | boolean | Checkbox |

### Building
| Field | Type | UI |
|-------|------|-----|
| `year_built_min` | number | Text input |
| `year_built_max` | number | Text input |

---

## API Endpoints

```
POST /api/search                    # Execute search
GET  /api/search/cities             # List cities with counts
GET  /api/search/geographies        # List submarkets
POST /api/search/saved              # Save search
GET  /api/search/saved              # List saved searches
GET  /api/search/saved/:id          # Get saved search
PUT  /api/search/saved/:id          # Update saved search
DELETE /api/search/saved/:id        # Delete saved search
```

---

## Export Functionality

### PDF Export

Generate professional property package:

```
┌─────────────────────────────────────────────────────────────┐
│                    PROPERTY SEARCH RESULTS                  │
│                    Prepared for: Acme Corp                  │
│                    Date: January 11, 2026                   │
│                    Prepared by: [Broker Name]               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Overview Map with all properties marked 1-12]             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Search Criteria:                                           │
│  • Size: 20,000 - 30,000 SF                                │
│  • Power: 800+ amps, 277/480v                              │
│  • Features: 1+ dock doors, fenced yard                    │
│  • Location: North Orange County                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 1420 Main St, Anaheim 92801                            │
│     ─────────────────────────────────────                  │
│     Size: 24,500 SF (22,000 WH / 2,500 OF)                │
│     Features: 28' clear, 2 docks, 1 GL, fenced             │
│     Power: 1,200A @ 277/480v                               │
│     Year Built: 1995                                        │
│     Status: Vacant                                          │
│     Asking: $1.25/SF NNN                                    │
│     [Aerial photo thumbnail]                                │
│                                                             │
│  2. 890 State College Blvd, Brea 92821                     │
│     ...                                                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Broker Name] | [Brokerage] | [Phone] | [Email]           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Implementation: Use a library like `@react-pdf/renderer` or server-side with Puppeteer.

### Excel Export

CSV/XLSX with all data fields:

| Address | City | SF | Warehouse SF | Office SF | Clear Ht | Docks | Power | Volts | Fenced | Status | Tenant | Lease Exp | Rent |
|---------|------|-----|--------------|-----------|----------|-------|-------|-------|--------|--------|--------|-----------|------|
| 1420 Main St | Anaheim | 24,500 | 22,000 | 2,500 | 28' | 2 | 1200 | 277/480 | Yes | Vacant | | | $1.25 |

---

## Alert System for Saved Searches

When `alert_enabled = true`:

1. **Daily check job** runs each saved search
2. Compare results to previous run
3. If new matches found:
   - Send email to client (if client_email set)
   - Create in-app notification
   - Update `match_count` and `last_run_at`

### New Match Email Template

```
Subject: New Property Match - Acme Corp Search

Hi,

A new property matches your search criteria:

1420 Main St, Anaheim
24,500 SF | 1,200A | 2 Docks | Fenced Yard
Status: Just became available

View details: [Link to property]

---
Your search: 20-30k SF, 800A+, North OC, Fenced

Regards,
[Broker Name]
```

---

## User Flows

### Flow 1: Ad-hoc Search

1. User taps "Search" button in nav
2. SearchPanel opens
3. User sets criteria
4. Taps "Search"
5. SearchResults shows on map + list
6. User taps property to view detail
7. Optionally exports or saves search

### Flow 2: Save Client Requirement

1. User builds search criteria
2. Taps "Save" button
3. SavedSearchForm opens
4. User enters client info
5. Enables alerts toggle
6. Saves
7. Saved search appears in list

### Flow 3: Run Saved Search

1. User goes to Saved Searches list
2. Taps "Run" on a saved search
3. Search executes with saved criteria
4. Results display
5. User can export to send to client

---

## Implementation Order

1. **Search API** - already built in Phase 1
2. **CitySelector** - simple multi-select
3. **SearchPanel** - main search form
4. **SearchResults** - map + list display
5. **SavedSearchForm** - save searches
6. **SavedSearchList** - manage saved searches
7. **PDF Export** - generate reports
8. **Excel Export** - data download
9. **Alert job** - background matching

---

## Technical Notes

### Search Performance

- PostGIS spatial index on `parcel.geometry`
- Partial indexes on `unit.for_sale`, `unit.for_lease`
- Limit results to 500 max
- Consider pagination for larger result sets

### Caching

- City list: cache 1 hour
- Geography list: cache 1 day
- Search results: no cache (real-time)

### Map Clustering

For many results (>50), cluster markers:
```tsx
import { MarkerClusterer } from '@googlemaps/markerclusterer'
```
