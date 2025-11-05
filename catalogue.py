"""
Catalogue Generator Module
Generates P2P/e-marketplace compatible catalogues from awards
"""
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from models import (
    Award, TenderBasket, VendorResponse, CatalogueItem
)
import pandas as pd
import io
import json


class CatalogueGenerator:
    """Generates catalogues from awarded tenders"""

    def __init__(self):
        self.supported_formats = [
            'csv', 'xlsx', 'json', 'xml',
            'punchout_cxml', 'ariba', 'coupa', 'sap'
        ]

    def generate_catalogue(
        self,
        tender_basket: TenderBasket,
        award: Award,
        vendor_responses: List[VendorResponse],
        contract_duration_months: Optional[int] = None
    ) -> List[CatalogueItem]:
        """
        Generate catalogue items from award

        Args:
            tender_basket: The tender basket
            award: The award decision
            vendor_responses: Vendor responses with final prices
            contract_duration_months: Contract duration (defaults to tender period)

        Returns:
            List of catalogue items
        """
        catalogue_items = []

        # Use tender period if not specified
        if contract_duration_months is None:
            contract_duration_months = tender_basket.tender_period_months

        # Calculate contract dates
        contract_start = datetime.now()
        contract_end = contract_start + timedelta(days=contract_duration_months * 30)

        # Create item lookup
        item_map = {item.id: item for item in tender_basket.line_items}

        # Create vendor response lookup
        vendor_response_map = {}
        for response in vendor_responses:
            for line_item in response.line_items:
                key = (response.vendor.id, line_item.line_item_id)
                vendor_response_map[key] = (response.vendor, line_item)

        # Process each awarded item
        for item_id, vendor_id in award.line_item_awards.items():
            tender_item = item_map.get(item_id)

            if not tender_item:
                continue

            # Get vendor response details
            key = (vendor_id, item_id)
            if key not in vendor_response_map:
                continue

            vendor, response_line = vendor_response_map[key]

            # Create catalogue item
            catalogue_item = CatalogueItem(
                product_code=tender_item.product_code,
                product_description=tender_item.product_description,
                supplier_name=vendor.name,
                supplier_id=vendor.id,
                unit_price=response_line.best_price,
                unit_of_measure=tender_item.unit_of_measure,
                category=tender_item.category,
                manufacturer=response_line.manufacturer,
                lead_time_days=response_line.lead_time_days,
                minimum_order_quantity=response_line.minimum_order_quantity,
                contract_number=f"CONTRACT-{award.id[:8]}",
                contract_start_date=contract_start,
                contract_end_date=contract_end
            )

            # Add additional attributes
            catalogue_item.attributes = {
                'lot_number': tender_item.lot_number or 'N/A',
                'tender_id': tender_basket.id,
                'award_id': award.id,
                'historical_avg_price': str(tender_item.avg_unit_price),
                'savings_vs_baseline': str(
                    tender_item.baseline_unit_price - response_line.best_price
                ),
                'award_strategy': award.award_strategy.value
            }

            catalogue_items.append(catalogue_item)

        return catalogue_items

    def export_to_csv(self, catalogue_items: List[CatalogueItem]) -> str:
        """Export catalogue to CSV format"""
        rows = []

        for item in catalogue_items:
            row = {
                'Product Code': item.product_code,
                'Description': item.product_description,
                'Supplier Name': item.supplier_name,
                'Supplier ID': item.supplier_id,
                'Unit Price': item.unit_price,
                'Unit of Measure': item.unit_of_measure,
                'Category': item.category,
                'Manufacturer': item.manufacturer or '',
                'Lead Time Days': item.lead_time_days or '',
                'Minimum Order Qty': item.minimum_order_quantity,
                'Contract Number': item.contract_number or '',
                'Contract Start': item.contract_start_date.isoformat() if item.contract_start_date else '',
                'Contract End': item.contract_end_date.isoformat() if item.contract_end_date else ''
            }

            # Add attributes as separate columns
            for key, value in item.attributes.items():
                row[f'Attribute: {key}'] = value

            rows.append(row)

        df = pd.DataFrame(rows)
        return df.to_csv(index=False)

    def export_to_excel(self, catalogue_items: List[CatalogueItem]) -> bytes:
        """Export catalogue to Excel format"""
        rows = []

        for item in catalogue_items:
            row = {
                'Product Code': item.product_code,
                'Description': item.product_description,
                'Supplier Name': item.supplier_name,
                'Supplier ID': item.supplier_id,
                'Unit Price': item.unit_price,
                'Unit of Measure': item.unit_of_measure,
                'Category': item.category,
                'Manufacturer': item.manufacturer or '',
                'Lead Time Days': item.lead_time_days or '',
                'Minimum Order Qty': item.minimum_order_quantity,
                'Contract Number': item.contract_number or '',
                'Contract Start': item.contract_start_date.isoformat() if item.contract_start_date else '',
                'Contract End': item.contract_end_date.isoformat() if item.contract_end_date else ''
            }

            for key, value in item.attributes.items():
                row[f'Attribute: {key}'] = value

            rows.append(row)

        df = pd.DataFrame(rows)

        # Write to bytes
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Catalogue', index=False)
        output.seek(0)

        return output.getvalue()

    def export_to_json(self, catalogue_items: List[CatalogueItem]) -> str:
        """Export catalogue to JSON format"""
        items = []

        for item in catalogue_items:
            item_dict = {
                'product_code': item.product_code,
                'description': item.product_description,
                'supplier': {
                    'name': item.supplier_name,
                    'id': item.supplier_id
                },
                'pricing': {
                    'unit_price': item.unit_price,
                    'unit_of_measure': item.unit_of_measure,
                    'minimum_order_quantity': item.minimum_order_quantity
                },
                'category': item.category,
                'manufacturer': item.manufacturer,
                'lead_time_days': item.lead_time_days,
                'contract': {
                    'number': item.contract_number,
                    'start_date': item.contract_start_date.isoformat() if item.contract_start_date else None,
                    'end_date': item.contract_end_date.isoformat() if item.contract_end_date else None
                },
                'attributes': item.attributes
            }

            items.append(item_dict)

        return json.dumps({'catalogue': items}, indent=2)

    def export_to_punchout_cxml(self, catalogue_items: List[CatalogueItem]) -> str:
        """Export catalogue to cXML PunchOut format"""
        # Simplified cXML structure
        cxml_header = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML version="1.2.014" xml:lang="en-US" timestamp="{timestamp}">
  <Header>
    <From>
      <Credential domain="NetworkId">
        <Identity>Procurement Platform</Identity>
      </Credential>
    </From>
    <To>
      <Credential domain="NetworkId">
        <Identity>Buyer</Identity>
      </Credential>
    </To>
    <Sender>
      <Credential domain="NetworkId">
        <Identity>Procurement Platform</Identity>
      </Credential>
    </Sender>
  </Header>
  <Message>
    <PunchOutOrderMessage>
      <BuyerCookie>session-id</BuyerCookie>
      <PunchOutOrderMessageHeader operationAllowed="create">
        <Total>
          <Money currency="USD">0.00</Money>
        </Total>
      </PunchOutOrderMessageHeader>
      <ItemIn quantity="1">
