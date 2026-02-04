#!/usr/bin/env python3
"""
Link Contacts to Properties
Matches contacts to properties based on:
1. Address mentions in emails
2. Owner name matching
3. Company name matching to owner
"""

import requests
import re
from collections import defaultdict

SUPABASE_URL = "https://mcslwdnlpyxnugojmvjk.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jc2x3ZG5scHl4bnVnb2ptdmprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODc0NzQ1NSwiZXhwIjoyMDg0MzIzNDU1fQ.1a8zoH1v7eQ41iF4-mm0akDTWus21ckcljdOe44A3Ko"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def normalize_address(addr):
    """Normalize address for matching"""
    if not addr:
        return ''
    addr = addr.lower().strip()
    # Standardize street types
    replacements = [
        ('street', 'st'), ('avenue', 'ave'), ('boulevard', 'blvd'),
        ('drive', 'dr'), ('road', 'rd'), ('lane', 'ln'),
        ('court', 'ct'), ('place', 'pl'), ('circle', 'cir'),
        (' north ', ' n '), (' south ', ' s '), (' east ', ' e '), (' west ', ' w '),
        (' n. ', ' n '), (' s. ', ' s '), (' e. ', ' e '), (' w. ', ' w '),
        ('  ', ' ')
    ]
    for old, new in replacements:
        addr = addr.replace(old, new)
    # Remove punctuation
    addr = re.sub(r'[.,#]', '', addr)
    return addr.strip()

def normalize_name(name):
    """Normalize name for matching"""
    if not name:
        return ''
    name = name.lower().strip()
    # Remove common suffixes
    for suffix in [' llc', ' inc', ' corp', ' ltd', ' lp', ' trust', ',']:
        name = name.replace(suffix, '')
    return name.strip()

def load_properties():
    """Load all properties with retry logic"""
    import time
    print("Loading properties...")
    all_props = []
    offset = 0
    limit = 500  # Smaller batches
    max_retries = 3
    
    while True:
        for attempt in range(max_retries):
            try:
                response = requests.get(
                    f"{SUPABASE_URL}/rest/v1/properties?select=id,address,city,owner_name&limit={limit}&offset={offset}",
                    headers=headers,
                    timeout=30
                )
                if response.status_code == 200 and response.text:
                    batch = response.json()
                    break
                else:
                    time.sleep(1)
            except Exception as e:
                print(f"  Retry {attempt + 1}: {e}")
                time.sleep(2)
        else:
            print("  Failed after retries, stopping")
            break
            
        if not batch:
            break
        all_props.extend(batch)
        offset += limit
        print(f"  Loaded {len(all_props)} properties...")
        time.sleep(0.2)  # Rate limit protection
    
    print(f"Total properties: {len(all_props)}")
    return all_props

def load_contacts():
    """Load all contacts with company names"""
    import time
    print("Loading contacts...")
    all_contacts = []
    offset = 0
    limit = 500
    max_retries = 3
    
    while True:
        for attempt in range(max_retries):
            try:
                response = requests.get(
                    f"{SUPABASE_URL}/rest/v1/contact?select=id,full_name,company_name,contact_type&limit={limit}&offset={offset}",
                    headers=headers,
                    timeout=30
                )
                if response.status_code == 200 and response.text:
                    batch = response.json()
                    break
                else:
                    time.sleep(1)
            except Exception as e:
                print(f"  Retry {attempt + 1}: {e}")
                time.sleep(2)
        else:
            print("  Failed after retries, stopping")
            break
            
        if not batch:
            break
        all_contacts.extend(batch)
        offset += limit
        print(f"  Loaded {len(all_contacts)} contacts...")
        time.sleep(0.2)
    
    print(f"Total contacts: {len(all_contacts)}")
    return all_contacts

