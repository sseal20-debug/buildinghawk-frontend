#!/usr/bin/env python3
"""
BuildingHawk CRM Backend Server
Run with: python server.py
Open: http://localhost:5000
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests
import os

app = Flask(__name__, static_folder='static')
CORS(app)

# Supabase configuration
SUPABASE_URL = "https://mcslwdnlpyxnugojmvjk.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jc2x3ZG5scHl4bnVnb2ptdmprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODc0NzQ1NSwiZXhwIjoyMDg0MzIzNDU1fQ.1a8zoH1v7eQ41iF4-mm0akDTWus21ckcljdOe44A3Ko"

def supabase_request(endpoint, method='GET', data=None, params=None):
    """Make authenticated request to Supabase"""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "count=exact"
    }
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    
    if method == 'GET':
        response = requests.get(url, headers=headers, params=params)
    elif method == 'POST':
        response = requests.post(url, headers=headers, json=data)
    elif method == 'PATCH':
        response = requests.patch(url, headers=headers, json=data)
    elif method == 'DELETE':
        response = requests.delete(url, headers=headers)
    
    count = None
    if 'content-range' in response.headers:
        count = int(response.headers['content-range'].split('/')[-1])
    
    return response.json() if response.text else [], count

# ============================================================================
# CONTACTS API
# ============================================================================

@app.route('/api/contacts')
def get_contacts():
    """Get contacts with pagination, search, and filtering"""
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    search = request.args.get('search', '')
    contact_type = request.args.get('type', '')
    sort = request.args.get('sort', 'total_emails.desc')
    
    offset = (page - 1) * limit
    
    # Build query
    endpoint = f"contact?select=*&order={sort}&limit={limit}&offset={offset}"
    
    if search:
        endpoint += f"&or=(full_name.ilike.*{search}*,primary_email.ilike.*{search}*,company_name.ilike.*{search}*)"
    
    if contact_type:
        endpoint += f"&contact_type=eq.{contact_type}"
    
    contacts, total = supabase_request(endpoint)
    
    return jsonify({
        'contacts': contacts,
        'total': total,
        'page': page,
        'pages': (total + limit - 1) // limit if total else 0
    })

@app.route('/api/contacts/<contact_id>')
def get_contact(contact_id):
    """Get single contact with linked properties"""
    contact, _ = supabase_request(f"contact?id=eq.{contact_id}")
    if not contact:
        return jsonify({'error': 'Not found'}), 404
    
    # Get linked properties
    links, _ = supabase_request(f"contact_property_link?contact_id=eq.{contact_id}&select=*,properties(*)")
    
    return jsonify({
        'contact': contact[0],
        'properties': links
    })

@app.route('/api/contacts/stats')
def get_contact_stats():
    """Get contact statistics"""
    contacts, total = supabase_request("contact?select=contact_type,total_emails")
    
    stats = {
        'total': total,
        'by_type': {},
        'total_emails': 0
    }
    
    for c in contacts:
        t = c.get('contact_type', 'unknown')
        stats['by_type'][t] = stats['by_type'].get(t, 0) + 1
        stats['total_emails'] += c.get('total_emails', 0)
    
    return jsonify(stats)

# ============================================================================
# PROPERTIES API
# ============================================================================

@app.route('/api/properties')
def get_properties():
    """Get properties with pagination and search"""
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    search = request.args.get('search', '')
    city = request.args.get('city', '')
    
    offset = (page - 1) * limit
    
    endpoint = f"properties?select=*&order=city,address&limit={limit}&offset={offset}"
    
    if search:
        endpoint += f"&or=(address.ilike.*{search}*,owner_name.ilike.*{search}*)"
    
    if city:
        endpoint += f"&city=ilike.{city}"
    
    properties, total = supabase_request(endpoint)
    
    return jsonify({
        'properties': properties,
        'total': total,
        'page': page,
        'pages': (total + limit - 1) // limit if total else 0
    })

@app.route('/api/properties/<int:property_id>')
def get_property(property_id):
    """Get single property with linked contacts"""
    prop, _ = supabase_request(f"properties?id=eq.{property_id}")
    if not prop:
        return jsonify({'error': 'Not found'}), 404
    
    # Get linked contacts
    links, _ = supabase_request(f"contact_property_link?property_id=eq.{property_id}&select=*,contact(*)")
    
    return jsonify({
        'property': prop[0],
        'contacts': links
    })

@app.route('/api/properties/cities')
def get_cities():
    """Get list of unique cities"""
    props, _ = supabase_request("properties?select=city&order=city")
    cities = sorted(set(p['city'] for p in props if p.get('city')))
    return jsonify(cities)

@app.route('/api/properties/stats')
def get_property_stats():
    """Get property statistics"""
    props, total = supabase_request("properties?select=city,building_sf,for_sale,for_lease")
    
    stats = {
        'total': total,
        'by_city': {},
        'for_sale': 0,
        'for_lease': 0,
        'total_sf': 0
    }
    
    for p in props:
        city = p.get('city', 'Unknown')
        stats['by_city'][city] = stats['by_city'].get(city, 0) + 1
        if p.get('for_sale'):
            stats['for_sale'] += 1
        if p.get('for_lease'):
            stats['for_lease'] += 1
        if p.get('building_sf'):
            stats['total_sf'] += p['building_sf']
    
    return jsonify(stats)

# ============================================================================
# REPORTS API
# ============================================================================

@app.route('/api/reports/top-contacts')
def report_top_contacts():
    """Top contacts by email frequency"""
    limit = int(request.args.get('limit', 50))
    contacts, _ = supabase_request(f"contact?select=full_name,primary_email,company_name,contact_type,total_emails,phones&order=total_emails.desc&limit={limit}")
    return jsonify(contacts)

@app.route('/api/reports/brokers')
def report_brokers():
    """All brokers ranked by email frequency"""
    brokers, total = supabase_request("contact?select=*&contact_type=eq.broker&order=total_emails.desc&limit=500")
    return jsonify({'brokers': brokers, 'total': total})

@app.route('/api/reports/companies')
def report_companies():
    """Contacts grouped by company"""
    contacts, _ = supabase_request("contact?select=company_name,contact_type,total_emails&order=company_name")
    
    companies = {}
    for c in contacts:
        co = c.get('company_name') or 'Unknown'
        if co not in companies:
            companies[co] = {'name': co, 'contacts': 0, 'total_emails': 0, 'types': {}}
        companies[co]['contacts'] += 1
        companies[co]['total_emails'] += c.get('total_emails', 0)
        t = c.get('contact_type', 'unknown')
        companies[co]['types'][t] = companies[co]['types'].get(t, 0) + 1
    
    # Sort by total emails
    sorted_companies = sorted(companies.values(), key=lambda x: -x['total_emails'])
    return jsonify(sorted_companies[:100])

# ============================================================================
# LISTINGS API (Industrial Tracker)
# ============================================================================

@app.route('/api/listings')
def get_listings():
    """Get listings with pagination, filtering, and search"""
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 100))
    listing_type = request.args.get('type', '')  # 'lease' or 'sale'
    city = request.args.get('city', '')
    status = request.args.get('status', 'active')
    min_sf = request.args.get('min_sf', '')
    max_sf = request.args.get('max_sf', '')
    search = request.args.get('search', '')
    sort = request.args.get('sort', 'sf.asc')
    
    offset = (page - 1) * limit
    
    endpoint = f"listings?select=*&order={sort}&limit={limit}&offset={offset}"
    
    if listing_type:
        endpoint += f"&listing_type=eq.{listing_type}"
    
    if city:
        endpoint += f"&city=ilike.{city}"
    
    if status:
        endpoint += f"&status=eq.{status}"
    
    if min_sf:
        endpoint += f"&sf=gte.{min_sf}"
    
    if max_sf:
        endpoint += f"&sf=lte.{max_sf}"
    
    if search:
        endpoint += f"&or=(address.ilike.*{search}*,notes.ilike.*{search}*)"
    
    listings, total = supabase_request(endpoint)
    
    return jsonify({
        'listings': listings,
        'total': total,
        'page': page,
        'pages': (total + limit - 1) // limit if total else 0
    })

@app.route('/api/listings/new')
def get_new_listings():
    """Get new listings from today"""
    listings, total = supabase_request("listings?select=*&is_new=eq.true&status=eq.active&order=sf.asc")
    return jsonify({'listings': listings, 'total': total})

@app.route('/api/listings/reduced')
def get_price_reduced():
    """Get price-reduced listings"""
    listings, total = supabase_request("listings?select=*&is_price_reduced=eq.true&status=eq.active&order=last_updated.desc")
    return jsonify({'listings': listings, 'total': total})

@app.route('/api/listings/changes')
def get_todays_changes():
    """Get today's changes (new, price drops, sold, leased)"""
    from datetime import date
    today = date.today().isoformat()
    
    history, _ = supabase_request(f"listing_history?select=*,listings(*)&change_date=eq.{today}&order=created_at.desc")
    return jsonify({'changes': history})

