#!/usr/bin/env python3
"""
Populate Lot/Tract to APN Lookup Table
======================================

This script populates the lot_tract_apn_lookup table from various sources:

1. OC Assessor Parcel Data (CSV or Shapefile)
   - Download from: https://www.ocgov.com/gov/assessor
   - Contains: APN, Legal Description (has Lot/Tract)

2. LandVision Export
   - User has access to LandVision
   - Export parcels with Lot/Tract/APN fields

3. TitlePro Export
   - User has access to TitlePro
   - Export parcel data with legal descriptions

4. Manual CSV Import
   - Create CSV with columns: lot_number, tract_number, city, apn

Usage:
    # From CSV
    python populate_lot_tract_lookup.py --csv lot_tract_data.csv

    # From OC Assessor shapefile
    python populate_lot_tract_lookup.py --shapefile Parcels.shp

    # Extract from watchlist parcels (use existing data)
    python populate_lot_tract_lookup.py --from-watchlist

    # Interactive mode - prompts for data
    python populate_lot_tract_lookup.py --interactive
"""

import os
import re
import csv
import json
import argparse
import logging
from typing import Dict, List, Optional, Tuple
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


def get_supabase_client():
    """Initialize Supabase client."""
    from supabase import create_client

    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_KEY')

    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY required")

    return create_client(url, key)


def create_lot_tract_table(db) -> bool:
    """
    Create the lot_tract_apn_lookup table if it doesn't exist.

    Note: This requires the SQL to be run in Supabase dashboard first.
    This function checks if the table exists.
    """
    try:
        result = db.table('lot_tract_apn_lookup').select('id').limit(1).execute()
        logger.info("lot_tract_apn_lookup table exists")
        return True
    except Exception as e:
        logger.error(f"Table does not exist. Please run sql/002_lot_tract_lookup.sql in Supabase first.")
        logger.error(f"Dashboard: https://supabase.com/dashboard/project/mcslwdnlpyxnugojmvjk/sql")
        return False


