#!/usr/bin/env python3
"""
Property Matcher for Deed Monitor
=================================

Provides multiple matching strategies to identify properties from deed recordings:

1. APN Matching (Direct) - Primary method when APN is available
2. Lot/Tract to APN Lookup - Uses OC Assessor Lot/Tract mapping
3. Address Matching (Fuzzy) - Fallback using normalized address comparison

Since RecorderWorks doesn't provide APN directly (only Lot#/Tract#),
we need alternative methods to match deeds to our watchlist.

Data Sources:
- OC Assessor Public Records: https://www.ocgov.com/gov/assessor
- LandVision: Has Lot/Tract to APN mapping (user has access)
- TitlePro: Property records with APN lookup (user has access)
- NeighborWho: Property search (user has access)

Usage:
    from property_matcher import PropertyMatcher

    matcher = PropertyMatcher(supabase_client, watchlist_cache)

    # Try to match a deed record
    match = matcher.match(deed_record)
    if match:
        print(f"Matched to {match['apn']} - {match['address']}")
"""

import os
import re
import logging
from typing import Dict, Optional, List, Any, Tuple
from dataclasses import dataclass
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)


@dataclass
class MatchResult:
    """Result of a property matching attempt."""
    matched: bool
    watchlist_entry: Optional[Dict] = None
    match_method: str = ''  # 'apn', 'lot_tract', 'address'
    confidence: float = 0.0
    matched_apn: Optional[str] = None
    notes: str = ''


