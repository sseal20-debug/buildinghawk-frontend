#!/usr/bin/env python3
"""
Import extracted comp data from JSON files into the PostgreSQL database.
Handles the comprehensive data structure from the PDF extraction script.
"""

import os
import json
import psycopg2
from datetime import datetime

# Database connection
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres.qrgkwcofdwkodxanaubr:$ealTheDeal51!@aws-0-us-west-2.pooler.supabase.com:5432/postgres')

# Input files
COMP_FOLDER = r"C:\Users\User\Seal Industrial Dropbox\1    SOLD or LEASED_sealhudmag\1     NOC LEASE AND SALE COMPS\comp_extraction\output"


def clamp_numeric(value, max_val=999.99):
    """Clamp numeric values to fit database constraints."""
    if value is None:
        return None
    try:
        val = float(value)
        if val > max_val:
            return max_val
        if val < -max_val:
            return -max_val
        return val
    except (ValueError, TypeError):
        return None


def normalize_lease_structure(rent_type):
    """Normalize lease structure to database enum values."""
    if not rent_type:
        return 'nnn'
    rent_type = str(rent_type).lower().strip()
    if 'nnn' in rent_type or 'triple' in rent_type:
        return 'nnn'
    elif 'gross' in rent_type and 'modified' in rent_type:
        return 'modified_gross'
    elif 'gross' in rent_type and 'industrial' in rent_type:
        return 'industrial_gross'
    elif 'gross' in rent_type:
        return 'gross'
    elif 'fsg' in rent_type or 'full service' in rent_type:
        return 'fsg'
    return 'nnn'


def parse_date(value):
    """Parse date string to database format."""
    if not value:
        return None
    if isinstance(value, str):
        try:
            # Try ISO format first
            return datetime.fromisoformat(value.replace('Z', '+00:00')).strftime('%Y-%m-%d')
        except:
            pass
    return None


def map_source_to_enum(provider):
    """Map source provider to database enum value."""
    if not provider:
        return 'manual'
    provider = str(provider).lower()
    if 'costar' in provider or 'metropolis' in provider:
        return 'costar'
    elif 'loopnet' in provider:
        return 'loopnet'
    elif 'broker' in provider:
        return 'broker'
    elif 'public' in provider or 'county' in provider:
        return 'public_record'
    elif 'client' in provider:
        return 'client'
    return 'manual'


def import_lease_comp(cur, comp):
    """Import a single lease comp."""
    address = comp.get('address', {})
    prop = comp.get('property', {})
    trans = comp.get('transaction', {})
    fin = comp.get('financials', {})
    parties = comp.get('parties', {})
    source = comp.get('source', {})

    # Build comp record
    record = {
        'property_address': address.get('street', ''),
        'city': address.get('city', ''),
        'state': address.get('state', 'CA'),
        'submarket': prop.get('submarket') or prop.get('market') or 'Unknown',
        'building_sf': fin.get('building_sqft'),
        'leased_sf': fin.get('space_leased_sqft'),
        'office_sf': fin.get('office_sqft'),
        'year_built': prop.get('year_built'),
        'dock_doors': prop.get('dock_doors'),
        'gl_doors': prop.get('gl_doors'),
        'clear_height_ft': clamp_numeric(prop.get('clear_height'), 99.99),
        'lease_date': parse_date(trans.get('trans_date')),
        'lease_term_months': fin.get('term_months'),
        'lease_structure': normalize_lease_structure(fin.get('rent_type')),
        'starting_rent_psf': clamp_numeric(fin.get('rent_per_sqft')),
        'effective_rent_psf': clamp_numeric(fin.get('effective_rent')),
        'nnn_expenses_psf': clamp_numeric(fin.get('nnn_expenses')),
        'annual_increases': clamp_numeric(fin.get('annual_increases_pct'), 99.99),
        'free_rent_months': fin.get('free_rent_months'),
        'ti_allowance_psf': clamp_numeric(fin.get('ti_allowance')),
        'tenant_name': parties.get('lessee'),
        'landlord_name': parties.get('lessor'),
        'notes': comp.get('comments', '')[:1000] if comp.get('comments') else None,
        'source': map_source_to_enum(source.get('provider')),
        'source_id': source.get('record_id'),
    }

    # Use leased_sf as default if building_sf not set
    if not record['leased_sf'] and record['building_sf']:
        record['leased_sf'] = record['building_sf']

    # Skip if no essential data
    if not record['property_address'] or not record['leased_sf']:
        return False

    cur.execute("""
        INSERT INTO lease_comp (
            property_address, city, state, submarket,
            building_sf, leased_sf, office_sf, year_built,
            dock_doors, gl_doors, clear_height_ft,
            lease_date, lease_term_months, lease_structure,
            starting_rent_psf, effective_rent_psf, nnn_expenses_psf, annual_increases,
            free_rent_months, ti_allowance_psf, tenant_name, landlord_name,
            notes, source, source_id
        ) VALUES (
            %(property_address)s, %(city)s, %(state)s, %(submarket)s,
            %(building_sf)s, %(leased_sf)s, %(office_sf)s, %(year_built)s,
            %(dock_doors)s, %(gl_doors)s, %(clear_height_ft)s,
            %(lease_date)s, %(lease_term_months)s, %(lease_structure)s,
            %(starting_rent_psf)s, %(effective_rent_psf)s, %(nnn_expenses_psf)s, %(annual_increases)s,
            %(free_rent_months)s, %(ti_allowance_psf)s, %(tenant_name)s, %(landlord_name)s,
            %(notes)s, %(source)s, %(source_id)s
        )
        ON CONFLICT DO NOTHING
    """, record)
    return True


