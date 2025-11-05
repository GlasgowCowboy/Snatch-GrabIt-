# PO/AP Tender & Auction Tool

A comprehensive procurement platform for converting Purchase Order (PO) and Accounts Payable (AP) data into collaborative tender processes and reverse auctions.

## Overview

This tool streamlines the entire procurement lifecycle for public sector organizations (central government, healthcare, defense):

1. **Data Ingestion**: Upload PO/AP data (12-24 months historical)
2. **Aggregation**: Consolidate line items across multiple organizations
3. **Tender Creation**: Generate basket of goods and commercial model
4. **Vendor Response**: Collect baseline pricing from suppliers
5. **Reverse Auction**: Dynamic defense auction for best and final offers
6. **Award Analysis**: Compare bids by whole tender, lots, or line items
7. **Catalogue Export**: Generate P2P/e-marketplace compatible catalogues

## Features

- **Multi-Organization Support**: Collaborative procurement across multiple buying authorities
- **Data Consolidation**: Automatic aggregation of identical products with quantity rollup
- **Flexible Award Strategies**:
  - Single vendor (whole tender)
  - Multiple vendors by lots (categories)
  - Multiple vendors by individual line items
- **Reverse Auction**: Best and final offer bidding below baseline
- **Export Formats**: Compatible with major P2P and e-marketplace systems

## Supported Product Categories

- Office supplies
- IT hardware and software
- Clinical goods (medical devices, implants)
- Medical supplies (gauzes, disposables)
- Janitorial services and cleaning supplies
- General inventory items

## Architecture

- **Backend**: Python with Flask/FastAPI
- **Data Processing**: Pandas for PO/AP aggregation
- **Database**: SQLite/PostgreSQL
- **Frontend**: HTML/JavaScript web interface
- **File Formats**: CSV, Excel, JSON

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py
```

## Workflow

```
PO/AP Upload → Aggregation → Tender Basket → Vendor Response →
Reverse Auction → Award Comparison → Catalogue Export
```

## License

MIT