class PropertyMatcher:
    """
    Multi-strategy property matcher for deed records.

    Attempts matching in order of reliability:
    1. Direct APN match
    2. Lot/Tract to APN lookup
    3. Address fuzzy matching
    """

    def __init__(
        self,
        supabase_client,
        watchlist_cache: Dict[str, Dict],
        lot_tract_cache: Optional[Dict] = None
    ):
        """
        Initialize the matcher.

        Args:
            supabase_client: Supabase client for database queries
            watchlist_cache: Dictionary of normalized APN -> watchlist entry
            lot_tract_cache: Optional pre-loaded Lot/Tract to APN mapping
        """
        self.db = supabase_client
        self.watchlist_cache = watchlist_cache
        self.lot_tract_cache = lot_tract_cache or {}

        # Build address index from watchlist for fuzzy matching
        self._address_index: Dict[str, List[Dict]] = {}
        self._build_address_index()

        # Load Lot/Tract mapping if not provided
        if not self.lot_tract_cache:
            self._load_lot_tract_mapping()

    def _build_address_index(self):
        """Build address index for fuzzy matching."""
        for apn_normalized, entry in self.watchlist_cache.items():
            address = entry.get('address', '')
            city = entry.get('city', '')

            if not address:
                continue

            # Normalize and index by street number + city
            normalized_addr = self._normalize_address(address)
            city_lower = city.lower() if city else ''

            # Extract street number
            match = re.match(r'^(\d+)', normalized_addr)
            if match:
                street_num = match.group(1)
                key = f"{street_num}|{city_lower}"

                if key not in self._address_index:
                    self._address_index[key] = []
                self._address_index[key].append({
                    'apn_normalized': apn_normalized,
                    'address': address,
                    'normalized_address': normalized_addr,
                    'city': city,
                    'entry': entry
                })

        logger.info(f"Built address index with {len(self._address_index)} street number/city combinations")

    def _load_lot_tract_mapping(self):
        """
        Load Lot/Tract to APN mapping from database.

        This mapping can be populated from:
        - OC Assessor data (parcel shapefiles have this)
        - LandVision exports
        - TitlePro exports
        """
        try:
            # Check if lot_tract_apn_lookup table exists
            result = self.db.table('lot_tract_apn_lookup').select(
                'lot_number, tract_number, city, apn'
            ).limit(1).execute()

            # Table exists, load it
            logger.info("Loading Lot/Tract to APN mapping...")

            offset = 0
            page_size = 1000

            while True:
                result = self.db.table('lot_tract_apn_lookup').select(
                    'lot_number, tract_number, city, apn'
                ).range(offset, offset + page_size - 1).execute()

                if not result.data:
                    break

                for row in result.data:
                    lot = row.get('lot_number', '')
                    tract = row.get('tract_number', '')
                    city = row.get('city', '').lower()
                    apn = row.get('apn', '')

                    if lot and tract and apn:
                        key = f"{lot}|{tract}|{city}"
                        self.lot_tract_cache[key] = apn

                if len(result.data) < page_size:
                    break
                offset += page_size

            logger.info(f"Loaded {len(self.lot_tract_cache)} Lot/Tract to APN mappings")

        except Exception as e:
            logger.debug(f"Lot/Tract lookup table not available: {e}")
            logger.info("Lot/Tract to APN lookup disabled - table not found")

    def match(self, deed_record) -> MatchResult:
        """
        Attempt to match a deed record to the watchlist using multiple strategies.

        Args:
            deed_record: DeedRecord from RecorderWorks or other source

        Returns:
            MatchResult with match details
        """
        # Strategy 1: Direct APN match
        apn = getattr(deed_record, 'apn', None)
        if apn:
            result = self._match_by_apn(apn)
            if result.matched:
                return result

        # Strategy 2: Lot/Tract to APN lookup
        lot_number = getattr(deed_record, 'lot_number', None)
        tract_number = getattr(deed_record, 'tract_number', None)
        city = getattr(deed_record, 'city', None)

        if lot_number and tract_number:
            result = self._match_by_lot_tract(lot_number, tract_number, city)
            if result.matched:
                return result

        # Strategy 3: Address fuzzy matching
        address = getattr(deed_record, 'address', None)
        if not address and city:
            # Try to find by city alone if we have DTT (real sale)
            dtt = getattr(deed_record, 'documentary_transfer_tax', None)
            if dtt and dtt > 0:
                # High-value sale in city - log for manual review
                logger.info(f"High-value sale in {city} with no address - DTT: ${dtt:,.2f}")

        if address and city:
            result = self._match_by_address(address, city)
            if result.matched:
                return result

        # No match found
        return MatchResult(matched=False, notes="No matching strategy succeeded")

    def _match_by_apn(self, apn: str) -> MatchResult:
        """Match by direct APN lookup."""
        apn_normalized = apn.replace('-', '').replace(' ', '')

        entry = self.watchlist_cache.get(apn_normalized)
        if entry:
            return MatchResult(
                matched=True,
                watchlist_entry=entry,
                match_method='apn',
                confidence=1.0,
                matched_apn=entry.get('apn', apn),
                notes="Direct APN match"
            )

        return MatchResult(matched=False)

    def _match_by_lot_tract(
        self,
        lot_number: str,
        tract_number: str,
        city: Optional[str] = None
    ) -> MatchResult:
        """Match by Lot/Tract to APN lookup."""

        if not self.lot_tract_cache:
            return MatchResult(
                matched=False,
                notes="Lot/Tract lookup not available"
            )

        city_lower = city.lower() if city else ''

        # Try exact match with city
        key = f"{lot_number}|{tract_number}|{city_lower}"
        apn = self.lot_tract_cache.get(key)

        # Try without city if no match
        if not apn:
            # Search for any match with this lot/tract
            for cache_key, cache_apn in self.lot_tract_cache.items():
                parts = cache_key.split('|')
                if len(parts) >= 2 and parts[0] == lot_number and parts[1] == tract_number:
                    apn = cache_apn
                    logger.debug(f"Lot/Tract match without city: {lot_number}/{tract_number} -> {apn}")
                    break

        if not apn:
            return MatchResult(
                matched=False,
                notes=f"No APN found for Lot {lot_number}, Tract {tract_number}"
            )

        # Now look up the APN in watchlist
        apn_normalized = apn.replace('-', '').replace(' ', '')
        entry = self.watchlist_cache.get(apn_normalized)

        if entry:
            return MatchResult(
                matched=True,
                watchlist_entry=entry,
                match_method='lot_tract',
                confidence=0.95,  # Slightly lower than direct APN
                matched_apn=apn,
                notes=f"Matched via Lot {lot_number}, Tract {tract_number}"
            )

        return MatchResult(
            matched=False,
            notes=f"APN {apn} from Lot/Tract not in watchlist"
        )

    def _match_by_address(
        self,
        address: str,
        city: str,
        min_confidence: float = 0.85
    ) -> MatchResult:
        """Match by fuzzy address comparison."""

        normalized_addr = self._normalize_address(address)
        city_lower = city.lower() if city else ''

        # Extract street number for quick lookup
        match = re.match(r'^(\d+)', normalized_addr)
        if not match:
            return MatchResult(
                matched=False,
                notes="Could not extract street number from address"
            )

        street_num = match.group(1)
        key = f"{street_num}|{city_lower}"

        # Get candidate addresses with same street number and city
        candidates = self._address_index.get(key, [])

        if not candidates:
            return MatchResult(
                matched=False,
                notes=f"No addresses in watchlist match {street_num} in {city}"
            )

        # Find best match using fuzzy comparison
        best_match = None
        best_score = 0.0

        for candidate in candidates:
            # Compare normalized addresses
            score = self._address_similarity(
                normalized_addr,
                candidate['normalized_address']
            )

            if score > best_score:
                best_score = score
                best_match = candidate

        if best_match and best_score >= min_confidence:
            return MatchResult(
                matched=True,
                watchlist_entry=best_match['entry'],
                match_method='address',
                confidence=best_score,
                matched_apn=best_match['entry'].get('apn'),
                notes=f"Address match: '{address}' ~ '{best_match['address']}' ({best_score:.1%})"
            )

        return MatchResult(
            matched=False,
            notes=f"Best address match score {best_score:.1%} below threshold {min_confidence:.1%}"
        )

    def _normalize_address(self, address: str) -> str:
        """
        Normalize address for comparison.

        - Lowercase
        - Remove punctuation
        - Standardize directionals (N, S, E, W)
        - Standardize street types (St, Ave, Blvd, etc.)
        """
        if not address:
            return ''

        addr = address.lower().strip()

        # Remove common punctuation
        addr = re.sub(r'[.,#]', '', addr)

        # Standardize directionals
        directionals = {
            'north': 'n', 'south': 's', 'east': 'e', 'west': 'w',
            'northeast': 'ne', 'northwest': 'nw',
            'southeast': 'se', 'southwest': 'sw'
        }
        for full, abbrev in directionals.items():
            addr = re.sub(rf'\b{full}\b', abbrev, addr)

        # Standardize street types
        street_types = {
            'street': 'st', 'avenue': 'ave', 'boulevard': 'blvd',
            'drive': 'dr', 'road': 'rd', 'lane': 'ln',
            'court': 'ct', 'circle': 'cir', 'place': 'pl',
            'way': 'wy', 'parkway': 'pkwy', 'highway': 'hwy'
        }
        for full, abbrev in street_types.items():
            addr = re.sub(rf'\b{full}\b', abbrev, addr)

        # Remove extra whitespace
        addr = ' '.join(addr.split())

        return addr

    def _address_similarity(self, addr1: str, addr2: str) -> float:
        """
        Calculate similarity score between two addresses.

        Uses SequenceMatcher with some additional heuristics.
        """
        # Basic sequence matcher score
        base_score = SequenceMatcher(None, addr1, addr2).ratio()

        # Boost score if street numbers match exactly
        num1 = re.match(r'^(\d+)', addr1)
        num2 = re.match(r'^(\d+)', addr2)

        if num1 and num2 and num1.group(1) == num2.group(1):
            # Street numbers match - this is important
            base_score = min(1.0, base_score + 0.1)

        return base_score

    def lookup_apn_by_lot_tract(
        self,
        lot_number: str,
        tract_number: str,
        city: Optional[str] = None
    ) -> Optional[str]:
        """
        Look up APN from Lot/Tract numbers.

        This can be extended to query external data sources like:
        - LandVision API
        - TitlePro API
        - OC Assessor online lookup
        """
        if not self.lot_tract_cache:
            return None

        city_lower = city.lower() if city else ''
        key = f"{lot_number}|{tract_number}|{city_lower}"

        return self.lot_tract_cache.get(key)

    def add_lot_tract_mapping(
        self,
        lot_number: str,
        tract_number: str,
        city: str,
        apn: str
    ):
        """Add a Lot/Tract to APN mapping."""
        key = f"{lot_number}|{tract_number}|{city.lower()}"
        self.lot_tract_cache[key] = apn

        # Also save to database
        try:
            self.db.table('lot_tract_apn_lookup').upsert({
                'lot_number': lot_number,
                'tract_number': tract_number,
                'city': city,
                'apn': apn
            }, on_conflict='lot_number,tract_number,city').execute()
        except Exception as e:
            logger.debug(f"Could not save Lot/Tract mapping to DB: {e}")


