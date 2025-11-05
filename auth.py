"""
Authentication and Authorization System
JWT-based authentication with role-based access control
"""
import jwt
import bcrypt
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify
import uuid
import os

from database import get_session, User, UserRole

# JWT Configuration
SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24


class AuthService:
    """Authentication service"""

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password using bcrypt"""
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        """Verify password against hash"""
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))

    @staticmethod
    def generate_token(user_id: str, email: str, role: str) -> str:
        """Generate JWT token"""
        payload = {
            'user_id': user_id,
            'email': email,
            'role': role,
            'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
            'iat': datetime.utcnow()
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)
        return token

    @staticmethod
    def verify_token(token: str) -> dict:
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

    @staticmethod
    def register_user(
        email: str,
        password: str,
        full_name: str,
        role: UserRole,
        organization_id: str = None,
        vendor_id: str = None
    ) -> User:
        """Register a new user"""
        session = get_session()

        try:
            # Check if user already exists
            existing_user = session.query(User).filter_by(email=email).first()
            if existing_user:
                raise ValueError("User with this email already exists")

            # Create new user
            user = User(
                id=str(uuid.uuid4()),
                email=email,
                password_hash=AuthService.hash_password(password),
                full_name=full_name,
                role=role,
                organization_id=organization_id,
                vendor_id=vendor_id,
                active=True,
                created_at=datetime.utcnow()
            )

            session.add(user)
            session.commit()
            session.refresh(user)

            return user

        finally:
            session.close()

    @staticmethod
    def login(email: str, password: str) -> tuple:
        """
        Authenticate user and return token

        Returns:
            (token, user) if successful, (None, None) if failed
        """
        session = get_session()

        try:
            user = session.query(User).filter_by(email=email, active=True).first()

            if not user:
                return None, None

            if not AuthService.verify_password(password, user.password_hash):
                return None, None

            # Update last login
            user.last_login = datetime.utcnow()
            session.commit()

            # Generate token
            token = AuthService.generate_token(user.id, user.email, user.role.value)

            return token, user

        finally:
            session.close()

    @staticmethod
    def get_current_user(token: str) -> User:
        """Get current user from token"""
        payload = AuthService.verify_token(token)

        if not payload:
            return None

        session = get_session()

        try:
            user = session.query(User).filter_by(id=payload['user_id'], active=True).first()
            return user
        finally:
            session.close()


# Decorators for route protection
def token_required(f):
    """Decorator to require valid JWT token"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # Check for token in header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]  # Bearer <token>
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401

        if not token:
            return jsonify({'error': 'Token is missing'}), 401

        # Verify token
        payload = AuthService.verify_token(token)

        if not payload:
            return jsonify({'error': 'Token is invalid or expired'}), 401

        # Get user
        session = get_session()
        try:
            user = session.query(User).filter_by(id=payload['user_id'], active=True).first()

            if not user:
                return jsonify({'error': 'User not found'}), 401

            # Add user to kwargs
            kwargs['current_user'] = user
            return f(*args, **kwargs)

        finally:
            session.close()

    return decorated


def role_required(*allowed_roles):
    """Decorator to require specific roles"""
    def decorator(f):
        @wraps(f)
        @token_required
        def decorated(*args, **kwargs):
            current_user = kwargs.get('current_user')

            if not current_user:
                return jsonify({'error': 'User not authenticated'}), 401

            # Check if user has required role
            user_role = current_user.role.value if isinstance(current_user.role, UserRole) else current_user.role

            if user_role not in [role.value if isinstance(role, UserRole) else role for role in allowed_roles]:
                return jsonify({'error': 'Insufficient permissions'}), 403

            return f(*args, **kwargs)

        return decorated
    return decorator


def org_admin_required(f):
    """Decorator for organization admin only"""
    return role_required(UserRole.ADMIN, UserRole.ORG_ADMIN)(f)


def vendor_access_required(f):
    """Decorator for vendor users"""
    return role_required(UserRole.ADMIN, UserRole.VENDOR_ADMIN, UserRole.VENDOR_USER)(f)


def admin_only(f):
    """Decorator for system admin only"""
    return role_required(UserRole.ADMIN)(f)


# Permission checks
class Permissions:
    """Permission checking utilities"""

    @staticmethod
    def can_create_tender(user: User) -> bool:
        """Check if user can create tender"""
        return user.role in [UserRole.ADMIN, UserRole.ORG_ADMIN]

    @staticmethod
    def can_view_tender(user: User, tender_basket_id: str) -> bool:
        """Check if user can view specific tender"""
        # Admins can view all
        if user.role == UserRole.ADMIN:
            return True

        # Organization users can view their tenders
        if user.role in [UserRole.ORG_ADMIN, UserRole.ORG_USER]:
            # TODO: Check if user's organization is part of tender
            return True

        # Vendors can view tenders they've been invited to
        if user.role in [UserRole.VENDOR_ADMIN, UserRole.VENDOR_USER]:
            # TODO: Check if tender is published and vendor has access
            return True

        return False

    @staticmethod
    def can_submit_response(user: User) -> bool:
        """Check if user can submit vendor response"""
        return user.role in [UserRole.ADMIN, UserRole.VENDOR_ADMIN]

    @staticmethod
    def can_bid_in_auction(user: User) -> bool:
        """Check if user can bid in auction"""
        return user.role in [UserRole.ADMIN, UserRole.VENDOR_ADMIN, UserRole.VENDOR_USER]

    @staticmethod
    def can_send_message_to_all(user: User) -> bool:
        """Check if user can send message to all vendors"""
        return user.role in [UserRole.ADMIN, UserRole.ORG_ADMIN]

    @staticmethod
    def can_create_award(user: User) -> bool:
        """Check if user can create award"""
        return user.role in [UserRole.ADMIN, UserRole.ORG_ADMIN]

    @staticmethod
    def can_view_all_messages(user: User, tender_basket_id: str) -> bool:
        """Check if user can view all messages in tender"""
        # Org admins can see all messages for their tenders
        return user.role in [UserRole.ADMIN, UserRole.ORG_ADMIN]

    @staticmethod
    def can_manage_users(user: User) -> bool:
        """Check if user can manage other users"""
        return user.role == UserRole.ADMIN
