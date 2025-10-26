"""Social Value Planner for defining requirements and targets."""

from typing import List, Dict, Optional
from datetime import datetime
from social_value.models.contract import Contract
from social_value.models.theme import SocialValueTheme, Outcome, Measure
from social_value.database import SessionLocal


class SocialValuePlanner:
    """Handles planning of social value requirements for contracts."""

    def __init__(self):
        self.db = SessionLocal()

    def create_contract(
        self,
        name: str,
        contract_value: float,
        social_value_percentage: float = 10.0,
        description: Optional[str] = None,
        procuring_authority: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Contract:
        """
        Create a new procurement contract.

        Args:
            name: Contract name
            contract_value: Total contract value in GBP
            social_value_percentage: Minimum social value percentage (default 10%)
            description: Contract description
            procuring_authority: Name of procuring authority
            start_date: Contract start date
            end_date: Contract end date

        Returns:
            Created Contract object
        """
        contract = Contract(
            name=name,
            contract_value=contract_value,
            social_value_percentage=social_value_percentage,
            description=description,
            procuring_authority=procuring_authority,
            start_date=start_date,
            end_date=end_date,
            status='Planning',
        )

        self.db.add(contract)
        self.db.commit()
        self.db.refresh(contract)

        return contract

    def get_contract(self, contract_id: Optional[int] = None, name: Optional[str] = None) -> Optional[Contract]:
        """Get a contract by ID or name."""
        if contract_id:
            return self.db.query(Contract).filter(Contract.id == contract_id).first()
        elif name:
            return self.db.query(Contract).filter(Contract.name == name).first()
        return None

    def list_contracts(self, status: Optional[str] = None) -> List[Contract]:
        """List all contracts, optionally filtered by status."""
        query = self.db.query(Contract)
        if status:
            query = query.filter(Contract.status == status)
        return query.all()

    def update_contract_status(self, contract_id: int, status: str) -> Contract:
        """Update contract status."""
        contract = self.get_contract(contract_id=contract_id)
        if contract:
            contract.status = status
            contract.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(contract)
        return contract

    def calculate_social_value_target(self, contract: Contract) -> float:
        """Calculate the target social value in GBP."""
        return contract.contract_value * (contract.social_value_percentage / 100)

    def get_available_themes(self, category: Optional[str] = None) -> List[SocialValueTheme]:
        """Get available social value themes."""
        query = self.db.query(SocialValueTheme)
        if category:
            query = query.filter(SocialValueTheme.category == category)
        return query.all()

    def get_theme_outcomes(self, theme_id: int) -> List[Outcome]:
        """Get outcomes for a specific theme."""
        return self.db.query(Outcome).filter(Outcome.theme_id == theme_id).all()

    def get_outcome_measures(self, outcome_id: int) -> List[Measure]:
        """Get measures for a specific outcome."""
        return self.db.query(Measure).filter(Measure.outcome_id == outcome_id).all()

    def generate_planning_summary(self, contract: Contract) -> Dict:
        """Generate a planning summary for a contract."""
        target_value = self.calculate_social_value_target(contract)

        return {
            'contract': contract.to_dict(),
            'social_value_target': target_value,
            'target_percentage': contract.social_value_percentage,
            'planning_status': contract.status,
        }

    def close(self):
        """Close the database session."""
        self.db.close()
