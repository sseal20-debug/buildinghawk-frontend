#!/usr/bin/env python3
"""
Import parcel geometries for all CRM properties from OC Landbase shapefile.
Matches by APN or by spatial lookup using property coordinates.
"""

import os
import json
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point
from shapely import wkt
import psycopg2
from psycopg2.extras import execute_batch

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data')
SHAPEFILE_PATH = os.path.join(DATA_DIR, 'parcel_polygons', 'Parcel_Polygons.shp')
ATTRIBUTES_PATH = os.path.join(DATA_DIR, 'parcel_polygons', 'Parcel_Attributes.csv')
CRM_JSON_PATH = os.path.join(DATA_DIR, 'building_hawk_all.json')

# Database connection
DB_CONFIG = {
    'host': 'aws-0-us-west-2.pooler.supabase.com',
    'port': 5432,
    'database': 'postgres',
    'user': 'postgres.qrgkwcofdwkodxanaubr',
    'password': '$ealTheDeal51!'
}


def normalize_apn(apn):
    """Normalize APN by removing dashes and spaces."""
    if pd.isna(apn) or apn is None:
        return None
    return str(apn).strip().replace('-', '').replace(' ', '')


def load_crm_properties():
    """Load CRM properties from JSON."""
    print("Loading CRM properties...")
    with open(CRM_JSON_PATH, 'r') as f:
        data = json.load(f)

    properties = data.get('properties', data)
    print(f"  Loaded {len(properties)} CRM properties")

    # Separate by APN status
    with_apn = [p for p in properties if p.get('apn')]
    without_apn = [p for p in properties if not p.get('apn')]

    print(f"  With APN: {len(with_apn)}")
    print(f"  Without APN: {len(without_apn)}")

    return properties, with_apn, without_apn


def load_shapefile_index():
    """Load and index the OC Landbase shapefile."""
    print("\nLoading OC Landbase shapefile (this takes a moment)...")

    # Load attributes CSV for APN mapping
    attrs_df = pd.read_csv(ATTRIBUTES_PATH)
    print(f"  Loaded {len(attrs_df)} parcel attributes")

    # Create LegalLotID -> APN mapping
    lot_to_apn = {}
    apn_to_lot = {}
    for _, row in attrs_df.iterrows():
        lot_id = row.get('LegalLotID')
        apn = row.get('AssessmentNo')
        if pd.notna(lot_id) and pd.notna(apn):
            lot_id = int(lot_id)
            apn_normalized = normalize_apn(apn)
            lot_to_apn[lot_id] = apn_normalized
            apn_to_lot[apn_normalized] = lot_id

    print(f"  APN mappings: {len(apn_to_lot)}")

    # Load shapefile
    gdf = gpd.read_file(SHAPEFILE_PATH)
    print(f"  Loaded {len(gdf)} parcel polygons")

    # Reproject to WGS84 if needed
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        print("  Reprojecting to WGS84...")
        gdf = gdf.to_crs(epsg=4326)

    # Create spatial index for point-in-polygon lookups
    print("  Building spatial index...")
    gdf_sindex = gdf.sindex

    return gdf, lot_to_apn, apn_to_lot, gdf_sindex


def find_parcel_by_apn(apn, gdf, apn_to_lot, lot_to_apn):
    """Find parcel geometry by APN."""
    apn_norm = normalize_apn(apn)
    if not apn_norm:
        return None

    # Find lot ID for this APN
    lot_id = apn_to_lot.get(apn_norm)
    if not lot_id:
        return None

    # Find row in geodataframe with this OID_JOIN
    matches = gdf[gdf['OID_JOIN'] == lot_id]
    if len(matches) > 0:
        return matches.iloc[0].geometry

    return None


def find_parcel_by_point(lat, lng, gdf, gdf_sindex, lot_to_apn):
    """Find parcel containing a point (for properties without APN)."""
    if not lat or not lng:
        return None, None

    point = Point(lng, lat)

    # Use spatial index to find candidate parcels
    possible_idx = list(gdf_sindex.intersection(point.bounds))
    if not possible_idx:
        return None, None

    # Check which parcel actually contains the point
    for idx in possible_idx:
        parcel = gdf.iloc[idx]
        if parcel.geometry.contains(point):
            # Get APN from lot ID
            lot_id = parcel.get('OID_JOIN')
            apn = lot_to_apn.get(lot_id) if pd.notna(lot_id) else None
            return parcel.geometry, apn

    return None, None


