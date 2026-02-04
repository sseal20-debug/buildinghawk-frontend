#!/usr/bin/env python3
"""Check apn_watchlist and parcel tables"""
import psycopg2

conn = psycopg2.connect(
    host='aws-0-us-west-2.pooler.supabase.com',
    port=5432,
    database='postgres',
    user='postgres.qrgkwcofdwkodxanaubr',
    password='$ealTheDeal51!'
)
cur = conn.cursor()

# Check apn_watchlist
cur.execute('SELECT COUNT(*) FROM apn_watchlist')
print('apn_watchlist count:', cur.fetchone()[0])

# Check parcel table - this likely has APNs
cur.execute('SELECT COUNT(*) FROM parcel')
print('parcel count:', cur.fetchone()[0])

# Get parcel columns
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'parcel' ORDER BY ordinal_position")
cols = [r[0] for r in cur.fetchall()]
print('parcel columns:', cols[:10], '...' if len(cols) > 10 else '')

# Sample parcel
cur.execute('SELECT * FROM parcel LIMIT 1')
sample = cur.fetchone()
if sample:
    print('Sample APN:', sample[cols.index('apn')] if 'apn' in cols else 'no apn column')

conn.close()
