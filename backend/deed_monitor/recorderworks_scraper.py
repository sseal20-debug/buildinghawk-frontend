#!/usr/bin/env python3
"""
RecorderWorks Scraper for Orange County Deed Monitor
=====================================================

Scrapes the OC Clerk-Recorder's RecorderWorks portal for deed recordings.
FREE alternative to PropertyRadar/ATTOM APIs ($0 vs $549+/mo).

URL: https://cr.occlerkrecorder.gov/RecorderWorksInternet/

Data Available from RecorderWorks:
----------------------------------
From search results:
- Document Number (e.g., 2026000012980)
- Grantors (Sellers)
- Grantees (Buyers)
- Document Type (GRANT DEED, TRUST DEED, etc.)
- Recording Date
- Pages

From document details (clicking into a result):
- City
- Transfer Tax Amount (Documentary Transfer Tax - DTT)
- Non Disc Tax Amount
- Lot #
- Tract #

Note: APN is NOT directly available. Need to derive from Lot/Tract or
cross-reference with OC Assessor data.

Sale Price Calculation:
- Orange County DTT rate: $1.10 per $1,000 of sale price
- Formula: Sale Price = (DTT / 1.10) * 1000
- Example: DTT=$1,901.35 → Sale Price = $1,728,500

Usage:
    from recorderworks_scraper import RecorderWorksSeleniumScraper

    scraper = RecorderWorksSeleniumScraper(headless=True)
    deeds = scraper.fetch_recordings(
        county='Orange',
        state='CA',
        start_date='2026-01-20',
        end_date='2026-01-21'
    )
    for deed in deeds:
        print(f"{deed.doc_number}: {deed.grantor} -> {deed.grantee}")
        if deed.documentary_transfer_tax:
            price = (deed.documentary_transfer_tax / 1.10) * 1000
            print(f"  Estimated Sale Price: ${price:,.0f}")
"""

import os
import sys
import time
import logging
import re
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# RecorderWorks URLs
BASE_URL = "https://cr.occlerkrecorder.gov/RecorderWorksInternet"

# Document types to monitor for property transfers
TRANSFER_DOC_TYPES = [
    'GRANT DEED',
    'GRANT',
    'TRUSTEE DEED',  # Foreclosure sale
]


@dataclass
class DeedRecord:
    """Represents a deed recording from RecorderWorks."""
    doc_number: str
    recording_date: str
    doc_type: str
    grantor: Optional[str] = None
    grantee: Optional[str] = None
    apn: Optional[str] = None
    documentary_transfer_tax: Optional[float] = None
    city: Optional[str] = None
    lot_number: Optional[str] = None
    tract_number: Optional[str] = None
    pages: Optional[int] = None
    address: Optional[str] = None  # Not available from RecorderWorks directly
    raw_data: Dict[str, Any] = field(default_factory=dict)

    @property
    def calculated_sale_price(self) -> Optional[float]:
        """Calculate sale price from Documentary Transfer Tax."""
        if self.documentary_transfer_tax and self.documentary_transfer_tax > 0:
            # Orange County rate: $1.10 per $1,000
            return (self.documentary_transfer_tax / 1.10) * 1000
        return None