'''.format(timestamp=datetime.now().isoformat())

        items_xml = []
        for item in catalogue_items:
            item_xml = f'''        <ItemID>
          <SupplierPartID>{item.product_code}</SupplierPartID>
        </ItemID>
        <ItemDetail>
          <UnitPrice>
            <Money currency="USD">{item.unit_price}</Money>
          </UnitPrice>
          <Description xml:lang="en-US">{item.product_description}</Description>
          <UnitOfMeasure>{item.unit_of_measure}</UnitOfMeasure>
          <Classification domain="UNSPSC">Category: {item.category}</Classification>
          <ManufacturerPartID>{item.manufacturer or 'N/A'}</ManufacturerPartID>
          <ManufacturerName>{item.manufacturer or 'N/A'}</ManufacturerName>
          <LeadTime>{item.lead_time_days or 0}</LeadTime>
        </ItemDetail>
        <SupplierID domain="DUNS">{item.supplier_id}</SupplierID>
'''
            items_xml.append(item_xml)

        cxml_footer = '''      </ItemIn>
    </PunchOutOrderMessage>
  </Message>
</cXML>'''

        return cxml_header + '\n'.join(items_xml) + cxml_footer

    def export_to_ariba(self, catalogue_items: List[CatalogueItem]) -> str:
        """Export catalogue to SAP Ariba CIF format"""
        # Ariba uses CIF (Catalog Interchange Format) - simplified version
        rows = []

        for item in catalogue_items:
            row = {
                'Supplier Part ID': item.product_code,
                'Manufacturer Part ID': item.manufacturer or '',
                'Item Description': item.product_description,
                'Short Name': item.product_description[:40],
                'Supplier Name': item.supplier_name,
                'Supplier ID': item.supplier_id,
                'Manufacturer Name': item.manufacturer or '',
                'Unit Price': item.unit_price,
                'Unit of Measure': item.unit_of_measure,
                'Price Currency': 'USD',
                'Lead Time': item.lead_time_days or 0,
                'Minimum Order Quantity': item.minimum_order_quantity,
                'UNSPSC': '',
                'Category': item.category,
                'Image': '',
                'Long Description': item.product_description,
                'Contract ID': item.contract_number or '',
                'Contract Start Date': item.contract_start_date.strftime('%Y-%m-%d') if item.contract_start_date else '',
                'Contract End Date': item.contract_end_date.strftime('%Y-%m-%d') if item.contract_end_date else ''
            }

            rows.append(row)

        df = pd.DataFrame(rows)
        return df.to_csv(index=False, sep='\t')  # Tab-delimited for Ariba

    def export_to_coupa(self, catalogue_items: List[CatalogueItem]) -> str:
        """Export catalogue to Coupa CSV format"""
        rows = []

        for item in catalogue_items:
            row = {
                'Item Number': item.product_code,
                'Item Description': item.product_description,
                'Supplier Name': item.supplier_name,
                'Supplier Item Number': item.product_code,
                'Manufacturer Name': item.manufacturer or '',
                'Manufacturer Part Number': item.product_code,
                'Price': item.unit_price,
                'Currency': 'USD',
                'UOM': item.unit_of_measure,
                'Lead Time Days': item.lead_time_days or 0,
                'Minimum Order Quantity': item.minimum_order_quantity,
                'Contract Name': item.contract_number or '',
                'Contract Start Date': item.contract_start_date.strftime('%Y-%m-%d') if item.contract_start_date else '',
                'Contract End Date': item.contract_end_date.strftime('%Y-%m-%d') if item.contract_end_date else '',
                'Commodity Name': item.category,
                'Active': 'Yes'
            }

            rows.append(row)

        df = pd.DataFrame(rows)
        return df.to_csv(index=False)

    def get_catalogue_summary(self, catalogue_items: List[CatalogueItem]) -> Dict:
        """Generate summary statistics for catalogue"""
        if not catalogue_items:
            return {
                'total_items': 0,
                'total_suppliers': 0,
                'categories': {},
                'average_price': 0
            }

        total_items = len(catalogue_items)
        unique_suppliers = len(set(item.supplier_id for item in catalogue_items))

        # Count by category
        categories = {}
        for item in catalogue_items:
            categories[item.category] = categories.get(item.category, 0) + 1

        # Calculate average price
        average_price = sum(item.unit_price for item in catalogue_items) / total_items

        return {
            'total_items': total_items,
            'total_suppliers': unique_suppliers,
            'categories': categories,
            'average_price': average_price,
            'contract_numbers': list(set(
                item.contract_number for item in catalogue_items if item.contract_number
            ))
        }
