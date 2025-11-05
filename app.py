"""
Main Flask Application
PO/AP Tender & Auction Tool
"""
from flask import Flask, request, jsonify, send_file, render_template_string
from werkzeug.utils import secure_filename
import io
import os
from datetime import datetime

from models import (
    Organization, Vendor, VendorResponse, VendorResponseLineItem,
    AwardStrategy, TenderStatus
)
from ingestion import POAPIngestion
from aggregation import AggregationEngine
from tender import TenderManager
from auction import AuctionManager
from award import AwardEngine
from catalogue import CatalogueGenerator


app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Initialize components
ingestion_engine = POAPIngestion()
aggregation_engine = AggregationEngine()
tender_manager = TenderManager()
auction_manager = AuctionManager()
award_engine = AwardEngine()
catalogue_generator = CatalogueGenerator()

# In-memory storage (replace with database in production)
organizations = {}
vendors = {}
po_data = {}  # org_id -> [POLineItem]
tender_baskets = {}
vendor_responses = {}  # tender_id -> [VendorResponse]
awards = {}


@app.route('/')
def index():
    """Home page with workflow overview"""
    html = '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>PO/AP Tender & Auction Tool</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
            h1 { color: #333; }
            h2 { color: #666; margin-top: 30px; }
            .workflow { display: flex; justify-content: space-between; margin: 30px 0; }
            .step { flex: 1; padding: 20px; margin: 5px; background: #e3f2fd; border-radius: 5px; text-align: center; }
            .step h3 { margin: 0; color: #1976d2; }
            .step p { font-size: 12px; color: #666; }
            .endpoint { background: #f9f9f9; padding: 10px; margin: 10px 0; border-left: 4px solid #1976d2; }
            .method { display: inline-block; padding: 2px 8px; background: #4caf50; color: white; border-radius: 3px; font-size: 12px; margin-right: 10px; }
            .method.get { background: #2196f3; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>PO/AP Tender & Auction Tool</h1>
            <p>Comprehensive procurement platform for collaborative tendering and reverse auctions</p>

            <div class="workflow">
                <div class="step">
                    <h3>1. Upload</h3>
                    <p>PO/AP Data</p>
                </div>
                <div class="step">
                    <h3>2. Aggregate</h3>
                    <p>Consolidate Items</p>
                </div>
                <div class="step">
                    <h3>3. Tender</h3>
                    <p>Create Basket</p>
                </div>
                <div class="step">
                    <h3>4. Response</h3>
                    <p>Vendor Pricing</p>
                </div>
                <div class="step">
                    <h3>5. Auction</h3>
                    <p>Reverse Bidding</p>
                </div>
                <div class="step">
                    <h3>6. Award</h3>
                    <p>Compare & Decide</p>
                </div>
                <div class="step">
                    <h3>7. Export</h3>
                    <p>Generate Catalogue</p>
                </div>
            </div>

            <h2>API Endpoints</h2>

            <div class="endpoint">
                <span class="method">POST</span>
                <code>/api/organizations</code> - Create organization
            </div>

            <div class="endpoint">
                <span class="method">POST</span>
                <code>/api/vendors</code> - Register vendor
            </div>

            <div class="endpoint">
                <span class="method">POST</span>
                <code>/api/upload-po-data</code> - Upload PO/AP data (CSV/Excel)
            </div>

            <div class="endpoint">
                <span class="method">POST</span>
                <code>/api/aggregate</code> - Aggregate line items
            </div>

            <div class="endpoint">
                <span class="method">POST</span>
                <code>/api/create-tender</code> - Create tender basket
            </div>

            <div class="endpoint">
                <span class="method get">GET</span>
                <code>/api/tender/&lt;tender_id&gt;/document</code> - Get tender document
            </div>

            <div class="endpoint">
                <span class="method">POST</span>
                <code>/api/vendor-response</code> - Submit vendor response
            </div>

            <div class="endpoint">
                <span class="method">POST</span>
                <code>/api/auction/create</code> - Create reverse auction
            </div>

            <div class="endpoint">
                <span class="method">POST</span>
                <code>/api/auction/bid</code> - Submit auction bid
            </div>

            <div class="endpoint">
                <span class="method get">GET</span>
                <code>/api/auction/&lt;auction_id&gt;/results</code> - Get auction results
            </div>

            <div class="endpoint">
                <span class="method">POST</span>
                <code>/api/award/compare</code> - Compare award strategies
            </div>

            <div class="endpoint">
                <span class="method">POST</span>
                <code>/api/award/create</code> - Create award
            </div>

            <div class="endpoint">
                <span class="method get">GET</span>
                <code>/api/catalogue/&lt;award_id&gt;?format=csv|xlsx|json</code> - Export catalogue
            </div>

            <h2>Getting Started</h2>
            <ol>
                <li>Create organizations using <code>POST /api/organizations</code></li>
                <li>Upload PO/AP data for each organization</li>
                <li>Aggregate data across organizations</li>
                <li>Create tender basket from aggregated items</li>
                <li>Collect vendor responses</li>
                <li>Run reverse auction</li>
                <li>Compare award strategies and create award</li>
                <li>Export catalogue for P2P/e-marketplace</li>
            </ol>
        </div>
    </body>
    </html>
    '''
    return render_template_string(html)


@app.route('/api/organizations', methods=['POST'])
def create_organization():
    """Create a buying organization"""
    data = request.json

    org = Organization(
        id=data.get('id', f"ORG-{len(organizations)+1:04d}"),
        name=data['name'],
        sector=data['sector'],
        contact_email=data['contact_email'],
        address=data.get('address')
    )

    organizations[org.id] = org
    return jsonify({'organization_id': org.id, 'name': org.name}), 201


@app.route('/api/vendors', methods=['POST'])
def register_vendor():
    """Register a vendor"""
    data = request.json

    vendor = Vendor(
        id=data.get('id', f"VENDOR-{len(vendors)+1:04d}"),
        name=data['name'],
        contact_email=data['contact_email'],
        registration_number=data.get('registration_number'),
        address=data.get('address')
    )

    vendors[vendor.id] = vendor
    return jsonify({'vendor_id': vendor.id, 'name': vendor.name}), 201


@app.route('/api/upload-po-data', methods=['POST'])
def upload_po_data():
    """Upload PO/AP data for an organization"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    organization_id = request.form.get('organization_id')

    if not organization_id or organization_id not in organizations:
        return jsonify({'error': 'Invalid organization_id'}), 400

    # Read file content
    file_content = file.read()
    filename = secure_filename(file.filename)

    # Parse based on file type
    try:
        if filename.endswith('.csv'):
            line_items = ingestion_engine.parse_csv(file_content, organization_id)
        elif filename.endswith(('.xlsx', '.xls')):
            line_items = ingestion_engine.parse_excel(file_content, organization_id)
        else:
            return jsonify({'error': 'Unsupported file format'}), 400

        # Validate and store
        validation = ingestion_engine.validate_line_items(line_items)

        if not validation['valid']:
            return jsonify({'error': validation['error']}), 400

        # Store line items
        if organization_id not in po_data:
            po_data[organization_id] = []
        po_data[organization_id].extend(line_items)

        return jsonify({
            'status': 'success',
            'organization_id': organization_id,
            'items_uploaded': validation['count'],
            'summary': validation
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/aggregate', methods=['POST'])
def aggregate_data():
    """Aggregate PO/AP data across organizations"""
    data = request.json
    org_ids = data.get('organization_ids', [])

    if not org_ids:
        org_ids = list(po_data.keys())

    # Gather line items from specified organizations
    org_line_items = {}
    for org_id in org_ids:
        if org_id in po_data:
            org_line_items[org_id] = po_data[org_id]

    if not org_line_items:
        return jsonify({'error': 'No data found for specified organizations'}), 400

    # Aggregate
    aggregated_items = aggregation_engine.merge_organizations(org_line_items)
    summary = aggregation_engine.get_aggregation_summary(aggregated_items)

    # Store for tender creation
    aggregated_id = f"AGG-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    po_data[aggregated_id] = aggregated_items

    return jsonify({
        'aggregated_id': aggregated_id,
        'summary': summary,
        'organizations': len(org_line_items)
    }), 200


@app.route('/api/create-tender', methods=['POST'])
def create_tender():
    """Create tender basket from aggregated data"""
    data = request.json

    aggregated_id = data['aggregated_id']
    if aggregated_id not in po_data:
        return jsonify({'error': 'Aggregated data not found'}), 404

    aggregated_items = po_data[aggregated_id]

    # Get participating organizations
    org_ids = data.get('organization_ids', [])
    participating_orgs = [organizations[org_id] for org_id in org_ids if org_id in organizations]

    # Parse award strategy
    strategy_str = data.get('award_strategy', 'by_lots')
    award_strategy = AwardStrategy(strategy_str)

    # Create tender
    tender = tender_manager.create_tender_basket(
        name=data['name'],
        description=data['description'],
        line_items=aggregated_items,
        organizations=participating_orgs,
        award_strategy=award_strategy,
        tender_period_months=data.get('tender_period_months', 24)
    )

    tender_baskets[tender.id] = tender
    vendor_responses[tender.id] = []

    return jsonify({
        'tender_id': tender.id,
        'summary': tender_manager.get_tender_summary(tender)
    }), 201


@app.route('/api/tender/<tender_id>/document', methods=['GET'])
def get_tender_document(tender_id):
    """Get tender documentation"""
    if tender_id not in tender_baskets:
        return jsonify({'error': 'Tender not found'}), 404

    tender = tender_baskets[tender_id]
    document = tender_manager.generate_tender_document(tender)

    return jsonify(document), 200


@app.route('/api/vendor-response', methods=['POST'])
def submit_vendor_response():
    """Submit vendor response to tender"""
    data = request.json

    tender_id = data['tender_id']
    vendor_id = data['vendor_id']

    if tender_id not in tender_baskets:
        return jsonify({'error': 'Tender not found'}), 404

    if vendor_id not in vendors:
        return jsonify({'error': 'Vendor not found'}), 404

    tender = tender_baskets[tender_id]
    vendor = vendors[vendor_id]

    # Create response line items
    line_items = []
    for item_data in data['line_items']:
        line_item = VendorResponseLineItem(
            tender_basket_id=tender_id,
            line_item_id=item_data['line_item_id'],
            vendor_id=vendor_id,
            baseline_unit_price=item_data['baseline_unit_price'],
            lead_time_days=item_data.get('lead_time_days', 30),
            minimum_order_quantity=item_data.get('minimum_order_quantity', 1.0),
            manufacturer=item_data.get('manufacturer'),
            product_code=item_data.get('product_code'),
            notes=item_data.get('notes')
        )
        line_items.append(line_item)

    # Create vendor response
    response = VendorResponse(
        id=f"RESP-{len(vendor_responses[tender_id])+1:04d}",
        tender_basket_id=tender_id,
        vendor=vendor,
        submission_date=datetime.now(),
        line_items=line_items,
        notes=data.get('notes')
    )

    response.calculate_total_value(tender)
    vendor_responses[tender_id].append(response)

    return jsonify({
        'response_id': response.id,
        'total_value': response.total_value
    }), 201


@app.route('/api/auction/create', methods=['POST'])
def create_auction():
    """Create reverse auction event"""
    data = request.json
    tender_id = data['tender_id']

    if tender_id not in tender_baskets:
        return jsonify({'error': 'Tender not found'}), 404

    tender = tender_baskets[tender_id]
    responses = vendor_responses.get(tender_id, [])

    if not responses:
        return jsonify({'error': 'No vendor responses found'}), 400

    auction = auction_manager.create_auction(
        tender_basket=tender,
        vendor_responses=responses,
        duration_hours=data.get('duration_hours', 2),
        minimum_decrement_percentage=data.get('minimum_decrement_percentage', 0.5)
    )

    return jsonify({
        'auction_id': auction.id,
        'start_time': auction.start_time.isoformat(),
        'end_time': auction.end_time.isoformat(),
        'participating_vendors': len(auction.vendor_ids)
    }), 201


@app.route('/api/auction/<auction_id>/start', methods=['POST'])
def start_auction(auction_id):
    """Start auction"""
    auction = auction_manager.start_auction(auction_id)
    return jsonify({'status': auction.status}), 200


@app.route('/api/auction/bid', methods=['POST'])
def submit_bid():
    """Submit auction bid"""
    data = request.json

    bid = auction_manager.submit_bid(
        auction_id=data['auction_id'],
        line_item_id=data['line_item_id'],
        vendor_id=data['vendor_id'],
        unit_price=data['unit_price'],
        baseline_price=data['baseline_price']
    )

    if not bid:
        return jsonify({'error': 'Invalid bid'}), 400

    return jsonify({
        'bid_id': bid.id,
        'rank': bid.rank
    }), 201


@app.route('/api/auction/<auction_id>/results', methods=['GET'])
def get_auction_results(auction_id):
    """Get auction results"""
    tender_id = request.args.get('tender_id')

    if not tender_id or tender_id not in tender_baskets:
        return jsonify({'error': 'Invalid tender_id'}), 400

    tender = tender_baskets[tender_id]
    results = auction_manager.get_auction_results(auction_id, tender)

    return jsonify(results), 200


@app.route('/api/award/compare', methods=['POST'])
def compare_awards():
    """Compare award strategies"""
    data = request.json
    tender_id = data['tender_id']
    auction_id = data.get('auction_id')

    if tender_id not in tender_baskets:
        return jsonify({'error': 'Tender not found'}), 404

    tender = tender_baskets[tender_id]
    responses = vendor_responses.get(tender_id, [])

    # Update with auction results if provided
    if auction_id:
        responses = auction_manager.update_vendor_responses_with_auction_results(
            auction_id, responses
        )

    comparison = award_engine.compare_responses(tender, responses)

    return jsonify(comparison), 200


@app.route('/api/award/create', methods=['POST'])
def create_award():
    """Create award"""
    data = request.json
    tender_id = data['tender_id']

    if tender_id not in tender_baskets:
        return jsonify({'error': 'Tender not found'}), 404

    tender = tender_baskets[tender_id]
    responses = vendor_responses.get(tender_id, [])

    # Update with auction results if provided
    auction_id = data.get('auction_id')
    if auction_id:
        responses = auction_manager.update_vendor_responses_with_auction_results(
            auction_id, responses
        )

    # Parse award strategy
    strategy_str = data['award_strategy']
    award_strategy = AwardStrategy(strategy_str)

    award = award_engine.create_award(tender, responses, award_strategy)
    awards[award.id] = (award, tender, responses)

    summary = award_engine.get_award_summary(award, tender)

    return jsonify({
        'award_id': award.id,
        'summary': summary
    }), 201


@app.route('/api/catalogue/<award_id>', methods=['GET'])
def export_catalogue(award_id):
    """Export catalogue"""
    if award_id not in awards:
        return jsonify({'error': 'Award not found'}), 404

    award, tender, responses = awards[award_id]
    export_format = request.args.get('format', 'csv')

    # Generate catalogue
    catalogue_items = catalogue_generator.generate_catalogue(
        tender_basket=tender,
        award=award,
        vendor_responses=responses
    )

    # Export in requested format
    if export_format == 'csv':
        csv_data = catalogue_generator.export_to_csv(catalogue_items)
        return csv_data, 200, {'Content-Type': 'text/csv', 'Content-Disposition': f'attachment; filename=catalogue_{award_id}.csv'}

    elif export_format == 'xlsx':
        excel_data = catalogue_generator.export_to_excel(catalogue_items)
        return send_file(
            io.BytesIO(excel_data),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'catalogue_{award_id}.xlsx'
        )

    elif export_format == 'json':
        json_data = catalogue_generator.export_to_json(catalogue_items)
        return json_data, 200, {'Content-Type': 'application/json'}

    elif export_format == 'ariba':
        ariba_data = catalogue_generator.export_to_ariba(catalogue_items)
        return ariba_data, 200, {'Content-Type': 'text/tab-separated-values', 'Content-Disposition': f'attachment; filename=catalogue_{award_id}_ariba.cif'}

    elif export_format == 'coupa':
        coupa_data = catalogue_generator.export_to_coupa(catalogue_items)
        return coupa_data, 200, {'Content-Type': 'text/csv', 'Content-Disposition': f'attachment; filename=catalogue_{award_id}_coupa.csv'}

    else:
        return jsonify({'error': 'Unsupported format'}), 400


@app.route('/api/template/csv', methods=['GET'])
def get_csv_template():
    """Get CSV template for PO/AP upload"""
    template = ingestion_engine.get_template_csv()
    return template, 200, {'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=po_ap_template.csv'}


if __name__ == '__main__':
    print("Starting PO/AP Tender & Auction Tool...")
    print("Open http://localhost:5000 in your browser")
    app.run(debug=True, host='0.0.0.0', port=5000)