def parse_legal_description(legal_desc: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse lot and tract numbers from a legal description.

    Examples:
    - "LOT 87 OF TRACT NO 13141" -> ('87', '13141')
    - "TR 5000 LOT 1 BLOCK A" -> ('1', '5000')
    - "TRACT 7128 LOT 2" -> ('2', '7128')
    """
    if not legal_desc:
        return None, None

    legal_desc = legal_desc.upper()

    # Pattern 1: LOT X OF TRACT Y
    match = re.search(r'LOT\s+(\d+).*?TRACT\s+(?:NO\s*)?(\d+)', legal_desc)
    if match:
        return match.group(1), match.group(2)

    # Pattern 2: TRACT Y LOT X
    match = re.search(r'TRACT\s+(?:NO\s*)?(\d+).*?LOT\s+(\d+)', legal_desc)
    if match:
        return match.group(2), match.group(1)

    # Pattern 3: TR Y LOT X
    match = re.search(r'TR\s+(\d+).*?LOT\s+(\d+)', legal_desc)
    if match:
        return match.group(2), match.group(1)

    # Pattern 4: Just LOT and TRACT anywhere
    lot_match = re.search(r'LOT\s+(\d+)', legal_desc)
    tract_match = re.search(r'(?:TRACT|TR)\s+(?:NO\s*)?(\d+)', legal_desc)

    if lot_match and tract_match:
        return lot_match.group(1), tract_match.group(1)

    return None, None


def load_from_csv(db, csv_path: str, source: str = 'csv') -> int:
    """
    Load Lot/Tract data from CSV file.

    Expected columns (flexible naming):
    - lot_number / lot / LOT
    - tract_number / tract / TRACT
    - city / CITY / situs_city
    - apn / APN / parcel_number
    - legal_description (optional - will parse lot/tract from this)
    """
    if not os.path.exists(csv_path):
        logger.error(f"File not found: {csv_path}")
        return 0

    count = 0
    records = []

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames

        # Identify column names
        lot_col = next((c for c in columns if c.lower() in ['lot_number', 'lot', 'lot_num']), None)
        tract_col = next((c for c in columns if c.lower() in ['tract_number', 'tract', 'tract_num']), None)
        city_col = next((c for c in columns if c.lower() in ['city', 'situs_city', 'property_city']), None)
        apn_col = next((c for c in columns if c.lower() in ['apn', 'parcel_number', 'parcel_apn']), None)
        legal_col = next((c for c in columns if 'legal' in c.lower()), None)

        logger.info(f"Columns found: lot={lot_col}, tract={tract_col}, city={city_col}, apn={apn_col}, legal={legal_col}")

        for row in reader:
            apn = row.get(apn_col, '').strip() if apn_col else ''
            lot = row.get(lot_col, '').strip() if lot_col else ''
            tract = row.get(tract_col, '').strip() if tract_col else ''
            city = row.get(city_col, '').strip() if city_col else ''

            # Try parsing from legal description if lot/tract not found
            if not lot or not tract:
                if legal_col:
                    legal_desc = row.get(legal_col, '')
                    parsed_lot, parsed_tract = parse_legal_description(legal_desc)
                    lot = lot or parsed_lot
                    tract = tract or parsed_tract

            if apn and lot and tract:
                records.append({
                    'lot_number': str(lot),
                    'tract_number': str(tract),
                    'city': city,
                    'apn': apn,
                    'source': source
                })
                count += 1

                # Batch insert
                if len(records) >= 500:
                    db.table('lot_tract_apn_lookup').upsert(
                        records,
                        on_conflict='lot_number,tract_number,city'
                    ).execute()
                    logger.info(f"Inserted {count} records...")
                    records = []

    # Insert remaining
    if records:
        db.table('lot_tract_apn_lookup').upsert(
            records,
            on_conflict='lot_number,tract_number,city'
        ).execute()

    logger.info(f"Loaded {count} Lot/Tract mappings from {csv_path}")
    return count


def load_from_shapefile(db, shapefile_path: str) -> int:
    """
    Load Lot/Tract data from OC Assessor shapefile.

    Requires: pip install geopandas
    """
    try:
        import geopandas as gpd
    except ImportError:
        logger.error("geopandas required: pip install geopandas")
        return 0

    if not os.path.exists(shapefile_path):
        logger.error(f"File not found: {shapefile_path}")
        return 0

    logger.info(f"Loading shapefile: {shapefile_path}")
    gdf = gpd.read_file(shapefile_path)
    logger.info(f"Columns: {list(gdf.columns)}")

    # Identify columns
    apn_col = None
    lot_col = None
    tract_col = None
    city_col = None
    legal_col = None

    for col in gdf.columns:
        col_lower = col.lower()
        if 'apn' in col_lower or 'parcel' in col_lower:
            apn_col = col
        elif col_lower in ['lot', 'lot_num', 'lot_number']:
            lot_col = col
        elif col_lower in ['tract', 'tract_num', 'tract_number']:
            tract_col = col
        elif 'city' in col_lower or 'situs' in col_lower:
            city_col = col
        elif 'legal' in col_lower:
            legal_col = col

    logger.info(f"Identified: apn={apn_col}, lot={lot_col}, tract={tract_col}, city={city_col}, legal={legal_col}")

    if not apn_col:
        logger.error("Could not identify APN column")
        return 0

    count = 0
    records = []

    for _, row in gdf.iterrows():
        apn = str(row[apn_col]).strip() if row[apn_col] else ''
        lot = str(row[lot_col]).strip() if lot_col and row[lot_col] else ''
        tract = str(row[tract_col]).strip() if tract_col and row[tract_col] else ''
        city = str(row[city_col]).strip() if city_col and row[city_col] else ''

        # Parse from legal description if needed
        if not lot or not tract:
            if legal_col and row[legal_col]:
                parsed_lot, parsed_tract = parse_legal_description(str(row[legal_col]))
                lot = lot or parsed_lot or ''
                tract = tract or parsed_tract or ''

        if apn and lot and tract:
            records.append({
                'lot_number': lot,
                'tract_number': tract,
                'city': city,
                'apn': apn,
                'source': 'assessor'
            })
            count += 1

            if len(records) >= 500:
                db.table('lot_tract_apn_lookup').upsert(
                    records,
                    on_conflict='lot_number,tract_number,city'
                ).execute()
                logger.info(f"Inserted {count} records...")
                records = []

    if records:
        db.table('lot_tract_apn_lookup').upsert(
            records,
            on_conflict='lot_number,tract_number,city'
        ).execute()

    logger.info(f"Loaded {count} Lot/Tract mappings from shapefile")
    return count


def extract_from_watchlist(db) -> int:
    """
    Extract Lot/Tract data from existing watchlist parcels.

    This uses any legal description data stored in the watchlist
    or raw_data fields to build mappings.
    """
    logger.info("Extracting Lot/Tract from watchlist parcels...")

    # Query watchlist for parcels with potential lot/tract data
    # This depends on what fields are available

    # For now, let's check what we have
    result = db.table('apn_watchlist').select('apn, city').limit(10).execute()

    if not result.data:
        logger.warning("No parcels in watchlist")
        return 0

    logger.info(f"Sample watchlist data: {result.data[0]}")
    logger.warning("Watchlist doesn't have lot/tract data stored. Need external data source.")

    return 0


def interactive_add(db):
    """Interactive mode to add Lot/Tract mappings manually."""
    print("\n=== Interactive Lot/Tract Entry ===")
    print("Enter Lot/Tract mappings (Ctrl+C to exit)\n")

    count = 0
    while True:
        try:
            lot = input("Lot Number: ").strip()
            tract = input("Tract Number: ").strip()
            city = input("City: ").strip()
            apn = input("APN: ").strip()

            if not all([lot, tract, apn]):
                print("Lot, Tract, and APN are required. Try again.\n")
                continue

            db.table('lot_tract_apn_lookup').upsert({
                'lot_number': lot,
                'tract_number': tract,
                'city': city,
                'apn': apn,
                'source': 'manual'
            }, on_conflict='lot_number,tract_number,city').execute()

            count += 1
            print(f"Added: Lot {lot}, Tract {tract} -> {apn}")
            print()

        except KeyboardInterrupt:
            break

    print(f"\nAdded {count} mappings.")
    return count


def show_sample_csv_format():
    """Show the expected CSV format."""
    print("""
=== Expected CSV Format ===

Option 1 (Direct columns):
lot_number,tract_number,city,apn
87,13141,Rancho Santa Margarita,754-012-03
1,9436,Huntington Beach,023-456-78
2,7128,Laguna Woods,938-271-01

Option 2 (With legal description):
apn,city,legal_description
754-012-03,Rancho Santa Margarita,"LOT 87 OF TRACT NO 13141"
023-456-78,Huntington Beach,"TR 9436 LOT 1"
938-271-01,Laguna Woods,"TRACT 7128 LOT 2 BLOCK A"

The script will automatically parse lot/tract from legal descriptions.
    """)


def main():
    parser = argparse.ArgumentParser(
        description='Populate Lot/Tract to APN lookup table',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python populate_lot_tract_lookup.py --csv lot_tract_data.csv
    python populate_lot_tract_lookup.py --shapefile OC_Parcels.shp
    python populate_lot_tract_lookup.py --interactive
    python populate_lot_tract_lookup.py --show-format
        """
    )

    parser.add_argument('--csv', help='Load from CSV file')
    parser.add_argument('--shapefile', help='Load from assessor shapefile')
    parser.add_argument('--from-watchlist', action='store_true',
                       help='Extract from existing watchlist data')
    parser.add_argument('--interactive', action='store_true',
                       help='Interactive manual entry mode')
    parser.add_argument('--show-format', action='store_true',
                       help='Show expected CSV format')
    parser.add_argument('--check-table', action='store_true',
                       help='Check if table exists')

    args = parser.parse_args()

    if args.show_format:
        show_sample_csv_format()
        return

    # Initialize Supabase
    db = get_supabase_client()

    if args.check_table:
        create_lot_tract_table(db)
        return

    # Check table exists
    if not create_lot_tract_table(db):
        print("\nPlease create the table first by running the SQL in Supabase dashboard.")
        print("SQL file: sql/002_lot_tract_lookup.sql")
        return

    # Load data
    if args.csv:
        count = load_from_csv(db, args.csv)
        print(f"\nLoaded {count} Lot/Tract mappings from CSV")

    elif args.shapefile:
        count = load_from_shapefile(db, args.shapefile)
        print(f"\nLoaded {count} Lot/Tract mappings from shapefile")

    elif args.from_watchlist:
        count = extract_from_watchlist(db)
        print(f"\nExtracted {count} Lot/Tract mappings from watchlist")

    elif args.interactive:
        count = interactive_add(db)

    else:
        parser.print_help()
        print("\n=== Current Status ===")

        try:
            result = db.table('lot_tract_apn_lookup').select('id').execute()
            print(f"Lot/Tract lookup table has {len(result.data)} records")
        except:
            print("Lot/Tract lookup table not found - needs to be created")


if __name__ == '__main__':
    main()
