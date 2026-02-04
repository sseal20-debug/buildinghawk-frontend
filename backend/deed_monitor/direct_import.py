#!/usr/bin/env python3
"""Direct PostgreSQL import for APN watchlist"""

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

# Load the combined parcels
df = pd.read_excel(r'D:\BuildingHawk_Master\data\properties\OC_Industrial_Parcels_Combined.xlsx')
print(f'Loaded {len(df)} parcels')

# Connect to Supabase via direct Postgres
conn = psycopg2.connect(
    host='aws-0-us-west-2.pooler.supabase.com',
    port=5432,
    database='postgres',
    user='postgres.qrgkwcofdwkodxanaubr',
    password='$ealTheDeal51!'
)
print('Connected to database')

cur = conn.cursor()

# Check if apn_watchlist table exists
cur.execute("""
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'apn_watchlist'
    );
""")
table_exists = cur.fetchone()[0]
print(f'Table apn_watchlist exists: {table_exists}')

if not table_exists:
    print('Creating apn_watchlist table...')
    cur.execute("""
        CREATE TABLE IF NOT EXISTS apn_watchlist (
            id SERIAL PRIMARY KEY,
            apn VARCHAR(50) UNIQUE NOT NULL,
            address VARCHAR(255),
            city VARCHAR(100),
            state VARCHAR(2) DEFAULT 'CA',
            zip VARCHAR(10),
            county VARCHAR(100) DEFAULT 'Orange',
            property_type VARCHAR(50) DEFAULT 'Industrial',
            building_sf INTEGER,
            lot_sf INTEGER,
            year_built INTEGER,
            zoning VARCHAR(50),
            owner_name VARCHAR(255),
            latitude DECIMAL(10, 7),
            longitude DECIMAL(10, 7),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    print('Table created')

# Prepare data for insert
records = []
for _, row in df.iterrows():
    apn = str(row.get('APN', '')).strip()
    if not apn:
        continue
    records.append((
        apn,
        str(row.get('SITE_ADDR', ''))[:255] if pd.notna(row.get('SITE_ADDR')) else None,
        str(row.get('SITE_CITY', ''))[:100] if pd.notna(row.get('SITE_CITY')) else None,
        'CA',
        str(row.get('SITE_ZIP', ''))[:10] if pd.notna(row.get('SITE_ZIP')) else None,
        'Orange',
        'Industrial',
        int(row.get('BUILDING_SQFT')) if pd.notna(row.get('BUILDING_SQFT')) else None,
        int(row.get('LAND_SQFT')) if pd.notna(row.get('LAND_SQFT')) else None,
        int(row.get('YR_BLT')) if pd.notna(row.get('YR_BLT')) else None,
        str(row.get('ZONING_CODE', ''))[:50].strip("'") if pd.notna(row.get('ZONING_CODE')) else None,
        str(row.get('OWNER_NAME_1', ''))[:255] if pd.notna(row.get('OWNER_NAME_1')) else None,
        float(row.get('LATITUDE')) if pd.notna(row.get('LATITUDE')) else None,
        float(row.get('LONGITUDE')) if pd.notna(row.get('LONGITUDE')) else None
    ))

print(f'Prepared {len(records)} records for import')

# Insert using execute_values for efficiency
insert_sql = """
    INSERT INTO apn_watchlist (apn, address, city, state, zip, county, property_type, 
                               building_sf, lot_sf, year_built, zoning, owner_name, 
                               latitude, longitude)
    VALUES %s
    ON CONFLICT (apn) DO UPDATE SET
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        zip = EXCLUDED.zip,
        building_sf = EXCLUDED.building_sf,
        lot_sf = EXCLUDED.lot_sf,
        year_built = EXCLUDED.year_built,
        zoning = EXCLUDED.zoning,
        owner_name = EXCLUDED.owner_name,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        updated_at = CURRENT_TIMESTAMP
"""

try:
    execute_values(cur, insert_sql, records, page_size=500)
    conn.commit()
    print(f'Successfully imported {len(records)} APNs to watchlist!')
except Exception as e:
    print(f'Error during import: {e}')
    conn.rollback()

# Verify
cur.execute("SELECT COUNT(*) FROM apn_watchlist")
count = cur.fetchone()[0]
print(f'Total APNs in watchlist: {count}')

cur.close()
conn.close()
print('Done!')
