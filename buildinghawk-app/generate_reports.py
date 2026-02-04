#!/usr/bin/env python3
"""
BuildingHawk Report Generator
Generates comprehensive reports from your CRM data
"""

import requests
import json
from datetime import datetime
from collections import defaultdict

SUPABASE_URL = "https://mcslwdnlpyxnugojmvjk.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jc2x3ZG5scHl4bnVnb2ptdmprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODc0NzQ1NSwiZXhwIjoyMDg0MzIzNDU1fQ.1a8zoH1v7eQ41iF4-mm0akDTWus21ckcljdOe44A3Ko"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

def fetch_all(endpoint):
    """Fetch all records from an endpoint"""
    all_records = []
    offset = 0
    limit = 1000
    
    while True:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/{endpoint}&limit={limit}&offset={offset}",
            headers=headers
        )
        batch = response.json()
        if not batch:
            break
        all_records.extend(batch)
        offset += limit
    
    return all_records

def generate_reports():
    print("=" * 70)
    print("BUILDINGHAWK REPORT GENERATOR")
    print("=" * 70)
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Fetch data
    print("Fetching data...")
    contacts = fetch_all("contact?select=*")
    properties = fetch_all("properties?select=*")
    
    print(f"  Contacts: {len(contacts):,}")
    print(f"  Properties: {len(properties):,}")
    print()
    
    # ========================================================================
    # CONTACT REPORTS
    # ========================================================================
    
    print("=" * 70)
    print("CONTACT ANALYSIS")
    print("=" * 70)
    print()
    
    # By type
    by_type = defaultdict(int)
    for c in contacts:
        by_type[c.get('contact_type', 'unknown')] += 1
    
    print("CONTACTS BY TYPE:")
    for t, count in sorted(by_type.items(), key=lambda x: -x[1]):
        pct = 100 * count / len(contacts)
        print(f"  {t:<15} {count:>8,}  ({pct:5.1f}%)")
    print()
    
    # Top contacts
    print("TOP 50 CONTACTS BY EMAIL VOLUME:")
    print("-" * 70)
    sorted_contacts = sorted(contacts, key=lambda x: x.get('total_emails', 0), reverse=True)
    for i, c in enumerate(sorted_contacts[:50], 1):
        name = (c.get('full_name') or 'Unknown')[:25]
        company = (c.get('company_name') or '')[:20]
        emails = c.get('total_emails', 0)
        ctype = c.get('contact_type', 'unknown')
        print(f"{i:3}. {name:<25} {company:<20} {ctype:<10} {emails:>10,}")
    print()
    
    # Brokers
    brokers = [c for c in contacts if c.get('contact_type') == 'broker']
    print(f"TOP 30 BROKERS ({len(brokers):,} total):")
    print("-" * 70)
    sorted_brokers = sorted(brokers, key=lambda x: x.get('total_emails', 0), reverse=True)
    for i, c in enumerate(sorted_brokers[:30], 1):
        name = (c.get('full_name') or 'Unknown')[:25]
        company = (c.get('company_name') or '')[:25]
        emails = c.get('total_emails', 0)
        print(f"{i:3}. {name:<25} {company:<25} {emails:>10,}")
    print()
    
    # Companies
    companies = defaultdict(lambda: {'contacts': 0, 'total_emails': 0, 'names': []})
    for c in contacts:
        co = c.get('company_name') or 'Unknown'
        companies[co]['contacts'] += 1
        companies[co]['total_emails'] += c.get('total_emails', 0)
        if c.get('full_name'):
            companies[co]['names'].append(c['full_name'])
    
    print("TOP 30 COMPANIES BY EMAIL VOLUME:")
    print("-" * 70)
    sorted_companies = sorted(companies.items(), key=lambda x: -x[1]['total_emails'])
    for i, (name, data) in enumerate(sorted_companies[:30], 1):
        print(f"{i:3}. {name[:40]:<40} {data['contacts']:>5} contacts  {data['total_emails']:>10,} emails")
    print()
    
    # Email domains
    domains = defaultdict(int)
    for c in contacts:
        email = c.get('primary_email', '')
        if '@' in email:
            domain = email.split('@')[1].lower()
            domains[domain] += 1
    
    print("TOP 30 EMAIL DOMAINS:")
    print("-" * 70)
    sorted_domains = sorted(domains.items(), key=lambda x: -x[1])
    for i, (domain, count) in enumerate(sorted_domains[:30], 1):
        print(f"{i:3}. {domain:<40} {count:>8,} contacts")
    print()
    
    # ========================================================================
    # PROPERTY REPORTS
    # ========================================================================
    
    print("=" * 70)
    print("PROPERTY ANALYSIS")
    print("=" * 70)
    print()
    
    # By city
    by_city = defaultdict(lambda: {'count': 0, 'total_sf': 0, 'for_sale': 0, 'for_lease': 0})
    for p in properties:
        city = p.get('city') or 'Unknown'
        by_city[city]['count'] += 1
        by_city[city]['total_sf'] += p.get('building_sf') or 0
        if p.get('for_sale'):
            by_city[city]['for_sale'] += 1
        if p.get('for_lease'):
            by_city[city]['for_lease'] += 1
    
    print("PROPERTIES BY CITY:")
    print("-" * 70)
    sorted_cities = sorted(by_city.items(), key=lambda x: -x[1]['count'])
    for city, data in sorted_cities[:25]:
        print(f"  {city:<20} {data['count']:>6,} props  {data['total_sf']:>12,} SF  "
              f"Sale: {data['for_sale']:>4}  Lease: {data['for_lease']:>4}")
    print()
    
    # Summary stats
    total_sf = sum(p.get('building_sf') or 0 for p in properties)
    for_sale = sum(1 for p in properties if p.get('for_sale'))
    for_lease = sum(1 for p in properties if p.get('for_lease'))
    
    print("PROPERTY SUMMARY:")
    print(f"  Total Properties:    {len(properties):>12,}")
    print(f"  Total Building SF:   {total_sf:>12,}")
    print(f"  For Sale:            {for_sale:>12,}")
    print(f"  For Lease:           {for_lease:>12,}")
    print(f"  Cities Covered:      {len(by_city):>12,}")
    print()
    
    # ========================================================================
    # SAVE TO FILE
    # ========================================================================
    
    report_data = {
        'generated_at': datetime.now().isoformat(),
        'summary': {
            'total_contacts': len(contacts),
            'total_properties': len(properties),
            'total_sf': total_sf,
            'contacts_by_type': dict(by_type),
            'cities': len(by_city)
        },
        'top_contacts': [
            {
                'name': c.get('full_name'),
                'email': c.get('primary_email'),
                'company': c.get('company_name'),
                'type': c.get('contact_type'),
                'emails': c.get('total_emails')
            }
            for c in sorted_contacts[:100]
        ],
        'top_companies': [
            {'name': name, **data}
            for name, data in sorted_companies[:50]
        ],
        'properties_by_city': [
            {'city': city, **data}
            for city, data in sorted_cities
        ]
    }
    
    with open('buildinghawk_report.json', 'w') as f:
        json.dump(report_data, f, indent=2, default=str)
    
    print("=" * 70)
    print("Report saved to: buildinghawk_report.json")
    print("=" * 70)

if __name__ == '__main__':
    generate_reports()
