"""
Tender Management Module
Handles creation and management of tender baskets and documentation
"""
from typing import List, Dict, Optional
from datetime import datetime
from models import (
    TenderBasket, AggregatedLineItem, Organization,
    TenderStatus, AwardStrategy
)
import uuid


class TenderManager:
    """Manages tender baskets and documentation generation"""

    def create_tender_basket(
        self,
        name: str,
        description: str,
        line_items: List[AggregatedLineItem],
        organizations: List[Organization],
        award_strategy: AwardStrategy = AwardStrategy.BY_LOTS,
        tender_period_months: int = 24
    ) -> TenderBasket:
        """
        Create a new tender basket from aggregated items

        Args:
            name: Tender name
            description: Tender description
            line_items: Aggregated line items
            organizations: Participating organizations
            award_strategy: Award strategy (whole/lots/line items)
            tender_period_months: Contract period in months

        Returns:
            Created TenderBasket
        """
        tender_id = str(uuid.uuid4())

        # Create lots dictionary
        lots = self._create_lots_from_items(line_items)

        # Create tender basket
        tender = TenderBasket(
            id=tender_id,
            name=name,
            description=description,
            created_date=datetime.now(),
            status=TenderStatus.DRAFT,
            organizations=organizations,
            line_items=line_items,
            lots=lots,
            award_strategy=award_strategy,
            tender_period_months=tender_period_months
        )

        # Calculate total value
        tender.calculate_total_value()

        return tender

    def _create_lots_from_items(
        self,
        line_items: List[AggregatedLineItem]
    ) -> Dict[str, List[str]]:
        """Create lots mapping from line items"""
        lots = {}

        for item in line_items:
            if item.lot_number:
                if item.lot_number not in lots:
                    lots[item.lot_number] = []
                lots[item.lot_number].append(item.id)

        return lots

    def generate_tender_document(self, tender: TenderBasket) -> Dict:
        """
        Generate tender documentation

        Returns:
            Dictionary containing tender document sections
        """
        document = {
            'tender_id': tender.id,
            'tender_name': tender.name,
            'tender_description': tender.description,
            'created_date': tender.created_date.isoformat(),
            'tender_period_months': tender.tender_period_months,
            'estimated_total_value': tender.estimated_total_value,
            'award_strategy': tender.award_strategy.value,

            # Participating organizations
            'participating_organizations': [
                {
                    'id': org.id,
                    'name': org.name,
                    'sector': org.sector,
                    'contact': org.contact_email
                }
                for org in tender.organizations
            ],

            # Summary
            'summary': {
                'total_line_items': len(tender.line_items),
                'total_lots': len(tender.lots),
                'total_value': tender.estimated_total_value
            },

            # Lots
            'lots': self._generate_lots_section(tender),

            # Line items
            'line_items': self._generate_line_items_section(tender),

            # Terms and conditions
            'terms_and_conditions': self._generate_terms_and_conditions(tender),

            # Response instructions
            'response_instructions': self._generate_response_instructions(tender)
        }

        return document

    def _generate_lots_section(self, tender: TenderBasket) -> List[Dict]:
        """Generate lots section of tender document"""
        lots_section = []

        # Create item lookup
        item_map = {item.id: item for item in tender.line_items}

        for lot_number, item_ids in tender.lots.items():
            lot_items = [item_map[item_id] for item_id in item_ids]

            lot_value = sum(item.estimated_total_value for item in lot_items)

            # Determine lot category from items
            categories = set(item.category for item in lot_items)
            lot_category = list(categories)[0] if len(categories) == 1 else "Mixed"

            lots_section.append({
                'lot_number': lot_number,
                'lot_name': lot_category,
                'item_count': len(lot_items),
                'estimated_value': lot_value,
                'item_ids': item_ids
            })

        return lots_section

    def _generate_line_items_section(self, tender: TenderBasket) -> List[Dict]:
        """Generate line items section of tender document"""
        line_items_section = []

        for item in tender.line_items:
            line_items_section.append({
                'item_id': item.id,
                'lot_number': item.lot_number,
                'product_code': item.product_code,
                'description': item.product_description,
                'quantity': item.total_quantity,
                'unit_of_measure': item.unit_of_measure,
                'category': item.category,
                'baseline_unit_price': item.baseline_unit_price,
                'estimated_total_value': item.estimated_total_value,
                'historical_pricing': {
                    'average': item.avg_unit_price,
                    'minimum': item.min_unit_price,
                    'maximum': item.max_unit_price
                },
                'manufacturers': item.manufacturers,
                'source_organizations': len(item.source_organizations),
                'source_po_count': item.source_po_count
            })

        return line_items_section

    def _generate_terms_and_conditions(self, tender: TenderBasket) -> Dict:
        """Generate terms and conditions section"""
        return {
            'contract_period': f"{tender.tender_period_months} months",
            'payment_terms': "Net 30 days from invoice date",
            'delivery_terms': "FOB Destination",
            'quality_requirements': "All goods must meet or exceed specifications",
            'compliance': "Suppliers must comply with all applicable regulations",
            'insurance': "Suppliers must maintain appropriate insurance coverage",
            'warranty': "Minimum 12 months warranty on all goods",
            'returns': "Defective goods may be returned within 30 days",
            'price_validity': "Prices must remain valid for contract period",
            'volume_flexibility': "Quantities are estimates and may vary by +/- 20%"
        }

    def _generate_response_instructions(self, tender: TenderBasket) -> Dict:
        """Generate vendor response instructions"""
        return {
            'submission_format': 'Electronic submission via platform',
            'required_information': [
                'Company registration details',
                'Tax identification number',
                'Insurance certificates',
                'Product specifications',
                'Unit pricing for each line item',
                'Lead times',
                'Minimum order quantities',
                'Payment terms',
                'References'
            ],
            'pricing_instructions': {
                'currency': 'Local currency',
                'pricing_basis': 'Per unit of measure specified',
                'baseline_prices': 'Historical average prices provided as reference',
                'auction_participation': 'Baseline prices will be used for reverse auction'
            },
            'evaluation_criteria': self._generate_evaluation_criteria(tender),
            'timeline': {
                'tender_published': datetime.now().isoformat(),
                'questions_deadline': '14 days from publication',
                'submission_deadline': '28 days from publication',
                'auction_date': '35 days from publication',
                'award_notification': '42 days from publication'
            }
        }

    def _generate_evaluation_criteria(self, tender: TenderBasket) -> Dict:
        """Generate evaluation criteria"""
        criteria = {
            'price': {
                'weight': 60,
                'description': 'Total cost of ownership'
            },
            'quality': {
                'weight': 20,
                'description': 'Product specifications and quality certifications'
            },
            'delivery': {
                'weight': 10,
                'description': 'Lead times and delivery reliability'
            },
            'service': {
                'weight': 10,
                'description': 'Customer service and support'
            }
        }

        if tender.award_strategy == AwardStrategy.WHOLE_TENDER:
            criteria['note'] = 'Single vendor will be awarded entire tender based on total score'
        elif tender.award_strategy == AwardStrategy.BY_LOTS:
            criteria['note'] = 'Awards will be made by lot to vendors with best score per lot'
        else:
            criteria['note'] = 'Awards will be made by line item to vendors with best score per item'

        return criteria

    def publish_tender(self, tender: TenderBasket) -> TenderBasket:
        """Publish tender and change status"""
        tender.status = TenderStatus.PUBLISHED
        return tender

    def open_for_responses(self, tender: TenderBasket) -> TenderBasket:
        """Open tender for vendor responses"""
        tender.status = TenderStatus.RESPONSE_COLLECTION
        return tender

    def get_tender_summary(self, tender: TenderBasket) -> Dict:
        """Get summary of tender basket"""
        return {
            'id': tender.id,
            'name': tender.name,
            'status': tender.status.value,
            'total_items': len(tender.line_items),
            'total_lots': len(tender.lots),
            'total_value': tender.estimated_total_value,
            'organizations': len(tender.organizations),
            'award_strategy': tender.award_strategy.value,
            'created_date': tender.created_date.isoformat()
        }
