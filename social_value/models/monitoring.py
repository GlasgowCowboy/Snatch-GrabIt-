"""Monitoring model for tracking commitment progress."""

from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text
from datetime import datetime
from social_value.database import Base


class MonitoringUpdate(Base):
    """Represents a progress update on a commitment."""

    __tablename__ = 'monitoring_updates'

    id = Column(Integer, primary_key=True, autoincrement=True)
    commitment_id = Column(Integer, ForeignKey('commitments.id'), nullable=False)

    update_date = Column(DateTime, default=datetime.utcnow)
    progress_value = Column(Float, nullable=False)  # Current progress (absolute or percentage)
    status = Column(String(50), nullable=True)  # On Track, At Risk, Delayed, Achieved

    description = Column(Text, nullable=True)
    evidence = Column(Text, nullable=True)  # Evidence of delivery
    evidence_link = Column(String(500), nullable=True)  # Link to evidence documents

    reported_by = Column(String(255), nullable=True)
    verified = Column(Integer, default=0)  # Has this been verified by the authority
    verified_by = Column(String(255), nullable=True)
    verified_date = Column(DateTime, nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<MonitoringUpdate(id={self.id}, commitment_id={self.commitment_id}, progress={self.progress_value})>"

    def to_dict(self):
        """Convert monitoring update to dictionary."""
        return {
            'id': self.id,
            'commitment_id': self.commitment_id,
            'update_date': self.update_date.isoformat() if self.update_date else None,
            'progress_value': self.progress_value,
            'status': self.status,
            'description': self.description,
            'evidence': self.evidence,
            'evidence_link': self.evidence_link,
            'reported_by': self.reported_by,
            'verified': bool(self.verified),
            'verified_by': self.verified_by,
            'verified_date': self.verified_date.isoformat() if self.verified_date else None,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
