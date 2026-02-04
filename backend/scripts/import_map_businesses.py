#!/usr/bin/env python3
"""
Import geocoded map businesses into Industrial Tracker.

1. Creates entity records for each business
2. Matches to nearest parcel (PostGIS)
3. Creates building + unit if needed
4. Creates occupancy records (tenant)
5. Updates building_hawk_all.json with CRM property entries
"""

import json
import sys
import os
import time
import psycopg2
from pathlib import Path

# Database connection (same as backend .env)
DATABASE_URL = "postgresql://postgres.mcslwdnlpyxnugojmvjk:ViaDelRio23705!@aws-1-us-east-1.pooler.supabase.com:6543/postgres"

DATA_DIR = Path(__file__).parent.parent / "data"
INPUT_FILE = DATA_DIR / "map_businesses_geocoded.json"
CRM_JSON_FILE = DATA_DIR / "building_hawk_all.json"

# Anaheim bounds for validation
LAT_MIN, LAT_MAX = 33.825, 33.855
LNG_MIN, LNG_MAX = -117.920, -117.870


def get_connection():
    """Connect to PostgreSQL database."""
    return psycopg2.connect(DATABASE_URL)


def find_nearest_parcel(cur, lat, lng, max_distance_m=200):
    """Find the nearest parcel to the given coordinates."""
    cur.execute("""
        SELECT apn, situs_address, city,
               ST_Distance(
                   centroid::geography,
                   ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
               ) AS distance_m
        FROM parcel
        WHERE ST_DWithin(
            centroid::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
            %s
        )
        ORDER BY distance_m
        LIMIT 1
    """, (lng, lat, lng, lat, max_distance_m))
    return cur.fetchone()


def find_or_create_entity(cur, name, website="", notes=""):
    """Find existing entity by name or create new one."""
    # Try exact match first
    cur.execute("""
        SELECT id, entity_name FROM entity
        WHERE LOWER(entity_name) = LOWER(%s)
        LIMIT 1
    """, (name,))
    row = cur.fetchone()
    if row:
        return row[0], False  # id, was_created

    # Try fuzzy match
    cur.execute("""
        SELECT id, entity_name FROM entity
        WHERE entity_name ILIKE %s
        LIMIT 1
    """, (f"%{name}%",))
    row = cur.fetchone()
    if row:
        return row[0], False

    # Create new entity
    cur.execute("""
        INSERT INTO entity (entity_name, entity_type, website, notes)
        VALUES (%s, 'company', %s, %s)
        RETURNING id
    """, (name, website or None, notes or None))
    return cur.fetchone()[0], True


def find_or_create_building(cur, parcel_apn, building_name=None):
    """Find existing building on parcel or create new one."""
    cur.execute("""
        SELECT id FROM building WHERE parcel_apn = %s LIMIT 1
    """, (parcel_apn,))
    row = cur.fetchone()
    if row:
        return row[0], False

    cur.execute("""
        INSERT INTO building (parcel_apn, building_name)
        VALUES (%s, %s)
        RETURNING id
    """, (parcel_apn, building_name))
    return cur.fetchone()[0], True


def find_or_create_unit(cur, building_id, address):
    """Find existing unit in building or create new one."""
    cur.execute("""
        SELECT id FROM unit WHERE building_id = %s LIMIT 1
    """, (building_id,))
    row = cur.fetchone()
    if row:
        return row[0], False

    cur.execute("""
        INSERT INTO unit (building_id, street_address, unit_status)
        VALUES (%s, %s, 'occupied')
        RETURNING id
    """, (building_id, address))
    return cur.fetchone()[0], True


def create_occupancy(cur, unit_id, entity_id):
    """Create occupancy record linking entity to unit."""
    # Check if occupancy already exists
    cur.execute("""
        SELECT id FROM occupancy
        WHERE unit_id = %s AND entity_id = %s AND is_current = true
        LIMIT 1
    """, (unit_id, entity_id))
    if cur.fetchone():
        return None, False

    cur.execute("""
        INSERT INTO occupancy (unit_id, entity_id, occupant_type, is_current, market_status)
        VALUES (%s, %s, 'tenant', true, 'stable')
        RETURNING id
    """, (unit_id, entity_id))
    return cur.fetchone()[0], True


