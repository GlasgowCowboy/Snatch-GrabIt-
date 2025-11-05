"""
Example Workflow Demonstration
Complete end-to-end workflow for PO/AP Tender & Auction Tool
"""
import io
import csv
from datetime import datetime

from models import (
    Organization, Vendor, VendorResponse, VendorResponseLineItem,
    AwardStrategy
)
from ingestion import POAPIngestion
from aggregation import AggregationEngine
from tender import TenderManager
from auction import AuctionManager
from award import AwardEngine
from catalogue import CatalogueGenerator


def create_sample_po_data():
    """Create sample PO/AP data for demonstration"""
    sample_data = """po_number,line_number,product_code,product_description,quantity,unit_of_measure,unit_price,total_price,supplier_name,date_ordered,category,manufacturer
PO-2024-001,1,OFF-001,Office Chair Ergonomic Black,10,EA,150.00,1500.00,Office Supplies Inc,2024-01-15,Office Furniture,ErgoChair Corp
PO-2024-001,2,OFF-002,Standing Desk Electric 60x30,5,EA,450.00,2250.00,Office Supplies Inc,2024-01-15,Office Furniture,DeskMaker Ltd
PO-2024-002,1,MED-001,Surgical Gloves Latex Size M,1000,BOX,12.50,12500.00,Medical Supplies Ltd,2024-01-20,Medical Supplies,MediGlove Inc
PO-2024-002,2,MED-002,Face Masks Type IIR,2000,BOX,8.00,16000.00,Medical Supplies Ltd,2024-01-20,Medical Supplies,SafeMask Co
PO-2024-003,1,IT-001,Laptop Dell Latitude 5520 i5 16GB,5,EA,1200.00,6000.00,Tech Distributors,2024-02-01,IT Hardware,Dell
PO-2024-003,2,IT-002,Monitor LG 27 inch 4K,10,EA,350.00,3500.00,Tech Distributors,2024-02-01,IT Hardware,LG
PO-2024-004,1,OFF-001,Office Chair Ergonomic Black,15,EA,155.00,2325.00,Furniture World,2024-02-10,Office Furniture,ErgoChair Corp
PO-2024-005,1,MED-001,Surgical Gloves Latex Size M,500,BOX,13.00,6500.00,Healthcare Supplies,2024-02-15,Medical Supplies,MediGlove Inc
PO-2024-006,1,CLIN-001,Hip Implant Titanium Ceramic,3,EA,2500.00,7500.00,MedTech Devices,2024-03-01,Clinical Goods,BioImplant Ltd
PO-2024-007,1,CLEAN-001,Disinfectant Spray Hospital Grade 5L,100,EA,15.00,1500.00,Cleaning Solutions,2024-03-05,Janitorial Supplies,CleanPro"""

    return sample_data.encode('utf-8')


