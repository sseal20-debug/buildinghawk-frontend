#!/usr/bin/env python3
"""
Import APN Watchlist
====================

Import industrial parcel APNs from CSV/Excel into the deed monitor watchlist.

This script helps you load your existing BuildingHawk data or county parcel
exports into the apn_watchlist table for monitoring.

Usage:
    # From CSV
    python import_watchlist.py --input parcels.csv
    
    # From Excel
    python import_watchlist.py --input parcels.xlsx --sheet "Industrial"
    
    # From existing Supabase table
    python import_watchlist.py --from-table properties --filter "property_type=industrial"
    
    # With column mapping
    python import_watchlist.py --input parcels.csv --mapping mapping.json
"""

import os
import sys
import json
import argparse
import logging
from typing import Dict, List, Optional
import pandas as pd
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)


# Default column mappings (source column -> target column)
DEFAULT_MAPPING = {
    # APN variations
    'apn': 'apn',
    'APN': 'apn',
    'parcel_apn': 'apn',
    'parcel_number': 'apn',
    'parcel': 'apn',
    'Parcel Number': 'apn',
    'PARCEL_ID': 'apn',
    
    # Address variations
    'address': 'address',
    'Address': 'address',
    'property_address': 'address',
    'situs_address': 'address',
    'SITUS_ADDR': 'address',
    'site_address': 'address',
    
    # City
    'city': 'city',
    'City': 'city',
    'situs_city': 'city',
    'SITUS_CITY': 'city',
    
    # State
    'state': 'state',
    'State': 'state',
    
    # Zip
    'zip': 'zip',
    'Zip': 'zip',
    'zip_code': 'zip',
    'postal_code': 'zip',
    
    # Building SF
    'building_sf': 'building_sf',
    'Building SF': 'building_sf',
    'building_sqft': 'building_sf',
    'improvement_sf': 'building_sf',
    'bldg_area': 'building_sf',
    'BLDG_SQFT': 'building_sf',
    
    # Lot SF
    'lot_sf': 'lot_sf',
    'Lot SF': 'lot_sf',
    'land_sf': 'lot_sf',
    'lot_size': 'lot_sf',
    'LAND_SQFT': 'lot_sf',
    'site_sf': 'lot_sf',
    
    # Year Built
    'year_built': 'year_built',
    'Year Built': 'year_built',
    'YR_BUILT': 'year_built',
    'year_constructed': 'year_built',
    
    # Zoning
    'zoning': 'zoning',
    'Zoning': 'zoning',
    'zone_code': 'zoning',
    'ZONING': 'zoning',
    
    # Assessed values
    'assessed_land': 'assessed_land',
    'land_value': 'assessed_land',
    'LAND_VALUE': 'assessed_land',
    
    'assessed_improvements': 'assessed_improvements',
    'improvement_value': 'assessed_improvements',
    'IMPR_VALUE': 'assessed_improvements',
    
    'assessed_total': 'assessed_total',
    'total_value': 'assessed_total',
    'assessed_value': 'assessed_total',
    'TOTAL_VALUE': 'assessed_total',
    
    # Coordinates
    'latitude': 'latitude',
    'lat': 'latitude',
    'LAT': 'latitude',
    'longitude': 'longitude',
    'lon': 'longitude',
    'lng': 'longitude',
    'LONG': 'longitude',
}


def normalize_apn(apn: str) -> str:
    """Normalize APN to standard format (XXX-XXX-XX)."""
    if not apn:
        return ''
    
    # Remove any non-alphanumeric characters
    clean = ''.join(c for c in str(apn) if c.isalnum())
    
    # If 8 digits, format as XXX-XXX-XX
    if len(clean) == 8 and clean.isdigit():
        return f"{clean[:3]}-{clean[3:6]}-{clean[6:8]}"
    
    # Return as-is if doesn't match expected pattern
    return str(apn).strip()


def load_data(
    filepath: str,
    sheet_name: Optional[str] = None
) -> pd.DataFrame:
    """Load data from CSV or Excel file."""
    
    ext = filepath.lower().split('.')[-1]
    
    if ext == 'csv':
        df = pd.read_csv(filepath, dtype=str)
    elif ext in ('xlsx', 'xls'):
        df = pd.read_excel(filepath, sheet_name=sheet_name or 0, dtype=str)
    else:
        raise ValueError(f"Unsupported file format: {ext}")
    
    logger.info(f"Loaded {len(df)} rows from {filepath}")
    return df


def map_columns(
    df: pd.DataFrame,
    custom_mapping: Optional[Dict[str, str]] = None
) -> pd.DataFrame:
    """Map source columns to target schema."""
    
    # Combine default and custom mappings
    mapping = DEFAULT_MAPPING.copy()
    if custom_mapping:
        mapping.update(custom_mapping)
    
    # Find matching columns
    rename_map = {}
    for source_col in df.columns:
        if source_col in mapping:
            rename_map[source_col] = mapping[source_col]
    
    # Rename columns
    df = df.rename(columns=rename_map)
    
    # Log mapping results
    logger.info(f"Mapped columns: {rename_map}")
    
    return df


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """Clean and validate data."""
    
    # Require APN
    if 'apn' not in df.columns:
        raise ValueError("No APN column found. Check column mapping.")
    
    # Remove rows without APN
    original_count = len(df)
    df = df[df['apn'].notna() & (df['apn'] != '')]
    logger.info(f"Removed {original_count - len(df)} rows with missing APN")
    
    # Normalize APNs
    df['apn'] = df['apn'].apply(normalize_apn)
    
    # Remove duplicates
    dup_count = df.duplicated(subset=['apn']).sum()
    if dup_count > 0:
        df = df.drop_duplicates(subset=['apn'], keep='first')
        logger.info(f"Removed {dup_count} duplicate APNs")
    
    # Convert numeric columns
    numeric_cols = ['building_sf', 'lot_sf', 'year_built', 
                    'assessed_land', 'assessed_improvements', 'assessed_total',
                    'latitude', 'longitude']
    
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    
    return df


