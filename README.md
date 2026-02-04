# Industrial Property Tracker

A GIS-based CRM for commercial real estate brokerage focused on industrial properties in Orange County, CA.

## Features

- **Interactive Map**: Google Maps satellite imagery with parcel overlays
- **Parcel/Building/Unit Hierarchy**: Track multi-tenant industrial parks at the unit level
- **Tenant & Owner Tracking**: Full CRM for entities, contacts, and relationships
- **Lease Management**: Track lease terms, rent, expirations, and market status
- **Property Search**: Query properties by SF, power, docks, location, and more
- **Saved Searches**: Save client requirements with match alerts
- **Change History**: Full audit trail on all data changes
- **Mobile-First PWA**: Works on any device, installable as app

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, TanStack Query
- **Backend**: Node.js, Express, PostgreSQL + PostGIS
- **Maps**: Google Maps JavaScript API
- **Mobile**: Progressive Web App (PWA)

## Prerequisites

- Node.js 18+
- PostgreSQL 16+ with PostGIS 3.4+
- Google Cloud account with Maps JavaScript API & Places API enabled

## Setup

### 1. Database Setup

```bash
# Create database
createdb industrial_tracker

# Enable PostGIS
psql -d industrial_tracker -c "CREATE EXTENSION postgis;"

# Run schema
psql -d industrial_tracker -f backend/src/db/schema.sql
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database URL and Google API key

# Start development server
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Google Maps API key

# Start development server
npm run dev
```

### 4. Import Parcel Data

See [Data Sources](#data-sources) below for obtaining Orange County parcel data.

## Data Sources

### Orange County Parcel Data

**Official Sources:**
- [OC GIS Open Data Portal](https://data-ocpw.opendata.arcgis.com/) - Search for parcel/cadastre data
- [OC Land Insights](https://webapps.ocgis.com/oclandinsights/) - Interactive viewer with data download
- [OC Survey Landbase](https://ocs.ocpublicworks.com/service-areas/oc-survey/products/landbase-information-systems) - Legal parcel boundaries

**Commercial Options:**
- [Regrid](https://app.regrid.com/us/ca/orange) - Nationwide parcel data with API access

### Loading Parcel Data

Once you have a shapefile or GeoJSON of parcels:

```bash
# Using ogr2ogr (GDAL)
ogr2ogr -f "PostgreSQL" \
  PG:"host=localhost dbname=industrial_tracker user=your_user" \
  your_parcels.shp \
  -nln parcel \
  -lco GEOMETRY_NAME=geometry \
  -lco FID=apn

# Or use QGIS DB Manager for visual import
```

## Project Structure

```
industrial-tracker/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.sql      # Complete database schema
│   │   │   └── connection.js   # Database connection pool
│   │   ├── routes/
│   │   │   ├── parcels.js      # Parcel endpoints
│   │   │   ├── buildings.js    # Building CRUD
│   │   │   ├── units.js        # Unit CRUD + history
│   │   │   ├── entities.js     # Entity/Contact management
│   │   │   ├── occupancy.js    # Tenant tracking
│   │   │   ├── ownership.js    # Owner tracking
│   │   │   ├── search.js       # Property search + saved searches
│   │   │   ├── places.js       # Google Places integration
│   │   │   └── alerts.js       # Reminder/alert system
│   │   └── index.js            # Express app
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/            # Google Maps component
│   │   │   ├── BottomSheet/    # Mobile bottom sheet
│   │   │   ├── ParcelDetail/   # Parcel + unit views
│   │   │   └── UnitForm/       # Unit editing form
│   │   ├── api/
│   │   │   └── client.ts       # API client
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript types
│   │   ├── hooks/
│   │   └── App.tsx
│   ├── index.html
│   └── package.json
│
└── README.md
```

## API Endpoints

### Parcels
- `GET /api/parcels?west=&south=&east=&north=` - Get parcels in bounds
- `GET /api/parcels/search?q=` - Search by APN or address
- `GET /api/parcels/:apn` - Get parcel with buildings and units

### Buildings
- `POST /api/buildings` - Create building
- `GET /api/buildings/:id` - Get building with units
- `PUT /api/buildings/:id` - Update building

### Units
- `POST /api/units` - Create unit
- `GET /api/units/:id` - Get unit with current occupancy
- `GET /api/units/:id/history` - Get change history
- `PUT /api/units/:id` - Update unit

### Entities & Contacts
- `GET /api/entities?q=` - List/search entities
- `POST /api/entities` - Create entity
- `GET /api/entities/:id` - Get entity with portfolio
- `POST /api/entities/:id/contacts` - Add contact

### Occupancy
- `POST /api/occupancy` - Create occupancy record
- `PUT /api/occupancy/:id` - Update occupancy
- `POST /api/occupancy/:id/vacate` - Mark tenant vacated
- `GET /api/occupancy/reports/expiring?days=` - Upcoming expirations
- `GET /api/occupancy/reports/in-market` - Tenants in the market

### Search
- `POST /api/search` - Execute property search
- `GET /api/search/saved` - List saved searches
- `POST /api/search/saved` - Create saved search
- `GET /api/search/cities` - List cities with counts
- `GET /api/search/geographies` - List submarkets

### Alerts
- `GET /api/alerts` - List alerts
- `GET /api/alerts/today` - Today's due alerts
- `POST /api/alerts` - Create alert
- `POST /api/alerts/:id/complete` - Mark complete
- `POST /api/alerts/:id/snooze` - Snooze to new date

## Development Phases

### Phase 1: Foundation (MVP) ✅
- Database schema
- Map with parcel overlay
- Basic CRUD for buildings and units
- Google Places integration

### Phase 2: CRM Core
- Entity and contact management
- Occupancy tracking (tenant, lease, rent)
- Ownership tracking (purchase history)
- Entity portfolio view

### Phase 3: Search & Query
- Query builder with all filters
- Geographic filtering
- Saved searches
- Export (PDF, Excel)

### Phase 4: Alerts & History
- Full audit log UI
- Property timeline
- Lease expiration alerts
- Push notifications

### Phase 5: Polish
- PDF report generator
- Market trend charts
- Dashboard

## License

Private - All rights reserved
