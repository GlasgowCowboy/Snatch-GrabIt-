# API Documentation

Complete API reference for the PO/AP Tender & Auction Tool.

## Base URL

```
http://localhost:5000/api
```

## Authentication

Currently no authentication required (add in production).

---

## Organizations

### Create Organization

**POST** `/api/organizations`

Create a new buying organization/authority.

**Request Body:**
```json
{
  "name": "General Hospital Trust",
  "sector": "healthcare",
  "contact_email": "procurement@hospital.nhs.uk",
  "address": "123 Hospital Road, London"
}
```

**Response:**
```json
{
  "organization_id": "ORG-0001",
  "name": "General Hospital Trust"
}
```

---

## Vendors

### Register Vendor

**POST** `/api/vendors`

Register a new vendor/supplier.

**Request Body:**
```json
{
  "name": "MegaSupply Corp",
  "contact_email": "sales@megasupply.com",
  "registration_number": "12345678",
  "address": "456 Supply Street, Manchester"
}
```

**Response:**
```json
{
  "vendor_id": "VENDOR-0001",
  "name": "MegaSupply Corp"
}
```

---

## Data Upload

### Upload PO/AP Data

**POST** `/api/upload-po-data`

Upload Purchase Order / Accounts Payable data for an organization.

**Content-Type:** `multipart/form-data`

**Form Data:**
- `file`: CSV or Excel file
- `organization_id`: Organization ID

**Response:**
```json
{
  "status": "success",
  "organization_id": "ORG-0001",
  "items_uploaded": 150,
  "summary": {
    "valid": true,
    "count": 150,
    "total_value": 125000.50,
    "unique_products": 45,
    "unique_suppliers": 12,
    "unique_pos": 23
  }
}
```

### Get CSV Template

**GET** `/api/template/csv`

Download CSV template for PO/AP data upload.

**Response:** CSV file download

---

## Aggregation

### Aggregate Data

**POST** `/api/aggregate`

Consolidate PO/AP data across organizations.

**Request Body:**
```json
{
  "organization_ids": ["ORG-0001", "ORG-0002"]
}
```

**Response:**
```json
{
  "aggregated_id": "AGG-20240315120000",
  "summary": {
    "total_items": 45,
    "total_value": 125000.50,
    "categories": {
      "Office Supplies": 15,
      "Medical Supplies": 20,
      "IT Hardware": 10
    },
    "participating_organizations": 2
  },
  "organizations": 2
}
```

---

## Tender Management

### Create Tender

**POST** `/api/create-tender`

Create a tender basket from aggregated data.

**Request Body:**
```json
{
  "aggregated_id": "AGG-20240315120000",
  "name": "Multi-Category Procurement Tender 2024",
  "description": "Collaborative procurement across multiple categories",
  "organization_ids": ["ORG-0001", "ORG-0002"],
  "award_strategy": "by_lots",
  "tender_period_months": 24
}
```

**Award Strategies:**
- `whole_tender`: Single vendor wins everything
- `by_lots`: Multiple vendors by category groups
- `by_line_item`: Multiple vendors by individual items

**Response:**
```json
{
  "tender_id": "uuid-here",
  "summary": {
    "id": "uuid-here",
    "name": "Multi-Category Procurement Tender 2024",
    "status": "draft",
    "total_items": 45,
    "total_lots": 3,
    "total_value": 125000.50,
    "organizations": 2,
    "award_strategy": "by_lots"
  }
}
```

### Get Tender Document

**GET** `/api/tender/{tender_id}/document`

Retrieve complete tender documentation.

**Response:**
```json
{
  "tender_id": "uuid-here",
  "tender_name": "Multi-Category Procurement Tender 2024",
  "tender_description": "...",
  "estimated_total_value": 125000.50,
  "award_strategy": "by_lots",
  "participating_organizations": [...],
  "lots": [...],
  "line_items": [...],
  "terms_and_conditions": {...},
  "response_instructions": {...}
}
```

---

## Vendor Responses

### Submit Vendor Response

**POST** `/api/vendor-response`

Submit vendor response to tender with baseline pricing.

**Request Body:**
```json
{
  "tender_id": "uuid-here",
  "vendor_id": "VENDOR-0001",
  "line_items": [
    {
      "line_item_id": "item-uuid-1",
      "baseline_unit_price": 142.50,
      "lead_time_days": 14,
      "minimum_order_quantity": 1.0,
      "manufacturer": "ErgoChair Corp",
      "notes": "Premium quality"
    }
  ],
  "notes": "We can supply all items"
}
```

**Response:**
```json
{
  "response_id": "RESP-0001",
  "total_value": 118000.00
}
```

---

## Reverse Auction

### Create Auction

**POST** `/api/auction/create`

Create a reverse auction event (Dynamic Defense).

**Request Body:**
```json
{
  "tender_id": "uuid-here",
  "duration_hours": 2,
  "minimum_decrement_percentage": 0.5
}
```

**Response:**
```json
{
  "auction_id": "auction-uuid",
  "start_time": "2024-03-15T10:00:00Z",
  "end_time": "2024-03-15T12:00:00Z",
  "participating_vendors": 3
}
```

### Start Auction

**POST** `/api/auction/{auction_id}/start`

Start the auction.

**Response:**
```json
{
  "status": "active"
}
```

### Submit Bid

**POST** `/api/auction/bid`

Submit a bid during reverse auction.

**Request Body:**
```json
{
  "auction_id": "auction-uuid",
  "line_item_id": "item-uuid",
  "vendor_id": "VENDOR-0001",
  "unit_price": 138.00,
  "baseline_price": 142.50
}
```

