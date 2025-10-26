"""Contract model representing procurement contracts."""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from datetime import datetime
from social_value.database import Base


class Contract(Base):
    """Represents a procurement contract."""

    __tablename__ = 'contracts'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    contract_value = Column(Float, nullable=False)
    social_value_percentage = Column(Float, default=10.0)  # Minimum 10% for PPN 06/20
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    procuring_authority = Column(String(255), nullable=True)
    contract_reference = Column(String(100), nullable=True)
    status = Column(String(50), default='Planning')  # Planning, Tender, Awarded, Active, Completed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Contract(id={self.id}, name='{self.name}', value={self.contract_value})>"

    def to_dict(self):
        """Convert contract to dictionary."""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'contract_value': self.contract_value,
            'social_value_percentage': self.social_value_percentage,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'procuring_authority': self.procuring_authority,
            'contract_reference': self.contract_reference,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
