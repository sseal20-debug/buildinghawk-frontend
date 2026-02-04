#!/usr/bin/env python3
"""
Import OC Landbase parcel polygon geometries into the BuildingHawk database.
Matches parcels by APN and updates geometry column with real parcel boundaries.
"""

import os
import sys
import geopandas as gpd
import pandas as pd
from shapely import wkb
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Database connection from environment
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:54322/postgres')

# Paths
SHAPEFILE_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'parcel_polygons', 'Parcel_Polygons.shp')
ATTRIBUTES_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'parcel_polygons', 'Parcel_Attributes.csv')


def normalize_apn(apn):
    """Normalize APN by removing dashes and leading zeros."""
    if pd.isna(apn):
        return None
    apn_str = str(apn).strip()
    # Remove dashes for comparison
    return apn_str.replace('-', '')


def main():
    print("=" * 60)
    print("OC Landbase Parcel Polygon Import")
    print("=" * 60)

    # Connect to database
    print("\n1. Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Get existing parcels from database (apn is the primary key)
    print("2. Fetching existing parcels from database...")
    cur.execute("SELECT apn FROM parcel WHERE apn IS NOT NULL")
    db_parcels = cur.fetchall()
    print(f"   Found {len(db_parcels)} parcels in database")

    # Create APN set (normalize APNs for matching)
    db_apn_set = set()
    db_apn_original = {}  # normalized -> original format
    for (apn,) in db_parcels:
        normalized = normalize_apn(apn)
        if normalized:
            db_apn_set.add(normalized)
            db_apn_original[normalized] = apn
    print(f"   Normalized APNs: {len(db_apn_set)}")

    # Load parcel attributes (maps ObjectID to APN)
    print("\n3. Loading parcel attributes...")
    attrs_df = pd.read_csv(ATTRIBUTES_PATH)
    print(f"   Loaded {len(attrs_df)} attribute records")
    print(f"   Columns: {list(attrs_df.columns)}")

    # Create LegalLotID to APN mapping (OID_JOIN in shapefile = LegalLotID in attributes)
    legallotid_to_apn = {}
    for _, row in attrs_df.iterrows():
        lot_id = row['LegalLotID']
        apn = row['AssessmentNo']
        if pd.notna(lot_id) and pd.notna(apn):
            legallotid_to_apn[int(lot_id)] = str(apn).strip()
    print(f"   LegalLotID to APN mapping: {len(legallotid_to_apn)} entries")

    # Load shapefile
    print("\n4. Loading shapefile (this may take a moment)...")
    gdf = gpd.read_file(SHAPEFILE_PATH)
    print(f"   Loaded {len(gdf)} parcel polygons")
    print(f"   CRS: {gdf.crs}")
    print(f"   Columns: {list(gdf.columns)}")

    # Reproject to WGS84 (EPSG:4326) if needed
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        print("\n5. Reprojecting to WGS84 (EPSG:4326)...")
        gdf = gdf.to_crs(epsg=4326)
        print(f"   New CRS: {gdf.crs}")
    else:
        print("\n5. Already in WGS84")

    # Match and prepare updates
    print("\n6. Matching parcels by APN...")
    updates = []
    matched = 0
    unmatched = 0

    # Shapefile uses OID_JOIN which maps to LegalLotID in attributes CSV
    print("   Using OID_JOIN -> LegalLotID -> APN mapping")

    for idx, row in gdf.iterrows():
        if idx % 50000 == 0:
            print(f"   Processing row {idx}...")

        # Get APN from OID_JOIN -> LegalLotID mapping
        apn = None
        oid_join = row.get('OID_JOIN')
        if pd.notna(oid_join) and int(oid_join) in legallotid_to_apn:
            apn = legallotid_to_apn[int(oid_join)]

        if not apn:
            unmatched += 1
            continue

        # Normalize APN and check if it's in our database
        normalized_apn = normalize_apn(apn)
        if normalized_apn not in db_apn_set:
            unmatched += 1
            continue

        # Get original APN format from database
        original_apn = db_apn_original[normalized_apn]

        # Convert geometry to WKT
        geom = row.geometry
        if geom is None or geom.is_empty:
            unmatched += 1
            continue

        # Convert to WKT for PostGIS
        wkt = geom.wkt
        updates.append((original_apn, wkt))
        matched += 1

    print(f"\n   Matched: {matched}")
    print(f"   Unmatched: {unmatched}")

    if not updates:
        print("\nNo parcels to update!")
        return

    # Update database
    print(f"\n7. Updating {len(updates)} parcel geometries in database...")

    batch_size = 500
    updated = 0

    for i in range(0, len(updates), batch_size):
        batch = updates[i:i+batch_size]

        for apn, wkt in batch:
            try:
                cur.execute("""
                    UPDATE parcel
                    SET geometry = ST_GeomFromText(%s, 4326),
                        centroid = ST_Centroid(ST_GeomFromText(%s, 4326))
                    WHERE apn = %s
                """, (wkt, wkt, apn))
                updated += 1
            except Exception as e:
                print(f"   Error updating parcel {apn}: {e}")

        conn.commit()
        if (i + batch_size) % 5000 == 0:
            print(f"   Updated {min(i + batch_size, len(updates))} parcels...")

    print(f"\n8. Successfully updated {updated} parcels with real geometries")

    # Verify
    print("\n9. Verification...")
    cur.execute("""
        SELECT COUNT(*) FROM parcel
        WHERE geometry IS NOT NULL
        AND ST_Area(geometry::geography) > 100
        AND ST_Area(geometry::geography) < 1000000
    """)
    real_geom_count = cur.fetchone()[0]
    print(f"   Parcels with real geometries (100-1M sqm): {real_geom_count}")

    cur.execute("""
        SELECT COUNT(*) FROM parcel
        WHERE geometry IS NOT NULL
        AND ST_Area(geometry::geography) >= 1000000
    """)
    fake_geom_count = cur.fetchone()[0]
    print(f"   Parcels with placeholder geometries (>=1M sqm): {fake_geom_count}")

    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print("Import complete!")
    print("=" * 60)


if __name__ == '__main__':
    main()
