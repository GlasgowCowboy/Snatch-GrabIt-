"""Commitment Tracker for managing vendor social value commitments."""

from typing import List, Optional, Dict
from datetime import datetime
from social_value.models.vendor import Vendor
from social_value.models.commitment import Commitment
from social_value.models.contract import Contract
from social_value.database import SessionLocal


class CommitmentTracker:
    """Handles tracking of vendor social value commitments."""

    def __init__(self):
        self.db = SessionLocal()

    def create_vendor(
        self,
        name: str,
        company_number: Optional[str] = None,
        contact_name: Optional[str] = None,
        contact_email: Optional[str] = None,
        contact_phone: Optional[str] = None,
        address: Optional[str] = None,
        website: Optional[str] = None,
        is_sme: bool = False,
        is_local: bool = False,
        notes: Optional[str] = None,
    ) -> Vendor:
        """
        Register a new vendor.

        Args:
            name: Vendor name
            company_number: Companies House registration number
            contact_name: Contact person name
            contact_email: Contact email
            contact_phone: Contact phone
            address: Vendor address
            website: Vendor website
            is_sme: Is the vendor a Small/Medium Enterprise
            is_local: Is the vendor local to the contracting authority
            notes: Additional notes

        Returns:
            Created Vendor object
        """
        vendor = Vendor(
            name=name,
            company_number=company_number,
            contact_name=contact_name,
            contact_email=contact_email,
            contact_phone=contact_phone,
            address=address,
            website=website,
            is_sme=1 if is_sme else 0,
            is_local=1 if is_local else 0,
            notes=notes,
        )

        self.db.add(vendor)
        self.db.commit()
        self.db.refresh(vendor)

        return vendor

    def get_vendor(self, vendor_id: Optional[int] = None, name: Optional[str] = None) -> Optional[Vendor]:
        """Get a vendor by ID or name."""
        if vendor_id:
            return self.db.query(Vendor).filter(Vendor.id == vendor_id).first()
        elif name:
            return self.db.query(Vendor).filter(Vendor.name == name).first()
        return None

    def list_vendors(self) -> List[Vendor]:
        """List all vendors."""
        return self.db.query(Vendor).all()

    def create_commitment(
        self,
        contract_id: int,
        vendor_id: int,
        theme_id: int,
        description: str,
        target_value: Optional[float] = None,
        target_unit: Optional[str] = None,
        monetary_value: Optional[float] = None,
        outcome_id: Optional[int] = None,
        measure_id: Optional[int] = None,
        delivery_date: Optional[datetime] = None,
        is_mandatory: bool = False,
        evaluation_score: Optional[float] = None,
        notes: Optional[str] = None,
    ) -> Commitment:
        """
        Record a social value commitment from a vendor.

        Args:
            contract_id: Contract ID
            vendor_id: Vendor ID
            theme_id: Social value theme ID
            description: Commitment description
            target_value: Target numeric value
            target_unit: Unit of measure
            monetary_value: TOMs proxy value in GBP
            outcome_id: Outcome ID (optional)
            measure_id: Measure ID (optional)
            delivery_date: Expected delivery date
            is_mandatory: Is this a mandatory requirement
            evaluation_score: Evaluation score
            notes: Additional notes

        Returns:
            Created Commitment object
        """
        commitment = Commitment(
            contract_id=contract_id,
            vendor_id=vendor_id,
            theme_id=theme_id,
            outcome_id=outcome_id,
            measure_id=measure_id,
            description=description,
            target_value=target_value,
            target_unit=target_unit,
            monetary_value=monetary_value,
            delivery_date=delivery_date,
            status='Committed',
            is_mandatory=1 if is_mandatory else 0,
            evaluation_score=evaluation_score,
            notes=notes,
        )

        self.db.add(commitment)
        self.db.commit()
        self.db.refresh(commitment)

        return commitment

    def get_commitment(self, commitment_id: int) -> Optional[Commitment]:
        """Get a commitment by ID."""
        return self.db.query(Commitment).filter(Commitment.id == commitment_id).first()

    def list_commitments(
        self,
        contract_id: Optional[int] = None,
        vendor_id: Optional[int] = None,
        theme_id: Optional[int] = None,
        status: Optional[str] = None,
    ) -> List[Commitment]:
        """
        List commitments with optional filters.

        Args:
            contract_id: Filter by contract
            vendor_id: Filter by vendor
            theme_id: Filter by theme
            status: Filter by status

        Returns:
            List of commitments
        """
        query = self.db.query(Commitment)

        if contract_id:
            query = query.filter(Commitment.contract_id == contract_id)
        if vendor_id:
            query = query.filter(Commitment.vendor_id == vendor_id)
        if theme_id:
            query = query.filter(Commitment.theme_id == theme_id)
        if status:
            query = query.filter(Commitment.status == status)

        return query.all()

    def calculate_total_commitment_value(self, contract_id: int, vendor_id: Optional[int] = None) -> float:
        """Calculate total monetary value of commitments for a contract."""
        query = self.db.query(Commitment).filter(Commitment.contract_id == contract_id)

        if vendor_id:
            query = query.filter(Commitment.vendor_id == vendor_id)

        commitments = query.all()
        total = sum(c.monetary_value for c in commitments if c.monetary_value)

        return total

    def get_vendor_summary(self, vendor_id: int, contract_id: int) -> Dict:
        """Get a summary of vendor commitments for a contract."""
        vendor = self.get_vendor(vendor_id=vendor_id)
        commitments = self.list_commitments(contract_id=contract_id, vendor_id=vendor_id)
        total_value = self.calculate_total_commitment_value(contract_id, vendor_id)

        return {
            'vendor': vendor.to_dict() if vendor else None,
            'total_commitments': len(commitments),
            'total_monetary_value': total_value,
            'commitments_by_status': self._group_by_status(commitments),
        }

    def _group_by_status(self, commitments: List[Commitment]) -> Dict[str, int]:
        """Group commitments by status."""
        status_counts = {}
        for commitment in commitments:
            status = commitment.status
            status_counts[status] = status_counts.get(status, 0) + 1
        return status_counts

    def close(self):
        """Close the database session."""
        self.db.close()