def import_to_database(businesses):
    """Import businesses into PostgreSQL database."""
    conn = get_connection()
    cur = conn.cursor()

    stats = {
        "entities_created": 0,
        "entities_existing": 0,
        "buildings_created": 0,
        "units_created": 0,
        "occupancy_created": 0,
        "no_parcel": 0,
        "errors": 0,
    }

    for biz in businesses:
        name = biz["original_name"]
        lat = biz.get("lat")
        lng = biz.get("lng")
        address = biz.get("address", "")
        notes = biz.get("notes", "")

        if not lat or not lng:
            stats["no_parcel"] += 1
            continue

        try:
            # 1. Find or create entity
            entity_id, created = find_or_create_entity(cur, name, notes=notes)
            if created:
                stats["entities_created"] += 1
            else:
                stats["entities_existing"] += 1

            # 2. Find nearest parcel
            parcel = find_nearest_parcel(cur, lat, lng)
            if not parcel:
                print(f"  NO PARCEL: {name} at ({lat}, {lng})")
                stats["no_parcel"] += 1
                conn.commit()
                continue

            apn, situs_addr, city, distance = parcel

            # 3. Find or create building
            building_id, b_created = find_or_create_building(cur, apn, name)
            if b_created:
                stats["buildings_created"] += 1

            # 4. Find or create unit
            unit_address = situs_addr or address.split(",")[0] if address else name
            unit_id, u_created = find_or_create_unit(cur, building_id, unit_address)
            if u_created:
                stats["units_created"] += 1

            # 5. Create occupancy
            occ_id, o_created = create_occupancy(cur, unit_id, entity_id)
            if o_created:
                stats["occupancy_created"] += 1

            conn.commit()

            status = "NEW" if created else "EXISTING"
            print(f"  {status}: {name} -> APN {apn} ({city}, {distance:.0f}m away)")

        except Exception as e:
            conn.rollback()
            print(f"  ERROR: {name} - {e}")
            stats["errors"] += 1

    cur.close()
    conn.close()

    return stats


def update_crm_json(businesses):
    """Add businesses to building_hawk_all.json."""
    # Load existing CRM data
    crm_data = {"properties": [], "stats": {}}
    if CRM_JSON_FILE.exists():
        with open(CRM_JSON_FILE, "r", encoding="utf-8") as f:
            crm_data = json.load(f)

    properties = crm_data.get("properties", [])
    if not isinstance(properties, list):
        properties = []

    # Get existing addresses to avoid duplicates
    existing_addresses = {
        (p.get("full_address", "") or p.get("address", "")).lower()
        for p in properties
    }

    # Find max ID
    max_id = 0
    for p in properties:
        try:
            pid = int(p.get("id", 0))
            max_id = max(max_id, pid)
        except (ValueError, TypeError):
            pass

    added = 0
    for biz in businesses:
        if not biz.get("lat") or not biz.get("lng"):
            continue

        address = biz.get("address", "")
        if not address:
            continue

        # Skip if address already exists
        if address.lower() in existing_addresses:
            continue

        max_id += 1

        # Parse city from address
        parts = address.split(",")
        city = parts[1].strip() if len(parts) > 1 else "Anaheim"
        state = "CA"
        zip_code = ""
        if len(parts) > 2:
            state_zip = parts[2].strip().split()
            if len(state_zip) >= 1:
                state = state_zip[0]
            if len(state_zip) >= 2:
                zip_code = state_zip[1]

        entry = {
            "id": max_id,
            "full_address": parts[0].strip() if parts else address,
            "city": city,
            "state": state,
            "zip": zip_code,
            "latitude": biz["lat"],
            "longitude": biz["lng"],
            "company": biz["original_name"],
            "owner_name": "",
            "contact_name": "",
            "phone": "",
            "sqft": None,
            "acreage": None,
            "apn": "",
            "land_use": "Industrial",
            "source": "map_logo_import",
            "last_sale_price": None,
            "last_sale_date": "",
        }

        properties.append(entry)
        existing_addresses.add(address.lower())
        added += 1

    # Update stats
    crm_data["properties"] = properties
    crm_data["stats"] = {
        "total_properties": len(properties),
        "cities": list(set(p.get("city", "") for p in properties if p.get("city"))),
    }

    # Save
    with open(CRM_JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(crm_data, f, indent=2, ensure_ascii=False)

    return added


def main():
    # Load geocoded businesses
    print(f"Loading geocoded businesses from {INPUT_FILE}")
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    businesses = [b for b in data["businesses"] if b.get("lat") and b.get("lng")]
    total = len(businesses)
    print(f"Found {total} geocoded businesses to import\n")

    # Import to database
    print("=" * 60)
    print("IMPORTING TO DATABASE")
    print("=" * 60)
    db_stats = import_to_database(businesses)

    print(f"\nDatabase Import Stats:")
    for key, val in db_stats.items():
        print(f"  {key}: {val}")

    # Update CRM JSON
    print(f"\n{'=' * 60}")
    print("UPDATING CRM JSON")
    print("=" * 60)
    crm_added = update_crm_json(businesses)
    print(f"Added {crm_added} new properties to {CRM_JSON_FILE.name}")

    print(f"\n{'=' * 60}")
    print("IMPORT COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
