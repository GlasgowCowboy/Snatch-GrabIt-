"""
Messaging System
Q&A and clarification system for tenders and auctions
"""
from typing import List, Optional, Dict
from datetime import datetime
import uuid

from database import (
    get_session, Message, MessageReadReceipt, User, TenderBasketDB,
    MessageType, MessageRecipientType, Vendor
)
from notifications import NotificationService


class MessagingService:
    """Service for managing messages and Q&A"""

    @staticmethod
    def send_message(
        tender_basket_id: str,
        sender_id: str,
        sender_type: str,
        message_type: MessageType,
        subject: str,
        body: str,
        recipient_type: MessageRecipientType,
        recipient_vendor_ids: List[str] = None,
        parent_message_id: str = None,
        is_public: bool = False
    ) -> Message:
        """
        Send a message or question

        Args:
            tender_basket_id: Tender basket ID
            sender_id: User ID of sender
            sender_type: 'organization' or 'vendor'
            message_type: Type of message
            subject: Message subject
            body: Message body
            recipient_type: Who should receive this
            recipient_vendor_ids: List of specific vendor IDs if SPECIFIC_VENDORS
            parent_message_id: If reply, parent message ID
            is_public: Whether all vendors can see this

        Returns:
            Created Message
        """
        session = get_session()

        try:
            # Validate sender
            sender = session.query(User).filter_by(id=sender_id).first()
            if not sender:
                raise ValueError("Sender not found")

            # Validate tender basket
            tender = session.query(TenderBasketDB).filter_by(id=tender_basket_id).first()
            if not tender:
                raise ValueError("Tender basket not found")

            # If reply, validate parent message
            is_reply = parent_message_id is not None
            if is_reply:
                parent = session.query(Message).filter_by(id=parent_message_id).first()
                if not parent:
                    raise ValueError("Parent message not found")

            # Create message
            message = Message(
                id=str(uuid.uuid4()),
                tender_basket_id=tender_basket_id,
                sender_id=sender_id,
                sender_type=sender_type,
                message_type=message_type,
                subject=subject,
                body=body,
                parent_message_id=parent_message_id,
                is_reply=is_reply,
                recipient_type=recipient_type,
                recipient_vendor_ids=recipient_vendor_ids,
                is_public=is_public,
                timestamp=datetime.utcnow()
            )

            session.add(message)
            session.commit()
            session.refresh(message)

            # Send email notifications
            MessagingService._send_message_notifications(message, session)

            return message

        finally:
            session.close()

    @staticmethod
    def _send_message_notifications(message: Message, session):
        """Send email notifications for new message"""
        # Get tender basket
        tender = session.query(TenderBasketDB).filter_by(id=message.tender_basket_id).first()

        if not tender:
            return

        # Determine recipients
        recipients = []

        if message.recipient_type == MessageRecipientType.ALL_VENDORS:
            # Get all vendors who have responded to this tender
            vendor_responses = tender.vendor_responses
            vendor_ids = [vr.vendor_id for vr in vendor_responses]

            for vendor_id in vendor_ids:
                vendor = session.query(Vendor).filter_by(id=vendor_id).first()
                if vendor:
                    recipients.append(vendor.contact_email)

        elif message.recipient_type == MessageRecipientType.SPECIFIC_VENDORS:
            if message.recipient_vendor_ids:
                for vendor_id in message.recipient_vendor_ids:
                    vendor = session.query(Vendor).filter_by(id=vendor_id).first()
                    if vendor:
                        recipients.append(vendor.contact_email)

        elif message.recipient_type == MessageRecipientType.INDIVIDUAL:
            # Reply to original sender
            if message.parent_message_id:
                parent = session.query(Message).filter_by(id=message.parent_message_id).first()
                if parent:
                    parent_sender = session.query(User).filter_by(id=parent.sender_id).first()
                    if parent_sender:
                        recipients.append(parent_sender.email)

        # Send notifications
        for recipient_email in recipients:
            NotificationService.send_message_notification(
                recipient_email=recipient_email,
                tender_name=tender.name,
                message_subject=message.subject,
                message_body=message.body,
                sender_name=message.sender.full_name,
                tender_id=tender.id,
                message_id=message.id
            )

    @staticmethod
    def get_tender_messages(
        tender_basket_id: str,
        user_id: str,
        include_replies: bool = True
    ) -> List[Message]:
        """
        Get messages for a tender

        Args:
            tender_basket_id: Tender basket ID
            user_id: User ID requesting messages
            include_replies: Whether to include reply threads

        Returns:
            List of messages user can see
        """
        session = get_session()

        try:
            # Get user
            user = session.query(User).filter_by(id=user_id).first()
            if not user:
                return []

            # Base query
            query = session.query(Message).filter_by(tender_basket_id=tender_basket_id)

            # Filter based on user role
            if user.vendor_id:
                # Vendor can see:
                # - Public messages
                # - Messages sent to all vendors
                # - Messages sent to their specific vendor
                # - Messages they sent
                query = query.filter(
                    (Message.is_public == True) |
                    (Message.recipient_type == MessageRecipientType.ALL_VENDORS) |
                    (Message.sender_id == user_id) |
                    (Message.recipient_vendor_ids.contains(user.vendor_id))
                )
            elif user.organization_id:
                # Organization users can see all messages
                pass

            # Optionally filter out replies (get top-level messages only)
            if not include_replies:
                query = query.filter_by(is_reply=False)

            messages = query.order_by(Message.timestamp.desc()).all()

            return messages

        finally:
            session.close()

    @staticmethod
    def get_message_thread(message_id: str, user_id: str) -> Dict:
        """
        Get a message and all its replies

        Args:
            message_id: Message ID
            user_id: User ID requesting thread

        Returns:
            Message thread with replies
        """
        session = get_session()

        try:
            # Get message
            message = session.query(Message).filter_by(id=message_id).first()

            if not message:
                return None

            # Check permissions
            user = session.query(User).filter_by(id=user_id).first()
            if not MessagingService._can_view_message(message, user):
                return None

            # Get replies
            replies = session.query(Message).filter_by(
                parent_message_id=message_id
            ).order_by(Message.timestamp.asc()).all()

            return {
                'message': MessagingService._message_to_dict(message, session),
                'replies': [MessagingService._message_to_dict(r, session) for r in replies]
            }

        finally:
            session.close()

    @staticmethod
    def _can_view_message(message: Message, user: User) -> bool:
        """Check if user can view message"""
        if not user:
            return False

        # Org users can see all
        if user.organization_id:
            return True

        # Vendor users can see public, to all, to them, or sent by them
        if user.vendor_id:
            if message.is_public:
                return True
            if message.recipient_type == MessageRecipientType.ALL_VENDORS:
                return True
            if message.sender_id == user.id:
                return True
            if message.recipient_vendor_ids and user.vendor_id in message.recipient_vendor_ids:
                return True

        return False

    @staticmethod
    def _message_to_dict(message: Message, session) -> Dict:
        """Convert message to dictionary"""
        return {
            'id': message.id,
            'tender_basket_id': message.tender_basket_id,
            'sender_id': message.sender_id,
            'sender_name': message.sender.full_name if message.sender else 'Unknown',
            'sender_type': message.sender_type,
            'message_type': message.message_type.value,
            'subject': message.subject,
            'body': message.body,
            'is_reply': message.is_reply,
            'parent_message_id': message.parent_message_id,
            'recipient_type': message.recipient_type.value,
            'is_public': message.is_public,
            'timestamp': message.timestamp.isoformat(),
            'reply_count': len(message.replies) if message.replies else 0
        }

    @staticmethod
    def mark_message_as_read(message_id: str, user_id: str):
        """Mark message as read by user"""
        session = get_session()

        try:
            # Check if already read
            existing = session.query(MessageReadReceipt).filter_by(
                message_id=message_id,
                user_id=user_id
            ).first()

            if existing:
                return

            # Create read receipt
            receipt = MessageReadReceipt(
                message_id=message_id,
                user_id=user_id,
                read_at=datetime.utcnow()
            )

            session.add(receipt)
            session.commit()

        finally:
            session.close()

    @staticmethod
    def get_unread_message_count(tender_basket_id: str, user_id: str) -> int:
        """Get count of unread messages for user in tender"""
        session = get_session()

        try:
            # Get all messages user can see
            messages = MessagingService.get_tender_messages(
                tender_basket_id, user_id, include_replies=True
            )

            # Count unread
            unread_count = 0
            for message in messages:
                read_receipt = session.query(MessageReadReceipt).filter_by(
                    message_id=message.id,
                    user_id=user_id
                ).first()

                if not read_receipt:
                    unread_count += 1

            return unread_count

        finally:
            session.close()

    @staticmethod
    def reply_to_message(
        message_id: str,
        sender_id: str,
        body: str
    ) -> Message:
        """
        Reply to an existing message

        Args:
            message_id: Parent message ID
            sender_id: User ID of replier
            body: Reply body

        Returns:
            Created reply message
        """
        session = get_session()

        try:
            # Get parent message
            parent = session.query(Message).filter_by(id=message_id).first()
            if not parent:
                raise ValueError("Parent message not found")

            # Get sender
            sender = session.query(User).filter_by(id=sender_id).first()
            if not sender:
                raise ValueError("Sender not found")

            # Determine sender type and recipient
            if sender.organization_id:
                sender_type = 'organization'
                # Reply goes to original sender if they're a vendor
                recipient_type = MessageRecipientType.INDIVIDUAL
            else:
                sender_type = 'vendor'
                # Reply goes to organization
                recipient_type = MessageRecipientType.INDIVIDUAL

            # Create reply
            reply = MessagingService.send_message(
                tender_basket_id=parent.tender_basket_id,
                sender_id=sender_id,
                sender_type=sender_type,
                message_type=parent.message_type,
                subject=f"Re: {parent.subject}",
                body=body,
                recipient_type=recipient_type,
                parent_message_id=message_id,
                is_public=parent.is_public
            )

            return reply

        finally:
            session.close()
