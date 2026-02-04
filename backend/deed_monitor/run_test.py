import os
import sys

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)

print('=== DEED MONITOR TEST ===')

# Load .env
from dotenv import load_dotenv
load_dotenv()

print(f'SUPABASE_URL set: {bool(os.getenv("SUPABASE_URL"))}')
print(f'DATA_PROVIDER: {os.getenv("DATA_PROVIDER", "NOT SET")}')

try:
    from supabase import create_client
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_KEY')
    
    if url and key:
        sb = create_client(url, key)
        
        # Count watchlist
        try:
            result = sb.table('apn_watchlist').select('apn', count='exact').limit(1).execute()
            print(f'Watchlist APNs: {result.count}')
        except Exception as e:
            print(f'Watchlist table error: {e}')
        
        # Count properties
        try:
            result = sb.table('properties').select('id', count='exact').limit(1).execute()
            print(f'Properties in DB: {result.count}')
        except Exception as e:
            print(f'Properties table error: {e}')
            
except Exception as e:
    print(f'Supabase error: {e}')

print('=== TEST COMPLETE ===')