def normalize_sale_type(trans_type):
    """Normalize sale type to database enum values."""
    if not trans_type:
        return None
    trans_type = str(trans_type).lower().strip()
    if 'investment' in trans_type:
        return 'investment'
    elif 'user' in trans_type or 'owner' in trans_type:
        return 'owner_user'
    elif 'land' in trans_type:
        return 'land'
    elif 'portfolio' in trans_type:
        return 'portfolio'
    elif 'distress' in trans_type or 'foreclosure' in trans_type:
        return 'distressed'
    return None  # Allow NULL for unmatched types


def import_sale_comp(cur, comp):
    """Import a single sale comp."""
    address = comp.get('address', {})
    prop = comp.get('property', {})
    trans = comp.get('transaction', {})
    fin = comp.get('financials', {})
    parties = comp.get('parties', {})
    source = comp.get('source', {})

    # Try to get building SF from multiple places
    building_sf = (
        fin.get('building_sqft') or
        fin.get('space_sqft') or
        fin.get('space_leased_sqft') or
        prop.get('building_sqft') or
        prop.get('building_sf')
    )

    # Build comp record
    record = {
        'property_address': address.get('street', ''),
        'city': address.get('city', ''),
        'state': address.get('state', 'CA'),
        'submarket': prop.get('submarket') or prop.get('market') or 'Unknown',
        'building_sf': building_sf,
        'land_sf': fin.get('land_sqft'),
        'land_acres': fin.get('land_acres'),
        'year_built': prop.get('year_built'),
        'dock_doors': prop.get('dock_doors'),
        'gl_doors': prop.get('gl_doors'),
        'clear_height_ft': clamp_numeric(prop.get('clear_height'), 99.99),
        'sale_date': parse_date(trans.get('trans_date')),
        'sale_type': normalize_sale_type(trans.get('trans_type')),
        'sale_price': fin.get('sale_price'),
        'price_psf': clamp_numeric(fin.get('price_per_sqft')),
        'cap_rate': clamp_numeric(fin.get('cap_rate'), 99.99),
        'noi': fin.get('noi'),
        'occupancy_pct': clamp_numeric(fin.get('occupancy_pct'), 100),
        'buyer_name': parties.get('buyer'),
        'seller_name': parties.get('seller'),
        'notes': comp.get('comments', '')[:1000] if comp.get('comments') else None,
        'source': map_source_to_enum(source.get('provider')),
        'source_id': source.get('record_id'),
    }

    # Calculate price_psf if not provided
    if not record['price_psf'] and record['sale_price'] and record['building_sf']:
        record['price_psf'] = round(record['sale_price'] / record['building_sf'], 2)

    # For sale comps, we can import without building_sf if we have sale_price
    if not record['property_address'] or (not record['building_sf'] and not record['sale_price']):
        return False

    cur.execute("""
        INSERT INTO sale_comp (
            property_address, city, state, submarket,
            building_sf, land_sf, land_acres, year_built,
            dock_doors, gl_doors, clear_height_ft,
            sale_date, sale_type, sale_price, price_psf, cap_rate, noi, occupancy_pct,
            buyer_name, seller_name, notes, source, source_id
        ) VALUES (
            %(property_address)s, %(city)s, %(state)s, %(submarket)s,
            %(building_sf)s, %(land_sf)s, %(land_acres)s, %(year_built)s,
            %(dock_doors)s, %(gl_doors)s, %(clear_height_ft)s,
            %(sale_date)s, %(sale_type)s, %(sale_price)s, %(price_psf)s, %(cap_rate)s, %(noi)s, %(occupancy_pct)s,
            %(buyer_name)s, %(seller_name)s, %(notes)s, %(source)s, %(source_id)s
        )
        ON CONFLICT DO NOTHING
    """, record)
    return True


