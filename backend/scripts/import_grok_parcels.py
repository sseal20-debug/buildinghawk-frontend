#!/usr/bin/env python3
"""
Import Grok/BuildingHawk Parcel Data
====================================

Imports parcel and building data from the CSV files in AI_Projects/Grok/BuildingHawk/
into the BuildingHawk PostgreSQL database.

Usage:
    python import_grok_parcels.py --dry-run  # Preview without importing
    python import_grok_parcels.py             # Actually import
"""

import os
import sys
import argparse
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment from backend .env
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Data source paths
GROK_DATA_DIR = Path("C:/Users/User/AI_Projects/Grok/BuildingHawk")
CSV_FILES = [
    "Parcels.csv",
    "Parcels (1).csv",
    "Parcels (2).csv",
    "Parcels (3).csv",
]

# Column mappings from CSV to our schema
COLUMN_MAP = {
    'APN': 'apn',
    'SITE_ADDR': 'situs_address',
    'SITE_CITY': 'city',
    'SITE_ZIP': 'zip',
    'LAND_SQFT': 'land_sf',
    'ZONING_CODE': 'zoning',
    'OWNER_NAME_1': 'assessor_owner_name',
    'VAL_ASSD': 'assessed_total',
    'BUILDING_SQFT': 'building_sf',
    'YR_BLT': 'year_built',
    'LATITUDE': 'lat',
    'LONGITUDE': 'lng',
    'USE_CODE_STD_CTGR_DESC': 'use_category',
    'USE_CODE_STD_DESC': 'use_description',
}


def get_db_connection():
    """Get database connection from environment."""
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        raise ValueError("DATABASE_URL not set in environment")
    return psycopg2.connect(db_url)


def load_csv_files() -> pd.DataFrame:
    """Load and combine all CSV files."""
    all_data = []

    for filename in CSV_FILES:
        filepath = GROK_DATA_DIR / filename
        if filepath.exists():
            try:
                df = pd.read_csv(filepath, dtype=str)
                logger.info(f"Loaded {len(df)} rows from {filename}")
                all_data.append(df)
            except Exception as e:
                logger.error(f"Error loading {filename}: {e}")
        else:
            logger.warning(f"File not found: {filepath}")

    if not all_data:
        raise ValueError("No data files loaded")

    combined = pd.concat(all_data, ignore_index=True)
    logger.info(f"Total rows loaded: {len(combined)}")
    return combined


def clean_apn(apn: str) -> Optional[str]:
    """Clean and normalize APN."""
    if pd.isna(apn) or not apn:
        return None
    apn = str(apn).strip()
    # Remove any quotes
    apn = apn.replace("'", "").replace('"', '')
    return apn if apn else None


def clean_numeric(val, as_int=True):
    """Clean numeric values."""
    if pd.isna(val) or val == '' or val is None:
        return None
    try:
        num = float(str(val).replace(',', ''))
        return int(num) if as_int else num
    except (ValueError, TypeError):
        return None


def clean_string(val: str, max_len: int = 255) -> Optional[str]:
    """Clean string values."""
    if pd.isna(val) or not val:
        return None
    val = str(val).strip()
    # Remove surrounding quotes
    val = val.strip("'\"")
    return val[:max_len] if val else None


def clean_zip(val) -> Optional[str]:
    """Clean zip code."""
    if pd.isna(val) or not val:
        return None
    try:
        # Handle numeric zips
        num = int(float(str(val)))
        return str(num).zfill(5)[:10]
    except (ValueError, TypeError):
        return str(val).strip()[:10]


def deduplicate_by_apn(df: pd.DataFrame) -> pd.DataFrame:
    """Deduplicate rows, keeping the most complete record for each APN."""
    if 'APN' not in df.columns:
        return df

    # Calculate completeness score
    df['_completeness'] = df.apply(lambda row: row.notna().sum(), axis=1)

    # Sort by completeness (descending) and drop duplicates keeping first
    df = df.sort_values('_completeness', ascending=False)
    df = df.drop_duplicates(subset=['APN'], keep='first')
    df = df.drop(columns=['_completeness'])

    logger.info(f"After deduplication: {len(df)} unique parcels")
    return df