**Response:**
```json
{
  "bid_id": "bid-uuid",
  "rank": 1
}
```

### Get Auction Results

**GET** `/api/auction/{auction_id}/results?tender_id={tender_id}`

Get final auction results.

**Response:**
```json
{
  "auction_id": "auction-uuid",
  "tender_basket_id": "tender-uuid",
  "total_bids": 45,
  "participating_vendors": 3,
  "baseline_total_value": 125000.50,
  "auction_total_value": 115000.00,
  "total_savings": 10000.50,
  "savings_percentage": 8.0,
  "winners": {
    "item-uuid-1": {
      "vendor_id": "VENDOR-0001",
      "final_unit_price": 138.00,
      "savings": 450.00
    }
  }
}
```

---

## Award Management

### Compare Award Strategies

**POST** `/api/award/compare`

Compare different award strategies.

**Request Body:**
```json
{
  "tender_id": "uuid-here",
  "auction_id": "auction-uuid"
}
```

**Response:**
```json
{
  "whole_tender": {
    "viable": true,
    "winner": {
      "vendor_id": "VENDOR-0001",
      "vendor_name": "MegaSupply Corp",
      "total_value": 115000.00,
      "savings": 10000.50,
      "savings_percentage": 8.0
    }
  },
  "by_lots": {
    "viable": true,
    "total_value": 112000.00,
    "total_savings": 13000.50,
    "savings_percentage": 10.4,
    "vendors_awarded": 2
  },
  "by_line_item": {
    "viable": true,
    "total_value": 110000.00,
    "total_savings": 15000.50,
    "savings_percentage": 12.0,
    "vendors_awarded": 3
  },
  "recommendation": {
    "recommended_strategy": "by_line_item",
    "reason": "Provides best savings (12.0%)"
  }
}
```

### Create Award

**POST** `/api/award/create`

Create award based on chosen strategy.

**Request Body:**
```json
{
  "tender_id": "uuid-here",
  "auction_id": "auction-uuid",
  "award_strategy": "by_line_item"
}
```

**Response:**
```json
{
  "award_id": "award-uuid",
  "summary": {
    "award_id": "award-uuid",
    "award_strategy": "by_line_item",
    "total_value": 110000.00,
    "estimated_savings": 15000.50,
    "savings_percentage": 12.0,
    "awarded_vendors": 3,
    "awarded_items": 45
  }
}
```

---

## Catalogue Export

### Export Catalogue

**GET** `/api/catalogue/{award_id}?format={format}`

Export catalogue in various formats for P2P/e-marketplace systems.

**Query Parameters:**
- `format`: `csv`, `xlsx`, `json`, `ariba`, `coupa`

**Response:** File download in requested format

**Supported Formats:**
- **CSV**: Generic CSV format
- **XLSX**: Excel format
- **JSON**: Structured JSON
- **Ariba**: SAP Ariba CIF format (tab-delimited)
- **Coupa**: Coupa CSV format

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": "Error message description"
}
```

**Status Codes:**
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `404`: Not Found
- `500`: Internal Server Error

---

## Data Models

### PO Line Item CSV Format

```csv
po_number,line_number,product_code,product_description,quantity,unit_of_measure,unit_price,total_price,supplier_name,date_ordered,category,manufacturer
PO-2024-001,1,PROD-001,Office Chair,10,EA,150.00,1500.00,ABC Supplies,2024-01-15,Office Furniture,ErgoChair Inc
```

**Required Fields:**
- `po_number`
- `product_code`
- `product_description`
- `quantity`
- `unit_price`
- `supplier_name`

**Optional Fields:**
- `line_number` (auto-generated if missing)
- `unit_of_measure` (defaults to 'EA')
- `total_price` (calculated if missing)
- `date_ordered` (defaults to current date)
- `category`
- `manufacturer`

---

## Workflow Example

Complete workflow using the API:

```bash
# 1. Create organization
curl -X POST http://localhost:5000/api/organizations \
  -H "Content-Type: application/json" \
  -d '{"name":"Hospital Trust","sector":"healthcare","contact_email":"proc@hospital.nhs.uk"}'

# 2. Upload PO data
curl -X POST http://localhost:5000/api/upload-po-data \
  -F "file=@po_data.csv" \
  -F "organization_id=ORG-0001"

# 3. Aggregate data
curl -X POST http://localhost:5000/api/aggregate \
  -H "Content-Type: application/json" \
  -d '{"organization_ids":["ORG-0001"]}'

# 4. Create tender
curl -X POST http://localhost:5000/api/create-tender \
  -H "Content-Type: application/json" \
  -d '{"aggregated_id":"AGG-20240315120000","name":"Tender 2024","description":"Annual procurement","organization_ids":["ORG-0001"],"award_strategy":"by_lots"}'

# 5. Submit vendor response
curl -X POST http://localhost:5000/api/vendor-response \
  -H "Content-Type: application/json" \
  -d '{"tender_id":"tender-uuid","vendor_id":"VENDOR-0001","line_items":[...]}'

# 6. Create auction
curl -X POST http://localhost:5000/api/auction/create \
  -H "Content-Type: application/json" \
  -d '{"tender_id":"tender-uuid","duration_hours":2}'

# 7. Create award
curl -X POST http://localhost:5000/api/award/create \
  -H "Content-Type: application/json" \
  -d '{"tender_id":"tender-uuid","auction_id":"auction-uuid","award_strategy":"by_lots"}'

# 8. Export catalogue
curl -O http://localhost:5000/api/catalogue/award-uuid?format=csv
```
