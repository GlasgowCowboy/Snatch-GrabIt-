## Procurement Platform - Deployment Guide

# Complete Setup and Launch Instructions

## 🎯 What You Have Now

### ✅ Completed Components

1. **Database Layer** (`database.py`)
   - SQLAlchemy models for all entities
   - User authentication tables
   - Messaging system tables
   - Audit logging
   - Email notification tracking

2. **Authentication System** (`auth.py`)
   - JWT-based authentication
   - Role-based access control (RBAC)
   - Password hashing with bcrypt
   - User registration and login
   - Permission decorators for routes

3. **Messaging System** (`messaging.py`)
   - Q&A threads with replies
   - Organization to vendor communication
   - Vendor questions to organization
   - Broadcast messages to all vendors
   - Date/time stamped with read receipts
   - Email notifications for new messages

4. **Email Notifications** (`notifications.py`)
   - Workflow stage notifications
   - Tender published
   - Response received
   - Auction starting/ending
   - Outbid notifications
   - Award notifications
   - Message notifications

5. **Business Logic** (existing files)
   - PO/AP data ingestion
   - Multi-organization aggregation
   - Tender management
   - Reverse auction engine
   - Award comparison
   - Catalogue generation

6. **Web UI** (templates + CSS)
   - Base template with navigation
   - Professional styling
   - Responsive design
   - Dashboard layouts

## 🚀 Launch Instructions

### Step 1: Install Dependencies

```bash
cd /home/user/Snatch-GrabIt-

# Install Python packages
pip install --user -r requirements.txt
```

### Step 2: Initialize Database

```bash
# Create database and tables
python database.py
```

This creates `procurement.db` SQLite database with all tables.

### Step 3: Create Initial Admin User

Create a script to add admin user:

```python
# create_admin.py
from database import init_database, get_session
from database import User, UserRole
from auth import AuthService
import uuid

init_database()

# Create admin user
admin = AuthService.register_user(
    email="admin@procurement.com",
    password="admin123",  # Change this!
    full_name="System Administrator",
    role=UserRole.ADMIN
)

print(f"✓ Admin user created: {admin.email}")
```

Run:
```bash
python create_admin.py
```

### Step 4: Configure Environment

Create `.env` file:

```bash
# .env
DATABASE_URL=sqlite:///procurement.db
JWT_SECRET_KEY=your-secret-key-change-me
BASE_URL=http://localhost:5000

# Email configuration (optional for testing)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@procurement.com
SMTP_FROM_NAME=Procurement Platform
```

### Step 5: Launch Application

```bash
# Run the Flask application
python app.py

# Application will be available at:
# http://localhost:5000
```

## 🎨 User Interface

### Available Pages

1. **Login** - `/login`
   - Email/password authentication
   - JWT token generation

2. **Organization Dashboard** - `/dashboard`
   - Upload PO/AP data
   - Create tenders
   - View responses
   - Manage awards

3. **Vendor Portal** - `/vendor/portal`
   - View active tenders
   - Submit responses
   - Participate in auctions
   - Ask questions

4. **Auction Dashboard** - `/auction/<auction_id>`
   - Real-time bidding
   - Live price updates
   - Bid ranking
   - WebSocket updates

5. **Messaging Center** - `/messages`
   - View all messages
   - Reply to questions
   - Send clarifications
   - Thread view

## 👥 User Roles

### Admin
- Full system access
- Manage all organizations
- Manage all vendors
- Override permissions

### Organization Admin
- Create tenders
- Upload PO/AP data
- View responses
- Create awards
- Send messages to vendors
- Manage organization users

### Organization User
- View tenders
- View responses
- Read messages

### Vendor Admin
- Submit tender responses
- Participate in auctions
- Ask questions
- Manage vendor users

### Vendor User
- View tenders
- Submit bids
- Read messages

## 📧 Email Notifications

Emails are automatically sent for:

1. **Tender Published** - Vendors notified
2. **Response Received** - Organization notified
3. **Auction Starting** - Vendors notified 24h before
4. **Auction Ending** - Vendors notified 30 min before
5. **Outbid** - Vendor notified when outbid
6. **Award** - Winning vendors notified
7. **Messages** - Recipients notified of new messages

## 💬 Messaging System Features

### For Organizations:
- **Broadcast** - Send to all vendors
- **Targeted** - Send to specific vendors
- **Replies** - Respond to vendor questions
- **Public** - Mark messages as public FAQ

### For Vendors:
- **Questions** - Ask clarifications
- **Private** - Direct messages to organization
- **Threads** - Follow conversation threads
- **Read Receipts** - Track message read status

## 🔐 Authentication Flow

```
1. User visits /login
2. Enters email/password
3. Backend validates credentials
4. JWT token generated (24h expiry)
5. Token stored in browser
6. Subsequent requests include token
7. Backend validates token
8. User data available in routes
```

## 📊 Database Schema

### Core Tables:
- **users** - User accounts
- **organizations** - Buying organizations
- **vendors** - Suppliers
- **tender_baskets** - Tenders
- **aggregated_line_items** - Tender items
- **vendor_responses** - Vendor submissions
- **vendor_response_line_items** - Pricing details
- **auction_events** - Auctions
- **auction_bids** - Bids
- **awards** - Award decisions
- **messages** - Q&A system
- **message_read_receipts** - Read tracking
- **email_notifications** - Email log
- **audit_logs** - Audit trail

## 🔄 Complete Workflow

