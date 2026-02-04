#!/usr/bin/env python3
"""
Pytest tests for deed monitor data classes and utilities.
Tests without database connection.
"""

import pytest
from datetime import datetime, timedelta
from decimal import Decimal


class TestDeedRecord:
    """Tests for DeedRecord dataclass."""

    def test_create_deed_record(self):
        """Test creating a basic DeedRecord."""
        from deed_monitor import DeedRecord

        deed = DeedRecord(
            doc_number="2026000012345",
            recording_date="2026-01-20",
            doc_type="GRANT DEED",
            apn="123-456-78",
            address="100 Industrial Way",
            city="Anaheim",
            grantor="SMITH JOHN",
            grantee="DOE JANE",
            documentary_transfer_tax=2860.00,
            raw_data={},
            source="mock"
        )

        assert deed.doc_number == "2026000012345"
        assert deed.recording_date == "2026-01-20"
        assert deed.doc_type == "GRANT DEED"
        assert deed.apn == "123-456-78"

    def test_apn_normalized_removes_dashes(self):
        """Test APN normalization removes dashes."""
        from deed_monitor import DeedRecord

        deed = DeedRecord(
            doc_number="TEST001",
            recording_date="2026-01-20",
            doc_type="GRANT DEED",
            apn="123-456-78",
            address=None,
            city=None,
            grantor=None,
            grantee=None,
            documentary_transfer_tax=None,
            raw_data={},
            source="mock"
        )

        assert deed.apn_normalized == "12345678"

    def test_apn_normalized_removes_spaces(self):
        """Test APN normalization removes spaces."""
        from deed_monitor import DeedRecord

        deed = DeedRecord(
            doc_number="TEST001",
            recording_date="2026-01-20",
            doc_type="GRANT DEED",
            apn="123 456 78",
            address=None,
            city=None,
            grantor=None,
            grantee=None,
            documentary_transfer_tax=None,
            raw_data={},
            source="mock"
        )

        assert deed.apn_normalized == "12345678"

    def test_apn_normalized_with_none(self):
        """Test APN normalization with None APN."""
        from deed_monitor import DeedRecord

        deed = DeedRecord(
            doc_number="TEST001",
            recording_date="2026-01-20",
            doc_type="GRANT DEED",
            apn=None,
            address=None,
            city=None,
            grantor=None,
            grantee=None,
            documentary_transfer_tax=None,
            raw_data={},
            source="mock"
        )

        assert deed.apn_normalized is None

    def test_calculate_sale_price(self):
        """Test sale price calculation from Documentary Transfer Tax."""
        from deed_monitor import DeedRecord

        # $2,860 DTT at $1.10/$1000 = $2,600,000 sale price
        deed = DeedRecord(
            doc_number="TEST001",
            recording_date="2026-01-20",
            doc_type="GRANT DEED",
            apn="123-456-78",
            address=None,
            city=None,
            grantor=None,
            grantee=None,
            documentary_transfer_tax=2860.00,
            raw_data={},
            source="mock"
        )

        sale_price = deed.calculate_sale_price(dtt_rate=1.10)
        assert sale_price == 2600000.0

    def test_calculate_sale_price_custom_rate(self):
        """Test sale price with custom DTT rate."""
        from deed_monitor import DeedRecord

        deed = DeedRecord(
            doc_number="TEST001",
            recording_date="2026-01-20",
            doc_type="GRANT DEED",
            apn="123-456-78",
            address=None,
            city=None,
            grantor=None,
            grantee=None,
            documentary_transfer_tax=1100.00,
            raw_data={},
            source="mock"
        )

        # At $1.10 rate: $1,100 DTT = $1,000,000
        sale_price = deed.calculate_sale_price(dtt_rate=1.10)
        assert sale_price == 1000000.0

    def test_calculate_sale_price_with_zero_dtt(self):
        """Test sale price calculation with zero DTT."""
        from deed_monitor import DeedRecord

        deed = DeedRecord(
            doc_number="TEST001",
            recording_date="2026-01-20",
            doc_type="GRANT DEED",
            apn="123-456-78",
            address=None,
            city=None,
            grantor=None,
            grantee=None,
            documentary_transfer_tax=0,
            raw_data={},
            source="mock"
        )

        sale_price = deed.calculate_sale_price()
        assert sale_price is None

    def test_calculate_sale_price_with_none_dtt(self):
        """Test sale price calculation with None DTT."""
        from deed_monitor import DeedRecord

        deed = DeedRecord(
            doc_number="TEST001",
            recording_date="2026-01-20",
            doc_type="GRANT DEED",
            apn="123-456-78",
            address=None,
            city=None,
            grantor=None,
            grantee=None,
            documentary_transfer_tax=None,
            raw_data={},
            source="mock"
        )

        sale_price = deed.calculate_sale_price()
        assert sale_price is None


