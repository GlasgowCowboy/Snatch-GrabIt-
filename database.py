"""
Database Models and Configuration
SQLAlchemy models for persistent storage
"""
from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, Enum as SQLEnum, JSON, Table
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, scoped_session
from datetime import datetime
import enum
import os

# Database configuration
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///procurement.db')

# Create engine
engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={'check_same_thread': False} if 'sqlite' in DATABASE_URL else {}
)

# Session factory
session_factory = sessionmaker(bind=engine)
Session = scoped_session(session_factory)

# Base class for models
Base = declarative_base()


# Enums
class UserRole(enum.Enum):
    """User roles in the system"""
    ADMIN = "admin"
    ORG_ADMIN = "org_admin"
    ORG_USER = "org_user"
    VENDOR_ADMIN = "vendor_admin"
    VENDOR_USER = "vendor_user"


class TenderStatusEnum(enum.Enum):
    """Tender lifecycle status"""
    DRAFT = "draft"
    PUBLISHED = "published"
    RESPONSE_COLLECTION = "response_collection"
    AUCTION_OPEN = "auction_open"
    AUCTION_CLOSED = "auction_closed"
    AWARDED = "awarded"
    CATALOGUE_GENERATED = "catalogue_generated"


class AwardStrategyEnum(enum.Enum):
    """Award strategy options"""
    WHOLE_TENDER = "whole_tender"
    BY_LOTS = "by_lots"
    BY_LINE_ITEM = "by_line_item"


class MessageType(enum.Enum):
    """Message types"""
    QUESTION = "question"
    CLARIFICATION = "clarification"
    ANNOUNCEMENT = "announcement"


class MessageRecipientType(enum.Enum):
    """Message recipient types"""
    INDIVIDUAL = "individual"
    ALL_VENDORS = "all_vendors"
    SPECIFIC_VENDORS = "specific_vendors"


# Models
class User(Base):
    """User accounts"""
    __tablename__ = 'users'

    id = Column(String(36), primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False)
    organization_id = Column(String(36), ForeignKey('organizations.id'), nullable=True)
    vendor_id = Column(String(36), ForeignKey('vendors.id'), nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    organization = relationship("Organization", back_populates="users")
    vendor = relationship("Vendor", back_populates="users")
    sent_messages = relationship("Message", foreign_keys="Message.sender_id", back_populates="sender")


class Organization(Base):
    """Buying organizations"""
    __tablename__ = 'organizations'

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    sector = Column(String(100), nullable=False)
    contact_email = Column(String(255), nullable=False)
    address = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="organization")
    po_line_items = relationship("POLineItemDB", back_populates="organization")


class Vendor(Base):
    """Vendors/Suppliers"""
    __tablename__ = 'vendors'

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    contact_email = Column(String(255), nullable=False)
    registration_number = Column(String(100), nullable=True)
    address = Column(Text, nullable=True)
    approved = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="vendor")
    responses = relationship("VendorResponseDB", back_populates="vendor")


class POLineItemDB(Base):
    """Purchase Order Line Items"""
    __tablename__ = 'po_line_items'

    id = Column(Integer, primary_key=True, autoincrement=True)
    po_number = Column(String(100), nullable=False, index=True)
    organization_id = Column(String(36), ForeignKey('organizations.id'), nullable=False)
    line_number = Column(Integer, nullable=False)
    product_code = Column(String(100), nullable=False, index=True)
    product_description = Column(Text, nullable=False)
    quantity = Column(Float, nullable=False)
    unit_of_measure = Column(String(50), nullable=False)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)
    supplier_name = Column(String(255), nullable=False)
    date_ordered = Column(DateTime, nullable=False)
    category = Column(String(100), nullable=True)
    manufacturer = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="po_line_items")