class LotTractDataLoader:
    """
    Utility class to load Lot/Tract to APN data from various sources.

    Sources:
    - OC Assessor parcel shapefiles
    - LandVision exports
    - TitlePro exports
    - Manual CSV imports
    """

    def __init__(self, supabase_client):
        self.db = supabase_client

    def load_from_csv(self, csv_path: str) -> int:
        """
        Load Lot/Tract to APN mappings from CSV.

        Expected columns: lot_number, tract_number, city, apn

        Returns:
            Number of records loaded
        """
        import csv

        count = 0
        records = []

        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)

            for row in reader:
                lot = row.get('lot_number', row.get('lot', row.get('LOT', '')))
                tract = row.get('tract_number', row.get('tract', row.get('TRACT', '')))
                city = row.get('city', row.get('CITY', ''))
                apn = row.get('apn', row.get('APN', row.get('parcel_number', '')))

                if lot and tract and apn:
                    records.append({
                        'lot_number': str(lot).strip(),
                        'tract_number': str(tract).strip(),
                        'city': city.strip(),
                        'apn': apn.strip()
                    })
                    count += 1

                    # Batch insert every 500 records
                    if len(records) >= 500:
                        self.db.table('lot_tract_apn_lookup').upsert(
                            records,
                            on_conflict='lot_number,tract_number,city'
                        ).execute()
                        records = []

        # Insert remaining records
        if records:
            self.db.table('lot_tract_apn_lookup').upsert(
                records,
                on_conflict='lot_number,tract_number,city'
            ).execute()

        logger.info(f"Loaded {count} Lot/Tract to APN mappings from {csv_path}")
        return count

    def load_from_assessor_shapefile(self, shapefile_path: str) -> int:
        """
        Load Lot/Tract data from OC Assessor parcel shapefile.

        The shapefile typically has fields like:
        - APN or PARCEL_NUM
        - LOT or LOT_NUM
        - TRACT or TRACT_NUM
        - CITY or SITUS_CITY

        Requires: pip install geopandas
        """
        try:
            import geopandas as gpd
        except ImportError:
            logger.error("geopandas required: pip install geopandas")
            return 0

        logger.info(f"Loading assessor shapefile: {shapefile_path}")
        gdf = gpd.read_file(shapefile_path)

        # Identify column names (varies by assessor)
        apn_col = None
        lot_col = None
        tract_col = None
        city_col = None

        for col in gdf.columns:
            col_lower = col.lower()
            if 'apn' in col_lower or 'parcel' in col_lower:
                apn_col = col
            elif 'lot' in col_lower:
                lot_col = col
            elif 'tract' in col_lower:
                tract_col = col
            elif 'city' in col_lower or 'situs' in col_lower:
                city_col = col

        if not all([apn_col, lot_col, tract_col]):
            logger.error(f"Could not identify required columns. Found: {list(gdf.columns)}")
            return 0

        count = 0
        records = []

        for _, row in gdf.iterrows():
            apn = str(row[apn_col]).strip() if row[apn_col] else ''
            lot = str(row[lot_col]).strip() if row[lot_col] else ''
            tract = str(row[tract_col]).strip() if row[tract_col] else ''
            city = str(row[city_col]).strip() if city_col and row[city_col] else ''

            if apn and lot and tract:
                records.append({
                    'lot_number': lot,
                    'tract_number': tract,
                    'city': city,
                    'apn': apn
                })
                count += 1

                if len(records) >= 500:
                    self.db.table('lot_tract_apn_lookup').upsert(
                        records,
                        on_conflict='lot_number,tract_number,city'
                    ).execute()
                    records = []

        if records:
            self.db.table('lot_tract_apn_lookup').upsert(
                records,
                on_conflict='lot_number,tract_number,city'
            ).execute()

        logger.info(f"Loaded {count} Lot/Tract mappings from shapefile")
        return count


