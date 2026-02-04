#!/usr/bin/env python3
"""Test deed monitor with correct database"""
import psycopg2
import sys
sys.stdout.reconfigure(encoding='utf-8')

conn = psycopg2.connect(
    host='aws-0-us-west-2.pooler.supabase.com',
    port=5432,
    database='postgres',
    user='postgres.qrgkwcofdwkodxanaubr',
    password='$ealTheDeal51!'
)
cur = conn.cursor()

print("=" * 60)
print("DEED MONITOR DATABASE STATUS")
print("=" * 60)

# Check apn_watchlist
cur.execute('SELECT COUNT(*) FROM apn_watchlist')
watchlist_count = cur.fetchone()[0]
print(f"\n[OK] apn_watchlist: {watchlist_count:,} APNs being monitored")

# Sample watchlist APNs
cur.execute('SELECT apn, address, city FROM apn_watchlist LIMIT 5')
print("\nSample watchlist entries:")
for row in cur.fetchall():
    print(f"   {row[0]}: {row[1]}, {row[2]}")

# Check deed_recordings
cur.execute('SELECT COUNT(*) FROM deed_recordings')
recordings_count = cur.fetchone()[0]
print(f"\n[OK] deed_recordings: {recordings_count} recorded sales")

# Check recent deed_recordings
cur.execute('''
    SELECT recording_date, apn, grantor, grantee, sale_price 
    FROM deed_recordings 
    ORDER BY recording_date DESC 
    LIMIT 5
''')
recent = cur.fetchall()
if recent:
    print("\nRecent deed recordings:")
    for row in recent:
        price = f"${row[4]:,.0f}" if row[4] else "N/A"
        print(f"   {row[0]}: {row[1]} - {row[2]} -> {row[3]} ({price})")
else:
    print("\nNo deed recordings yet - run the monitor to start tracking!")

# Check parcels
cur.execute('SELECT COUNT(*) FROM parcel')
parcel_count = cur.fetchone()[0]
print(f"\n[OK] parcel: {parcel_count:,} parcels with geometry")

conn.close()

print("\n" + "=" * 60)
print("PHASE 1 STATUS: READY TO RUN")
print("=" * 60)
print(f"The deed monitor can now match against {watchlist_count:,} industrial APNs!")