def main():
    print("=" * 60)
    print("Importing Extracted Comp Data")
    print("=" * 60)

    # Connect to database
    try:
        conn = psycopg2.connect(DATABASE_URL)
        print("Connected to database")
    except Exception as e:
        print(f"Database connection failed: {e}")
        return

    # Load all comps JSON
    json_path = os.path.join(COMP_FOLDER, 'all_comps.json')
    print(f"\nLoading: {json_path}")

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            all_comps = json.load(f)
        print(f"Loaded {len(all_comps)} comps")
    except Exception as e:
        print(f"Error loading JSON: {e}")
        conn.close()
        return

    cur = conn.cursor()

    # Clear existing CoStar-sourced data to avoid duplicates
    print("\nClearing previous CoStar extracts...")
    cur.execute("DELETE FROM lease_comp WHERE source = 'costar'")
    lease_deleted = cur.rowcount
    cur.execute("DELETE FROM sale_comp WHERE source = 'costar'")
    sale_deleted = cur.rowcount
    conn.commit()
    print(f"  Cleared {lease_deleted} lease comps, {sale_deleted} sale comps")

    # Import comps
    lease_count = 0
    sale_count = 0
    lease_errors = 0
    sale_errors = 0

    print("\nImporting comps...")
    for i, comp in enumerate(all_comps):
        try:
            if comp.get('type') == 'lease':
                if import_lease_comp(cur, comp):
                    lease_count += 1
            elif comp.get('type') == 'sale':
                if import_sale_comp(cur, comp):
                    sale_count += 1

            # Commit every 100 records
            if (i + 1) % 100 == 0:
                conn.commit()
                print(f"  Processed {i + 1}/{len(all_comps)}...")

        except Exception as e:
            conn.rollback()
            if comp.get('type') == 'lease':
                lease_errors += 1
            else:
                sale_errors += 1
            if lease_errors + sale_errors <= 5:
                print(f"  Error: {comp.get('address', {}).get('street')}: {e}")

    conn.commit()

    # Get final counts
    cur.execute("SELECT COUNT(*) FROM lease_comp")
    total_lease = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM sale_comp")
    total_sale = cur.fetchone()[0]

    print("\n" + "=" * 60)
    print("Import Complete!")
    print(f"  Lease Comps Imported: {lease_count} (errors: {lease_errors})")
    print(f"  Sale Comps Imported: {sale_count} (errors: {sale_errors})")
    print(f"\n  Total Lease Comps in DB: {total_lease}")
    print(f"  Total Sale Comps in DB: {total_sale}")
    print("=" * 60)

    conn.close()


if __name__ == '__main__':
    main()