def prepare_parcel_data(df: pd.DataFrame) -> List[Dict]:
    """Prepare parcel data for insertion."""
    parcels = []

    for _, row in df.iterrows():
        apn = clean_apn(row.get('APN'))
        lat = clean_numeric(row.get('LATITUDE'), as_int=False)
        lng = clean_numeric(row.get('LONGITUDE'), as_int=False)

        if not apn or not lat or not lng:
            continue

        # Create a small polygon around the point (approx 80m square)
        # This is a placeholder - ideally we'd have real parcel geometries
        delta = 0.0004  # ~40m at this latitude
        geometry_wkt = f"POLYGON(({lng-delta} {lat-delta}, {lng+delta} {lat-delta}, {lng+delta} {lat+delta}, {lng-delta} {lat+delta}, {lng-delta} {lat-delta}))"

        parcel = {
            'apn': apn,
            'situs_address': clean_string(row.get('SITE_ADDR')),
            'city': clean_string(row.get('SITE_CITY'), 100),
            'zip': clean_zip(row.get('SITE_ZIP')),
            'land_sf': clean_numeric(row.get('LAND_SQFT')),
            'zoning': clean_string(row.get('ZONING_CODE'), 50),
            'assessor_owner_name': clean_string(row.get('OWNER_NAME_1')),
            'geometry_wkt': geometry_wkt,
        }

        parcels.append(parcel)

    return parcels


def prepare_building_data(df: pd.DataFrame) -> List[Dict]:
    """Prepare building data for insertion."""
    buildings = []

    for _, row in df.iterrows():
        apn = clean_apn(row.get('APN'))
        building_sf = clean_numeric(row.get('BUILDING_SQFT'))

        # Only create building if we have APN and building SF > 0
        if not apn or not building_sf or building_sf <= 0:
            continue

        building = {
            'parcel_apn': apn,
            'building_sf': building_sf,
            'year_built': clean_numeric(row.get('YR_BLT')),
            'building_name': None,  # Could extract from use description
        }

        buildings.append(building)

    return buildings


def get_existing_apns(conn) -> set:
    """Get set of existing APNs in database."""
    with conn.cursor() as cur:
        cur.execute("SELECT apn FROM parcel")
        return {row[0] for row in cur.fetchall()}


def import_parcels(conn, parcels: List[Dict], dry_run: bool = False) -> Tuple[int, int, int]:
    """Import parcels into database."""
    existing = get_existing_apns(conn)
    logger.info(f"Existing parcels in DB: {len(existing)}")

    new_parcels = [p for p in parcels if p['apn'] not in existing]
    update_parcels = [p for p in parcels if p['apn'] in existing]

    logger.info(f"New parcels to insert: {len(new_parcels)}")
    logger.info(f"Existing parcels to update: {len(update_parcels)}")

    if dry_run:
        return len(new_parcels), len(update_parcels), 0

    inserted = 0
    updated = 0
    errors = 0

    with conn.cursor() as cur:
        # Insert new parcels
        for p in new_parcels:
            try:
                cur.execute("""
                    INSERT INTO parcel (apn, geometry, situs_address, city, zip, land_sf, zoning, assessor_owner_name)
                    VALUES (%s, ST_GeomFromText(%s, 4326), %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (apn) DO NOTHING
                """, (
                    p['apn'],
                    p['geometry_wkt'],
                    p['situs_address'],
                    p['city'],
                    p['zip'],
                    p['land_sf'],
                    p['zoning'],
                    p['assessor_owner_name']
                ))
                inserted += 1
            except Exception as e:
                errors += 1
                if errors <= 5:
                    logger.error(f"Insert error for {p['apn']}: {e}")

        # Update existing parcels (fill in missing data)
        for p in update_parcels:
            try:
                cur.execute("""
                    UPDATE parcel SET
                        situs_address = COALESCE(situs_address, %s),
                        city = COALESCE(city, %s),
                        zip = COALESCE(zip, %s),
                        land_sf = COALESCE(land_sf, %s),
                        zoning = COALESCE(zoning, %s),
                        assessor_owner_name = COALESCE(assessor_owner_name, %s),
                        updated_at = NOW()
                    WHERE apn = %s
                """, (
                    p['situs_address'],
                    p['city'],
                    p['zip'],
                    p['land_sf'],
                    p['zoning'],
                    p['assessor_owner_name'],
                    p['apn']
                ))
                updated += 1
            except Exception as e:
                errors += 1
                if errors <= 5:
                    logger.error(f"Update error for {p['apn']}: {e}")

        conn.commit()

    return inserted, updated, errors


