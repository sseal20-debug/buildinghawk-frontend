#!/usr/bin/env python3
"""Test deed monitor matching"""

import psycopg2

conn = psycopg2.connect(
    host='aws-0-us-west-2.pooler.supabase.com',
    port=5432,
    database='postgres',
    user='postgres.qrgkwcofdwkodxanaubr',
    password='$ealTheDeal51!'
)
cur = conn.cursor()

# Check watchlist
cur.execute("SELECT COUNT(*) FROM apn_watchlist")
watchlist_count = cur.fetchone()[0]
print(f'APNs in watchlist: {watchlist_count}')

# Sample APNs from watchlist
cur.execute("SELECT apn, address, city FROM apn_watchlist LIMIT 5")
print('\nSample watchlist entries:')
for row in cur.fetchall():
    print(f'  {row[0]} - {row[1]}, {row[2]}')

# Check if deed_recordings table exists and has data
cur.execute("""
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'deed_recordings'
    );
""")
if cur.fetchone()[0]:
    cur.execute("SELECT COUNT(*) FROM deed_recordings")
    deed_count = cur.fetchone()[0]
    print(f'\nDeed recordings captured: {deed_count}')
    
    # Check for matches
    cur.execute("""
        SELECT dr.doc_number, dr.recording_date, dr.apn, dr.sale_price, w.address
        FROM deed_recordings dr
        JOIN apn_watchlist w ON dr.apn = w.apn
        ORDER BY dr.recording_date DESC
        LIMIT 10
    """)
    matches = cur.fetchall()
    print(f'Matched deeds: {len(matches)}')
    for m in matches:
        print(f'  {m[0]} | {m[1]} | {m[2]} | ${m[3]:,.0f} | {m[4]}' if m[3] else f'  {m}')
else:
    print('\nNo deed_recordings table yet')

cur.close()
conn.close()
