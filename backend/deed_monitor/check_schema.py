#!/usr/bin/env python3
"""Check schema and import APNs"""

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

# Load the combined parcels
df = pd.read_excel(r'D:\BuildingHawk_Master\data\properties\OC_Industrial_Parcels_Combined.xlsx')
print(f'Loaded {len(df)} parcels')

# Connect to Supabase
conn = psycopg2.connect(
    host='aws-0-us-west-2.pooler.supabase.com',
    port=5432,
    database='postgres',
    user='postgres.qrgkwcofdwkodxanaubr',
    password='$ealTheDeal51!'
)
cur = conn.cursor()

# Check existing schema
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'apn_watchlist'
    ORDER BY ordinal_position;
""")
columns = cur.fetchall()
print('Existing columns:')
for col, dtype in columns:
    print(f'  {col}: {dtype}')

# Check existing count
cur.execute("SELECT COUNT(*) FROM apn_watchlist")
existing = cur.fetchone()[0]
print(f'\nExisting APNs: {existing}')

# Check for overlap
apns_to_add = df['APN'].dropna().astype(str).str.strip().tolist()
placeholders = ','.join([f"'{a}'" for a in apns_to_add[:100]])  # Sample check
cur.execute(f"SELECT apn FROM apn_watchlist WHERE apn IN ({placeholders})")
found = [r[0] for r in cur.fetchall()]
print(f'Sample: {len(found)} of first 100 APNs already in watchlist')

cur.close()
conn.close()