class TestSaleAlert:
    """Tests for SaleAlert dataclass."""

    def test_create_sale_alert(self):
        """Test creating a SaleAlert."""
        from deed_monitor import SaleAlert

        alert = SaleAlert(
            watchlist_id="watch-001",
            deed_id="deed-001",
            apn="123-456-78",
            address="100 Industrial Way",
            city="Anaheim",
            sale_price=2600000.0,
            sale_date="2026-01-20",
            buyer="DOE JANE",
            seller="SMITH JOHN",
            was_listed=True,
            listing_price=2700000.0
        )

        assert alert.apn == "123-456-78"
        assert alert.sale_price == 2600000.0
        assert alert.was_listed == True
        assert alert.listing_price == 2700000.0

    def test_sale_alert_defaults(self):
        """Test SaleAlert default values."""
        from deed_monitor import SaleAlert

        alert = SaleAlert(
            watchlist_id="watch-001",
            deed_id="deed-001",
            apn="123-456-78",
            address="100 Industrial Way",
            city="Anaheim",
            sale_price=2600000.0,
            sale_date="2026-01-20",
            buyer="DOE JANE",
            seller="SMITH JOHN"
        )

        assert alert.was_listed == False
        assert alert.listing_price is None


class TestConfig:
    """Tests for Config dataclass."""

    def test_config_defaults(self):
        """Test Config default values."""
        from deed_monitor import Config

        config = Config(
            supabase_url="https://test.supabase.co",
            supabase_key="test-key"
        )

        assert config.county == "Orange"
        assert config.state == "CA"
        assert config.dtt_rate == 1.10

    def test_config_from_env_with_defaults(self, monkeypatch):
        """Test Config.from_env with empty environment."""
        from deed_monitor import Config

        # Clear relevant env vars
        monkeypatch.delenv('SUPABASE_URL', raising=False)
        monkeypatch.delenv('SUPABASE_KEY', raising=False)
        monkeypatch.delenv('MONITOR_COUNTY', raising=False)

        config = Config.from_env()

        assert config.supabase_url == ''
        assert config.supabase_key == ''
        assert config.county == 'Orange'
        assert config.state == 'CA'

    def test_config_from_env_with_values(self, monkeypatch):
        """Test Config.from_env with environment variables set."""
        from deed_monitor import Config

        monkeypatch.setenv('SUPABASE_URL', 'https://my-project.supabase.co')
        monkeypatch.setenv('SUPABASE_KEY', 'my-secret-key')
        monkeypatch.setenv('MONITOR_COUNTY', 'Los Angeles')
        monkeypatch.setenv('DTT_RATE', '2.20')

        config = Config.from_env()

        assert config.supabase_url == 'https://my-project.supabase.co'
        assert config.supabase_key == 'my-secret-key'
        assert config.county == 'Los Angeles'
        assert config.dtt_rate == 2.20


class TestMockClient:
    """Tests for MockClient data source."""

    def test_mock_client_exists(self):
        """Test MockClient can be imported."""
        from deed_monitor import MockClient

        client = MockClient()
        assert client is not None

    def test_mock_client_fetch_recordings(self):
        """Test MockClient returns deed records."""
        from deed_monitor import MockClient

        client = MockClient()
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')

        deeds = client.fetch_recordings(
            county='Orange',
            state='CA',
            start_date=start_date,
            end_date=end_date
        )

        assert isinstance(deeds, list)
        assert len(deeds) > 0

    def test_mock_client_returns_deed_records(self):
        """Test MockClient returns DeedRecord instances."""
        from deed_monitor import MockClient, DeedRecord

        client = MockClient()
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')

        deeds = client.fetch_recordings(
            county='Orange',
            state='CA',
            start_date=start_date,
            end_date=end_date
        )

        for deed in deeds:
            assert isinstance(deed, DeedRecord)
            assert deed.doc_number is not None
            assert deed.recording_date is not None


class TestDTTCalculations:
    """Tests for Documentary Transfer Tax calculations."""

    @pytest.mark.parametrize("dtt,rate,expected_price", [
        (1100.00, 1.10, 1000000.0),   # $1.1M
        (2860.00, 1.10, 2600000.0),   # $2.6M
        (5500.00, 1.10, 5000000.0),   # $5M
        (110.00, 1.10, 100000.0),     # $100K
        (11000.00, 1.10, 10000000.0), # $10M
    ])
    def test_dtt_to_sale_price(self, dtt, rate, expected_price):
        """Test DTT to sale price conversion for various amounts."""
        from deed_monitor import DeedRecord

        deed = DeedRecord(
            doc_number="TEST",
            recording_date="2026-01-20",
            doc_type="GRANT DEED",
            apn="123-456-78",
            address=None,
            city=None,
            grantor=None,
            grantee=None,
            documentary_transfer_tax=dtt,
            raw_data={},
            source="mock"
        )

        assert deed.calculate_sale_price(dtt_rate=rate) == expected_price
