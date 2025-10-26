"""Basic tests for the Social Value Consultant Tool."""

import unittest
import tempfile
import os
from datetime import datetime

from social_value.database import init_db, SessionLocal
from social_value.planning import SocialValuePlanner
from social_value.execution import CommitmentTracker
from social_value.monitoring import ProgressMonitor
from social_value.data import load_toms_framework


class TestSocialValueTool(unittest.TestCase):
    """Test suite for the Social Value Consultant Tool."""

    @classmethod
    def setUpClass(cls):
        """Set up test database."""
        # Use a temporary database for testing
        cls.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        os.environ['SOCIAL_VALUE_DB'] = cls.temp_db.name

        # Initialize database
        init_db()
        load_toms_framework()

    @classmethod
    def tearDownClass(cls):
        """Clean up test database."""
        try:
            os.unlink(cls.temp_db.name)
        except:
            pass

    def test_create_contract(self):
        """Test creating a contract."""
        planner = SocialValuePlanner()

        contract = planner.create_contract(
            name="Test Contract",
            contract_value=1000000.0,
            social_value_percentage=10.0,
            description="Test contract description",
        )

        self.assertIsNotNone(contract.id)
        self.assertEqual(contract.name, "Test Contract")
        self.assertEqual(contract.contract_value, 1000000.0)
        self.assertEqual(contract.social_value_percentage, 10.0)

        # Test social value target calculation
        target = planner.calculate_social_value_target(contract)
        self.assertEqual(target, 100000.0)

        planner.close()

    def test_create_vendor(self):
        """Test creating a vendor."""
        tracker = CommitmentTracker()

        vendor = tracker.create_vendor(
            name="Test Vendor Ltd",
            company_number="12345678",
            contact_email="test@vendor.com",
            is_sme=True,
            is_local=True,
        )

        self.assertIsNotNone(vendor.id)
        self.assertEqual(vendor.name, "Test Vendor Ltd")
        self.assertEqual(vendor.company_number, "12345678")
        self.assertTrue(vendor.is_sme)
        self.assertTrue(vendor.is_local)

        tracker.close()

    def test_create_commitment(self):
        """Test creating a social value commitment."""
        # First create a contract and vendor
        planner = SocialValuePlanner()
        contract = planner.create_contract(
            name="Test Contract 2",
            contract_value=500000.0,
        )
        planner.close()

        tracker = CommitmentTracker()
        vendor = tracker.create_vendor(name="Test Vendor 2")

        # Get a theme ID
        from social_value.models.theme import SocialValueTheme
        db = SessionLocal()
        theme = db.query(SocialValueTheme).first()
        db.close()

        commitment = tracker.create_commitment(
            contract_id=contract.id,
            vendor_id=vendor.id,
            theme_id=theme.id,
            description="Create 5 local jobs",
            target_value=5.0,
            target_unit="jobs",
            monetary_value=129415.0,
        )

        self.assertIsNotNone(commitment.id)
        self.assertEqual(commitment.description, "Create 5 local jobs")
        self.assertEqual(commitment.target_value, 5.0)
        self.assertEqual(commitment.status, "Committed")

        tracker.close()

    def test_monitoring_update(self):
        """Test adding a monitoring update."""
        # Create contract, vendor, and commitment
        planner = SocialValuePlanner()
        contract = planner.create_contract(
            name="Test Contract 3",
            contract_value=750000.0,
        )
        planner.close()

        tracker = CommitmentTracker()
        vendor = tracker.create_vendor(name="Test Vendor 3")

        from social_value.models.theme import SocialValueTheme
        db = SessionLocal()
        theme = db.query(SocialValueTheme).first()
        db.close()

        commitment = tracker.create_commitment(
            contract_id=contract.id,
            vendor_id=vendor.id,
            theme_id=theme.id,
            description="Provide 100 training hours",
            target_value=100.0,
            target_unit="hours",
        )
        tracker.close()

        # Add monitoring update
        monitor = ProgressMonitor()
        update = monitor.add_update(
            commitment_id=commitment.id,
            progress_value=50.0,
            status="On Track",
            description="50 hours completed",
            reported_by="Test Manager",
        )

        self.assertIsNotNone(update.id)
        self.assertEqual(update.progress_value, 50.0)
        self.assertEqual(update.status, "On Track")

        # Check that commitment progress was updated
        progress = monitor.get_commitment_progress(commitment.id)
        self.assertEqual(progress['current_progress'], 50.0)
        self.assertEqual(progress['progress_percentage'], 50.0)

        monitor.close()

    def test_toms_framework_loaded(self):
        """Test that TOMs framework is loaded."""
        planner = SocialValuePlanner()
        themes = planner.get_available_themes()

        self.assertGreater(len(themes), 0)
        self.assertTrue(any(t.code == 'JOBS' for t in themes))
        self.assertTrue(any(t.code == 'ENVIRONMENT' for t in themes))

        planner.close()


if __name__ == '__main__':
    unittest.main()
