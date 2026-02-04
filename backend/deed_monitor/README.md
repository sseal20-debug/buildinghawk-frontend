# 🏭 Deed Monitor for BuildingHawk

**Real-time industrial property sale detection for Orange County (and beyond)**

Stop finding out about industrial sales 3-6 months after they happen. This system monitors county deed recordings and alerts you within days when a property on your watchlist sells.

```
Your 9,000+ Industrial APNs ──▶ Deed Recording Feed ──▶ MATCH! ──▶ 📱 Alert
                                        │
                    Sale Price Calculated from DTT
```

## 🎯 The Problem It Solves

The county assessor database has a **3-6 month lag** between when a property sells and when you see the new assessed value. By then, you've missed the opportunity to:

- Reach out to the new owner
- Update your market comps
- Understand who's buying in your market
- Adjust your client's expectations

This system watches the **deed recordings** (which happen 1-4 weeks after close) instead of waiting for assessor updates.

## 📊 How It Works

1. **Your APN Watchlist**: Load your 9,000+ industrial parcel APNs
2. **Daily Deed Scan**: Fetch new deed recordings from the county
3. **APN Matching**: Cross-reference against your watchlist
4. **Price Calculation**: Extract sale price from Documentary Transfer Tax
5. **Instant Alert**: Slack/email notification with buyer, seller, price

### Sale Price Calculation

California deeds include Documentary Transfer Tax (DTT) stamps. The math:

```
Orange County DTT Rate: $1.10 per $1,000 of sale price

Example: DTT = $2,860
Sale Price = ($2,860 / $1.10) × $1,000 = $2,600,000
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd deed-monitor
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Create Database Tables

Run the SQL schema against your Supabase database:

```bash
# Via Supabase Dashboard > SQL Editor
# Paste contents of sql/001_deed_monitor_schema.sql
```

### 4. Import Your APN Watchlist

```bash
# From CSV
python import_watchlist.py --input your_parcels.csv

# From Excel
python import_watchlist.py --input parcels.xlsx --sheet "Industrial"

# Dry run first to validate
python import_watchlist.py --input parcels.csv --dry-run
```

### 5. Run the Monitor

```bash
# Check last 1 day of recordings
python deed_monitor.py --days 1

# Check specific date
python deed_monitor.py --date 2025-01-20

# Backfill historical data
python deed_monitor.py --backfill --start 2024-01-01 --end 2024-12-31

# Dry run (no database writes)
python deed_monitor.py --days 7 --dry-run
```

### 6. Schedule Automatic Runs

```bash
# Run every hour
python scheduler.py --interval 60

# Run daily at 6 AM
python scheduler.py --time 06:00

# Or use system cron
crontab -e
# Add: 0 6 * * * cd /path/to/deed-monitor && python deed_monitor.py --days 1
```

## 📁 Project Structure

```
deed-monitor/
├── deed_monitor.py      # Main monitoring script
├── import_watchlist.py  # Import APNs from CSV/Excel
├── scheduler.py         # Automated scheduling
├── requirements.txt     # Python dependencies
├── .env.example         # Configuration template
└── sql/
    └── 001_deed_monitor_schema.sql  # Database schema
```

## 🗃️ Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `apn_watchlist` | Your monitored industrial parcels |
| `deed_recordings` | Raw deed data from county |
| `sale_alerts` | Generated alerts for matches |
| `monitor_runs` | Audit log of monitor executions |

### Key Views

| View | Purpose |
|------|---------|
| `recent_industrial_sales` | Dashboard of recent sales with price/SF |
| `monitor_dashboard` | Summary stats for monitoring |

## 🔌 Data Source Options

### Option 1: PropertyRadar (Recommended)

- **Coverage**: California (excellent)
- **Lag**: 1-3 days from recording
- **Pricing**: ~$200-400/month
- **Signup**: https://www.propertyradar.com

Best for: Orange County focus, best CA coverage

### Option 2: ATTOM Data

- **Coverage**: Nationwide
- **Lag**: 1-7 days
- **Pricing**: ~$500+/month
- **Signup**: https://www.attomdata.com

Best for: Multi-state expansion

### Option 3: County Scraper (DIY)

- **Coverage**: Single county
- **Lag**: Same day (if scraping daily)
- **Pricing**: Free (your time)

Build a scraper for OC RecorderWorks. Fragile but free.

## 📱 Notification Options

### Slack (Recommended)

1. Create Slack app: https://api.slack.com/apps
2. Add incoming webhook
3. Set `SLACK_WEBHOOK_URL` in `.env`

### Email

Set SMTP credentials in `.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
NOTIFICATION_EMAIL=alerts@your-company.com
```

### Example Alert

```
🏭 Industrial Property Sale Detected

📍 2911 N Orange Olive Rd, Orange
🏷️ APN: 360-384-05

💰 Sale Price: $2,600,000
📅 Recording Date: 2025-01-22

👤 Seller: OLIVE HILL PROPERTIES LLC
👤 Buyer: NEW BUYER INDUSTRIAL LLC

📊 Was Listed: $2,600,000 (0.0% from list)
📊 Sale/Assessed Ratio: 3.32x
```

## 🔧 Extending the System

### Add Riverside County

```python
# In deed_monitor.py
config.county = "Riverside"
config.dtt_rate = 1.10  # Same rate as Orange
```

### Add LA County

```python
# LA has city-level transfer taxes on top of county
# You'll need to handle this per-city
config.county = "Los Angeles"
config.dtt_rate = 1.10  # Base county rate
# Note: Cities like LA add $4.50 per $1,000
```

### Custom Alert Logic

Modify `_process_record()` in `deed_monitor.py`:

```python
# Alert only for sales over $5M
if sale_price and sale_price < 5_000_000:
    return result

# Alert only for specific cities
if record.city not in ['Anaheim', 'Fullerton', 'Brea']:
    return result
```

## 📈 Integration with BuildingHawk

This system is designed to plug into your existing BuildingHawk stack:

1. **Shared Supabase**: Uses your existing database
2. **APN as Key**: Matches on the same APN field
3. **Updates Properties**: Sets `last_sale_date` and `last_sale_price`
4. **Clears Listings**: Automatically marks sold properties as no longer listed

To link with existing properties table:

```sql
-- Create foreign key relationship
ALTER TABLE apn_watchlist 
ADD COLUMN property_id UUID REFERENCES properties(id);

-- Populate from existing data
UPDATE apn_watchlist w
SET property_id = p.id
FROM properties p
WHERE w.apn = p.parcel_apn;
```

## 🐛 Troubleshooting

### No matches found

1. Check APN format matches between watchlist and recordings
2. Run with `--dry-run` to see what's being fetched
3. Verify your data source API key is valid

### DTT is $0 or NULL

Some transfers are exempt from DTT:
- Inter-family transfers
- Trust transfers
- Foreclosures (sometimes)

These will show `calculated_sale_price = NULL`

### Duplicate alerts

The system uses upsert on `(watchlist_id, deed_id)` so true duplicates shouldn't occur. If you're seeing dupes, check for multiple watchlist entries with same APN.

## 📝 License

MIT - Use it, modify it, build a business on it.

## 🤝 Contributing

Built for Scott's BuildingHawk project. PRs welcome for:
- Additional data source integrations
- Multi-county support improvements
- Alert channel integrations (SMS, etc.)
