"""Vendor model representing suppliers/contractors."""

from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
from social_value.database import Base


class Vendor(Base):
    """Represents a vendor/supplier."""

    __tablename__ = 'vendors'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    company_number = Column(String(50), nullable=True)
    contact_name = Column(String(255), nullable=True)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    website = Column(String(255), nullable=True)
    is_sme = Column(Integer, default=0)  # Is Small/Medium Enterprise
    is_local = Column(Integer, default=0)  # Is local to contracting authority
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Vendor(id={self.id}, name='{self.name}')>"

    def to_dict(self):
        """Convert vendor to dictionary."""
        return {
            'id': self.id,
            'name': self.name,
            'company_number': self.company_number,
            'contact_name': self.contact_name,
            'contact_email': self.contact_email,
            'contact_phone': self.contact_phone,
            'address': self.address,
            'website': self.website,
            'is_sme': bool(self.is_sme),
            'is_local': bool(self.is_local),
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