class TenderBasketDB(Base):
    """Tender Baskets"""
    __tablename__ = 'tender_baskets'

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    created_date = Column(DateTime, nullable=False)
    status = Column(SQLEnum(TenderStatusEnum), nullable=False, default=TenderStatusEnum.DRAFT)
    award_strategy = Column(SQLEnum(AwardStrategyEnum), nullable=False)
    tender_period_months = Column(Integer, nullable=False)
    estimated_total_value = Column(Float, nullable=False)

    # JSON fields for complex data
    organization_ids = Column(JSON, nullable=False)  # List of org IDs
    lots = Column(JSON, nullable=True)  # Dict of lot_number -> [item_ids]

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    line_items = relationship("AggregatedLineItemDB", back_populates="tender_basket", cascade="all, delete-orphan")
    vendor_responses = relationship("VendorResponseDB", back_populates="tender_basket", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="tender_basket", cascade="all, delete-orphan")
    auctions = relationship("AuctionEventDB", back_populates="tender_basket", cascade="all, delete-orphan")
    awards = relationship("AwardDB", back_populates="tender_basket", cascade="all, delete-orphan")


class AggregatedLineItemDB(Base):
    """Aggregated Line Items"""
    __tablename__ = 'aggregated_line_items'

    id = Column(String(36), primary_key=True)
    tender_basket_id = Column(String(36), ForeignKey('tender_baskets.id'), nullable=False)
    product_code = Column(String(100), nullable=False, index=True)
    product_description = Column(Text, nullable=False)
    total_quantity = Column(Float, nullable=False)
    unit_of_measure = Column(String(50), nullable=False)
    category = Column(String(100), nullable=False)
    lot_number = Column(String(50), nullable=True)

    # Pricing data
    avg_unit_price = Column(Float, nullable=False)
    min_unit_price = Column(Float, nullable=False)
    max_unit_price = Column(Float, nullable=False)
    baseline_unit_price = Column(Float, nullable=True)
    estimated_total_value = Column(Float, nullable=True)

    # Source tracking (JSON)
    source_organizations = Column(JSON, nullable=False)
    source_po_count = Column(Integer, nullable=False)
    manufacturers = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    tender_basket = relationship("TenderBasketDB", back_populates="line_items")
    vendor_response_items = relationship("VendorResponseLineItemDB", back_populates="line_item", cascade="all, delete-orphan")