class RecorderWorksSeleniumScraper:
    """
    Selenium-based scraper for Orange County RecorderWorks portal.

    This scraper automates browser interactions to:
    1. Search by Recording Date or Document Type
    2. Parse results table
    3. Click into each result to get detailed information (DTT, city, etc.)

    Requirements:
        pip install selenium webdriver-manager
    """

    def __init__(self, headless: bool = True, delay: float = 1.5):
        """
        Initialize Selenium scraper.

        Args:
            headless: Run browser in headless mode (no GUI)
            delay: Seconds to wait between actions (be nice to their servers)
        """
        self.headless = headless
        self.delay = delay
        self.driver = None
        self._initialized = False

    def _init_driver(self) -> bool:
        """Initialize Selenium WebDriver with Chrome."""
        if self._initialized and self.driver:
            return True

        try:
            from selenium import webdriver
            from selenium.webdriver.chrome.service import Service
            from selenium.webdriver.chrome.options import Options
            from webdriver_manager.chrome import ChromeDriverManager

            options = Options()
            if self.headless:
                options.add_argument('--headless=new')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--window-size=1920,1080')
            options.add_argument('--disable-gpu')
            options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=options)
            self.driver.implicitly_wait(10)
            self._initialized = True
            logger.info("Selenium WebDriver initialized successfully")
            return True

        except ImportError:
            logger.error("Selenium not installed. Run: pip install selenium webdriver-manager")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize WebDriver: {e}")
            return False

    def _convert_date(self, date_str: str) -> str:
        """Convert date from YYYY-MM-DD to MM/DD/YYYY format."""
        if '-' in date_str:
            return datetime.strptime(date_str, '%Y-%m-%d').strftime('%m/%d/%Y')
        return date_str

    def search_by_recording_date(
        self,
        start_date: str,
        end_date: str,
        get_details: bool = True,
        max_results: int = 500
    ) -> List[DeedRecord]:
        """
        Search RecorderWorks by recording date range.

        Args:
            start_date: Start date (YYYY-MM-DD or MM/DD/YYYY)
            end_date: End date (YYYY-MM-DD or MM/DD/YYYY)
            get_details: Whether to click into each result for details
            max_results: Maximum number of results to process

        Returns:
            List of DeedRecord objects
        """
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        if not self._init_driver():
            return []

        start_date = self._convert_date(start_date)
        end_date = self._convert_date(end_date)

        logger.info(f"Searching recordings from {start_date} to {end_date}")

        try:
            # Navigate to RecorderWorks
            self.driver.get(BASE_URL)
            time.sleep(self.delay)

            # Click on "Recording Date" tab
            recording_date_tab = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.LINK_TEXT, "Recording Date"))
            )
            recording_date_tab.click()
            time.sleep(self.delay)

            # Use specific element IDs for Recording Date search form
            # Start Date: MainContent_MainMenu1_SearchByRecordingDate1_FromDate
            # End Date: MainContent_MainMenu1_SearchByRecordingDate1_ToDate
            # Search Button: MainContent_MainMenu1_SearchByRecordingDate1_btnSearch

            start_input = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((
                    By.ID, "MainContent_MainMenu1_SearchByRecordingDate1_FromDate"
                ))
            )
            start_input.clear()
            start_input.send_keys(start_date)
            time.sleep(0.3)

            end_input = self.driver.find_element(
                By.ID, "MainContent_MainMenu1_SearchByRecordingDate1_ToDate"
            )
            end_input.clear()
            end_input.send_keys(end_date)
            time.sleep(0.3)

            # Click Search button
            search_btn = self.driver.find_element(
                By.ID, "MainContent_MainMenu1_SearchByRecordingDate1_btnSearch"
            )
            search_btn.click()
            time.sleep(self.delay * 2)

            # Handle "too many results" dialog if it appears
            try:
                ok_btn = WebDriverWait(self.driver, 3).until(
                    EC.element_to_be_clickable((By.XPATH, "//button[text()='OK' or text()='Ok']"))
                )
                ok_btn.click()
                time.sleep(self.delay)
            except:
                pass  # No dialog appeared

            # Parse results
            records = self._parse_search_results(get_details, max_results)

            return records

        except Exception as e:
            logger.error(f"Search failed: {e}")
            import traceback
            traceback.print_exc()
            return []

    def search_by_document_type(
        self,
        start_date: str,
        end_date: str,
        doc_type: str = 'GRANT DEED',
        get_details: bool = True,
        max_results: int = 500
    ) -> List[DeedRecord]:
        """
        Search RecorderWorks by document type within a date range.
        This is more targeted for finding property transfers.

        Args:
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            doc_type: Document type to search for
            get_details: Whether to click into each result for details
            max_results: Maximum number of results to process

        Returns:
            List of DeedRecord objects
        """
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.common.keys import Keys

        if not self._init_driver():
            return []

        start_date = self._convert_date(start_date)
        end_date = self._convert_date(end_date)

        logger.info(f"Searching {doc_type} from {start_date} to {end_date}")

        try:
            # Navigate to RecorderWorks
            self.driver.get(BASE_URL)
            time.sleep(self.delay)

            # Click on "Document Type" tab
            doc_type_tab = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.LINK_TEXT, "Document Type"))
            )
            doc_type_tab.click()
            time.sleep(self.delay)

            # Find the Document Type tab content and its inputs
            # The textbox with placeholder "Search - type here document type"
            type_input = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((
                    By.CSS_SELECTOR,
                    "input[placeholder*='type here document type']"
                ))
            )

            # Find date inputs in the Document Type tab
            # They should be near the type input
            all_inputs = self.driver.find_elements(By.CSS_SELECTOR, "input[type='text']")
            date_inputs = [inp for inp in all_inputs
                         if inp.get_attribute('placeholder') == 'MM/DD/YYYY' or
                         re.match(r'\d{1,2}/\d{1,2}/\d{4}', inp.get_attribute('value') or '')]

            if len(date_inputs) >= 2:
                # Clear and fill start date
                date_inputs[0].clear()
                date_inputs[0].send_keys(start_date)
                time.sleep(0.3)

                # Clear and fill end date
                date_inputs[1].clear()
                date_inputs[1].send_keys(end_date)
                time.sleep(0.3)

            # Type document type and select from dropdown
            type_input.clear()
            type_input.send_keys(doc_type)
            time.sleep(self.delay)

            # Wait for autocomplete dropdown and select exact match
            try:
                # Look for the autocomplete list item
                autocomplete_item = WebDriverWait(self.driver, 5).until(
                    EC.element_to_be_clickable((
                        By.XPATH,
                        f"//li[contains(@class, 'ui-menu-item')]//div[text()='{doc_type}'] | "
                        f"//ul[contains(@class, 'ui-autocomplete')]//li[contains(text(), '{doc_type}')]"
                    ))
                )
                autocomplete_item.click()
                time.sleep(0.5)
            except:
                # If no dropdown, try pressing Enter
                type_input.send_keys(Keys.RETURN)
                time.sleep(0.5)

            # Find and click Search button in the Document Type section
            # Look for buttons/generics with "Search" text
            search_elements = self.driver.find_elements(
                By.XPATH,
                "//div[@id='tabs-nohdr-4']//button | "
                "//div[@id='tabs-nohdr-4']//span[text()='Search']/parent::* | "
                "//div[@id='tabs-nohdr-4']//*[contains(@class, 'search')]"
            )

            search_clicked = False
            for elem in search_elements:
                try:
                    if 'Search' in elem.text or 'search' in (elem.get_attribute('class') or '').lower():
                        elem.click()
                        search_clicked = True
                        break
                except:
                    continue

            if not search_clicked:
                # Try finding any clickable button-like element
                generic_search = self.driver.find_element(
                    By.XPATH,
                    "//*[contains(text(), 'Search') and ancestor::div[@id='tabs-nohdr-4']]"
                )
                generic_search.click()

            time.sleep(self.delay * 2)

            # Handle "too many results" dialog
            try:
                ok_btn = WebDriverWait(self.driver, 3).until(
                    EC.element_to_be_clickable((By.XPATH, "//button[text()='OK' or text()='Ok']"))
                )
                ok_btn.click()
                time.sleep(self.delay)
            except:
                pass

            # Parse results
            records = self._parse_search_results(get_details, max_results)

            return records

        except Exception as e:
            logger.error(f"Search failed: {e}")
            import traceback
            traceback.print_exc()
            return []

    def _parse_search_results(
        self,
        get_details: bool = True,
        max_results: int = 500
    ) -> List[DeedRecord]:
        """
        Parse search results from the current page using text parsing.
        This approach is more reliable than DOM traversal for this site.

        Args:
            get_details: Whether to click into each result for DTT, city, etc.
            max_results: Maximum number of results to process

        Returns:
            List of DeedRecord objects
        """
        from selenium.webdriver.common.by import By

        records = []

        logger.info("Parsing search results...")

        # Get all visible text from the page body
        body_text = self.driver.find_element(By.TAG_NAME, "body").text

        # Split by document numbers and analyze each section
        sections = re.split(r'(2026\d{9})', body_text)

        current_doc = None
        for i, section in enumerate(sections):
            if re.match(r'^2026\d{9}$', section):
                current_doc = section
            elif current_doc:
                # Parse this section for the previous document number
                section_text = section[:500]  # First 500 chars should have the info

                # Extract document type
                doc_type = None
                for dtype in ['GRANT DEED', 'TRUST DEED', 'QUITCLAIM', 'AFFIDAVIT',
                              'ASSIGNMENT RNT', 'ASSIGNMENT LSE', 'RELEASE', 'REQUEST NOTICE',
                              'UCC - F S', 'ASSUMPTION AGM', 'TRUSTEE DEED']:
                    if dtype in section_text:
                        doc_type = dtype
                        break

                # Extract recording date
                date_match = re.search(r'(\d{1,2}/\d{1,2}/\d{4})', section_text)
                rec_date = date_match.group(1) if date_match else ''

                # Extract names (lines before doc type)
                lines = section_text.strip().split('\n')
                names = []
                for line in lines:
                    line = line.strip()
                    if line and not any(dt in line for dt in ['GRANT', 'TRUST', 'DEED', 'ASSIGNMENT', 'RELEASE', 'UCC', 'AFFIDAVIT', 'REQUEST']):
                        if not re.match(r'^\d', line) and len(line) > 2:
                            names.append(line)

                # First names are grantors, after doc type are grantees
                # Simplified: take first few as grantor, rest as grantee
                grantor = '\n'.join(names[:2]) if names else ''
                grantee = '\n'.join(names[2:4]) if len(names) > 2 else ''

                record = DeedRecord(
                    doc_number=current_doc,
                    recording_date=rec_date,
                    doc_type=doc_type or 'Unknown',
                    grantor=grantor,
                    grantee=grantee,
                    raw_data={'section_text': section_text}
                )
                records.append(record)
                current_doc = None

                if len(records) >= max_results:
                    break

        logger.info(f"Found {len(records)} total records")

        # Filter for property transfers and get details
        transfer_records = []
        for record in records:
            if record.doc_type and any(
                t.lower() in record.doc_type.lower()
                for t in TRANSFER_DOC_TYPES
            ):
                if get_details:
                    self._get_document_details(record)
                transfer_records.append(record)

        logger.info(f"Filtered to {len(transfer_records)} property transfer records")
        return transfer_records

    def _get_document_details(self, record: DeedRecord) -> None:
        """
        Click into a document to get additional details like DTT, city, etc.
        Updates the record in place.

        Args:
            record: DeedRecord to update with details
        """
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        try:
            # First dismiss any overlays
            try:
                overlays = self.driver.find_elements(By.CSS_SELECTOR, ".ui-widget-overlay")
                for overlay in overlays:
                    self.driver.execute_script("arguments[0].style.display = 'none';", overlay)
            except:
                pass

            # Also try clicking OK button if there's a modal
            try:
                ok_btn = self.driver.find_element(By.XPATH, "//button[text()='OK' or text()='Ok']")
                ok_btn.click()
                time.sleep(0.5)
            except:
                pass

            # Find and click the document number using JavaScript to avoid overlay issues
            doc_link = self.driver.find_element(
                By.XPATH,
                f"//*[text()='{record.doc_number}']"
            )
            self.driver.execute_script("arguments[0].click();", doc_link)
            time.sleep(self.delay * 1.5)

            # Get the body text which includes the detail panel
            body_text = self.driver.find_element(By.TAG_NAME, "body").text

            # Extract Transfer Tax Amount
            dtt_match = re.search(r'Transfer Tax Amount[:\s]*([0-9,.]+)', body_text)
            if dtt_match:
                record.documentary_transfer_tax = float(dtt_match.group(1).replace(',', ''))

            # Extract City
            city_match = re.search(r'City[:\s]*([A-Za-z\s]+?)(?:\n|Transfer|$)', body_text)
            if city_match:
                record.city = city_match.group(1).strip()

            # Extract Lot #
            lot_match = re.search(r'Lot #[:\s]*(\d+)', body_text)
            if lot_match:
                record.lot_number = lot_match.group(1)

            # Extract Tract #
            tract_match = re.search(r'Tract #[:\s]*(\d+)', body_text)
            if tract_match:
                record.tract_number = tract_match.group(1)

            # Store raw detail text
            record.raw_data['detail_text'] = body_text[:1000]

            # Go back to results - click Back To Search Result button
            try:
                back_btn = self.driver.find_element(
                    By.XPATH,
                    "//*[contains(text(), 'Back To Search Result')]"
                )
                self.driver.execute_script("arguments[0].click();", back_btn)
                time.sleep(self.delay)
            except:
                # If no back button, navigate back
                self.driver.back()
                time.sleep(self.delay)

        except Exception as e:
            logger.debug(f"Could not get details for {record.doc_number}: {e}")

    def fetch_recordings(
        self,
        county: str,
        state: str,
        start_date: str,
        end_date: str,
        **kwargs
    ) -> List[DeedRecord]:
        """
        Fetch deed recordings - compatible with DeedMonitor interface.

        Args:
            county: County name (only 'Orange' supported)
            state: State code (only 'CA' supported)
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)

        Returns:
            List of DeedRecord objects
        """
        if county.lower() != 'orange' or state.upper() != 'CA':
            logger.warning(f"RecorderWorks only supports Orange County, CA. Got: {county}, {state}")
            return []

        # Use Recording Date search and filter for property transfers
        # This is more reliable than Document Type search
        records = self.search_by_recording_date(
            start_date=start_date,
            end_date=end_date,
            get_details=True
        )

        # Filter to only include property transfers (GRANT DEEDs, etc.)
        transfer_records = [
            r for r in records
            if r.doc_type and any(
                t.lower() in r.doc_type.lower()
                for t in TRANSFER_DOC_TYPES
            )
        ]

        logger.info(f"Filtered to {len(transfer_records)} property transfers from {len(records)} total records")
        return transfer_records

    def close(self):
        """Close the WebDriver."""
        if self.driver:
            try:
                self.driver.quit()
            except:
                pass
            self.driver = None
            self._initialized = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