def main():
    print("=" * 60)
    print("Import Parcel Geometries for CRM Properties")
    print("=" * 60)

    # Load data
    properties, with_apn, without_apn = load_crm_properties()
    gdf, lot_to_apn, apn_to_lot, gdf_sindex = load_shapefile_index()

    # Connect to database
    print("\nConnecting to database...")
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Get existing parcels in database
    cur.execute("SELECT apn FROM parcel WHERE geometry IS NOT NULL")
    existing_apns = set(normalize_apn(row[0]) for row in cur.fetchall())
    print(f"  Existing parcels with geometry: {len(existing_apns)}")

    # Track results
    matched_by_apn = 0
    matched_by_point = 0
    already_exists = 0
    not_found = 0
    inserted = 0
    updated = 0

    # Process properties with APNs
    print("\n" + "=" * 60)
    print("Processing properties WITH APN...")
    print("=" * 60)

    inserts = []
    updates = []

    for i, prop in enumerate(with_apn):
        if i % 500 == 0:
            print(f"  Processing {i}/{len(with_apn)}...")

        apn = prop.get('apn')
        apn_norm = normalize_apn(apn)

        # Check if already in database with geometry
        if apn_norm in existing_apns:
            already_exists += 1
            continue

        # Find parcel in shapefile
        geom = find_parcel_by_apn(apn, gdf, apn_to_lot, lot_to_apn)

        if geom:
            matched_by_apn += 1
            wkt_str = geom.wkt
            centroid = geom.centroid

            # Check if parcel exists (without geometry)
            cur.execute("SELECT apn FROM parcel WHERE apn = %s", (apn_norm,))
            if cur.fetchone():
                updates.append((wkt_str, wkt_str, apn_norm))
            else:
                # Insert new parcel
                inserts.append((
                    apn_norm,
                    prop.get('full_address', ''),
                    prop.get('city', ''),
                    prop.get('zip', ''),
                    prop.get('sqft'),
                    prop.get('land_use', ''),
                    wkt_str,
                    wkt_str
                ))
        else:
            not_found += 1

    # Process properties without APNs (use spatial lookup)
    print("\n" + "=" * 60)
    print("Processing properties WITHOUT APN (spatial lookup)...")
    print("=" * 60)

    for i, prop in enumerate(without_apn):
        if i % 200 == 0:
            print(f"  Processing {i}/{len(without_apn)}...")

        lat = prop.get('latitude')
        lng = prop.get('longitude')

        if not lat or not lng:
            not_found += 1
            continue

        # Find parcel containing this point
        geom, found_apn = find_parcel_by_point(lat, lng, gdf, gdf_sindex, lot_to_apn)

        if geom and found_apn:
            matched_by_point += 1

            # Check if this APN already processed
            if found_apn in existing_apns:
                already_exists += 1
                continue

            wkt_str = geom.wkt

            # Check if parcel exists
            cur.execute("SELECT apn FROM parcel WHERE apn = %s", (found_apn,))
            if cur.fetchone():
                updates.append((wkt_str, wkt_str, found_apn))
            else:
                inserts.append((
                    found_apn,
                    prop.get('full_address', ''),
                    prop.get('city', ''),
                    prop.get('zip', ''),
                    prop.get('sqft'),
                    prop.get('land_use', ''),
                    wkt_str,
                    wkt_str
                ))

            existing_apns.add(found_apn)
        else:
            not_found += 1

    # Execute database operations
    print("\n" + "=" * 60)
    print("Updating database...")
    print("=" * 60)

    if updates:
        print(f"  Updating {len(updates)} existing parcels...")
        execute_batch(cur, """
            UPDATE parcel
            SET geometry = ST_GeomFromText(%s, 4326),
                centroid = ST_Centroid(ST_GeomFromText(%s, 4326))
            WHERE apn = %s
        """, updates)
        updated = len(updates)

    if inserts:
        print(f"  Inserting {len(inserts)} new parcels...")
        # Insert one by one to handle conflicts properly
        for ins in inserts:
            try:
                cur.execute("""
                    INSERT INTO parcel (apn, situs_address, city, zip, land_sf, zoning, geometry, centroid)
                    VALUES (%s, %s, %s, %s, %s, %s, ST_GeomFromText(%s, 4326), ST_Centroid(ST_GeomFromText(%s, 4326)))
                    ON CONFLICT (apn) DO UPDATE SET
                        geometry = ST_GeomFromText(%s, 4326),
                        centroid = ST_Centroid(ST_GeomFromText(%s, 4326))
                """, (ins[0], ins[1], ins[2], ins[3], ins[4], ins[5], ins[6], ins[7], ins[6], ins[7]))
                inserted += 1
            except Exception as e:
                print(f"    Error inserting {ins[0]}: {e}")

            if inserted % 100 == 0:
                conn.commit()
                print(f"    Inserted {inserted}...")

    conn.commit()

    # Final stats
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)
    print(f"  Matched by APN:      {matched_by_apn}")
    print(f"  Matched by location: {matched_by_point}")
    print(f"  Already in DB:       {already_exists}")
    print(f"  Not found:           {not_found}")
    print(f"  Parcels updated:     {updated}")
    print(f"  Parcels inserted:    {inserted}")

    # Verify
    cur.execute("SELECT COUNT(*) FROM parcel WHERE geometry IS NOT NULL")
    total_with_geom = cur.fetchone()[0]
    print(f"\n  Total parcels with geometry: {total_with_geom}")

    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == '__main__':
    main()
