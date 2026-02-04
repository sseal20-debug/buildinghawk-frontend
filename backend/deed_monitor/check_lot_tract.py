#!/usr/bin/env python3
"""Check lot/tract lookup data"""

import psycopg2

conn = psycopg2.connect(
    host='aws-0-us-west-2.pooler.supabase.com',
    port=5432,
    database='postgres',
    user='postgres.qrgkwcofdwkodxanaubr',
    password='$ealTheDeal51!'
)
cur = conn.cursor()

# Check for lot_tract_lookup table
cur.execute("""
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'lot_tract_lookup'
    );
""")
exists = cur.fetchone()[0]
print(f'lot_tract_lookup table exists: {exists}')

if exists:
    cur.execute("SELECT COUNT(*) FROM lot_tract_lookup")
    count = cur.fetchone()[0]
    print(f'Records: {count}')
    
    cur.execute("SELECT * FROM lot_tract_lookup LIMIT 3")
    print('Sample:')
    for row in cur.fetchall():
        print(f'  {row}')
else:
    print('\nLot/Tract lookup table does not exist!')
    print('This mapping is REQUIRED for the deed monitor to work.')
    print('RecorderWorks provides Lot/Tract numbers but NOT APNs.')

# List all tables with 'lot' or 'tract' in name
cur.execute("""
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND (table_name LIKE '%lot%' OR table_name LIKE '%tract%')
""")
tables = cur.fetchall()
if tables:
    print(f'\nRelated tables found: {[t[0] for t in tables]}')

cur.close()
conn.close()
