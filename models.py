"""
Data models for the PO/AP Tender & Auction Tool
"""
from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict
from dataclasses import dataclass, field


class AwardStrategy(Enum):
    """Award strategy options"""
    WHOLE_TENDER = "whole_tender"  # Single vendor wins entire tender
    BY_LOTS = "by_lots"  # Multiple vendors win by category groups
    BY_LINE_ITEM = "by_line_item"  # Multiple vendors win by individual items


class TenderStatus(Enum):
    """Tender lifecycle status"""
    DRAFT = "draft"
    PUBLISHED = "published"
    RESPONSE_COLLECTION = "response_collection"
    AUCTION_OPEN = "auction_open"
    AUCTION_CLOSED = "auction_closed"
    AWARDED = "awarded"
    CATALOGUE_GENERATED = "catalogue_generated"


@dataclass
class Organization:
    """Buying organization/authority"""
    id: str
    name: str
    sector: str  # e.g., "healthcare", "defense", "central_government"
    contact_email: str
    address: Optional[str] = None


@dataclass
class POLineItem:
    """Purchase Order line item from uploaded data"""
    po_number: str
    organization_id: str
    line_number: int
    product_code: str
    product_description: str
    quantity: float
    unit_of_measure: str
    unit_price: float
    total_price: float
    supplier_name: str
    date_ordered: datetime
    category: Optional[str] = None
    manufacturer: Optional[str] = None

    def __post_init__(self):
        """Normalize data for aggregation"""
        # Normalize product code and description for matching
        self.product_code = self.product_code.strip().upper()
        self.product_description = self.product_description.strip()


@dataclass
class AggregatedLineItem:
    """Consolidated line item across multiple POs"""
    id: str
    product_code: str
    product_description: str
    total_quantity: float
    unit_of_measure: str
    category: str
    lot_number: Optional[str] = None

    # Historical pricing data
    avg_unit_price: float = 0.0
    min_unit_price: float = 0.0
    max_unit_price: float = 0.0

    # Source tracking
    source_organizations: List[str] = field(default_factory=list)
    source_po_count: int = 0
    manufacturers: List[str] = field(default_factory=list)

    # Tender metadata
    baseline_unit_price: Optional[float] = None
    estimated_total_value: Optional[float] = None


@dataclass
class TenderBasket:
    """Collection of aggregated items for tender"""
    id: str
    name: str
    description: str
    created_date: datetime
    status: TenderStatus

    # Participating organizations
    organizations: List[Organization] = field(default_factory=list)

    # Line items
    line_items: List[AggregatedLineItem] = field(default_factory=list)

    # Lots (categories grouping)
    lots: Dict[str, List[str]] = field(default_factory=dict)  # lot_name -> [item_ids]

    # Award strategy
    award_strategy: AwardStrategy = AwardStrategy.BY_LOTS

    # Tender metadata
    tender_period_months: int = 24
    estimated_total_value: float = 0.0

    def calculate_total_value(self):
        """Calculate total estimated value"""
        self.estimated_total_value = sum(
            item.estimated_total_value or 0.0 for item in self.line_items
        )


@dataclass
class Vendor:
    """Supplier/vendor participating in tender"""
    id: str
    name: str
    contact_email: str
    registration_number: Optional[str] = None
    address: Optional[str] = None
    approved: bool = True


@dataclass
class VendorResponseLineItem:
    """Vendor's response for a specific line item"""
    tender_basket_id: str
    line_item_id: str
    vendor_id: str

    # Baseline response
    baseline_unit_price: float
    lead_time_days: int
    minimum_order_quantity: float = 1.0

    # Auction pricing
    auction_unit_price: Optional[float] = None
    final_unit_price: Optional[float] = None

    # Additional details
    manufacturer: Optional[str] = None
    product_code: Optional[str] = None
    notes: Optional[str] = None

    @property
    def best_price(self) -> float:
        """Return the best available price"""
        if self.final_unit_price:
            return self.final_unit_price
        elif self.auction_unit_price:
            return self.auction_unit_price
        return self.baseline_unit_price


@dataclass
class VendorResponse:
    """Complete vendor response to tender"""
    id: str
    tender_basket_id: str
    vendor: Vendor
    submission_date: datetime
    line_items: List[VendorResponseLineItem] = field(default_factory=list)

    # Metadata
    total_value: float = 0.0
    notes: Optional[str] = None

    def calculate_total_value(self, tender_basket: TenderBasket):
        """Calculate total response value"""
        self.total_value = 0.0
        item_map = {item.id: item for item in tender_basket.line_items}

        for response_item in self.line_items:
            tender_item = item_map.get(response_item.line_item_id)
            if tender_item:
                self.total_value += (
                    response_item.best_price * tender_item.total_quantity
                )


@dataclass
class AuctionEvent:
    """Reverse auction event"""
    id: str
    tender_basket_id: str
    start_time: datetime
    end_time: datetime
    status: str  # "scheduled", "active", "closed"

    # Auction rules
    minimum_decrement_percentage: float = 0.5  # Minimum bid reduction
    extension_on_bid_minutes: int = 5  # Auto-extend if bid near end

    # Participating vendors
    vendor_ids: List[str] = field(default_factory=list)


@dataclass
class AuctionBid:
    """Individual bid in reverse auction"""
    id: str
    auction_id: str
    line_item_id: str
    vendor_id: str
    bid_time: datetime
    unit_price: float
    rank: Optional[int] = None  # 1 = lowest price


@dataclass
class Award:
    """Award decision for tender or line items"""
    id: str
    tender_basket_id: str
    award_date: datetime
    award_strategy: AwardStrategy

    # Awards by line item
    line_item_awards: Dict[str, str] = field(default_factory=dict)  # item_id -> vendor_id

    # Awards by lot (if applicable)
    lot_awards: Dict[str, str] = field(default_factory=dict)  # lot_name -> vendor_id

    # Whole tender award (if applicable)
    winning_vendor_id: Optional[str] = None

    # Financial summary
    total_award_value: float = 0.0
    estimated_savings: float = 0.0


@dataclass
class CatalogueItem:
    """Catalogue item for P2P/e-marketplace export"""
    product_code: str
    product_description: str
    supplier_name: str
    supplier_id: str
    unit_price: float
    unit_of_measure: str
    category: str

    # Additional catalogue fields
    manufacturer: Optional[str] = None
    lead_time_days: Optional[int] = None
    minimum_order_quantity: float = 1.0
    contract_number: Optional[str] = None
    contract_start_date: Optional[datetime] = None
    contract_end_date: Optional[datetime] = None

    # Product attributes
    attributes: Dict[str, str] = field(default_factory=dict)