class VendorResponseDB(Base):
    """Vendor Responses"""
    __tablename__ = 'vendor_responses'

    id = Column(String(36), primary_key=True)
    tender_basket_id = Column(String(36), ForeignKey('tender_baskets.id'), nullable=False)
    vendor_id = Column(String(36), ForeignKey('vendors.id'), nullable=False)
    submission_date = Column(DateTime, nullable=False)
    total_value = Column(Float, nullable=False, default=0.0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    tender_basket = relationship("TenderBasketDB", back_populates="vendor_responses")
    vendor = relationship("Vendor", back_populates="responses")
    line_items = relationship("VendorResponseLineItemDB", back_populates="vendor_response", cascade="all, delete-orphan")


class VendorResponseLineItemDB(Base):
    """Vendor Response Line Items"""
    __tablename__ = 'vendor_response_line_items'

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_response_id = Column(String(36), ForeignKey('vendor_responses.id'), nullable=False)
    line_item_id = Column(String(36), ForeignKey('aggregated_line_items.id'), nullable=False)

    baseline_unit_price = Column(Float, nullable=False)
    lead_time_days = Column(Integer, nullable=False)
    minimum_order_quantity = Column(Float, default=1.0)

    # Auction pricing
    auction_unit_price = Column(Float, nullable=True)
    final_unit_price = Column(Float, nullable=True)

    # Additional details
    manufacturer = Column(String(255), nullable=True)
    product_code = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    vendor_response = relationship("VendorResponseDB", back_populates="line_items")
    line_item = relationship("AggregatedLineItemDB", back_populates="vendor_response_items")


class AuctionEventDB(Base):
    """Auction Events"""
    __tablename__ = 'auction_events'

    id = Column(String(36), primary_key=True)
    tender_basket_id = Column(String(36), ForeignKey('tender_baskets.id'), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(String(50), nullable=False, default='scheduled')

    # Auction rules
    minimum_decrement_percentage = Column(Float, default=0.5)
    extension_on_bid_minutes = Column(Integer, default=5)

    # Participating vendors (JSON list)
    vendor_ids = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    tender_basket = relationship("TenderBasketDB", back_populates="auctions")
    bids = relationship("AuctionBidDB", back_populates="auction", cascade="all, delete-orphan")


class AuctionBidDB(Base):
    """Auction Bids"""
    __tablename__ = 'auction_bids'

    id = Column(String(36), primary_key=True)
    auction_id = Column(String(36), ForeignKey('auction_events.id'), nullable=False)
    line_item_id = Column(String(36), nullable=False)
    vendor_id = Column(String(36), ForeignKey('vendors.id'), nullable=False)
    bid_time = Column(DateTime, nullable=False)
    unit_price = Column(Float, nullable=False)
    rank = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    auction = relationship("AuctionEventDB", back_populates="bids")


class AwardDB(Base):
    """Awards"""
    __tablename__ = 'awards'

    id = Column(String(36), primary_key=True)
    tender_basket_id = Column(String(36), ForeignKey('tender_baskets.id'), nullable=False)
    award_date = Column(DateTime, nullable=False)
    award_strategy = Column(SQLEnum(AwardStrategyEnum), nullable=False)

    # Awards (JSON)
    line_item_awards = Column(JSON, nullable=False)  # Dict: item_id -> vendor_id
    lot_awards = Column(JSON, nullable=True)  # Dict: lot_name -> vendor_id
    winning_vendor_id = Column(String(36), nullable=True)

    # Financial summary
    total_award_value = Column(Float, nullable=False, default=0.0)
    estimated_savings = Column(Float, nullable=False, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    tender_basket = relationship("TenderBasketDB", back_populates="awards")


class Message(Base):
    """Messages and Q&A System"""
    __tablename__ = 'messages'

    id = Column(String(36), primary_key=True)
    tender_basket_id = Column(String(36), ForeignKey('tender_baskets.id'), nullable=False)

    # Sender information
    sender_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    sender_type = Column(String(50), nullable=False)  # 'organization' or 'vendor'

    # Message details
    message_type = Column(SQLEnum(MessageType), nullable=False)
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)

    # Threading
    parent_message_id = Column(String(36), ForeignKey('messages.id'), nullable=True)
    is_reply = Column(Boolean, default=False)

    # Recipients
    recipient_type = Column(SQLEnum(MessageRecipientType), nullable=False)
    recipient_vendor_ids = Column(JSON, nullable=True)  # List of vendor IDs if specific

    # Status
    is_public = Column(Boolean, default=False)  # Public to all vendors
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    tender_basket = relationship("TenderBasketDB", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id], back_populates="sent_messages")
    replies = relationship("Message", backref="parent", remote_side=[id])
    read_receipts = relationship("MessageReadReceipt", back_populates="message", cascade="all, delete-orphan")


class MessageReadReceipt(Base):
    """Track message read status"""
    __tablename__ = 'message_read_receipts'

    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(String(36), ForeignKey('messages.id'), nullable=False)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    read_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    message = relationship("Message", back_populates="read_receipts")


class EmailNotificationLog(Base):
    """Log of email notifications sent"""
    __tablename__ = 'email_notifications'

    id = Column(Integer, primary_key=True, autoincrement=True)
    recipient_email = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    notification_type = Column(String(100), nullable=False)
    related_entity_id = Column(String(36), nullable=True)  # tender_id, auction_id, etc.
    sent_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default='sent')  # sent, failed, pending


class AuditLog(Base):
    """Audit trail for all actions"""
    __tablename__ = 'audit_logs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=False)  # tender, auction, award, etc.
    entity_id = Column(String(36), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


# Initialize database
def init_database():
    """Create all tables"""
    Base.metadata.create_all(engine)
    print("✓ Database initialized successfully")


def get_session():
    """Get database session"""
    return Session()


def close_session():
    """Close database session"""
    Session.remove()


if __name__ == "__main__":
    init_database()