def import_buildings(conn, buildings: List[Dict], dry_run: bool = False) -> Tuple[int, int, int]:
    """Import buildings into database."""
    # Get existing parcel APNs
    existing_apns = get_existing_apns(conn)

    # Filter to only buildings with valid parcel references
    valid_buildings = [b for b in buildings if b['parcel_apn'] in existing_apns]
    logger.info(f"Buildings with valid parcel references: {len(valid_buildings)}")

    # Get existing buildings by parcel
    with conn.cursor() as cur:
        cur.execute("SELECT parcel_apn FROM building")
        existing_building_parcels = {row[0] for row in cur.fetchall()}

    new_buildings = [b for b in valid_buildings if b['parcel_apn'] not in existing_building_parcels]

    logger.info(f"New buildings to insert: {len(new_buildings)}")

    if dry_run:
        return len(new_buildings), 0, 0

    inserted = 0
    errors = 0

    with conn.cursor() as cur:
        for b in new_buildings:
            try:
                cur.execute("""
                    INSERT INTO building (parcel_apn, building_sf, year_built, building_name)
                    VALUES (%s, %s, %s, %s)
                """, (
                    b['parcel_apn'],
                    b['building_sf'],
                    b['year_built'],
                    b['building_name']
                ))
                inserted += 1
            except Exception as e:
                errors += 1
                if errors <= 5:
                    logger.error(f"Building insert error: {e}")

        conn.commit()

    return inserted, 0, errors


def print_summary(conn):
    """Print final database counts."""
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM parcel")
        parcel_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM building")
        building_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM unit")
        unit_count = cur.fetchone()[0]

        cur.execute("SELECT city, COUNT(*) FROM parcel WHERE city IS NOT NULL GROUP BY city ORDER BY COUNT(*) DESC LIMIT 10")
        cities = cur.fetchall()

    print("\n" + "="*50)
    print("DATABASE SUMMARY")
    print("="*50)
    print(f"Total Parcels:   {parcel_count:,}")
    print(f"Total Buildings: {building_count:,}")
    print(f"Total Units:     {unit_count:,}")
    print("\nTop Cities:")
    for city, count in cities:
        print(f"  {city}: {count:,}")
    print("="*50)


def main():
    parser = argparse.ArgumentParser(description='Import Grok/BuildingHawk parcel data')
    parser.add_argument('--dry-run', action='store_true', help='Preview without importing')
    args = parser.parse_args()

    print("="*50)
    print("GROK/BUILDINGHAWK PARCEL IMPORT")
    print("="*50)

    # Load data
    logger.info("Loading CSV files...")
    df = load_csv_files()

    # Deduplicate
    df = deduplicate_by_apn(df)

    # Prepare data
    logger.info("Preparing parcel data...")
    parcels = prepare_parcel_data(df)
    logger.info(f"Prepared {len(parcels)} parcels")

    logger.info("Preparing building data...")
    buildings = prepare_building_data(df)
    logger.info(f"Prepared {len(buildings)} buildings")

    if args.dry_run:
        print("\n" + "="*50)
        print("DRY RUN - No data will be imported")
        print("="*50)
        print(f"Parcels to process:  {len(parcels)}")
        print(f"Buildings to process: {len(buildings)}")
        print("\nSample parcels:")
        for p in parcels[:3]:
            print(f"  {p['apn']}: {p['situs_address']}, {p['city']}")
        print("="*50)
        return

    # Connect and import
    logger.info("Connecting to database...")
    conn = get_db_connection()

    try:
        logger.info("Importing parcels...")
        p_ins, p_upd, p_err = import_parcels(conn, parcels)
        print(f"Parcels: {p_ins} inserted, {p_upd} updated, {p_err} errors")

        logger.info("Importing buildings...")
        b_ins, b_upd, b_err = import_buildings(conn, buildings)
        print(f"Buildings: {b_ins} inserted, {b_err} errors")

        print_summary(conn)
        print("\n[OK] Import complete!")

    finally:
        conn.close()


if __name__ == '__main__':
    main()
