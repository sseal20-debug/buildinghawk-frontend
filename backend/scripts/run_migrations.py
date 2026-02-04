#!/usr/bin/env python3
"""
Run SQL Migrations against PostgreSQL/Supabase
===============================================

Executes SQL migration files directly against the database.

Usage:
    python run_migrations.py                          # Run all migrations
    python run_migrations.py --file sql/001_schema.sql  # Run specific file
    python run_migrations.py --deed-monitor           # Run deed monitor migrations
"""

import os
import sys
import argparse
import logging
from pathlib import Path
import psycopg2
from dotenv import load_dotenv

# Setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# Load environment
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)


def get_db_connection():
    """Get database connection."""
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        raise ValueError("DATABASE_URL not set")
    return psycopg2.connect(db_url)


def run_sql_file(conn, filepath: Path) -> bool:
    """Execute SQL from file."""
    logger.info(f"Running migration: {filepath.name}")

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            sql = f.read()

        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()

        logger.info(f"[OK] Completed: {filepath.name}")
        return True

    except psycopg2.Error as e:
        conn.rollback()
        logger.error(f"[ERROR] in {filepath.name}: {e}")
        return False


def run_deed_monitor_migrations(conn):
    """Run all deed monitor migrations."""
    deed_monitor_dir = Path(__file__).parent.parent / 'deed_monitor' / 'sql'

    if not deed_monitor_dir.exists():
        logger.error(f"Deed monitor SQL directory not found: {deed_monitor_dir}")
        return False

    migration_files = sorted(deed_monitor_dir.glob('*.sql'))

    if not migration_files:
        logger.warning("No migration files found")
        return True

    logger.info(f"Found {len(migration_files)} migration files")

    success = True
    for filepath in migration_files:
        if not run_sql_file(conn, filepath):
            success = False
            # Continue with other files even if one fails

    return success


def populate_watchlist_from_parcels(conn):
    """Populate apn_watchlist from existing parcels."""
    logger.info("Populating apn_watchlist from parcels...")

    sql = """
    INSERT INTO apn_watchlist (
        apn, address, city, state, county, property_type,
        building_sf, lot_sf, zoning, geom
    )
    SELECT
        p.apn,
        p.situs_address,
        p.city,
        'CA',
        'Orange',
        'industrial',
        b.total_building_sf,
        p.land_sf,
        p.zoning,
        p.centroid
    FROM parcel p
    LEFT JOIN (
        SELECT parcel_apn, SUM(building_sf) as total_building_sf
        FROM building
        GROUP BY parcel_apn
    ) b ON b.parcel_apn = p.apn
    WHERE p.city IN ('Anaheim', 'Fullerton', 'Brea', 'Orange', 'Placentia', 'La Habra', 'Yorba Linda', 'Buena Park', 'Garden Grove', 'Santa Ana', 'Corona')
    ON CONFLICT (apn) DO UPDATE SET
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        building_sf = EXCLUDED.building_sf,
        lot_sf = EXCLUDED.lot_sf,
        zoning = EXCLUDED.zoning,
        geom = EXCLUDED.geom,
        updated_at = NOW()
    """

    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            count = cur.rowcount
        conn.commit()
        logger.info(f"[OK] Populated {count} parcels into apn_watchlist")
        return True
    except psycopg2.Error as e:
        conn.rollback()
        logger.error(f"[ERROR] populating watchlist: {e}")
        return False


def check_deed_monitor_tables(conn) -> dict:
    """Check if deed monitor tables exist."""
    tables = ['apn_watchlist', 'deed_recordings', 'sale_alerts', 'monitor_runs']
    results = {}

    with conn.cursor() as cur:
        for table in tables:
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = %s
                )
            """, (table,))
            results[table] = cur.fetchone()[0]

    return results


def main():
    parser = argparse.ArgumentParser(description='Run SQL migrations')
    parser.add_argument('--file', '-f', help='Run specific SQL file')
    parser.add_argument('--deed-monitor', '-d', action='store_true', help='Run deed monitor migrations')
    parser.add_argument('--populate-watchlist', '-p', action='store_true', help='Populate watchlist from parcels')
    parser.add_argument('--check', '-c', action='store_true', help='Check deed monitor tables')
    args = parser.parse_args()

    print("="*50)
    print("DATABASE MIGRATIONS")
    print("="*50)

    conn = get_db_connection()
    logger.info("Connected to database")

    try:
        if args.check:
            tables = check_deed_monitor_tables(conn)
            print("\nDeed Monitor Tables:")
            for table, exists in tables.items():
                status = "[OK] exists" if exists else "[MISSING]"
                print(f"  {table}: {status}")
            return

        if args.file:
            filepath = Path(args.file)
            if not filepath.exists():
                logger.error(f"File not found: {filepath}")
                sys.exit(1)
            run_sql_file(conn, filepath)

        elif args.deed_monitor:
            run_deed_monitor_migrations(conn)

        elif args.populate_watchlist:
            populate_watchlist_from_parcels(conn)

        else:
            # Default: check status and prompt
            tables = check_deed_monitor_tables(conn)
            missing = [t for t, exists in tables.items() if not exists]

            if missing:
                print(f"\nMissing tables: {', '.join(missing)}")
                print("Run with --deed-monitor to create them")
            else:
                print("\n[OK] All deed monitor tables exist")

                # Count records
                with conn.cursor() as cur:
                    cur.execute("SELECT COUNT(*) FROM apn_watchlist")
                    watchlist_count = cur.fetchone()[0]

                    cur.execute("SELECT COUNT(*) FROM sale_alerts")
                    alerts_count = cur.fetchone()[0]

                print(f"\nWatchlist parcels: {watchlist_count:,}")
                print(f"Sale alerts: {alerts_count:,}")

                if watchlist_count == 0:
                    print("\nRun with --populate-watchlist to import parcels")

    finally:
        conn.close()


if __name__ == '__main__':
    main()
