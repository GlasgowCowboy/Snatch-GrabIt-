# Quick Start Guide

## Get Running in 5 Minutes!

### Step 1: Install Dependencies

```bash
pip install --user -r requirements.txt
```

### Step 2: Initialize Database & Create Admin

```bash
python create_admin.py
```

Follow the prompts:
- Enter admin email (or press Enter for default)
- Enter admin password (or press Enter for default)
- Enter admin name (or press Enter for default)
- Create sample data? Type 'y' for testing

### Step 3: Start the Application

```bash
python app.py
```

Application will start at: **http://localhost:5000**

### Step 4: Login

**Admin User:**
- Email: `admin@procurement.com`
- Password: `admin123`

**Organization Admin (if created sample data):**
- Email: `org.admin@hospital.nhs.uk`
- Password: `orgadmin123`

**Vendor Admin (if created sample data):**
- Email: `vendor.admin@medsupplies.com`
- Password: `vendoradmin123`

## API Quick Test

### 1. Get JWT Token

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@procurement.com","password":"admin123"}'
```

Returns:
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {...}
}
```

### 2. Get CSV Template

```bash
curl -O http://localhost:5000/api/template/csv
```

### 3. Upload PO Data

```bash
curl -X POST http://localhost:5000/api/upload-po-data \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "file=@po_data.csv" \
  -F "organization_id=ORG_ID"
```

## Running the Example Workflow

To see a complete demo:

```bash
python example_workflow.py
```

This demonstrates:
- ✓ Creating organizations
- ✓ Uploading PO/AP data
- ✓ Aggregating across organizations
- ✓ Creating tender basket
- ✓ Vendor responses
- ✓ Reverse auction
- ✓ Award comparison
- ✓ Catalogue generation

## Key Features

### For Organizations:
1. **Upload PO/AP Data** - CSV or Excel
2. **Create Tenders** - From aggregated data
3. **Receive Responses** - From multiple vendors
4. **Run Auctions** - Dynamic reverse auction
5. **Compare Awards** - Whole/Lots/Line items
6. **Export Catalogues** - P2P compatible

### For Vendors:
1. **View Tenders** - Active opportunities
2. **Submit Responses** - Baseline pricing
3. **Participate in Auctions** - Real-time bidding
4. **Ask Questions** - Clarifications
5. **Track Awards** - Win notifications

## Messaging System

**Vendors can:**
- Ask questions about tenders
- Request clarifications
- View public FAQ

**Organizations can:**
- Reply to individual vendors
- Reply to all vendors
- Make answers public (FAQ)

All messages are:
- ✓ Date/time stamped
- ✓ Threaded (with replies)
- ✓ Logged in database
- ✓ Email notifications sent

## Email Notifications

System automatically sends emails for:
- 📧 Tender published
- 📧 Response received
- 📧 Auction starting
- 📧 Auction ending soon
- 📧 Outbid alert
- 📧 Award notification
- 📧 New message received

## Troubleshooting

### Database Issues

```bash
# Delete and recreate database
rm procurement.db
python create_admin.py
```

### Module Not Found

```bash
# Reinstall dependencies
pip install --user -r requirements.txt --force-reinstall
```

### Port Already in Use

Edit `app.py` and change port:
```python
app.run(debug=True, host='0.0.0.0', port=5001)  # Change port
```

## What's Next?

1. **Test Workflow** - Run example_workflow.py
2. **Upload Real Data** - Try with actual PO/AP files
3. **Create Tender** - Build a real tender
4. **Invite Vendors** - Get responses
5. **Run Auction** - Test bidding
6. **Export Catalogue** - Generate outputs

## Architecture

```
┌─────────────────────────────────────────┐
│         Web UI (HTML/CSS/JS)            │
├─────────────────────────────────────────┤
│     Flask REST API + WebSocket          │
├─────────────────────────────────────────┤
│  Authentication │ Authorization │ RBAC  │
├─────────────────────────────────────────┤
│     Business Logic (Modules)            │
│  ┌──────────┬──────────┬──────────┐    │
│  │Ingestion │Aggregation│ Tender  │    │
│  ├──────────┼──────────┼──────────┤    │
│  │ Auction  │  Award   │Catalogue│    │
│  ├──────────┼──────────┼──────────┤    │
│  │Messaging │  Email   │  Audit  │    │
│  └──────────┴──────────┴──────────┘    │
├─────────────────────────────────────────┤
│      SQLAlchemy ORM (Database)          │
├─────────────────────────────────────────┤
│       SQLite / PostgreSQL               │
└─────────────────────────────────────────┘
```

## File Structure

```
Snatch-GrabIt-/
├── app.py                  # Main Flask application
├── database.py             # Database models
├── auth.py                 # Authentication system
├── messaging.py            # Q&A messaging
├── notifications.py        # Email notifications
├── models.py               # Business models
├── ingestion.py            # PO/AP data upload
├── aggregation.py          # Data consolidation
├── tender.py               # Tender management
├── auction.py              # Reverse auction
├── award.py                # Award comparison
├── catalogue.py            # Catalogue export
├── create_admin.py         # Setup script
├── example_workflow.py     # Demo workflow
├── requirements.txt        # Python dependencies
├── procurement.db          # SQLite database
├── templates/              # HTML templates
│   └── base.html
├── static/                 # Static files
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── main.js
├── README.md               # Project overview
├── API_DOCUMENTATION.md    # API reference
├── DEPLOYMENT.md           # Deployment guide
└── QUICK_START.md          # This file
```

## Support & Documentation

- **API Docs**: See API_DOCUMENTATION.md
- **Deployment**: See DEPLOYMENT.md
- **Full Guide**: See README.md

## Production Checklist

Before going live:

- [ ] Change default passwords
- [ ] Set strong JWT secret
- [ ] Configure SMTP for real emails
- [ ] Use PostgreSQL instead of SQLite
- [ ] Enable HTTPS
- [ ] Set up backups
- [ ] Configure monitoring
- [ ] Load testing
- [ ] Security audit
- [ ] User training

## Success!

If you can:
1. ✅ Login with admin credentials
2. ✅ See the dashboard
3. ✅ Upload PO data
4. ✅ Create a tender
5. ✅ Send a message

**You're ready to start your pilot!** 🎉
