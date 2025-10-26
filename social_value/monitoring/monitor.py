"""Progress Monitor for tracking social value commitment delivery."""

from typing import List, Optional, Dict
from datetime import datetime
from social_value.models.commitment import Commitment
from social_value.models.monitoring import MonitoringUpdate
from social_value.database import SessionLocal


class ProgressMonitor:
    """Handles monitoring and tracking of commitment progress."""

    def __init__(self):
        self.db = SessionLocal()

    def add_update(
        self,
        commitment_id: int,
        progress_value: float,
        status: Optional[str] = None,
        description: Optional[str] = None,
        evidence: Optional[str] = None,
        evidence_link: Optional[str] = None,
        reported_by: Optional[str] = None,
        update_date: Optional[datetime] = None,
        notes: Optional[str] = None,
    ) -> MonitoringUpdate:
        """
        Add a progress update for a commitment.

        Args:
            commitment_id: Commitment ID
            progress_value: Current progress value
            status: Update status (On Track, At Risk, Delayed, Achieved)
            description: Update description
            evidence: Evidence of delivery
            evidence_link: Link to evidence documents
            reported_by: Person reporting the update
            update_date: Date of update (defaults to now)
            notes: Additional notes

        Returns:
            Created MonitoringUpdate object
        """
        # Update the commitment's current progress
        commitment = self.db.query(Commitment).filter(Commitment.id == commitment_id).first()

        if commitment:
            commitment.current_progress = progress_value
            if status:
                commitment.status = status
            commitment.updated_at = datetime.utcnow()

        # Create the monitoring update
        update = MonitoringUpdate(
            commitment_id=commitment_id,
            update_date=update_date or datetime.utcnow(),
            progress_value=progress_value,
            status=status,
            description=description,
            evidence=evidence,
            evidence_link=evidence_link,
            reported_by=reported_by,
            notes=notes,
        )

        self.db.add(update)
        self.db.commit()
        self.db.refresh(update)

        return update

    def verify_update(
        self,
        update_id: int,
        verified_by: str,
        verified_date: Optional[datetime] = None,
    ) -> MonitoringUpdate:
        """
        Verify a monitoring update.

        Args:
            update_id: Update ID
            verified_by: Person verifying the update
            verified_date: Date of verification (defaults to now)

        Returns:
            Updated MonitoringUpdate object
        """
        update = self.db.query(MonitoringUpdate).filter(MonitoringUpdate.id == update_id).first()

        if update:
            update.verified = 1
            update.verified_by = verified_by
            update.verified_date = verified_date or datetime.utcnow()
            self.db.commit()
            self.db.refresh(update)

        return update

    def get_update(self, update_id: int) -> Optional[MonitoringUpdate]:
        """Get a monitoring update by ID."""
        return self.db.query(MonitoringUpdate).filter(MonitoringUpdate.id == update_id).first()

    def list_updates(
        self,
        commitment_id: Optional[int] = None,
        verified: Optional[bool] = None,
    ) -> List[MonitoringUpdate]:
        """
        List monitoring updates with optional filters.

        Args:
            commitment_id: Filter by commitment
            verified: Filter by verification status

        Returns:
            List of monitoring updates
        """
        query = self.db.query(MonitoringUpdate)

        if commitment_id:
            query = query.filter(MonitoringUpdate.commitment_id == commitment_id)
        if verified is not None:
            query = query.filter(MonitoringUpdate.verified == (1 if verified else 0))

        return query.order_by(MonitoringUpdate.update_date.desc()).all()

    def get_commitment_progress(self, commitment_id: int) -> Dict:
        """
        Get progress summary for a commitment.

        Args:
            commitment_id: Commitment ID

        Returns:
            Dictionary with progress information
        """
        commitment = self.db.query(Commitment).filter(Commitment.id == commitment_id).first()
        updates = self.list_updates(commitment_id=commitment_id)

        if not commitment:
            return {}

        progress_percentage = 0
        if commitment.target_value and commitment.target_value > 0:
            progress_percentage = (commitment.current_progress / commitment.target_value) * 100

        return {
            'commitment_id': commitment_id,
            'description': commitment.description,
            'target_value': commitment.target_value,
            'target_unit': commitment.target_unit,
            'current_progress': commitment.current_progress,
            'progress_percentage': progress_percentage,
            'status': commitment.status,
            'total_updates': len(updates),
            'verified_updates': len([u for u in updates if u.verified]),
            'latest_update': updates[0].to_dict() if updates else None,
        }

    def get_at_risk_commitments(self, contract_id: Optional[int] = None) -> List[Commitment]:
        """
        Get commitments that are at risk or delayed.

        Args:
            contract_id: Optional contract ID to filter

        Returns:
            List of at-risk commitments
        """
        query = self.db.query(Commitment).filter(
            Commitment.status.in_(['At Risk', 'Delayed', 'Not Met'])
        )

        if contract_id:
            query = query.filter(Commitment.contract_id == contract_id)

        return query.all()

    def calculate_overall_progress(self, contract_id: int) -> Dict:
        """
        Calculate overall progress for all commitments in a contract.

        Args:
            contract_id: Contract ID

        Returns:
            Dictionary with overall progress statistics
        """
        commitments = self.db.query(Commitment).filter(Commitment.contract_id == contract_id).all()

        if not commitments:
            return {
                'total_commitments': 0,
                'average_progress': 0,
                'on_track': 0,
                'at_risk': 0,
                'delayed': 0,
                'achieved': 0,
            }

        total = len(commitments)
        total_progress = sum(c.current_progress for c in commitments)
        avg_progress = total_progress / total if total > 0 else 0

        status_counts = {
            'on_track': len([c for c in commitments if c.status in ['Committed', 'In Progress', 'On Track']]),
            'at_risk': len([c for c in commitments if c.status == 'At Risk']),
            'delayed': len([c for c in commitments if c.status == 'Delayed']),
            'achieved': len([c for c in commitments if c.status == 'Achieved']),
            'not_met': len([c for c in commitments if c.status == 'Not Met']),
        }

        return {
            'total_commitments': total,
            'average_progress': avg_progress,
            **status_counts,
        }

    def close(self):
        """Close the database session."""
        self.db.close()
