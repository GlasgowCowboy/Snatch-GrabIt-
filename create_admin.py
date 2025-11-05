"""
Create Initial Admin User
Run this script to create the first admin user for the system
"""
from database import init_database, get_session, User, Organization, Vendor, UserRole
from auth import AuthService
import uuid

def create_admin_user():
    """Create system admin user"""
    print("Initializing database...")
    init_database()

    print("\n=== Create Admin User ===\n")

    email = input("Admin email: ") or "admin@procurement.com"
    password = input("Admin password: ") or "admin123"
    full_name = input("Admin full name: ") or "System Administrator"

    try:
        admin = AuthService.register_user(
            email=email,
            password=password,
            full_name=full_name,
            role=UserRole.ADMIN
        )

        print(f"\n✓ Admin user created successfully!")
        print(f"  Email: {admin.email}")
        print(f"  Role: {admin.role.value}")
        print(f"\nYou can now login at http://localhost:5000/login")

    except ValueError as e:
        print(f"\n✗ Error: {e}")


def create_sample_data():
    """Create sample organizations and vendors for testing"""
    print("\n=== Create Sample Data? (y/n) ===")
    create_sample = input("Create sample orgs and vendors? ").lower() == 'y'

    if not create_sample:
        return

    session = get_session()

    try:
        # Create sample organization
        org = Organization(
            id=str(uuid.uuid4()),
            name="General Hospital Trust",
            sector="healthcare",
            contact_email="procurement@hospital.nhs.uk",
            address="123 Hospital Road, London"
        )
        session.add(org)

        # Create org admin user
        org_admin = AuthService.register_user(
            email="org.admin@hospital.nhs.uk",
            password="orgadmin123",
            full_name="Hospital Procurement Manager",
            role=UserRole.ORG_ADMIN,
            organization_id=org.id
        )

        # Create sample vendor
        vendor = Vendor(
            id=str(uuid.uuid4()),
            name="Medical Supplies Ltd",
            contact_email="sales@medsupplies.com",
            registration_number="12345678",
            address="456 Supply Street, Manchester"
        )
        session.add(vendor)

        # Create vendor admin user
        vendor_admin = AuthService.register_user(
            email="vendor.admin@medsupplies.com",
            password="vendoradmin123",
            full_name="Sales Manager",
            role=UserRole.VENDOR_ADMIN,
            vendor_id=vendor.id
        )

        session.commit()

        print("\n✓ Sample data created:")
        print(f"\n  Organization: {org.name}")
        print(f"    Login: {org_admin.email} / orgadmin123")
        print(f"\n  Vendor: {vendor.name}")
        print(f"    Login: {vendor_admin.email} / vendoradmin123")

    except Exception as e:
        print(f"\n✗ Error creating sample data: {e}")
        session.rollback()

    finally:
        session.close()


if __name__ == "__main__":
    print("=" * 60)
    print("PROCUREMENT PLATFORM - INITIAL SETUP")
    print("=" * 60)

    create_admin_user()
    create_sample_data()

    print("\n" + "=" * 60)
    print("Setup complete! Start the application with:")
    print("  python app.py")
    print("=" * 60)
