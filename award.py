"""
Award Comparison and Decision Engine
Compares vendor responses and determines awards by tender/lot/line item
"""
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from models import (
    Award, TenderBasket, VendorResponse, VendorResponseLineItem,
    AwardStrategy, Vendor
)
from collections import defaultdict
import uuid


class AwardEngine:
    """Manages award comparison and decision making"""

    def __init__(self):
        pass

    def compare_responses(
        self,
        tender_basket: TenderBasket,
        vendor_responses: List[VendorResponse]
    ) -> Dict:
        """
        Compare all vendor responses across different award strategies

        Args:
            tender_basket: The tender basket
            vendor_responses: List of vendor responses with final prices

        Returns:
            Comparison analysis for all strategies
        """
        # Calculate total scores for each vendor
        vendor_totals = self._calculate_vendor_totals(tender_basket, vendor_responses)

        # Analyze by different strategies
        whole_tender_analysis = self._analyze_whole_tender(vendor_totals)
        by_lots_analysis = self._analyze_by_lots(tender_basket, vendor_responses)
        by_line_item_analysis = self._analyze_by_line_item(tender_basket, vendor_responses)

        return {
            'whole_tender': whole_tender_analysis,
            'by_lots': by_lots_analysis,
            'by_line_item': by_line_item_analysis,
            'recommendation': self._generate_recommendation(
                whole_tender_analysis,
                by_lots_analysis,
                by_line_item_analysis
            )
        }

    def _calculate_vendor_totals(
        self,
        tender_basket: TenderBasket,
        vendor_responses: List[VendorResponse]
    ) -> Dict[str, Dict]:
        """Calculate total cost and savings for each vendor"""
        vendor_totals = {}

        # Create item lookup map for efficiency
        item_map = {item.id: item for item in tender_basket.line_items}

        for response in vendor_responses:
            response.calculate_total_value(tender_basket)

            # Calculate savings vs baseline
            baseline_total = sum(
                item_map[line.line_item_id].baseline_unit_price * item_map[line.line_item_id].total_quantity
                for line in response.line_items
                if line.line_item_id in item_map
            )

            savings = baseline_total - response.total_value
            savings_percentage = (savings / baseline_total * 100) if baseline_total > 0 else 0

            vendor_totals[response.vendor.id] = {
                'vendor': response.vendor,
                'total_value': response.total_value,
                'baseline_total': baseline_total,
                'savings': savings,
                'savings_percentage': savings_percentage,
                'items_quoted': len(response.line_items)
            }

        return vendor_totals

    def _analyze_whole_tender(self, vendor_totals: Dict[str, Dict]) -> Dict:
        """Analyze awarding entire tender to single vendor"""
        if not vendor_totals:
            return {'viable': False, 'reason': 'No vendor responses'}

        # Sort by total value (lowest first)
        sorted_vendors = sorted(
            vendor_totals.items(),
            key=lambda x: x[1]['total_value']
        )

        winner_id, winner_data = sorted_vendors[0]

        return {
            'viable': True,
            'winner': {
                'vendor_id': winner_id,
                'vendor_name': winner_data['vendor'].name,
                'total_value': winner_data['total_value'],
                'savings': winner_data['savings'],
                'savings_percentage': winner_data['savings_percentage']
            },
            'all_vendors': [
                {
                    'vendor_id': vid,
                    'vendor_name': data['vendor'].name,
                    'total_value': data['total_value'],
                    'savings_percentage': data['savings_percentage']
                }
                for vid, data in sorted_vendors
            ]
        }

    def _analyze_by_lots(
        self,
        tender_basket: TenderBasket,
        vendor_responses: List[VendorResponse]
    ) -> Dict:
        """Analyze awarding by lots (categories)"""
        lot_awards = {}

        # Create item lookup
        item_map = {item.id: item for item in tender_basket.line_items}

        # Process each lot
        for lot_number, item_ids in tender_basket.lots.items():
            lot_items = [item_map[item_id] for item_id in item_ids]

            # Calculate vendor totals for this lot
            lot_vendor_totals = defaultdict(lambda: {'total': 0.0, 'baseline': 0.0, 'items': []})

            for response in vendor_responses:
                for line_item in response.line_items:
                    if line_item.line_item_id in item_ids:
                        tender_item = item_map[line_item.line_item_id]

                        lot_vendor_totals[response.vendor.id]['total'] += (
                            line_item.best_price * tender_item.total_quantity
                        )
                        lot_vendor_totals[response.vendor.id]['baseline'] += (
                            tender_item.baseline_unit_price * tender_item.total_quantity
                        )
                        lot_vendor_totals[response.vendor.id]['items'].append(line_item.line_item_id)
                        lot_vendor_totals[response.vendor.id]['vendor'] = response.vendor

            # Find best vendor for this lot
            if lot_vendor_totals:
                best_vendor_id = min(
                    lot_vendor_totals.keys(),
                    key=lambda x: lot_vendor_totals[x]['total']
                )

                best_data = lot_vendor_totals[best_vendor_id]
                savings = best_data['baseline'] - best_data['total']
                savings_percentage = (savings / best_data['baseline'] * 100) if best_data['baseline'] > 0 else 0

                lot_awards[lot_number] = {
                    'winner_vendor_id': best_vendor_id,
                    'winner_vendor_name': best_data['vendor'].name,
                    'total_value': best_data['total'],
                    'baseline_value': best_data['baseline'],
                    'savings': savings,
                    'savings_percentage': savings_percentage,
                    'items_count': len(best_data['items'])
                }

        # Calculate overall totals
        total_value = sum(lot['total_value'] for lot in lot_awards.values())
        total_baseline = sum(lot['baseline_value'] for lot in lot_awards.values())
        total_savings = total_baseline - total_value
        total_savings_percentage = (total_savings / total_baseline * 100) if total_baseline > 0 else 0

        return {
            'viable': bool(lot_awards),
            'lot_awards': lot_awards,
            'total_value': total_value,
            'total_savings': total_savings,
            'savings_percentage': total_savings_percentage,
            'vendors_awarded': len(set(lot['winner_vendor_id'] for lot in lot_awards.values()))
        }

    def _analyze_by_line_item(
        self,
        tender_basket: TenderBasket,
        vendor_responses: List[VendorResponse]
    ) -> Dict:
        """Analyze awarding by individual line items"""
        line_item_awards = {}

        # Create item lookup
        item_map = {item.id: item for item in tender_basket.line_items}

        # Process each line item
        for item in tender_basket.line_items:
            # Collect all vendor responses for this item
            item_responses = []

            for response in vendor_responses:
                for line_item in response.line_items:
                    if line_item.line_item_id == item.id:
                        item_responses.append({
                            'vendor_id': response.vendor.id,
                            'vendor_name': response.vendor.name,
                            'unit_price': line_item.best_price,
                            'total_price': line_item.best_price * item.total_quantity
                        })

            if item_responses:
                # Find best price
                best_response = min(item_responses, key=lambda x: x['unit_price'])

                baseline_total = item.baseline_unit_price * item.total_quantity
                savings = baseline_total - best_response['total_price']
                savings_percentage = (savings / baseline_total * 100) if baseline_total > 0 else 0

                line_item_awards[item.id] = {
                    'product_code': item.product_code,
                    'description': item.product_description,
                    'quantity': item.total_quantity,
                    'winner_vendor_id': best_response['vendor_id'],
                    'winner_vendor_name': best_response['vendor_name'],
                    'unit_price': best_response['unit_price'],
                    'total_value': best_response['total_price'],
                    'baseline_value': baseline_total,
                    'savings': savings,
                    'savings_percentage': savings_percentage,
                    'competing_vendors': len(item_responses)
                }

        # Calculate overall totals
        total_value = sum(award['total_value'] for award in line_item_awards.values())
        total_baseline = sum(award['baseline_value'] for award in line_item_awards.values())
        total_savings = total_baseline - total_value
        total_savings_percentage = (total_savings / total_baseline * 100) if total_baseline > 0 else 0

        return {
            'viable': bool(line_item_awards),
            'line_item_awards': line_item_awards,
            'total_value': total_value,
            'total_savings': total_savings,
            'savings_percentage': total_savings_percentage,
            'vendors_awarded': len(set(award['winner_vendor_id'] for award in line_item_awards.values()))
        }

    def _generate_recommendation(
        self,
        whole_tender: Dict,
        by_lots: Dict,
        by_line_item: Dict
    ) -> Dict:
        """Generate recommendation on best award strategy"""
        strategies = []

        if whole_tender.get('viable'):
            strategies.append({
                'strategy': 'whole_tender',
                'savings_percentage': whole_tender['winner']['savings_percentage'],
                'total_value': whole_tender['winner']['total_value'],
                'vendors': 1,
                'complexity': 'low'
            })

        if by_lots.get('viable'):
            strategies.append({
                'strategy': 'by_lots',
                'savings_percentage': by_lots['savings_percentage'],
                'total_value': by_lots['total_value'],
                'vendors': by_lots['vendors_awarded'],
                'complexity': 'medium'
            })

        if by_line_item.get('viable'):
            strategies.append({
                'strategy': 'by_line_item',
                'savings_percentage': by_line_item['savings_percentage'],
                'total_value': by_line_item['total_value'],
                'vendors': by_line_item['vendors_awarded'],
                'complexity': 'high'
            })

        # Recommend strategy with best savings
        if strategies:
            best_strategy = max(strategies, key=lambda x: x['savings_percentage'])

            return {
                'recommended_strategy': best_strategy['strategy'],
                'reason': f"Provides best savings ({best_strategy['savings_percentage']:.2f}%)",
                'comparison': strategies
            }

        return {
            'recommended_strategy': None,
            'reason': 'No viable strategies found'
        }

    def create_award(
        self,
        tender_basket: TenderBasket,
        vendor_responses: List[VendorResponse],
        award_strategy: AwardStrategy
    ) -> Award:
        """
        Create award based on chosen strategy

        Args:
            tender_basket: The tender basket
            vendor_responses: Vendor responses with final prices
            award_strategy: Chosen award strategy

        Returns:
            Created Award
        """
        award = Award(
            id=str(uuid.uuid4()),
            tender_basket_id=tender_basket.id,
            award_date=datetime.now(),
            award_strategy=award_strategy
        )

        # Get comparison analysis
        comparison = self.compare_responses(tender_basket, vendor_responses)

        if award_strategy == AwardStrategy.WHOLE_TENDER:
            analysis = comparison['whole_tender']
            if analysis['viable']:
                award.winning_vendor_id = analysis['winner']['vendor_id']
                award.total_award_value = analysis['winner']['total_value']
                award.estimated_savings = analysis['winner']['savings']

                # Assign all items to winning vendor
                for item in tender_basket.line_items:
                    award.line_item_awards[item.id] = award.winning_vendor_id

        elif award_strategy == AwardStrategy.BY_LOTS:
            analysis = comparison['by_lots']
            if analysis['viable']:
                award.total_award_value = analysis['total_value']
                award.estimated_savings = analysis['total_savings']

                # Assign lot awards
                award.lot_awards = {
                    lot_num: lot_data['winner_vendor_id']
                    for lot_num, lot_data in analysis['lot_awards'].items()
                }

                # Assign line items based on lot awards
                item_map = {item.id: item for item in tender_basket.line_items}

                for lot_num, vendor_id in award.lot_awards.items():
                    item_ids = tender_basket.lots.get(lot_num, [])
                    for item_id in item_ids:
                        award.line_item_awards[item_id] = vendor_id

        elif award_strategy == AwardStrategy.BY_LINE_ITEM:
            analysis = comparison['by_line_item']
            if analysis['viable']:
                award.total_award_value = analysis['total_value']
                award.estimated_savings = analysis['total_savings']

                # Assign line item awards
                award.line_item_awards = {
                    item_id: item_data['winner_vendor_id']
                    for item_id, item_data in analysis['line_item_awards'].items()
                }

        return award

    def get_award_summary(self, award: Award, tender_basket: TenderBasket) -> Dict:
        """Get summary of award"""
        # Count awarded vendors
        awarded_vendors = set(award.line_item_awards.values())

        if award.winning_vendor_id:
            awarded_vendors.add(award.winning_vendor_id)

        return {
            'award_id': award.id,
            'tender_basket_id': award.tender_basket_id,
            'award_date': award.award_date.isoformat(),
            'award_strategy': award.award_strategy.value,
            'total_value': award.total_award_value,
            'estimated_savings': award.estimated_savings,
            'savings_percentage': (award.estimated_savings / tender_basket.estimated_total_value * 100)
                if tender_basket.estimated_total_value > 0 else 0,
            'awarded_vendors': len(awarded_vendors),
            'awarded_items': len(award.line_item_awards),
            'awarded_lots': len(award.lot_awards)
        }