### 1. Setup
```bash
# Organization Admin registers
POST /api/auth/register
{
  "email": "admin@hospital.nhs.uk",
  "password": "secure123",
  "full_name": "Hospital Procurement",
  "role": "org_admin",
  "organization_name": "General Hospital"
}

# Vendor Admin registers
POST /api/auth/register
{
  "email": "sales@supplier.com",
  "password": "secure123",
  "full_name": "Supplier Sales",
  "role": "vendor_admin",
  "vendor_name": "Medical Supplies Ltd"
}
```

### 2. Upload Data
```bash
# Login
POST /api/auth/login
{
  "email": "admin@hospital.nhs.uk",
  "password": "secure123"
}
# Returns: { "token": "jwt-token", "user": {...} }

# Upload PO data
POST /api/upload-po-data
Header: Authorization: Bearer jwt-token
Form Data: file=po_data.csv
```

### 3. Create Tender
```bash
# Create tender
POST /api/create-tender
Header: Authorization: Bearer jwt-token
{
  "name": "Annual Procurement 2024",
  "description": "Medical supplies",
  "award_strategy": "by_lots"
}

# Email sent to all registered vendors
```

### 4. Vendor Asks Question
```bash
# Vendor sends question
POST /api/messages
Header: Authorization: Bearer jwt-token
{
  "tender_id": "uuid",
  "message_type": "question",
  "subject": "Delivery timelines",
  "body": "What are the expected delivery windows?"
}

# Email sent to organization admin
```

### 5. Organization Replies
```bash
# Organization replies
POST /api/messages/<message_id>/reply
Header: Authorization: Bearer jwt-token
{
  "body": "Delivery required within 14 days",
  "is_public": true  # All vendors can see
}

# Email sent to vendor
```

### 6. Vendor Submits Response
```bash
# Submit response
POST /api/vendor-response
Header: Authorization: Bearer jwt-token
{
  "tender_id": "uuid",
  "line_items": [...]
}

# Email sent to organization
```

### 7. Auction
```bash
# Create auction
POST /api/auction/create
Header: Authorization: Bearer jwt-token

# Email sent to all vendors

# Real-time bidding via WebSocket
socket.emit('place_bid', {
  "line_item_id": "uuid",
  "price": 150.00
})

# All participants get live updates
```

### 8. Award
```bash
# Create award
POST /api/award/create
Header: Authorization: Bearer jwt-token
{
  "award_strategy": "by_line_item"
}

# Email sent to winning vendors
```

### 9. Export Catalogue
```bash
# Download catalogue
GET /api/catalogue/<award_id>?format=csv
Header: Authorization: Bearer jwt-token

# Ready for upload to P2P system
```

## 🔧 Configuration Options

### Database
- **SQLite** (default) - For testing/pilot
- **PostgreSQL** - For production
  ```
  DATABASE_URL=postgresql://user:pass@localhost/procurement
  ```

### Email
- **Console** (default) - Prints to console
- **SMTP** - Real email delivery
- **SendGrid** - Email service
- **AWS SES** - Amazon email service

### Authentication
- **JWT Expiry** - 24 hours (configurable)
- **Password Requirements** - Minimum 8 characters
- **Session Management** - Token refresh

## 📈 Next Steps for Production

### 1. Security Hardening
- [ ] Change JWT secret key
- [ ] Enable HTTPS
- [ ] Add rate limiting
- [ ] Input validation
- [ ] SQL injection protection (already done via SQLAlchemy)
- [ ] XSS protection

### 2. Performance
- [ ] Database indexing
- [ ] Caching (Redis)
- [ ] CDN for static files
- [ ] Database connection pooling

### 3. Monitoring
- [ ] Application logs
- [ ] Error tracking (Sentry)
- [ ] Performance monitoring
- [ ] User analytics

### 4. Backup & Recovery
- [ ] Automated database backups
- [ ] Disaster recovery plan
- [ ] Data retention policy

## 🐳 Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "app.py"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db/procurement
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=procurement
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Run:
```bash
docker-compose up -d
```

## ☁️ Cloud Deployment

### AWS
1. **EC2** - Virtual machine
2. **RDS** - PostgreSQL database
3. **SES** - Email service
4. **S3** - File storage
5. **CloudFront** - CDN
6. **ELB** - Load balancer

### Azure
1. **App Service** - Web hosting
2. **Azure Database** - PostgreSQL
3. **SendGrid** - Email
4. **Blob Storage** - Files
5. **CDN** - Content delivery

### Google Cloud
1. **App Engine** - Web hosting
2. **Cloud SQL** - PostgreSQL
3. **SendGrid** - Email
4. **Cloud Storage** - Files
5. **Cloud CDN** - Content delivery

## 🧪 Testing

```bash
# Run example workflow
python example_workflow.py

# Test authentication
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@procurement.com","password":"admin123"}'

# Test with token
curl -X GET http://localhost:5000/api/tenders \
  -H "Authorization: Bearer your-jwt-token"
```

## 📞 Support

For issues or questions:
1. Check logs: `tail -f app.log`
2. Check database: `sqlite3 procurement.db`
3. Review documentation
4. Contact system administrator

## 🎉 Success Criteria

Your system is ready when:

- ✅ Database initialized
- ✅ Admin user created
- ✅ Application starts without errors
- ✅ Login works
- ✅ Can upload PO data
- ✅ Can create tender
- ✅ Can send/receive messages
- ✅ Emails are logged (or sent)
- ✅ Example workflow completes

**You're now ready for pilot testing!**
