import sys
print('Starting...', file=sys.stderr)
try:
    from dotenv import load_dotenv
    load_dotenv()
    import os
    print(f"SUPABASE_URL set: {bool(os.getenv('SUPABASE_URL'))}")
    print(f"DATA_PROVIDER: {os.getenv('DATA_PROVIDER', 'not set')}")
    
    from supabase import create_client
    print("Supabase imported")
    
    from deed_monitor import DeedMonitor
    print("DeedMonitor imported")
    
    dm = DeedMonitor()
    print(f"Initialized with provider: {dm.data_provider}")
    
    # Check watchlist count
    result = dm.supabase.table('apn_watchlist').select('*', count='exact').limit(1).execute()
    print(f"Watchlist APNs: {result.count}")
    
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
