#!/usr/bin/env python3
"""Check lot_tract_apn_lookup table"""

import psycopg2

conn = psycopg2.connect(
    host='aws-0-us-west-2.pooler.supabase.com',
    port=5432,
    database='postgres',
    user='postgres.qrgkwcofdwkodxanaubr',
    password='$ealTheDeal51!'
)
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM lot_tract_apn_lookup")
count = cur.fetchone()[0]
print(f'lot_tract_apn_lookup records: {count}')

if count > 0:
    cur.execute("SELECT * FROM lot_tract_apn_lookup LIMIT 5")
    cols = [desc[0] for desc in cur.description]
    print(f'Columns: {cols}')
    print('Sample rows:')
    for row in cur.fetchall():
        print(f'  {row}')
else:
    print('Table is EMPTY - need to populate lot/tract to APN mapping')

cur.close()
conn.close()
