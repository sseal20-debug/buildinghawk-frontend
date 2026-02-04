# Lot/Tract to APN Data Sources

Since RecorderWorks provides Lot# and Tract# but NOT APN, we need a lookup table
to match recorded deeds to our industrial watchlist.

## Available Data Sources (User has access)

### 1. LandVision
**URL:** https://www.landvision.com (login required)

**Export Steps:**
1. Log into LandVision
2. Go to Property Search
3. Filter by: Orange County, CA
4. Select fields to export:
   - APN (Assessor Parcel Number)
   - Lot Number
   - Tract Number
   - City
   - Legal Description (optional - can parse lot/tract from this)
5. Export as CSV
6. Run: `python populate_lot_tract_lookup.py --csv landvision_export.csv`

**Notes:**
- LandVision has comprehensive parcel data
- Can export entire county or filter by property type
- Legal descriptions contain Lot/Tract info

---

### 2. TitlePro
**URL:** https://www.titlepro247.com (login required)

**Export Steps:**
1. Log into TitlePro
2. Select Orange County
3. Run a property search or report
4. Include fields:
   - APN
   - Legal Description
   - City
5. Export results
6. Run: `python populate_lot_tract_lookup.py --csv titlepro_export.csv`

**Notes:**
- TitlePro focuses on title/deed data
- Legal descriptions usually have Lot/Tract
- May need to parse lot/tract from legal description

---

### 3. Moody's / AIR Commercial Real Estate
**URL:** Varies by subscription

**Export Steps:**
1. Log into Moody's/AIR portal
2. Search Orange County industrial properties
3. Export property details with:
   - APN
   - Legal Description
   - City
4. Import via CSV

---

### 4. NeighborWho
**URL:** https://neighborwho.com

**Export Steps:**
1. Search by property address or APN
2. Copy Lot/Tract info from property details
3. Add manually via: `python populate_lot_tract_lookup.py --interactive`

---

### 5. OC Assessor Website (FREE)
**URL:** https://www.ocassessor.gov/

**Manual Lookup:**
1. Search by APN or address
2. Property detail page shows Legal Description
3. Parse Lot/Tract from legal description
4. Add to lookup table

**Bulk Data:**
- OC Assessor publishes parcel shapefiles
- Download from: https://data-ocgov.opendata.arcgis.com/
- Look for "Parcels" dataset
- Contains APN and may have Lot/Tract fields

---

### 6. Dealius (CRE Platform)
**URL:** Varies by subscription

**Export Steps:**
1. Log into Dealius
2. Export property inventory
3. Include APN and legal description fields
4. Import via CSV

---

## Quick Start: Populate Lookup Table

### Step 1: Create Table in Supabase
```sql
-- Run sql/002_lot_tract_lookup.sql in Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/mcslwdnlpyxnugojmvjk/sql
```

### Step 2: Export Data from LandVision/TitlePro
Export CSV with columns:
- lot_number (or lot, LOT)
- tract_number (or tract, TRACT)
- city (or CITY, situs_city)
- apn (or APN, parcel_number)
- legal_description (optional - script will parse lot/tract)

### Step 3: Import Data
```bash
cd industrial-tracker/backend/deed_monitor
python populate_lot_tract_lookup.py --csv your_export.csv
```

### Step 4: Verify
```bash
python populate_lot_tract_lookup.py --check-table
```

---

## CSV Format Examples

### Format 1: Direct Lot/Tract Columns
```csv
lot_number,tract_number,city,apn
87,13141,Rancho Santa Margarita,754-012-03
1,9436,Huntington Beach,023-456-78
2,7128,Laguna Woods,938-271-01
```

### Format 2: Legal Description (Will Be Parsed)
```csv
apn,city,legal_description
754-012-03,Rancho Santa Margarita,"LOT 87 OF TRACT NO 13141"
023-456-78,Huntington Beach,"TR 9436 LOT 1 BLOCK A"
938-271-01,Laguna Woods,"TRACT 7128 LOT 2"
```

---

## Industrial-Only Strategy

Since we're monitoring **industrial properties only**, you can:

1. **Filter exports to industrial zoning codes:**
   - M1, M2, M3 (Manufacturing)
   - I (Industrial)
   - BP (Business Park)

2. **Export only our 3,493 watchlist APNs:**
   - Export watchlist APNs from Supabase
   - Look up Lot/Tract for each in LandVision
   - This is faster than importing entire county

3. **Focus on industrial cities:**
   - Anaheim
   - Brea
   - Buena Park
   - Fullerton
   - Irvine
   - Orange
   - Santa Ana
   - Tustin

---

## Matching Without Lot/Tract

If Lot/Tract data is unavailable, the system still supports:

1. **Address Matching (Enabled):**
   - Fuzzy matches addresses
   - Works when deed includes property address
   - ~85%+ confidence threshold

2. **City + Sale Price Matching:**
   - For high-value industrial sales in target cities
   - Logged for manual review

3. **Manual Review:**
   - View unmatched deeds in `deed_recordings_need_apn` view
   - Research APN in assessor records
   - Add to watchlist if industrial

---

## Commands Reference

```bash
# Check if table exists
python populate_lot_tract_lookup.py --check-table

# Show expected CSV format
python populate_lot_tract_lookup.py --show-format

# Import from CSV
python populate_lot_tract_lookup.py --csv data.csv

# Import from shapefile
python populate_lot_tract_lookup.py --shapefile Parcels.shp

# Interactive entry
python populate_lot_tract_lookup.py --interactive
```

---

## Next Steps

1. **Create table in Supabase** - Run the SQL migration
2. **Export from LandVision** - Get Lot/Tract data for OC parcels
3. **Import to lookup table** - Use populate script
4. **Test matching** - Run deed monitor with dry-run
