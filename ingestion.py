"""
PO/AP Data Ingestion Module
Handles uploading and parsing of Purchase Order and Accounts Payable data
"""
import pandas as pd
from typing import List, Dict, Optional
from datetime import datetime
from models import POLineItem, Organization
import io


class POAPIngestion:
    """Handles ingestion of PO/AP data from various formats"""

    def __init__(self):
        self.supported_formats = ['csv', 'xlsx', 'xls']

    def parse_csv(self, file_content: bytes, organization_id: str) -> List[POLineItem]:
        """Parse CSV file containing PO/AP data"""
        df = pd.read_csv(io.BytesIO(file_content))
        return self._dataframe_to_line_items(df, organization_id)

    def parse_excel(self, file_content: bytes, organization_id: str, sheet_name: str = 0) -> List[POLineItem]:
        """Parse Excel file containing PO/AP data"""
        df = pd.read_excel(io.BytesIO(file_content), sheet_name=sheet_name)
        return self._dataframe_to_line_items(df, organization_id)

    def _dataframe_to_line_items(self, df: pd.DataFrame, organization_id: str) -> List[POLineItem]:
        """Convert DataFrame to list of POLineItem objects"""
        line_items = []

        # Normalize column names (case-insensitive matching)
        df.columns = df.columns.str.strip().str.lower()

        # Define column mapping (flexible field names)
        column_mapping = {
            'po_number': ['po_number', 'po number', 'purchase_order', 'po', 'order_number'],
            'line_number': ['line_number', 'line number', 'line_no', 'line', 'item_line'],
            'product_code': ['product_code', 'product code', 'item_code', 'sku', 'material_number'],
            'product_description': ['product_description', 'description', 'item_description', 'product_name', 'item'],
            'quantity': ['quantity', 'qty', 'order_quantity', 'amount'],
            'unit_of_measure': ['unit_of_measure', 'uom', 'unit', 'measure'],
            'unit_price': ['unit_price', 'unit price', 'price', 'unit_cost'],
            'total_price': ['total_price', 'total price', 'total', 'line_total', 'extended_price'],
            'supplier_name': ['supplier_name', 'supplier', 'vendor', 'vendor_name'],
            'date_ordered': ['date_ordered', 'order_date', 'date', 'po_date'],
            'category': ['category', 'product_category', 'item_category', 'class'],
            'manufacturer': ['manufacturer', 'mfg', 'brand', 'make']
        }

        # Find actual column names in dataframe
        actual_columns = {}
        for standard_name, possible_names in column_mapping.items():
            for col in df.columns:
                if col in possible_names:
                    actual_columns[standard_name] = col
                    break

        # Validate required columns
        required_columns = ['po_number', 'product_code', 'product_description', 'quantity', 'unit_price', 'supplier_name']
        missing_columns = [col for col in required_columns if col not in actual_columns]

        if missing_columns:
            raise ValueError(f"Missing required columns: {missing_columns}. Available columns: {list(df.columns)}")

        # Convert rows to POLineItem objects
        for idx, row in df.iterrows():
            try:
                # Extract values with fallbacks
                po_number = str(row[actual_columns['po_number']])
                line_number = int(row[actual_columns['line_number']]) if 'line_number' in actual_columns else idx + 1

                product_code = str(row[actual_columns['product_code']])
                product_description = str(row[actual_columns['product_description']])

                quantity = float(row[actual_columns['quantity']])
                unit_of_measure = str(row[actual_columns.get('unit_of_measure', 'EA')]) if 'unit_of_measure' in actual_columns else 'EA'

                unit_price = float(row[actual_columns['unit_price']])

                # Calculate or use provided total
                if 'total_price' in actual_columns and pd.notna(row[actual_columns['total_price']]):
                    total_price = float(row[actual_columns['total_price']])
                else:
                    total_price = quantity * unit_price

                supplier_name = str(row[actual_columns['supplier_name']])

                # Parse date
                if 'date_ordered' in actual_columns:
                    date_ordered = pd.to_datetime(row[actual_columns['date_ordered']])
                else:
                    date_ordered = datetime.now()

                # Optional fields
                category = str(row[actual_columns['category']]) if 'category' in actual_columns and pd.notna(row[actual_columns['category']]) else None
                manufacturer = str(row[actual_columns['manufacturer']]) if 'manufacturer' in actual_columns and pd.notna(row[actual_columns['manufacturer']]) else None

                # Create line item
                line_item = POLineItem(
                    po_number=po_number,
                    organization_id=organization_id,
                    line_number=line_number,
                    product_code=product_code,
                    product_description=product_description,
                    quantity=quantity,
                    unit_of_measure=unit_of_measure,
                    unit_price=unit_price,
                    total_price=total_price,
                    supplier_name=supplier_name,
                    date_ordered=date_ordered,
                    category=category,
                    manufacturer=manufacturer
                )

                line_items.append(line_item)

            except Exception as e:
                print(f"Error parsing row {idx}: {e}")
                continue

        return line_items

    def validate_line_items(self, line_items: List[POLineItem]) -> Dict[str, any]:
        """Validate parsed line items and return summary"""
        if not line_items:
            return {
                'valid': False,
                'error': 'No line items parsed',
                'count': 0
            }

        total_value = sum(item.total_price for item in line_items)
        unique_products = len(set(item.product_code for item in line_items))
        unique_suppliers = len(set(item.supplier_name for item in line_items))
        unique_pos = len(set(item.po_number for item in line_items))

        return {
            'valid': True,
            'count': len(line_items),
            'total_value': total_value,
            'unique_products': unique_products,
            'unique_suppliers': unique_suppliers,
            'unique_pos': unique_pos,
            'date_range': {
                'earliest': min(item.date_ordered for item in line_items),
                'latest': max(item.date_ordered for item in line_items)
            }
        }

    def get_template_csv(self) -> str:
        """Return CSV template for PO/AP data upload"""
        template = """po_number,line_number,product_code,product_description,quantity,unit_of_measure,unit_price,total_price,supplier_name,date_ordered,category,manufacturer
PO-2024-001,1,PROD-001,Office Chair Ergonomic,10,EA,150.00,1500.00,ABC Office Supplies,2024-01-15,Office Furniture,ErgoChair Inc
PO-2024-001,2,PROD-002,Desk Lamp LED,25,EA,35.00,875.00,ABC Office Supplies,2024-01-15,Office Supplies,BrightLight Co
PO-2024-002,1,MED-001,Surgical Gloves Latex Size M,1000,BOX,12.50,12500.00,Medical Supplies Ltd,2024-01-20,Medical Supplies,MediCare
PO-2024-003,1,IT-001,Laptop Dell Latitude 5520,5,EA,1200.00,6000.00,Tech Distributors,2024-02-01,IT Hardware,Dell"""
        return template

    def get_template_excel_columns(self) -> List[str]:
        """Return list of expected Excel columns"""
        return [
            'po_number',
            'line_number',
            'product_code',
            'product_description',
            'quantity',
            'unit_of_measure',
            'unit_price',
            'total_price',
            'supplier_name',
            'date_ordered',
            'category',
            'manufacturer'
        ]
