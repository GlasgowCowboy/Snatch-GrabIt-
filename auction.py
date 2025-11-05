"""
Reverse Auction Module (Dynamic Defense)
Handles best and final offer reverse auction process
"""
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from models import (
    AuctionEvent, AuctionBid, VendorResponse, VendorResponseLineItem,
    TenderBasket, Vendor
)
from collections import defaultdict
import uuid


class AuctionManager:
    """Manages reverse auction events and bidding"""

    def __init__(self):
        self.active_auctions = {}
        self.auction_bids = defaultdict(list)

    def create_auction(
        self,
        tender_basket: TenderBasket,
        vendor_responses: List[VendorResponse],
        duration_hours: int = 2,
        minimum_decrement_percentage: float = 0.5,
        extension_on_bid_minutes: int = 5
    ) -> AuctionEvent:
        """
        Create a reverse auction event from vendor responses

        Args:
            tender_basket: The tender basket
            vendor_responses: List of vendor baseline responses
            duration_hours: Auction duration in hours
            minimum_decrement_percentage: Minimum bid reduction required
            extension_on_bid_minutes: Auto-extend if bid within this time

        Returns:
            Created AuctionEvent
        """
        auction_id = str(uuid.uuid4())

        start_time = datetime.now()
        end_time = start_time + timedelta(hours=duration_hours)

        # Extract participating vendor IDs
        vendor_ids = [response.vendor.id for response in vendor_responses]

        auction = AuctionEvent(
            id=auction_id,
            tender_basket_id=tender_basket.id,
            start_time=start_time,
            end_time=end_time,
            status='scheduled',
            minimum_decrement_percentage=minimum_decrement_percentage,
            extension_on_bid_minutes=extension_on_bid_minutes,
            vendor_ids=vendor_ids
        )

        self.active_auctions[auction_id] = auction

        return auction

    def start_auction(self, auction_id: str) -> AuctionEvent:
        """Start the auction"""
        auction = self.active_auctions[auction_id]
        auction.status = 'active'
        auction.start_time = datetime.now()
        return auction

    def submit_bid(
        self,
        auction_id: str,
        line_item_id: str,
        vendor_id: str,
        unit_price: float,
        baseline_price: float
    ) -> Optional[AuctionBid]:
        """
        Submit a bid in the reverse auction

        Args:
            auction_id: Auction ID
            line_item_id: Line item being bid on
            vendor_id: Vendor submitting bid
            unit_price: Bid unit price
            baseline_price: Vendor's baseline price

        Returns:
            Created AuctionBid or None if invalid
        """
        auction = self.active_auctions.get(auction_id)

        if not auction or auction.status != 'active':
            return None

        # Validate vendor participation
        if vendor_id not in auction.vendor_ids:
            return None

        # Validate bid is below baseline
        if unit_price >= baseline_price:
            return None

        # Check minimum decrement
        reduction_percentage = ((baseline_price - unit_price) / baseline_price) * 100

        if reduction_percentage < auction.minimum_decrement_percentage:
            return None

        # Check auction still open
        current_time = datetime.now()
        if current_time > auction.end_time:
            return None

        # Auto-extend if bid near end
        time_remaining = (auction.end_time - current_time).total_seconds() / 60

        if time_remaining < auction.extension_on_bid_minutes:
            auction.end_time = current_time + timedelta(minutes=auction.extension_on_bid_minutes)

        # Create bid
        bid = AuctionBid(
            id=str(uuid.uuid4()),
            auction_id=auction_id,
            line_item_id=line_item_id,
            vendor_id=vendor_id,
            bid_time=current_time,
            unit_price=unit_price
        )

        # Store bid
        self.auction_bids[auction_id].append(bid)

        # Rank bids for this line item
        self._rank_bids_for_item(auction_id, line_item_id)

        return bid

    def _rank_bids_for_item(self, auction_id: str, line_item_id: str):
        """Rank bids for a specific line item"""
        # Get all bids for this item
        item_bids = [
            bid for bid in self.auction_bids[auction_id]
            if bid.line_item_id == line_item_id
        ]

        # Sort by price (lowest first)
        item_bids.sort(key=lambda x: x.unit_price)

        # Assign ranks
        for rank, bid in enumerate(item_bids, 1):
            bid.rank = rank

    def get_current_leader(
        self,
        auction_id: str,
        line_item_id: str
    ) -> Optional[AuctionBid]:
        """Get current leading bid for a line item"""
        item_bids = [
            bid for bid in self.auction_bids[auction_id]
            if bid.line_item_id == line_item_id and bid.rank == 1
        ]

        return item_bids[0] if item_bids else None

    def get_vendor_position(
        self,
        auction_id: str,
        line_item_id: str,
        vendor_id: str
    ) -> Optional[int]:
        """Get vendor's current rank for a line item"""
        vendor_bids = [
            bid for bid in self.auction_bids[auction_id]
            if bid.line_item_id == line_item_id and bid.vendor_id == vendor_id
        ]

        if not vendor_bids:
            return None

        # Return best rank
        return min(bid.rank for bid in vendor_bids)

    def close_auction(self, auction_id: str) -> AuctionEvent:
        """Close the auction"""
        auction = self.active_auctions[auction_id]
        auction.status = 'closed'
        return auction

    def get_auction_results(
        self,
        auction_id: str,
        tender_basket: TenderBasket
    ) -> Dict:
        """
        Get final auction results

        Returns:
            Dictionary with auction results and winners
        """
        auction = self.active_auctions[auction_id]
        bids = self.auction_bids[auction_id]

        # Group bids by line item
        item_bids = defaultdict(list)
        for bid in bids:
            item_bids[bid.line_item_id].append(bid)

        # Determine winners for each line item
        winners = {}
        total_auction_value = 0.0

        for item in tender_basket.line_items:
            if item.id in item_bids:
                # Get winning bid (rank 1)
                winning_bids = [b for b in item_bids[item.id] if b.rank == 1]

                if winning_bids:
                    winning_bid = winning_bids[0]
                    winners[item.id] = {
                        'vendor_id': winning_bid.vendor_id,
                        'final_unit_price': winning_bid.unit_price,
                        'baseline_unit_price': item.baseline_unit_price,
                        'savings': (item.baseline_unit_price - winning_bid.unit_price) * item.total_quantity,
                        'total_value': winning_bid.unit_price * item.total_quantity,
                        'reduction_percentage': ((item.baseline_unit_price - winning_bid.unit_price) / item.baseline_unit_price) * 100
                    }

                    total_auction_value += winners[item.id]['total_value']

        # Calculate total savings
        baseline_total = sum(item.baseline_unit_price * item.total_quantity for item in tender_basket.line_items)
        total_savings = baseline_total - total_auction_value
        savings_percentage = (total_savings / baseline_total) * 100 if baseline_total > 0 else 0

        return {
            'auction_id': auction_id,
            'tender_basket_id': tender_basket.id,
            'start_time': auction.start_time.isoformat(),
            'end_time': auction.end_time.isoformat(),
            'total_bids': len(bids),
            'participating_vendors': len(auction.vendor_ids),
            'items_with_bids': len(winners),
            'total_items': len(tender_basket.line_items),
            'baseline_total_value': baseline_total,
            'auction_total_value': total_auction_value,
            'total_savings': total_savings,
            'savings_percentage': savings_percentage,
            'winners': winners
        }

    def update_vendor_responses_with_auction_results(
        self,
        auction_id: str,
        vendor_responses: List[VendorResponse]
    ) -> List[VendorResponse]:
        """
        Update vendor responses with final auction prices

        Args:
            auction_id: Auction ID
            vendor_responses: Original vendor responses

        Returns:
            Updated vendor responses with auction prices
        """
        bids = self.auction_bids[auction_id]

        # Create mapping of vendor + item to best bid
        vendor_item_bids = {}
        for bid in bids:
            key = (bid.vendor_id, bid.line_item_id)
            if key not in vendor_item_bids or bid.rank == 1:
                vendor_item_bids[key] = bid

        # Update responses
        for response in vendor_responses:
            for line_item in response.line_items:
                key = (response.vendor.id, line_item.line_item_id)

                if key in vendor_item_bids:
                    best_bid = vendor_item_bids[key]
                    line_item.final_unit_price = best_bid.unit_price

        return vendor_responses

    def get_auction_leaderboard(
        self,
        auction_id: str,
        line_item_id: str
    ) -> List[Dict]:
        """
        Get current leaderboard for a line item

        Returns:
            List of bids sorted by rank
        """
        item_bids = [
            bid for bid in self.auction_bids[auction_id]
            if bid.line_item_id == line_item_id
        ]

        # Get latest bid per vendor
        vendor_latest = {}
        for bid in item_bids:
            if bid.vendor_id not in vendor_latest or bid.bid_time > vendor_latest[bid.vendor_id].bid_time:
                vendor_latest[bid.vendor_id] = bid

        # Sort by price
        leaderboard = sorted(vendor_latest.values(), key=lambda x: x.unit_price)

        return [
            {
                'rank': idx + 1,
                'vendor_id': bid.vendor_id,
                'unit_price': bid.unit_price,
                'bid_time': bid.bid_time.isoformat()
            }
            for idx, bid in enumerate(leaderboard)
        ]
