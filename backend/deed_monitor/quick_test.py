import os
from dotenv import load_dotenv
load_dotenv()

print('=== DEED MONITOR TEST ===')
print(f"Working dir: {os.getcwd()}")
print(f"SUPABASE_URL: {'SET' if os.getenv('SUPABASE_URL') else 'NOT SET'}")
print(f"DATA_PROVIDER: {os.getenv('DATA_PROVIDER', 'NOT SET')}")

try:
    from supabase import create_client
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_KEY')
    if url and key:
        sb = create_client(url, key)
        # Test connection
        result = sb.table('apn_watchlist').select('apn', count='exact').limit(1).execute()
        print(f'Watchlist APNs: {result.count}')
        
        result2 = sb.table('properties').select('id', count='exact').limit(1).execute()
        print(f'Properties: {result2.count}')
    else:
        print('Missing Supabase credentials')
except Exception as e:
    print(f'Error: {e}')