def run_complete_workflow():
    """Run complete procurement workflow"""
    print("=" * 80)
    print("PO/AP TENDER & AUCTION TOOL - COMPLETE WORKFLOW DEMONSTRATION")
    print("=" * 80)

    # Initialize components
    ingestion = POAPIngestion()
    aggregation = AggregationEngine()
    tender_mgr = TenderManager()
    auction_mgr = AuctionManager()
    award_eng = AwardEngine()
    catalogue_gen = CatalogueGenerator()

    # Step 1: Create Organizations
    print("\n[STEP 1] Creating Organizations...")
    org1 = Organization(
        id="ORG-001",
        name="General Hospital Trust",
        sector="healthcare",
        contact_email="procurement@hospital.nhs.uk"
    )

    org2 = Organization(
        id="ORG-002",
        name="Department of Defense Procurement",
        sector="defense",
        contact_email="procurement@mod.gov.uk"
    )

    print(f"✓ Created: {org1.name} ({org1.sector})")
    print(f"✓ Created: {org2.name} ({org2.sector})")

    # Step 2: Upload PO/AP Data
    print("\n[STEP 2] Uploading PO/AP Data...")
    po_csv_data = create_sample_po_data()

    line_items_org1 = ingestion.parse_csv(po_csv_data, org1.id)
    validation = ingestion.validate_line_items(line_items_org1)

    print(f"✓ Uploaded {validation['count']} line items for {org1.name}")
    print(f"  - Total Value: £{validation['total_value']:,.2f}")
    print(f"  - Unique Products: {validation['unique_products']}")
    print(f"  - Unique Suppliers: {validation['unique_suppliers']}")

    # Step 3: Aggregate Data
    print("\n[STEP 3] Aggregating Line Items...")
    org_line_items = {org1.id: line_items_org1}
    aggregated_items = aggregation.merge_organizations(org_line_items)
    agg_summary = aggregation.get_aggregation_summary(aggregated_items)

    print(f"✓ Aggregated {agg_summary['total_items']} unique products")
    print(f"  - Total Value: £{agg_summary['total_value']:,.2f}")
    print(f"  - Categories: {len(agg_summary['categories'])}")
    print(f"  - Lots: {len(agg_summary['lots'])}")

    # Step 4: Create Tender Basket
    print("\n[STEP 4] Creating Tender Basket...")
    tender = tender_mgr.create_tender_basket(
        name="Multi-Category Procurement Tender 2024",
        description="Collaborative procurement for office supplies, medical supplies, IT hardware, and clinical goods",
        line_items=aggregated_items,
        organizations=[org1, org2],
        award_strategy=AwardStrategy.BY_LOTS,
        tender_period_months=24
    )

    print(f"✓ Tender Created: {tender.name}")
    print(f"  - Tender ID: {tender.id}")
    print(f"  - Total Items: {len(tender.line_items)}")
    print(f"  - Estimated Value: £{tender.estimated_total_value:,.2f}")
    print(f"  - Award Strategy: {tender.award_strategy.value}")

    # Generate tender document
    tender_doc = tender_mgr.generate_tender_document(tender)
    print(f"\n✓ Tender Documentation Generated")
    print(f"  - Lots: {len(tender_doc['lots'])}")

    # Step 5: Register Vendors
    print("\n[STEP 5] Registering Vendors...")
    vendor1 = Vendor(
        id="VENDOR-001",
        name="MegaSupply Corp",
        contact_email="sales@megasupply.com"
    )

    vendor2 = Vendor(
        id="VENDOR-002",
        name="Quality Medical Supplies Ltd",
        contact_email="tenders@qms.com"
    )

    vendor3 = Vendor(
        id="VENDOR-003",
        name="TechSource Distributors",
        contact_email="procurement@techsource.com"
    )

    print(f"✓ Registered {vendor1.name}")
    print(f"✓ Registered {vendor2.name}")
    print(f"✓ Registered {vendor3.name}")

    # Step 6: Collect Vendor Responses
    print("\n[STEP 6] Collecting Vendor Responses...")

    # Vendor 1 Response (responds to all items with competitive pricing)
    response1_items = []
    for item in tender.line_items:
        # Bid 5% below baseline
        response1_items.append(VendorResponseLineItem(
            tender_basket_id=tender.id,
            line_item_id=item.id,
            vendor_id=vendor1.id,
            baseline_unit_price=item.baseline_unit_price * 0.95,
            lead_time_days=14
        ))

    response1 = VendorResponse(
        id="RESP-001",
        tender_basket_id=tender.id,
        vendor=vendor1,
        submission_date=datetime.now(),
        line_items=response1_items
    )
    response1.calculate_total_value(tender)

    # Vendor 2 Response (responds only to medical/clinical items with best pricing)
    response2_items = []
    for item in tender.line_items:
        if item.category in ['Medical Supplies', 'Clinical Goods']:
            # Bid 10% below baseline
            response2_items.append(VendorResponseLineItem(
                tender_basket_id=tender.id,
                line_item_id=item.id,
                vendor_id=vendor2.id,
                baseline_unit_price=item.baseline_unit_price * 0.90,
                lead_time_days=21
            ))

    response2 = VendorResponse(
        id="RESP-002",
        tender_basket_id=tender.id,
        vendor=vendor2,
        submission_date=datetime.now(),
        line_items=response2_items
    )
    response2.calculate_total_value(tender)

    # Vendor 3 Response (responds only to IT items)
    response3_items = []
    for item in tender.line_items:
        if item.category == 'IT Hardware':
            # Bid 7% below baseline
            response3_items.append(VendorResponseLineItem(
                tender_basket_id=tender.id,
                line_item_id=item.id,
                vendor_id=vendor3.id,
                baseline_unit_price=item.baseline_unit_price * 0.93,
                lead_time_days=10
            ))

    response3 = VendorResponse(
        id="RESP-003",
        tender_basket_id=tender.id,
        vendor=vendor3,
        submission_date=datetime.now(),
        line_items=response3_items
    )
    response3.calculate_total_value(tender)

    all_responses = [response1, response2, response3]

    print(f"✓ {vendor1.name}: £{response1.total_value:,.2f} ({len(response1.line_items)} items)")
    print(f"✓ {vendor2.name}: £{response2.total_value:,.2f} ({len(response2.line_items)} items)")
    print(f"✓ {vendor3.name}: £{response3.total_value:,.2f} ({len(response3.line_items)} items)")

    # Step 7: Create and Run Reverse Auction
    print("\n[STEP 7] Running Reverse Auction (Dynamic Defense)...")
    auction = auction_mgr.create_auction(
        tender_basket=tender,
        vendor_responses=all_responses,
        duration_hours=2,
        minimum_decrement_percentage=0.5
    )
    auction_mgr.start_auction(auction.id)

    print(f"✓ Auction Created: {auction.id}")
    print(f"  - Duration: 2 hours")
    print(f"  - Participating Vendors: {len(auction.vendor_ids)}")

    # Simulate some auction bids (vendors bidding down from baseline)
    print("\n  Simulating Auction Bids...")
    bid_count = 0

    for item in tender.line_items[:3]:  # Simulate bids on first 3 items
        # Vendor 1 improves their bid
        if item.category != 'Medical Supplies':
            bid = auction_mgr.submit_bid(
                auction_id=auction.id,
                line_item_id=item.id,
                vendor_id=vendor1.id,
                unit_price=item.baseline_unit_price * 0.92,  # 8% reduction
                baseline_price=item.baseline_unit_price * 0.95
            )
            if bid:
                bid_count += 1
                print(f"    • {vendor1.name} bid £{bid.unit_price:.2f} on {item.product_code}")

    print(f"  ✓ {bid_count} auction bids submitted")

    # Close auction and get results
    auction_mgr.close_auction(auction.id)
    auction_results = auction_mgr.get_auction_results(auction.id, tender)

    print(f"\n✓ Auction Closed")
    print(f"  - Total Bids: {auction_results['total_bids']}")
    print(f"  - Baseline Total: £{auction_results['baseline_total_value']:,.2f}")
    print(f"  - Auction Total: £{auction_results['auction_total_value']:,.2f}")
    print(f"  - Total Savings: £{auction_results['total_savings']:,.2f} ({auction_results['savings_percentage']:.1f}%)")

    # Update vendor responses with auction results
    updated_responses = auction_mgr.update_vendor_responses_with_auction_results(
        auction.id, all_responses
    )

    # Step 8: Compare Award Strategies
    print("\n[STEP 8] Comparing Award Strategies...")
    comparison = award_eng.compare_responses(tender, updated_responses)

    print(f"\n  Whole Tender Strategy:")
    if comparison['whole_tender']['viable']:
        winner = comparison['whole_tender']['winner']
        print(f"    Winner: {winner['vendor_name']}")
        print(f"    Total Value: £{winner['total_value']:,.2f}")
        print(f"    Savings: £{winner['savings']:,.2f} ({winner['savings_percentage']:.1f}%)")

    print(f"\n  By Lots Strategy:")
    if comparison['by_lots']['viable']:
        print(f"    Total Value: £{comparison['by_lots']['total_value']:,.2f}")
        print(f"    Savings: £{comparison['by_lots']['total_savings']:,.2f} ({comparison['by_lots']['savings_percentage']:.1f}%)")
        print(f"    Vendors Awarded: {comparison['by_lots']['vendors_awarded']}")

    print(f"\n  By Line Item Strategy:")
    if comparison['by_line_item']['viable']:
        print(f"    Total Value: £{comparison['by_line_item']['total_value']:,.2f}")
        print(f"    Savings: £{comparison['by_line_item']['total_savings']:,.2f} ({comparison['by_line_item']['savings_percentage']:.1f}%)")
        print(f"    Vendors Awarded: {comparison['by_line_item']['vendors_awarded']}")

    print(f"\n  Recommendation: {comparison['recommendation']['recommended_strategy']}")
    print(f"  Reason: {comparison['recommendation']['reason']}")

    # Step 9: Create Award
    print("\n[STEP 9] Creating Award...")
    award = award_eng.create_award(
        tender_basket=tender,
        vendor_responses=updated_responses,
        award_strategy=AwardStrategy.BY_LOTS
    )

    award_summary = award_eng.get_award_summary(award, tender)

    print(f"✓ Award Created: {award.id}")
    print(f"  - Strategy: {award_summary['award_strategy']}")
    print(f"  - Total Value: £{award_summary['total_value']:,.2f}")
    print(f"  - Savings: £{award_summary['estimated_savings']:,.2f} ({award_summary['savings_percentage']:.1f}%)")
    print(f"  - Awarded Vendors: {award_summary['awarded_vendors']}")
    print(f"  - Awarded Items: {award_summary['awarded_items']}")

    # Step 10: Generate Catalogue
    print("\n[STEP 10] Generating Catalogue...")
    catalogue_items = catalogue_gen.generate_catalogue(
        tender_basket=tender,
        award=award,
        vendor_responses=updated_responses
    )

    catalogue_summary = catalogue_gen.get_catalogue_summary(catalogue_items)

    print(f"✓ Catalogue Generated")
    print(f"  - Total Items: {catalogue_summary['total_items']}")
    print(f"  - Suppliers: {catalogue_summary['total_suppliers']}")
    print(f"  - Categories: {len(catalogue_summary['categories'])}")

    # Export to different formats
    print("\n  Exporting to Multiple Formats...")
    csv_export = catalogue_gen.export_to_csv(catalogue_items)
    json_export = catalogue_gen.export_to_json(catalogue_items)
    ariba_export = catalogue_gen.export_to_ariba(catalogue_items)
    coupa_export = catalogue_gen.export_to_coupa(catalogue_items)

    print(f"    ✓ CSV export: {len(csv_export)} bytes")
    print(f"    ✓ JSON export: {len(json_export)} bytes")
    print(f"    ✓ Ariba CIF export: {len(ariba_export)} bytes")
    print(f"    ✓ Coupa export: {len(coupa_export)} bytes")

    # Summary
    print("\n" + "=" * 80)
    print("WORKFLOW COMPLETE!")
    print("=" * 80)
    print(f"\nSummary:")
    print(f"  Original PO Value: £{validation['total_value']:,.2f}")
    print(f"  Tender Value: £{tender.estimated_total_value:,.2f}")
    print(f"  Award Value: £{award_summary['total_value']:,.2f}")
    print(f"  Total Savings: £{award_summary['estimated_savings']:,.2f} ({award_summary['savings_percentage']:.1f}%)")
    print(f"  Participating Organizations: {len(tender.organizations)}")
    print(f"  Vendors Responding: {len(all_responses)}")
    print(f"  Vendors Awarded: {award_summary['awarded_vendors']}")
    print(f"  Catalogue Items: {catalogue_summary['total_items']}")
    print("\n✓ Catalogue ready for upload to P2P/e-marketplace systems")


if __name__ == "__main__":
    run_complete_workflow()