# =============================================================================
# CLI for testing
# =============================================================================

if __name__ == '__main__':
    import argparse
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv()

    parser = argparse.ArgumentParser(description='Property Matcher Testing')
    parser.add_argument('--test-address', help='Test address matching')
    parser.add_argument('--test-lot', help='Test Lot number')
    parser.add_argument('--test-tract', help='Test Tract number')
    parser.add_argument('--city', help='City for matching')
    parser.add_argument('--load-csv', help='Load Lot/Tract data from CSV')
    parser.add_argument('--load-shapefile', help='Load from assessor shapefile')

    args = parser.parse_args()

    # Initialize Supabase
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_KEY')

    if not supabase_url or not supabase_key:
        print("SUPABASE_URL and SUPABASE_KEY required")
        exit(1)

    db = create_client(supabase_url, supabase_key)

    # Load Lot/Tract data if specified
    if args.load_csv:
        loader = LotTractDataLoader(db)
        count = loader.load_from_csv(args.load_csv)
        print(f"Loaded {count} records from CSV")
        exit(0)

    if args.load_shapefile:
        loader = LotTractDataLoader(db)
        count = loader.load_from_assessor_shapefile(args.load_shapefile)
        print(f"Loaded {count} records from shapefile")
        exit(0)

    # Build watchlist cache
    print("Loading watchlist...")
    watchlist_cache = {}
    offset = 0

    while True:
        result = db.table('apn_watchlist').select(
            'id, apn, apn_normalized, address, city, building_sf, assessed_total'
        ).range(offset, offset + 999).execute()

        if not result.data:
            break

        for row in result.data:
            normalized = row.get('apn_normalized') or row['apn'].replace('-', '').replace(' ', '')
            watchlist_cache[normalized] = row

        if len(result.data) < 1000:
            break
        offset += 1000

    print(f"Loaded {len(watchlist_cache)} parcels")

    # Initialize matcher
    matcher = PropertyMatcher(db, watchlist_cache)

    # Test matching
    if args.test_address:
        print(f"\nTesting address: {args.test_address}")

        # Create a mock record
        class MockRecord:
            def __init__(self, address, city):
                self.address = address
                self.city = city
                self.apn = None
                self.lot_number = None
                self.tract_number = None

        record = MockRecord(args.test_address, args.city or 'Orange')
        result = matcher.match(record)

        print(f"Matched: {result.matched}")
        print(f"Method: {result.match_method}")
        print(f"Confidence: {result.confidence:.1%}")
        print(f"Notes: {result.notes}")

        if result.watchlist_entry:
            print(f"Matched APN: {result.matched_apn}")
            print(f"Address: {result.watchlist_entry.get('address')}")

    if args.test_lot and args.test_tract:
        print(f"\nTesting Lot {args.test_lot}, Tract {args.test_tract}")

        class MockRecord:
            def __init__(self, lot, tract, city):
                self.lot_number = lot
                self.tract_number = tract
                self.city = city
                self.apn = None
                self.address = None

        record = MockRecord(args.test_lot, args.test_tract, args.city)
        result = matcher.match(record)

        print(f"Matched: {result.matched}")
        print(f"Method: {result.match_method}")
        print(f"Confidence: {result.confidence:.1%}")
        print(f"Notes: {result.notes}")

        if result.watchlist_entry:
            print(f"Matched APN: {result.matched_apn}")
            print(f"Address: {result.watchlist_entry.get('address')}")
