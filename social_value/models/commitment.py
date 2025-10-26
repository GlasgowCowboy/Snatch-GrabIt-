"""Commitment model representing vendor social value commitments."""

from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text
from datetime import datetime
from social_value.database import Base


class Commitment(Base):
    """Represents a social value commitment from a vendor."""

    __tablename__ = 'commitments'

    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey('contracts.id'), nullable=False)
    vendor_id = Column(Integer, ForeignKey('vendors.id'), nullable=False)
    theme_id = Column(Integer, ForeignKey('social_value_themes.id'), nullable=False)
    outcome_id = Column(Integer, ForeignKey('outcomes.id'), nullable=True)
    measure_id = Column(Integer, ForeignKey('measures.id'), nullable=True)

    description = Column(Text, nullable=False)
    target_value = Column(Float, nullable=True)  # Numeric target (e.g., 10 jobs, 500 hours)
    target_unit = Column(String(100), nullable=True)  # Unit of measure (jobs, hours, tonnes CO2, etc.)
    monetary_value = Column(Float, nullable=True)  # TOMs proxy value in GBP

    delivery_date = Column(DateTime, nullable=True)
    status = Column(String(50), default='Committed')  # Committed, In Progress, Achieved, Not Met
    current_progress = Column(Float, default=0.0)  # Percentage or absolute value

    is_mandatory = Column(Integer, default=0)  # Is this a mandatory requirement
    evaluation_score = Column(Float, nullable=True)  # Score during evaluation

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Commitment(id={self.id}, vendor_id={self.vendor_id}, theme_id={self.theme_id})>"

    def to_dict(self):
        """Convert commitment to dictionary."""
        return {
            'id': self.id,
            'contract_id': self.contract_id,
            'vendor_id': self.vendor_id,
            'theme_id': self.theme_id,
            'outcome_id': self.outcome_id,
            'measure_id': self.measure_id,
            'description': self.description,
            'target_value': self.target_value,
            'target_unit': self.target_unit,
            'monetary_value': self.monetary_value,
            'delivery_date': self.delivery_date.isoformat() if self.delivery_date else None,
            'status': self.status,
            'current_progress': self.current_progress,
            'is_mandatory': bool(self.is_mandatory),
            'evaluation_score': self.evaluation_score,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
