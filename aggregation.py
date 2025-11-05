"""
Data Aggregation Engine
Consolidates PO/AP line items across multiple organizations
"""
from typing import List, Dict, Tuple
from collections import defaultdict
from models import POLineItem, AggregatedLineItem
import uuid


class AggregationEngine:
    """Aggregates and consolidates PO/AP line items"""

    def __init__(self, fuzzy_matching: bool = False):
        """
        Initialize aggregation engine

        Args:
            fuzzy_matching: Enable fuzzy matching for product descriptions (future enhancement)
        """
        self.fuzzy_matching = fuzzy_matching

    def aggregate_line_items(
        self,
        line_items: List[POLineItem],
        group_by_category: bool = True
    ) -> List[AggregatedLineItem]:
        """
        Aggregate line items by product code

        Args:
            line_items: List of PO line items to aggregate
            group_by_category: Whether to assign categories/lots

        Returns:
            List of aggregated line items
        """
        # Group items by product code
        product_groups = defaultdict(list)

        for item in line_items:
            # Use product code as primary key
            # Could enhance with fuzzy matching on description
            key = self._generate_product_key(item)
            product_groups[key].append(item)

        # Create aggregated items
        aggregated_items = []

        for product_key, items in product_groups.items():
            agg_item = self._create_aggregated_item(items)
            aggregated_items.append(agg_item)

        # Assign lots/categories if requested
        if group_by_category:
            self._assign_lots(aggregated_items)

        return aggregated_items

    def _generate_product_key(self, item: POLineItem) -> str:
        """Generate unique key for product matching"""
        # Primary key is product code
        # Could enhance with manufacturer, UOM, etc.
        return f"{item.product_code}|{item.unit_of_measure}"

    def _create_aggregated_item(self, items: List[POLineItem]) -> AggregatedLineItem:
        """Create aggregated item from group of line items"""
        # Use first item as template
        template = items[0]

        # Aggregate quantities
        total_quantity = sum(item.quantity for item in items)

        # Calculate price statistics
        unit_prices = [item.unit_price for item in items]
        avg_unit_price = sum(unit_prices) / len(unit_prices)
        min_unit_price = min(unit_prices)
        max_unit_price = max(unit_prices)

        # Collect source organizations
        source_organizations = list(set(item.organization_id for item in items))

        # Collect unique POs
        source_po_count = len(set(item.po_number for item in items))

        # Collect manufacturers
        manufacturers = list(set(
            item.manufacturer for item in items if item.manufacturer
        ))

        # Determine category
        category = self._determine_category(items)

        # Calculate estimated value using average historical price
        estimated_total_value = total_quantity * avg_unit_price

        # Create aggregated item
        agg_item = AggregatedLineItem(
            id=str(uuid.uuid4()),
            product_code=template.product_code,
            product_description=template.product_description,
            total_quantity=total_quantity,
            unit_of_measure=template.unit_of_measure,
            category=category,
            avg_unit_price=avg_unit_price,
            min_unit_price=min_unit_price,
            max_unit_price=max_unit_price,
            source_organizations=source_organizations,
            source_po_count=source_po_count,
            manufacturers=manufacturers,
            baseline_unit_price=avg_unit_price,  # Use historical average as baseline
            estimated_total_value=estimated_total_value
        )

        return agg_item

    def _determine_category(self, items: List[POLineItem]) -> str:
        """Determine category for group of items"""
        # Use most common category
        categories = [item.category for item in items if item.category]

        if not categories:
            # Fallback to product code prefix or generic
            product_code = items[0].product_code
            return self._infer_category_from_code(product_code)

        # Return most common category
        category_counts = defaultdict(int)
        for cat in categories:
            category_counts[cat] += 1

        return max(category_counts.items(), key=lambda x: x[1])[0]

    def _infer_category_from_code(self, product_code: str) -> str:
        """Infer category from product code prefix"""
        code_upper = product_code.upper()

        # Common prefixes
        if code_upper.startswith('MED-') or code_upper.startswith('MEDICAL-'):
            return 'Medical Supplies'
        elif code_upper.startswith('IT-') or code_upper.startswith('TECH-'):
            return 'IT Hardware & Software'
        elif code_upper.startswith('OFF-') or code_upper.startswith('OFFICE-'):
            return 'Office Supplies'
        elif code_upper.startswith('CLEAN-') or code_upper.startswith('JAN-'):
            return 'Janitorial & Cleaning'
        elif code_upper.startswith('CLIN-') or code_upper.startswith('SURG-'):
            return 'Clinical Goods'
        else:
            return 'General Supplies'

    def _assign_lots(self, items: List[AggregatedLineItem]) -> None:
        """Assign lot numbers to aggregated items based on category"""
        # Group by category
        category_items = defaultdict(list)
        for item in items:
            category_items[item.category].append(item)

        # Assign lot numbers
        lot_counter = 1
        for category in sorted(category_items.keys()):
            lot_number = f"LOT-{lot_counter:03d}"
            for item in category_items[category]:
                item.lot_number = lot_number
            lot_counter += 1

    def get_aggregation_summary(self, aggregated_items: List[AggregatedLineItem]) -> Dict:
        """Generate summary statistics for aggregated items"""
        total_items = len(aggregated_items)
        total_value = sum(item.estimated_total_value for item in aggregated_items)

        # Count by category
        category_counts = defaultdict(int)
        category_values = defaultdict(float)

        for item in aggregated_items:
            category_counts[item.category] += 1
            category_values[item.category] += item.estimated_total_value

        # Count by lot
        lot_counts = defaultdict(int)
        lot_values = defaultdict(float)

        for item in aggregated_items:
            if item.lot_number:
                lot_counts[item.lot_number] += 1
                lot_values[item.lot_number] += item.estimated_total_value

        # Count organizations
        all_orgs = set()
        for item in aggregated_items:
            all_orgs.update(item.source_organizations)

        return {
            'total_items': total_items,
            'total_value': total_value,
            'categories': dict(category_counts),
            'category_values': dict(category_values),
            'lots': dict(lot_counts),
            'lot_values': dict(lot_values),
            'participating_organizations': len(all_orgs),
            'average_item_value': total_value / total_items if total_items > 0 else 0
        }

    def merge_organizations(
        self,
        org_line_items: Dict[str, List[POLineItem]]
    ) -> List[AggregatedLineItem]:
        """
        Merge line items from multiple organizations

        Args:
            org_line_items: Dictionary mapping organization_id to their line items

        Returns:
            Combined aggregated line items
        """
        # Flatten all line items
        all_items = []
        for org_id, items in org_line_items.items():
            all_items.extend(items)

        # Aggregate across all organizations
        return self.aggregate_line_items(all_items, group_by_category=True)

    def split_by_lots(
        self,
        aggregated_items: List[AggregatedLineItem]
    ) -> Dict[str, List[AggregatedLineItem]]:
        """Split aggregated items into lots"""
        lots = defaultdict(list)

        for item in aggregated_items:
            if item.lot_number:
                lots[item.lot_number].append(item)
            else:
                lots['UNASSIGNED'].append(item)

        return dict(lots)
