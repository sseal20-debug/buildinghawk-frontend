#!/usr/bin/env python3
"""
Run SQL migrations against Supabase.

Usage:
    python run_sql_migration.py sql/002_lot_tract_lookup.sql
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Get Supabase credentials
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_KEY required")
    sys.exit(1)

# Extract project ref from URL
# https://mcslwdnlpyxnugojmvjk.supabase.co -> mcslwdnlpyxnugojmvjk
import re
match = re.search(r'https://([^.]+)\.supabase\.co', SUPABASE_URL)
if match:
    PROJECT_REF = match.group(1)
    print(f"Project: {PROJECT_REF}")
else:
    print("ERROR: Could not parse project ref from SUPABASE_URL")
    sys.exit(1)

def run_sql_via_api(sql: str) -> dict:
    """Run SQL via Supabase REST API using RPC."""
    import requests

    # Try using the query endpoint
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    }

    # Split SQL into individual statements
    statements = []
    current = []

    for line in sql.split('\n'):
        # Skip comments and empty lines for splitting
        stripped = line.strip()
        if stripped.startswith('--') or not stripped:
            current.append(line)
            continue

        current.append(line)

        # Check if this is end of a statement
        if stripped.endswith(';') and not stripped.endswith('$$;'):
            statements.append('\n'.join(current))
            current = []

    # Handle last statement
    if current:
        statements.append('\n'.join(current))

    print(f"Found {len(statements)} SQL statements to execute")

    return statements

def main():
    if len(sys.argv) < 2:
        print("Usage: python run_sql_migration.py <sql_file>")
        sys.exit(1)

    sql_file = sys.argv[1]

    if not os.path.exists(sql_file):
        print(f"ERROR: File not found: {sql_file}")
        sys.exit(1)

    with open(sql_file, 'r', encoding='utf-8') as f:
        sql = f.read()

    print(f"\nSQL Migration: {sql_file}")
    print("=" * 60)
    print("\nTo run this migration, execute the following SQL in your Supabase dashboard:")
    print("https://supabase.com/dashboard/project/{}/sql".format(PROJECT_REF))
    print("\n" + "-" * 60)

    # Show a summary of what will be created
    if 'CREATE TABLE' in sql:
        tables = re.findall(r'CREATE TABLE[^(]*?(\w+)', sql, re.IGNORECASE)
        print(f"\nTables to create: {', '.join(set(tables))}")

    if 'CREATE INDEX' in sql:
        indexes = re.findall(r'CREATE INDEX[^(]*?(\w+)', sql, re.IGNORECASE)
        print(f"Indexes to create: {len(set(indexes))}")

    if 'CREATE FUNCTION' in sql or 'CREATE OR REPLACE FUNCTION' in sql:
        functions = re.findall(r'FUNCTION\s+(\w+)', sql, re.IGNORECASE)
        print(f"Functions to create: {', '.join(set(functions))}")

    print("\n" + "-" * 60)
    print("\nStatements summary:")
    statements = run_sql_via_api(sql)

    for i, stmt in enumerate(statements, 1):
        # Show first line of each statement
        first_line = stmt.strip().split('\n')[0][:80]
        if first_line.startswith('--'):
            continue
        print(f"  {i}. {first_line}...")

    print("\n" + "=" * 60)
    print(f"\nCopy the SQL from {sql_file} and paste it into the Supabase SQL editor.")
    print("Or use the Supabase CLI: supabase db push")


if __name__ == '__main__':
    main()