def build_property_index(properties):
    """Build lookup indexes for properties"""
    print("Building property indexes...")
    
    # Index by normalized address parts
    address_index = defaultdict(list)
    owner_index = defaultdict(list)
    
    for prop in properties:
        # Index by street number + first word of street name
        addr = normalize_address(prop.get('address', ''))
        if addr:
            # Extract street number
            match = re.match(r'^(\d+)', addr)
            if match:
                street_num = match.group(1)
                address_index[street_num].append(prop)
        
        # Index by owner name
        owner = normalize_name(prop.get('owner_name', ''))
        if owner:
            # Index by first significant word
            words = owner.split()
            for word in words[:3]:  # First 3 words
                if len(word) > 2:
                    owner_index[word].append(prop)
    
    print(f"  Address index entries: {len(address_index)}")
    print(f"  Owner index entries: {len(owner_index)}")
    
    return address_index, owner_index

def match_contacts_to_properties(contacts, properties, address_index, owner_index):
    """Match contacts to properties"""
    print("Matching contacts to properties...")
    
    links = []
    matched_contacts = 0
    
    for contact in contacts:
        contact_links = []
        
        company = normalize_name(contact.get('company_name', ''))
        name = normalize_name(contact.get('full_name', ''))
        contact_type = contact.get('contact_type', 'unknown')
        
        # Try to match by company name to owner
        if company:
            words = company.split()
            for word in words:
                if len(word) > 3 and word in owner_index:
                    for prop in owner_index[word]:
                        prop_owner = normalize_name(prop.get('owner_name', ''))
                        # Check if company name appears in owner name or vice versa
                        if company in prop_owner or prop_owner in company:
                            role = 'owner' if contact_type == 'owner' else 'associated'
                            contact_links.append({
                                'contact_id': contact['id'],
                                'property_id': prop['id'],
                                'role': role,
                                'match_type': 'company_to_owner'
                            })
        
        # Try to match by contact name to owner (for owners)
        if contact_type == 'owner' and name:
            words = name.split()
            for word in words:
                if len(word) > 3 and word in owner_index:
                    for prop in owner_index[word]:
                        prop_owner = normalize_name(prop.get('owner_name', ''))
                        if word in prop_owner:
                            contact_links.append({
                                'contact_id': contact['id'],
                                'property_id': prop['id'],
                                'role': 'owner',
                                'match_type': 'name_to_owner'
                            })
        
        # Deduplicate links for this contact
        seen = set()
        for link in contact_links:
            key = (link['contact_id'], link['property_id'])
            if key not in seen:
                seen.add(key)
                links.append(link)
        
        if contact_links:
            matched_contacts += 1
    
    print(f"Matched {matched_contacts} contacts to properties")
    print(f"Total links created: {len(links)}")
    
    return links

def save_links(links):
    """Save links to Supabase"""
    if not links:
        print("No links to save")
        return
    
    print(f"Saving {len(links)} links to Supabase...")
    
    # Insert in batches
    batch_size = 100
    saved = 0
    errors = 0
    
    for i in range(0, len(links), batch_size):
        batch = links[i:i+batch_size]
        
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/contact_property_link",
            headers={**headers, "Prefer": "return=minimal,resolution=merge-duplicates"},
            json=batch
        )
        
        if response.status_code in [200, 201]:
            saved += len(batch)
        else:
            errors += len(batch)
            print(f"  Error: {response.text[:100]}")
        
        print(f"  Progress: {saved}/{len(links)}")
    
    print(f"Saved: {saved}, Errors: {errors}")

def main():
    print("=" * 60)
    print("CONTACT-PROPERTY LINKING")
    print("=" * 60)
    print()
    
    # Load data
    properties = load_properties()
    contacts = load_contacts()
    
    # Build indexes
    address_index, owner_index = build_property_index(properties)
    
    # Match
    links = match_contacts_to_properties(contacts, properties, address_index, owner_index)
    
    # Save
    save_links(links)
    
    print()
    print("=" * 60)
    print("DONE!")
    print("=" * 60)

if __name__ == '__main__':
    main()
