#!/usr/bin/env python3
"""
Deed Monitor for BuildingHawk
=============================

Monitors county deed recordings and alerts when watched industrial parcels sell.

Data Flow:
1. Fetch recent deed recordings from data source (PropertyRadar, ATTOM, or scraper)
2. Match APNs against your watchlist
3. Calculate sale price from Documentary Transfer Tax
4. Create alerts and send notifications

Usage:
    python deed_monitor.py --county orange --days 1
    python deed_monitor.py --county orange --date 2025-01-20
    python deed_monitor.py --backfill --start 2024-01-01 --end 2024-12-31
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
import requests
from supabase import create_client, Client

# Import property matcher for multi-strategy matching
try:
    from property_matcher import PropertyMatcher, MatchResult
    PROPERTY_MATCHER_AVAILABLE = True
except ImportError:
    PROPERTY_MATCHER_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('deed_monitor.log')
    ]
)
logger = logging.getLogger(__name__)


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class Config:
    """Configuration loaded from environment variables."""
    
    # Supabase
    supabase_url: str
    supabase_key: str
    
    # Data source credentials (choose one)
    propertyradar_api_key: Optional[str] = None
    attom_api_key: Optional[str] = None
    
    # Notifications
    slack_webhook_url: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    notification_email: Optional[str] = None
    
    # Settings
    county: str = "Orange"
    state: str = "CA"
    dtt_rate: float = 1.10  # $1.10 per $1,000 in Orange County
    
    @classmethod
    def from_env(cls) -> 'Config':
        """Load configuration from environment variables."""
        return cls(
            supabase_url=os.environ.get('SUPABASE_URL', ''),
            supabase_key=os.environ.get('SUPABASE_KEY', ''),
            propertyradar_api_key=os.environ.get('PROPERTYRADAR_API_KEY'),
            attom_api_key=os.environ.get('ATTOM_API_KEY'),
            slack_webhook_url=os.environ.get('SLACK_WEBHOOK_URL'),
            smtp_host=os.environ.get('SMTP_HOST'),
            smtp_user=os.environ.get('SMTP_USER'),
            smtp_password=os.environ.get('SMTP_PASSWORD'),
            notification_email=os.environ.get('NOTIFICATION_EMAIL'),
            county=os.environ.get('MONITOR_COUNTY', 'Orange'),
            state=os.environ.get('MONITOR_STATE', 'CA'),
            dtt_rate=float(os.environ.get('DTT_RATE', '1.10'))
        )


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class DeedRecord:
    """Represents a deed recording from the county."""
    doc_number: str
    recording_date: str  # YYYY-MM-DD
    doc_type: str
    apn: Optional[str]
    address: Optional[str]
    city: Optional[str]
    grantor: Optional[str]  # Seller
    grantee: Optional[str]  # Buyer
    documentary_transfer_tax: Optional[float]
    raw_data: Dict[str, Any]
    source: str
    
    @property
    def apn_normalized(self) -> Optional[str]:
        """Normalize APN by removing dashes and spaces."""
        if self.apn:
            return self.apn.replace('-', '').replace(' ', '')
        return None
    
    def calculate_sale_price(self, dtt_rate: float = 1.10) -> Optional[float]:
        """Calculate sale price from Documentary Transfer Tax."""
        if self.documentary_transfer_tax and self.documentary_transfer_tax > 0:
            return round((self.documentary_transfer_tax / dtt_rate) * 1000, 0)
        return None


@dataclass
class SaleAlert:
    """Alert generated when a watched parcel sells."""
    watchlist_id: str
    deed_id: str
    apn: str
    address: str
    city: str
    sale_price: float
    sale_date: str
    buyer: str
    seller: str
    was_listed: bool = False
    listing_price: Optional[float] = None


# =============================================================================
# Data Source Clients
# =============================================================================

class PropertyRadarClient:
    """
    PropertyRadar API client for fetching deed recordings.
    
    PropertyRadar provides near-real-time deed recordings for California.
    Docs: https://www.propertyradar.com/api
    Pricing: ~$200-400/month depending on volume
    """
    
    BASE_URL = "https://api.propertyradar.com/v1"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        })
    
    def fetch_recordings(
        self,
        county: str,
        state: str,
        start_date: str,
        end_date: str,
        doc_types: List[str] = None
    ) -> List[DeedRecord]:
        """
        Fetch deed recordings for a date range.
        
        Args:
            county: County name (e.g., 'Orange')
            state: State code (e.g., 'CA')
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            doc_types: Filter by document types (default: grant deeds)
        
        Returns:
            List of DeedRecord objects
        """
        if doc_types is None:
            doc_types = ['Grant Deed', 'Grant Deed - Joint Tenancy', 'Warranty Deed']
        
        # PropertyRadar uses criteria-based search
        criteria = {
            "state": state,
            "county": county,
            "recordingDateMin": start_date,
            "recordingDateMax": end_date,
            "documentType": doc_types
        }
        
        records = []
        offset = 0
        limit = 100
        
        while True:
            try:
                response = self.session.post(
                    f"{self.BASE_URL}/recordings/search",
                    json={
                        "criteria": criteria,
                        "limit": limit,
                        "offset": offset,
                        "fields": [
                            "documentNumber", "recordingDate", "documentType",
                            "apn", "propertyAddress", "propertyCity",
                            "grantor", "grantee", "transferTax"
                        ]
                    }
                )
                response.raise_for_status()
                data = response.json()
                
                for item in data.get('results', []):
                    record = DeedRecord(
                        doc_number=item.get('documentNumber', ''),
                        recording_date=item.get('recordingDate', ''),
                        doc_type=item.get('documentType', ''),
                        apn=item.get('apn'),
                        address=item.get('propertyAddress'),
                        city=item.get('propertyCity'),
                        grantor=item.get('grantor'),
                        grantee=item.get('grantee'),
                        documentary_transfer_tax=item.get('transferTax'),
                        raw_data=item,
                        source='propertyradar'
                    )
                    records.append(record)
                
                # Check if more pages
                if len(data.get('results', [])) < limit:
                    break
                offset += limit
                
            except requests.RequestException as e:
                logger.error(f"PropertyRadar API error: {e}")
                break
        
        return records


class ATTOMClient:
    """
    ATTOM Data API client for fetching deed recordings.
    
    ATTOM provides nationwide property and transaction data.
    Docs: https://api.gateway.attomdata.com/propertyapi/v1.0.0/
    Pricing: Starting ~$500/month
    """
    
    BASE_URL = "https://api.gateway.attomdata.com/propertyapi/v1.0.0"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            'apikey': api_key,
            'Accept': 'application/json'
        })
    
    def fetch_recordings(
        self,
        county: str,
        state: str,
        start_date: str,
        end_date: str,
        **kwargs
    ) -> List[DeedRecord]:
        """Fetch deed recordings from ATTOM."""
        
        # ATTOM uses geographic identifiers
        geo_id = f"{state}/{county}"
        
        records = []
        page = 1
        
        while True:
            try:
                response = self.session.get(
                    f"{self.BASE_URL}/sale/snapshot",
                    params={
                        "geoIdV4": geo_id,
                        "minsaledate": start_date,
                        "maxsaledate": end_date,
                        "page": page,
                        "pageSize": 100
                    }
                )
                response.raise_for_status()
                data = response.json()
                
                properties = data.get('property', [])
                for item in properties:
                    sale = item.get('sale', {}).get('saleTransferData', {})
                    record = DeedRecord(
                        doc_number=sale.get('documentNumber', ''),
                        recording_date=sale.get('recordingDate', ''),
                        doc_type=sale.get('documentType', ''),
                        apn=item.get('identifier', {}).get('apn'),
                        address=item.get('address', {}).get('oneLine'),
                        city=item.get('address', {}).get('locality'),
                        grantor=sale.get('sellerName'),
                        grantee=sale.get('buyerName'),
                        documentary_transfer_tax=sale.get('transferTax'),
                        raw_data=item,
                        source='attom'
                    )
                    records.append(record)
                
                # Check pagination
                if len(properties) < 100:
                    break
                page += 1
                
            except requests.RequestException as e:
                logger.error(f"ATTOM API error: {e}")
                break
        
        return records


class MockClient:
    """
    Mock client for testing without API credentials.
    Generates sample deed records.
    """
    
    def fetch_recordings(
        self,
        county: str,
        state: str,
        start_date: str,
        end_date: str,
        **kwargs
    ) -> List[DeedRecord]:
        """Generate mock deed records for testing."""
        
        # Sample data for testing - includes APNs that might match your watchlist
        sample_records = [
            DeedRecord(
                doc_number="2025000012345",
                recording_date=start_date,
                doc_type="Grant Deed",
                apn="360-384-05",  # 2911 N Orange Olive!
                address="2911 N Orange Olive Rd",
                city="Orange",
                grantor="OLIVE HILL PROPERTIES LLC",
                grantee="NEW BUYER INDUSTRIAL LLC",
                documentary_transfer_tax=2860.00,  # = $2,600,000 sale
                raw_data={"test": True},
                source="mock"
            ),
            DeedRecord(
                doc_number="2025000012346",
                recording_date=start_date,
                doc_type="Grant Deed",
                apn="082-261-15",
                address="3855 E La Palma Ave",
                city="Anaheim",
                grantor="LA PALMA INDUSTRIAL OWNER LLC",
                grantee="WAREHOUSE BUYER CORP",
                documentary_transfer_tax=15400.00,  # = $14,000,000 sale
                raw_data={"test": True},
                source="mock"
            ),
        ]
        
        return sample_records


# =============================================================================
# Deed Monitor
# =============================================================================

class DeedMonitor:
    """
    Main deed monitoring service.
    
    Orchestrates:
    - Fetching deed recordings from data source
    - Matching against APN watchlist
    - Creating alerts
    - Sending notifications
    """
    
    def __init__(self, config: Config):
        self.config = config
        self.db: Client = create_client(config.supabase_url, config.supabase_key)

        # Initialize data source client based on DATA_PROVIDER env var or available credentials
        data_provider = os.environ.get('DATA_PROVIDER', '').lower()

        if data_provider == 'recorderworks':
            # Use FREE RecorderWorks scraper (Orange County only)
            from recorderworks_scraper import RecorderWorksSeleniumScraper
            self.data_client = RecorderWorksSeleniumScraper(headless=True)
            logger.info("Using RecorderWorks scraper as data source (FREE)")
        elif data_provider == 'mock':
            self.data_client = MockClient()
            logger.info("Using mock data for testing")
        elif config.propertyradar_api_key:
            self.data_client = PropertyRadarClient(config.propertyradar_api_key)
            logger.info("Using PropertyRadar as data source ($549/mo)")
        elif config.attom_api_key:
            self.data_client = ATTOMClient(config.attom_api_key)
            logger.info("Using ATTOM as data source ($500+/mo)")
        else:
            self.data_client = MockClient()
            logger.warning("No API keys configured - using mock data for testing")
            logger.info("Set DATA_PROVIDER=recorderworks for FREE Orange County scraping")

        # Cache watchlist APNs for fast matching
        self._watchlist_cache: Dict[str, Dict] = {}
        self._load_watchlist_cache()

        # Initialize property matcher for multi-strategy matching
        self._property_matcher = None
        if PROPERTY_MATCHER_AVAILABLE:
            try:
                self._property_matcher = PropertyMatcher(self.db, self._watchlist_cache)
                logger.info("PropertyMatcher initialized (Lot/Tract + Address matching enabled)")
            except Exception as e:
                logger.warning(f"Could not initialize PropertyMatcher: {e}")
        else:
            logger.info("PropertyMatcher not available - using APN-only matching")
    
    def _load_watchlist_cache(self):
        """Load APN watchlist into memory for fast matching."""
        logger.info("Loading APN watchlist cache...")

        # Fetch all records with pagination (Supabase limits to 1000 per request)
        page_size = 1000
        offset = 0

        while True:
            result = self.db.table('apn_watchlist').select(
                'id, apn, apn_normalized, address, city, building_sf, '
                'assessed_total, is_listed_for_sale, listing_price'
            ).range(offset, offset + page_size - 1).execute()

            if not result.data:
                break

            for row in result.data:
                normalized = row.get('apn_normalized') or row['apn'].replace('-', '').replace(' ', '')
                self._watchlist_cache[normalized] = row

            if len(result.data) < page_size:
                break
            offset += page_size

        logger.info(f"Loaded {len(self._watchlist_cache)} parcels into watchlist cache")
    
    def run(
        self,
        start_date: str,
        end_date: str,
        dry_run: bool = False
    ) -> Dict[str, Any]:
        """
        Run the deed monitor for a date range.
        
        Args:
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            dry_run: If True, don't save to database
        
        Returns:
            Summary statistics
        """
        run_id = None
        stats = {
            'records_fetched': 0,
            'records_matched': 0,
            'alerts_created': 0,
            'errors': []
        }
        
        try:
            # Log run start
            if not dry_run:
                run_result = self.db.table('monitor_runs').insert({
                    'county': self.config.county,
                    'date_range_start': start_date,
                    'date_range_end': end_date,
                    'status': 'running'
                }).execute()
                run_id = run_result.data[0]['id']
            
            # Fetch recordings
            logger.info(f"Fetching deed recordings from {start_date} to {end_date}...")
            records = self.data_client.fetch_recordings(
                county=self.config.county,
                state=self.config.state,
                start_date=start_date,
                end_date=end_date
            )
            stats['records_fetched'] = len(records)
            logger.info(f"Fetched {len(records)} deed recordings")
            
            # Process each record
            for record in records:
                try:
                    result = self._process_record(record, dry_run)
                    if result.get('matched'):
                        stats['records_matched'] += 1
                    if result.get('alert_created'):
                        stats['alerts_created'] += 1
                except Exception as e:
                    logger.error(f"Error processing record {record.doc_number}: {e}")
                    stats['errors'].append(str(e))
            
            # Update run status
            if not dry_run and run_id:
                self.db.table('monitor_runs').update({
                    'completed_at': datetime.utcnow().isoformat(),
                    'status': 'completed',
                    'records_fetched': stats['records_fetched'],
                    'records_matched': stats['records_matched'],
                    'alerts_created': stats['alerts_created']
                }).eq('id', run_id).execute()
            
            logger.info(f"Monitor run complete: {stats}")
            return stats
            
        except Exception as e:
            logger.error(f"Monitor run failed: {e}")
            if not dry_run and run_id:
                self.db.table('monitor_runs').update({
                    'completed_at': datetime.utcnow().isoformat(),
                    'status': 'failed',
                    'error_message': str(e)
                }).eq('id', run_id).execute()
            raise
    
    def _process_record(self, record, dry_run: bool = False) -> Dict[str, Any]:
        """Process a single deed record.

        Args:
            record: DeedRecord from any data source (PropertyRadar, ATTOM, RecorderWorks, Mock)
            dry_run: If True, don't save to database
        """
        result = {'matched': False, 'alert_created': False}

        # Handle both internal DeedRecord and RecorderWorks DeedRecord
        # RecorderWorks records may not have APN directly
        apn = getattr(record, 'apn', None)
        apn_normalized = None
        watchlist_entry = None
        match_method = 'apn'
        match_confidence = 1.0

        if apn:
            apn_normalized = apn.replace('-', '').replace(' ', '')
        elif hasattr(record, 'apn_normalized'):
            apn_normalized = record.apn_normalized

        # Strategy 1: Direct APN match
        if apn_normalized:
            watchlist_entry = self._watchlist_cache.get(apn_normalized)

        # Strategy 2 & 3: Use PropertyMatcher for Lot/Tract or Address matching
        if not watchlist_entry and self._property_matcher:
            match_result = self._property_matcher.match(record)

            if match_result.matched:
                watchlist_entry = match_result.watchlist_entry
                apn = match_result.matched_apn
                apn_normalized = apn.replace('-', '').replace(' ', '') if apn else None
                match_method = match_result.match_method
                match_confidence = match_result.confidence
                logger.info(f"Matched via {match_method} ({match_confidence:.0%}): {match_result.notes}")

        # No match found
        if not watchlist_entry:
            # Log for manual review if it's a real sale (has DTT)
            dtt = getattr(record, 'documentary_transfer_tax', None)
            if dtt and dtt > 0:
                city = getattr(record, 'city', 'Unknown')
                lot = getattr(record, 'lot_number', None)
                tract = getattr(record, 'tract_number', None)
                if lot and tract:
                    logger.info(f"No match for {record.doc_number} - Lot {lot}/Tract {tract} ({city}) - DTT: ${dtt:,.2f}")
                else:
                    logger.debug(f"No APN for {record.doc_number} ({city}) - DTT: ${dtt:,.2f}")
            return result

        result['matched'] = True
        address = getattr(record, 'address', None) or watchlist_entry.get('address', '')
        logger.info(f"🎯 MATCH FOUND: {apn} - {address}")

        # Calculate sale price - handle different record types
        dtt = getattr(record, 'documentary_transfer_tax', None)
        if dtt and dtt > 0:
            sale_price = round((dtt / self.config.dtt_rate) * 1000, 0)
        elif hasattr(record, 'calculated_sale_price') and record.calculated_sale_price:
            sale_price = record.calculated_sale_price
        elif hasattr(record, 'calculate_sale_price'):
            sale_price = record.calculate_sale_price(self.config.dtt_rate)
        else:
            sale_price = None
        
        if dry_run:
            if sale_price:
                logger.info(f"  [DRY RUN] Would create alert for ${sale_price:,.0f} sale")
            else:
                logger.info(f"  [DRY RUN] Would create alert (no sale price available)")
            return result

        # Save deed recording - use getattr for compatibility with different record types
        deed_data = {
            'doc_number': record.doc_number,
            'recording_date': record.recording_date,
            'doc_type': getattr(record, 'doc_type', 'Grant Deed'),
            'apn': apn,
            'apn_normalized': apn_normalized,
            'address': getattr(record, 'address', None) or watchlist_entry.get('address'),
            'city': getattr(record, 'city', None) or watchlist_entry.get('city'),
            'grantor': getattr(record, 'grantor', None),
            'grantee': getattr(record, 'grantee', None),
            'documentary_transfer_tax': dtt,
            'calculated_sale_price': sale_price,
            'matched_watchlist_id': watchlist_entry['id'],
            'match_confidence': match_confidence,
            'raw_data': {
                **getattr(record, 'raw_data', {}),
                'match_method': match_method,
                'lot_number': getattr(record, 'lot_number', None),
                'tract_number': getattr(record, 'tract_number', None),
            },
            'source': getattr(record, 'source', 'recorderworks'),
            'processed_at': datetime.utcnow().isoformat()
        }
        
        deed_result = self.db.table('deed_recordings').upsert(
            deed_data,
            on_conflict='doc_number,recording_date'
        ).execute()
        
        deed_id = deed_result.data[0]['id']
        
        # Create alert
        alert_data = {
            'watchlist_id': watchlist_entry['id'],
            'deed_id': deed_id,
            'apn': record.apn,
            'address': watchlist_entry.get('address') or record.address,
            'city': watchlist_entry.get('city') or record.city,
            'sale_price': sale_price,
            'sale_date': record.recording_date,
            'buyer': record.grantee,
            'seller': record.grantor,
            'was_listed': watchlist_entry.get('is_listed_for_sale', False),
            'listing_price': watchlist_entry.get('listing_price'),
            'assessed_value': watchlist_entry.get('assessed_total'),
            'priority': 'high' if sale_price and sale_price > 5000000 else 'normal'
        }
        
        # Calculate price vs assessed ratio
        if sale_price and watchlist_entry.get('assessed_total'):
            alert_data['price_vs_assessed'] = round(
                sale_price / float(watchlist_entry['assessed_total']), 2
            )
        
        # Calculate price vs listing
        if sale_price and watchlist_entry.get('listing_price'):
            listing = float(watchlist_entry['listing_price'])
            alert_data['price_vs_listing'] = round(
                ((sale_price - listing) / listing) * 100, 2
            )
        
        alert_result = self.db.table('sale_alerts').upsert(
            alert_data,
            on_conflict='watchlist_id,deed_id'
        ).execute()
        
        if alert_result.data:
            result['alert_created'] = True
            logger.info(f"  ✅ Alert created: ${sale_price:,.0f} sale to {record.grantee}")
            
            # Send notification
            self._send_notification(alert_data)
        
        # Update watchlist entry with new sale info
        self.db.table('apn_watchlist').update({
            'last_sale_date': record.recording_date,
            'last_sale_price': sale_price,
            'last_sale_doc_number': record.doc_number,
            'is_listed_for_sale': False,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', watchlist_entry['id']).execute()
        
        return result
    
    def _send_notification(self, alert: Dict[str, Any]):
        """Send notification for a new sale alert."""
        
        # Format message
        message = self._format_alert_message(alert)
        
        # Slack notification
        if self.config.slack_webhook_url:
            try:
                requests.post(
                    self.config.slack_webhook_url,
                    json={'text': message},
                    timeout=10
                )
                logger.info("Slack notification sent")
            except Exception as e:
                logger.error(f"Failed to send Slack notification: {e}")
        
        # Email notification
        if self.config.smtp_host and self.config.notification_email:
            try:
                self._send_email(
                    to=self.config.notification_email,
                    subject=f"🏭 Industrial Sale Alert: {alert['address']}",
                    body=message
                )
                logger.info("Email notification sent")
            except Exception as e:
                logger.error(f"Failed to send email notification: {e}")
    
    def _format_alert_message(self, alert: Dict[str, Any]) -> str:
        """Format alert as human-readable message."""
        
        price = alert.get('sale_price', 0)
        price_str = f"${price:,.0f}" if price else "Unknown"
        
        lines = [
            f"🏭 *Industrial Property Sale Detected*",
            f"",
            f"📍 *{alert.get('address', 'Unknown')}*, {alert.get('city', '')}",
            f"🏷️ APN: {alert.get('apn', 'Unknown')}",
            f"",
            f"💰 *Sale Price: {price_str}*",
            f"📅 Recording Date: {alert.get('sale_date', 'Unknown')}",
            f"",
            f"👤 Seller: {alert.get('seller', 'Unknown')}",
            f"👤 Buyer: {alert.get('buyer', 'Unknown')}",
        ]
        
        # Add comparison data if available
        if alert.get('was_listed') and alert.get('listing_price'):
            listing = alert['listing_price']
            diff = alert.get('price_vs_listing', 0)
            lines.append(f"")
            lines.append(f"📊 Was Listed: ${listing:,.0f} ({diff:+.1f}% from list)")
        
        if alert.get('price_vs_assessed'):
            ratio = alert['price_vs_assessed']
            lines.append(f"📊 Sale/Assessed Ratio: {ratio:.2f}x")
        
        return "\n".join(lines)
    
    def _send_email(self, to: str, subject: str, body: str):
        """Send email notification."""
        import smtplib
        from email.mime.text import MIMEText
        
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = self.config.smtp_user
        msg['To'] = to
        
        with smtplib.SMTP(self.config.smtp_host, 587) as server:
            server.starttls()
            server.login(self.config.smtp_user, self.config.smtp_password)
            server.send_message(msg)


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Monitor deed recordings for industrial property sales'
    )
    parser.add_argument(
        '--county',
        default='Orange',
        help='County to monitor (default: Orange)'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=1,
        help='Number of days to look back (default: 1)'
    )
    parser.add_argument(
        '--date',
        help='Specific date to check (YYYY-MM-DD)'
    )
    parser.add_argument(
        '--start',
        help='Start date for backfill (YYYY-MM-DD)'
    )
    parser.add_argument(
        '--end',
        help='End date for backfill (YYYY-MM-DD)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Run without saving to database'
    )
    parser.add_argument(
        '--backfill',
        action='store_true',
        help='Run backfill mode (use with --start and --end)'
    )
    
    args = parser.parse_args()
    
    # Load config
    config = Config.from_env()
    config.county = args.county
    
    # Validate config
    if not config.supabase_url or not config.supabase_key:
        logger.error("SUPABASE_URL and SUPABASE_KEY environment variables required")
        sys.exit(1)
    
    # Determine date range
    if args.date:
        start_date = args.date
        end_date = args.date
    elif args.backfill and args.start and args.end:
        start_date = args.start
        end_date = args.end
    else:
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=args.days)).strftime('%Y-%m-%d')
    
    # Run monitor
    monitor = DeedMonitor(config)
    
    try:
        stats = monitor.run(
            start_date=start_date,
            end_date=end_date,
            dry_run=args.dry_run
        )
        
        # Print summary
        print("\n" + "="*50)
        print("DEED MONITOR SUMMARY")
        print("="*50)
        print(f"Date Range: {start_date} to {end_date}")
        print(f"Records Fetched: {stats['records_fetched']}")
        print(f"Records Matched: {stats['records_matched']}")
        print(f"Alerts Created: {stats['alerts_created']}")
        if stats['errors']:
            print(f"Errors: {len(stats['errors'])}")
        print("="*50)
        
    except Exception as e:
        logger.error(f"Monitor failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
