# BuildingHawk CRM Application

## Your Data
- **22,426 Contacts** extracted from 24 years of emails
- **9,257 Properties** in Orange County industrial market
- Fully secured with Row Level Security

## Quick Start

### Option 1: Run the Web App (Recommended)
```
Double-click START_SERVER.bat
```
Or in PowerShell:
```powershell
pip install flask flask-cors requests
python server.py
```
Then open **http://localhost:5000** in your browser.

### Option 2: Run Reports
```powershell
python generate_reports.py
```
Generates a comprehensive report of your contacts and properties.

### Option 3: Link Contacts to Properties
```powershell
python link_contacts_to_properties.py
```
Matches contacts to properties based on company/owner name matching.

## Features

### Contacts Tab
- Search by name, email, or company
- Filter by type (broker, owner, tenant, vendor)
- Sort by email frequency, name, or company
- Click any contact to see full details

### Properties Tab  
- Search by address or owner
- Filter by city
- View building SF, sale/lease status

### Reports Tab
- Top 25 contacts by email volume
- Contact type breakdown (pie chart)
- Top broker relationships
- Top companies
- Properties by city (bar chart)

## Files

| File | Description |
|------|-------------|
| `server.py` | Python backend server (Flask) |
| `static/index.html` | Frontend web application |
| `generate_reports.py` | Generate text/JSON reports |
| `link_contacts_to_properties.py` | Link contacts to properties |
| `requirements.txt` | Python dependencies |

## API Endpoints (for developers)

- `GET /api/contacts` - List contacts (pagination, search, filter)
- `GET /api/contacts/:id` - Get single contact with linked properties
- `GET /api/contacts/stats` - Contact statistics
- `GET /api/properties` - List properties (pagination, search, filter)
- `GET /api/properties/:id` - Get single property with linked contacts
- `GET /api/properties/cities` - List of unique cities
- `GET /api/properties/stats` - Property statistics
- `GET /api/reports/top-contacts` - Top contacts by email frequency
- `GET /api/reports/brokers` - All brokers ranked
- `GET /api/reports/companies` - Companies by email volume

## Security

Your Supabase database has Row Level Security enabled:
- `anon` key: Blocked from all data access
- `service_role` key: Full access (used by this app)

**Never expose the service_role key in a public website.**

---
Built for Scott | BuildingHawk | January 2026