@app.route('/api/listings/stats')
def get_listing_stats():
    """Get listing statistics by city and type"""
    listings, total = supabase_request("listings?select=city,listing_type,sf,rate_monthly,sale_price,price_psf,status,is_new,is_price_reduced")
    
    stats = {
        'total': total,
        'by_city': {},
        'by_type': {'lease': 0, 'sale': 0},
        'new_today': 0,
        'price_reduced': 0,
        'total_sf': 0
    }
    
    for l in listings:
        if l.get('status') != 'active':
            continue
        
        city = l.get('city', 'Unknown')
        ltype = l.get('listing_type', 'unknown')
        
        if city not in stats['by_city']:
            stats['by_city'][city] = {'lease': 0, 'sale': 0, 'sf': 0}
        
        stats['by_city'][city][ltype] = stats['by_city'][city].get(ltype, 0) + 1
        stats['by_city'][city]['sf'] += l.get('sf', 0) or 0
        stats['by_type'][ltype] = stats['by_type'].get(ltype, 0) + 1
        stats['total_sf'] += l.get('sf', 0) or 0
        
        if l.get('is_new'):
            stats['new_today'] += 1
        if l.get('is_price_reduced'):
            stats['price_reduced'] += 1
    
    return jsonify(stats)

@app.route('/api/listings/<listing_id>')
def get_listing(listing_id):
    """Get single listing with history"""
    listing, _ = supabase_request(f"listings?id=eq.{listing_id}")
    if not listing:
        return jsonify({'error': 'Not found'}), 404
    
    history, _ = supabase_request(f"listing_history?listing_id=eq.{listing_id}&order=change_date.desc")
    
    return jsonify({
        'listing': listing[0],
        'history': history
    })

# ============================================================================
# SERVE FRONTEND
# ============================================================================

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    print("=" * 60)
    print("BUILDINGHAWK CRM SERVER")
    print("=" * 60)
    print("Open http://localhost:5000 in your browser")
    print("=" * 60)
    app.run(debug=True, port=5000)
