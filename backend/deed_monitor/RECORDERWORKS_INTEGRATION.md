# RecorderWorks Integration Spec
## Orange County Deed Monitor - FREE Data Source

### Overview

Instead of paying $550+/mo for PropertyRadar or ATTOM APIs, we scrape the **OC Clerk-Recorder's RecorderWorks** portal directly.

**Portal URL:** https://cr.occlerkrecorder.gov/RecorderWorksInternet/

### What RecorderWorks Offers

| Feature | Available | Notes |
|---------|-----------|-------|
| Recording Date Search | ✅ Yes | Date range from 1982 to today |
| Document Type Filter | ✅ Yes | GRANT DEED, TRUST DEED, etc. |
| Name Search | ✅ Yes | Grantor/Grantee index |
| Document Number Lookup | ✅ Yes | Direct lookup |
| APN Search | ❌ No | Must parse from doc details |
| Bulk Download | ❌ No | One at a time |
| API | ❌ No | Web scraping required |

### Search Strategy

Since there's no direct APN search, we use **Recording Date + Document Type**:

```
Daily Workflow:
1. Search Recording Date: Yesterday to Today
2. Filter Document Type: GRANT DEED
3. Parse each result for:
   - Document Number
   - Recording Date
   - Grantor (Seller)
   - Grantee (Buyer)
   - APN (from document details)
   - Documentary Transfer Tax (from document)
4. Match APNs against our 4,100 industrial watchlist
5. Create alerts for matches
```

### Document Types to Monitor

| Doc Type | Purpose | Monitor? |
|----------|---------|----------|
| GRANT DEED | Property sale/transfer | ✅ Primary |
| QUITCLAIM DEED | Transfer (often non-sale) | ⚠️ Optional |
| TRUST DEED | Mortgage/financing | ❌ No |
| RECONVEYANCE | Mortgage payoff | ❌ No |
| NOTICE OF DEFAULT | Foreclosure start | ⚠️ Optional |
| TRUSTEE'S DEED | Foreclosure sale | ✅ Yes |

### Data Fields Available

From search results:
- Document Number
- Recording Date
- Document Type
- Book/Page (older docs)

From document details (requires clicking in):
- Grantor (Seller)
- Grantee (Buyer)
- Legal Description (contains APN)
- Documentary Transfer Tax (DTT)
- Consideration Amount (sometimes)

### Technical Implementation

#### Option 1: Selenium/Playwright (Recommended)

Full browser automation handles JavaScript, sessions, and pagination.

```python
from selenium import webdriver
from selenium.webdriver.common.by import By

driver = webdriver.Chrome()
driver.get("https://cr.occlerkrecorder.gov/RecorderWorksInternet/")

# Click Recording Date tab
driver.find_element(By.LINK_TEXT, "Recording Date").click()

# Enter date range
driver.find_element(By.ID, "RecDateStart").send_keys("01/20/2026")
driver.find_element(By.ID, "RecDateEnd").send_keys("01/21/2026")

# Click Search
driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()

# Parse results...
```

**Pros:** Reliable, handles JS
**Cons:** Slower, needs Chrome/ChromeDriver

#### Option 2: Requests + BeautifulSoup

Direct HTTP requests for faster scraping.

```python
import requests
from bs4 import BeautifulSoup

session = requests.Session()
session.get(BASE_URL)  # Get cookies

response = session.post(SEARCH_URL, data={
    'startDate': '01/20/2026',
    'endDate': '01/21/2026',
    'docType': 'GRANT DEED'
})

soup = BeautifulSoup(response.text, 'html.parser')
# Parse results table...
```

**Pros:** Faster, lighter
**Cons:** May break if site uses heavy JS

### Rate Limiting

Be respectful of county resources:
- Add 1-2 second delay between requests
- Run during off-peak hours (early morning)
- Limit to 1 day of recordings at a time
- Cache results to avoid re-scraping

### Daily Volume Estimate

Orange County records approximately:
- **500-1,000 documents/day** (all types)
- **50-150 Grant Deeds/day** (property transfers)

With 4,100 industrial APNs in our watchlist:
- Expected matches: **1-5 per week** (industrial is small % of total)

### Integration with Deed Monitor

Replace the `MockClient` with `RecorderWorksClient`:

```python
# deed_monitor.py

from recorderworks_scraper import RecorderWorksSeleniumScraper

class DeedMonitor:
    def __init__(self, config):
        # Use RecorderWorks scraper instead of API
        self.data_client = RecorderWorksSeleniumScraper(headless=True)
```

### Dependencies

```bash
# For Selenium approach
pip install selenium webdriver-manager

# For requests approach
pip install requests beautifulsoup4

# Already installed
pip install pandas  # For data processing
```

### Cron Schedule

```bash
# Run daily at 6 AM PT (after county posts previous day's recordings)
0 6 * * * cd /path/to/deed_monitor && python deed_monitor.py --days 1

# Or use the scheduler
python scheduler.py --time 06:00
```

### Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| No APN in search results | Click into each doc, parse legal description |
| DTT not always shown | OCR the document image, or estimate from sale price |
| Site changes break scraper | Monitor for errors, update selectors as needed |
| Rate limiting | Add delays, run off-peak |
| Session timeouts | Re-initialize session periodically |

### Cost Comparison

| Data Source | Monthly Cost | Coverage |
|-------------|--------------|----------|
| RecorderWorks Scraper | **$0** | Orange County only |
| PropertyRadar API | $549/mo | California |
| ATTOM API | $500+/mo | Nationwide |

### Next Steps

1. ✅ Created `recorderworks_scraper.py` skeleton
2. ⬜ Install Selenium: `pip install selenium webdriver-manager`
3. ⬜ Test scraper manually
4. ⬜ Implement result parsing
5. ⬜ Add APN extraction from doc details
6. ⬜ Integrate with deed_monitor.py
7. ⬜ Set up daily cron job
8. ⬜ Add error alerting (Slack/email when scraper fails)

### Alternative: County RSS/Data Feed

Some counties offer official data feeds. Check:
- https://ocrecorder.com for any API or bulk data options
- County Open Data portal
- FOIA/public records request for bulk data

This would be more reliable than scraping if available.
