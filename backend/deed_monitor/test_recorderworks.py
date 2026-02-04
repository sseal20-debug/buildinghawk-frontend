#!/usr/bin/env python3
"""
Simple test script for RecorderWorks scraper.
Tests the search functionality and parses results.
"""

import time
import re
from datetime import datetime, timedelta

def test_scraper():
    """Test the RecorderWorks Selenium scraper."""
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from webdriver_manager.chrome import ChromeDriverManager

    print("=" * 70)
    print("RecorderWorks Scraper Test")
    print("=" * 70)

    # Setup Chrome
    options = Options()
    # options.add_argument('--headless=new')  # Uncomment for headless mode
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--window-size=1920,1080')

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    driver.implicitly_wait(10)

    try:
        # Navigate to RecorderWorks
        print("\n1. Navigating to RecorderWorks...")
        driver.get("https://cr.occlerkrecorder.gov/RecorderWorksInternet")
        time.sleep(2)

        # Click Recording Date tab
        print("2. Clicking Recording Date tab...")
        rec_date_tab = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.LINK_TEXT, "Recording Date"))
        )
        rec_date_tab.click()
        time.sleep(1)

        # Set dates
        start_date = "1/20/2026"
        end_date = "1/21/2026"
        print(f"3. Setting date range: {start_date} to {end_date}...")

        start_input = driver.find_element(
            By.ID, "MainContent_MainMenu1_SearchByRecordingDate1_FromDate"
        )
        start_input.clear()
        start_input.send_keys(start_date)

        end_input = driver.find_element(
            By.ID, "MainContent_MainMenu1_SearchByRecordingDate1_ToDate"
        )
        end_input.clear()
        end_input.send_keys(end_date)
        time.sleep(0.5)

        # Click Search
        print("4. Clicking Search...")
        search_btn = driver.find_element(
            By.ID, "MainContent_MainMenu1_SearchByRecordingDate1_btnSearch"
        )
        search_btn.click()
        time.sleep(3)

        # Handle "too many results" dialog
        try:
            ok_btn = WebDriverWait(driver, 3).until(
                EC.element_to_be_clickable((By.XPATH, "//button[text()='OK' or text()='Ok']"))
            )
            ok_btn.click()
            time.sleep(1)
            print("   (Dismissed 'too many results' dialog)")
        except:
            pass

        # Parse results using page text
        print("\n5. Parsing results...")

        # Find all document numbers on the page
        page_text = driver.page_source
        doc_numbers = re.findall(r'2026\d{9}', page_text)
        unique_docs = list(set(doc_numbers))
        print(f"   Found {len(unique_docs)} unique document numbers")

        # Look for GRANT DEED entries by parsing the page text
        grant_deeds = []

        # Get page source and extract document info using regex
        page_source = driver.page_source

        # Find all document records by looking for patterns in the HTML
        # Document numbers appear near their document types
        doc_pattern = r'>(2026\d{9})<.*?GRANT DEED'

        # Simpler approach: Get text content and parse it
        body_text = driver.find_element(By.TAG_NAME, "body").text

        # Split by document numbers and analyze each section
        sections = re.split(r'(2026\d{9})', body_text)

        current_doc = None
        for i, section in enumerate(sections):
            if re.match(r'^2026\d{9}$', section):
                current_doc = section
            elif current_doc and 'GRANT DEED' in section[:500]:
                # This section has a GRANT DEED for the previous doc number
                grant_deeds.append({
                    'doc_number': current_doc,
                    'text': section[:300],
                    'doc_type': 'GRANT DEED'
                })
                current_doc = None

        print(f"\n6. Found {len(grant_deeds)} GRANT DEED entries")

        # Print some samples
        for i, deed in enumerate(grant_deeds[:5], 1):
            print(f"\n   {i}. Doc #{deed['doc_number']}")
            print(f"      Context: {deed['text'][:100]}...")

        # Now test clicking on a document to get details
        if grant_deeds:
            print("\n7. Testing document detail view...")
            doc_num = grant_deeds[1]['doc_number']  # Use second one (first GRANT DEED with clear data)

            # First dismiss any overlays
            try:
                overlays = driver.find_elements(By.CSS_SELECTOR, ".ui-widget-overlay")
                for overlay in overlays:
                    driver.execute_script("arguments[0].style.display = 'none';", overlay)
            except:
                pass

            # Also try clicking OK button if there's a modal
            try:
                ok_btn = driver.find_element(By.XPATH, "//button[text()='OK' or text()='Ok']")
                ok_btn.click()
                time.sleep(1)
            except:
                pass

            # Find and click the document number using JavaScript
            doc_link = driver.find_element(
                By.XPATH,
                f"//*[text()='{doc_num}']"
            )
            driver.execute_script("arguments[0].click();", doc_link)
            time.sleep(2)

            # Look for detail fields - wait for detail panel to load
            time.sleep(2)

            # Get the body text which includes the detail panel
            body_text = driver.find_element(By.TAG_NAME, "body").text
            detail_text = driver.page_source

            print(f"\n   Document: {doc_num}")

            # Extract Transfer Tax Amount from body text
            dtt_match = re.search(r'Transfer Tax Amount[:\s]*([0-9,.]+)', body_text)
            if not dtt_match:
                dtt_match = re.search(r'Transfer Tax Amount[:\s]*([0-9,.]+)', detail_text)

            # Extract City
            city_match = re.search(r'City[:\s]*([A-Za-z\s]+?)(?:\n|Transfer|$)', body_text)
            if not city_match:
                city_match = re.search(r'>City</.*?>([^<]+)<', detail_text)

            # Extract Lot and Tract
            lot_match = re.search(r'Lot #[:\s]*(\d+)', body_text)
            tract_match = re.search(r'Tract #[:\s]*(\d+)', body_text)

            if city_match:
                city = city_match.group(1).strip()
                if city:
                    print(f"   City: {city}")
            if dtt_match:
                dtt = float(dtt_match.group(1).replace(',', ''))
                sale_price = (dtt / 1.10) * 1000
                print(f"   Transfer Tax: ${dtt:,.2f}")
                print(f"   Calculated Sale Price: ${sale_price:,.0f}")
            if lot_match:
                print(f"   Lot #: {lot_match.group(1)}")
            if tract_match:
                print(f"   Tract #: {tract_match.group(1)}")

            # Debug: Print a snippet of body text around "Transfer"
            if 'Transfer' in body_text:
                idx = body_text.index('Transfer')
                print(f"\n   Debug - Text around 'Transfer': ...{body_text[idx:idx+100]}...")

        print("\n" + "=" * 70)
        print("Test completed successfully!")
        print("=" * 70)

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()

    finally:
        driver.quit()


if __name__ == '__main__':
    test_scraper()