# =============================================================================
# Simpler requests-based scraper (for basic operations)
# =============================================================================

class RecorderWorksScraper:
    """
    Simple requests-based scraper for RecorderWorks.

    Note: This may not work if the site uses heavy JavaScript.
    Use RecorderWorksSeleniumScraper for reliable scraping.
    """

    def __init__(self, delay: float = 1.0):
        import requests
        self.session = requests.Session()
        self.delay = delay
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        })

    def fetch_recordings(self, county: str, state: str, start_date: str, end_date: str, **kwargs):
        """Placeholder - use Selenium scraper for actual scraping."""
        logger.warning("RecorderWorksScraper (requests) not fully implemented. Use RecorderWorksSeleniumScraper.")
        return []


# =============================================================================
# Factory function
# =============================================================================

def create_recorderworks_client(use_selenium: bool = True, headless: bool = True):
    """
    Factory function to create a RecorderWorks client.

    Args:
        use_selenium: Use Selenium for reliable scraping (recommended)
        headless: Run browser in headless mode

    Returns:
        Scraper instance compatible with DeedMonitor
    """
    if use_selenium:
        return RecorderWorksSeleniumScraper(headless=headless)
    else:
        return RecorderWorksScraper()


# =============================================================================
# CLI for testing
# =============================================================================

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='RecorderWorks Scraper for Orange County')
    parser.add_argument('--start',
                       default=(datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d'),
                       help='Start date (YYYY-MM-DD), default: yesterday')
    parser.add_argument('--end',
                       default=datetime.now().strftime('%Y-%m-%d'),
                       help='End date (YYYY-MM-DD), default: today')
    parser.add_argument('--headless', action='store_true', default=True,
                       help='Run browser in headless mode (default: True)')
    parser.add_argument('--visible', action='store_true',
                       help='Show browser window for debugging')
    parser.add_argument('--max-results', type=int, default=50,
                       help='Maximum results to fetch (default: 50)')

    args = parser.parse_args()

    print("=" * 70)
    print("RecorderWorks Scraper - Orange County Deed Monitor")
    print("=" * 70)
    print(f"Date range: {args.start} to {args.end}")
    print(f"Headless: {not args.visible}")
    print(f"Max results: {args.max_results}")
    print()

    # Create scraper
    scraper = RecorderWorksSeleniumScraper(headless=not args.visible)

    try:
        # Search for GRANT DEEDs
        print("Searching for GRANT DEEDs...")
        records = scraper.search_by_document_type(
            start_date=args.start,
            end_date=args.end,
            doc_type='GRANT DEED',
            get_details=True,
            max_results=args.max_results
        )

        print(f"\nFound {len(records)} GRANT DEED recordings:\n")

        for i, record in enumerate(records[:20], 1):
            print(f"{i}. Doc #{record.doc_number} ({record.recording_date})")
            print(f"   Type: {record.doc_type}")
            print(f"   Grantor (Seller): {record.grantor}")
            print(f"   Grantee (Buyer): {record.grantee}")
            if record.city:
                print(f"   City: {record.city}")
            if record.documentary_transfer_tax:
                print(f"   Documentary Transfer Tax: ${record.documentary_transfer_tax:,.2f}")
                if record.calculated_sale_price:
                    print(f"   Calculated Sale Price: ${record.calculated_sale_price:,.0f}")
            if record.lot_number or record.tract_number:
                print(f"   Lot/Tract: {record.lot_number or 'N/A'} / {record.tract_number or 'N/A'}")
            print()

        if len(records) > 20:
            print(f"... and {len(records) - 20} more records")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        scraper.close()

    print("\n" + "=" * 70)
    print("Scraper test complete")
    print("=" * 70)