def prepare_records(df: pd.DataFrame) -> List[Dict]:
    """Prepare records for database insertion."""
    
    # Define valid columns for the watchlist table
    valid_columns = {
        'apn', 'address', 'city', 'state', 'zip', 'county',
        'property_type', 'building_sf', 'lot_sf', 'year_built', 'zoning',
        'assessed_land', 'assessed_improvements', 'assessed_total',
        'assessment_year', 'is_listed_for_sale', 'listing_price'
    }
    
    records = []
    for _, row in df.iterrows():
        record = {}
        
        for col in valid_columns:
            if col in row.index and pd.notna(row[col]):
                value = row[col]
                # Convert numpy types to Python types
                if hasattr(value, 'item'):
                    value = value.item()
                record[col] = value
        
        # Add geometry if coordinates present
        if 'latitude' in row.index and 'longitude' in row.index:
            if pd.notna(row['latitude']) and pd.notna(row['longitude']):
                record['geom'] = f"POINT({row['longitude']} {row['latitude']})"
        
        # Set defaults
        record.setdefault('property_type', 'industrial')
        record.setdefault('state', 'CA')
        record.setdefault('county', 'Orange')
        
        records.append(record)
    
    return records


def import_to_supabase(
    records: List[Dict],
    supabase_url: str,
    supabase_key: str,
    batch_size: int = 500,
    upsert: bool = True
) -> Dict:
    """Import records to Supabase apn_watchlist table."""
    
    db = create_client(supabase_url, supabase_key)
    
    stats = {
        'total': len(records),
        'inserted': 0,
        'errors': 0
    }
    
    # Process in batches
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        
        try:
            if upsert:
                result = db.table('apn_watchlist').upsert(
                    batch,
                    on_conflict='apn'
                ).execute()
            else:
                result = db.table('apn_watchlist').insert(batch).execute()
            
            stats['inserted'] += len(result.data)
            logger.info(f"Batch {i//batch_size + 1}: Inserted {len(result.data)} records")
            
        except Exception as e:
            logger.error(f"Batch {i//batch_size + 1} error: {e}")
            stats['errors'] += len(batch)
    
    return stats


def main():
    parser = argparse.ArgumentParser(
        description='Import APNs into deed monitor watchlist'
    )
    parser.add_argument(
        '--input', '-i',
        required=True,
        help='Input file (CSV or Excel)'
    )
    parser.add_argument(
        '--sheet',
        help='Sheet name for Excel files'
    )
    parser.add_argument(
        '--mapping',
        help='JSON file with custom column mapping'
    )
    parser.add_argument(
        '--county',
        default='Orange',
        help='Default county (default: Orange)'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=500,
        help='Batch size for database inserts (default: 500)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Validate data without importing'
    )
    parser.add_argument(
        '--no-upsert',
        action='store_true',
        help='Insert only, fail on duplicates'
    )
    
    args = parser.parse_args()
    
    # Load config
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_KEY')
    
    if not args.dry_run and (not supabase_url or not supabase_key):
        logger.error("SUPABASE_URL and SUPABASE_KEY environment variables required")
        sys.exit(1)
    
    # Load custom mapping if provided
    custom_mapping = None
    if args.mapping:
        with open(args.mapping) as f:
            custom_mapping = json.load(f)
    
    # Process data
    try:
        # Load
        df = load_data(args.input, args.sheet)
        
        # Map columns
        df = map_columns(df, custom_mapping)
        
        # Clean
        df = clean_data(df)
        
        # Set default county
        df['county'] = args.county
        
        # Prepare records
        records = prepare_records(df)
        
        logger.info(f"Prepared {len(records)} records for import")
        
        if args.dry_run:
            print("\n" + "="*50)
            print("DRY RUN - No data imported")
            print("="*50)
            print(f"Records to import: {len(records)}")
            print("\nSample records:")
            for record in records[:3]:
                print(f"  - {record.get('apn')}: {record.get('address')}, {record.get('city')}")
            print("="*50)
            return
        
        # Import
        stats = import_to_supabase(
            records,
            supabase_url,
            supabase_key,
            batch_size=args.batch_size,
            upsert=not args.no_upsert
        )
        
        print("\n" + "="*50)
        print("IMPORT COMPLETE")
        print("="*50)
        print(f"Total records: {stats['total']}")
        print(f"Inserted/Updated: {stats['inserted']}")
        print(f"Errors: {stats['errors']}")
        print("="*50)
        
    except Exception as e:
        logger.error(f"Import failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
