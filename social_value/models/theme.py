"""Models for TOMs framework: Themes, Outcomes, and Measures."""

from sqlalchemy import Column, Integer, String, Text, ForeignKey
from social_value.database import Base


class SocialValueTheme(Base):
    """Represents a social value theme from the National TOMs framework."""

    __tablename__ = 'social_value_themes'

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(50), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)  # Employment, Environment, Social, Innovation

    def __repr__(self):
        return f"<SocialValueTheme(id={self.id}, code='{self.code}', name='{self.name}')>"

    def to_dict(self):
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'description': self.description,
            'category': self.category,
        }


class Outcome(Base):
    """Represents an outcome within a theme."""

    __tablename__ = 'outcomes'

    id = Column(Integer, primary_key=True, autoincrement=True)
    theme_id = Column(Integer, ForeignKey('social_value_themes.id'), nullable=False)
    code = Column(String(50), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    def __repr__(self):
        return f"<Outcome(id={self.id}, code='{self.code}', name='{self.name}')>"

    def to_dict(self):
        return {
            'id': self.id,
            'theme_id': self.theme_id,
            'code': self.code,
            'name': self.name,
            'description': self.description,
        }


class Measure(Base):
    """Represents a specific measure within an outcome."""

    __tablename__ = 'measures'

    id = Column(Integer, primary_key=True, autoincrement=True)
    outcome_id = Column(Integer, ForeignKey('outcomes.id'), nullable=False)
    code = Column(String(50), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    unit = Column(String(100), nullable=True)  # e.g., "no. of jobs", "hours", "tonnes CO2"
    proxy_value = Column(String(100), nullable=True)  # TOMs proxy value

    def __repr__(self):
        return f"<Measure(id={self.id}, code='{self.code}', name='{self.name}')>"

    def to_dict(self):
        return {
            'id': self.id,
            'outcome_id': self.outcome_id,
            'code': self.code,
            'name': self.name,
            'description': self.description,
            'unit': self.unit,
            'proxy_value': self.proxy_value,
        }
