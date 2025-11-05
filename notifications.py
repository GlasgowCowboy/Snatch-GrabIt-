"""
Email Notification System
Sends notifications for workflow stages
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List
import os
from datetime import datetime

from database import get_session, EmailNotificationLog


class NotificationService:
    """Email notification service"""

    # Email configuration from environment
    SMTP_HOST = os.getenv('SMTP_HOST', 'localhost')
    SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
    SMTP_USER = os.getenv('SMTP_USER', '')
    SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')
    SMTP_FROM_EMAIL = os.getenv('SMTP_FROM_EMAIL', 'noreply@procurement.com')
    SMTP_FROM_NAME = os.getenv('SMTP_FROM_NAME', 'Procurement Platform')

    # Base URL for links in emails
    BASE_URL = os.getenv('BASE_URL', 'http://localhost:5000')

    @staticmethod
    def send_email(
        recipient_email: str,
        subject: str,
        body_html: str,
        body_text: str = None,
        notification_type: str = 'general',
        related_entity_id: str = None
    ) -> bool:
        """
        Send email notification

        Args:
            recipient_email: Recipient email address
            subject: Email subject
            body_html: HTML body
            body_text: Plain text body (optional)
            notification_type: Type of notification
            related_entity_id: Related tender/auction ID

        Returns:
            True if sent successfully
        """
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{NotificationService.SMTP_FROM_NAME} <{NotificationService.SMTP_FROM_EMAIL}>"
            msg['To'] = recipient_email

            # Add text part
            if body_text:
                text_part = MIMEText(body_text, 'plain')
                msg.attach(text_part)

            # Add HTML part
            html_part = MIMEText(body_html, 'html')
            msg.attach(html_part)

            # Send email (only if SMTP is configured)
            if NotificationService.SMTP_USER:
                with smtplib.SMTP(NotificationService.SMTP_HOST, NotificationService.SMTP_PORT) as server:
                    server.starttls()
                    server.login(NotificationService.SMTP_USER, NotificationService.SMTP_PASSWORD)
                    server.send_message(msg)

            # Log notification
            NotificationService._log_notification(
                recipient_email, subject, body_html, notification_type, related_entity_id, 'sent'
            )

            return True

        except Exception as e:
            print(f"Failed to send email to {recipient_email}: {e}")

            # Log failed notification
            NotificationService._log_notification(
                recipient_email, subject, body_html, notification_type, related_entity_id, 'failed'
            )

            return False

    @staticmethod
    def _log_notification(
        recipient_email: str,
        subject: str,
        body: str,
        notification_type: str,
        related_entity_id: str,
        status: str
    ):
        """Log email notification to database"""
        session = get_session()

        try:
            log = EmailNotificationLog(
                recipient_email=recipient_email,
                subject=subject,
                body=body,
                notification_type=notification_type,
                related_entity_id=related_entity_id,
                sent_at=datetime.utcnow(),
                status=status
            )

            session.add(log)
            session.commit()

        finally:
            session.close()

    @staticmethod
    def _get_email_template(content: str) -> str:
        """Wrap content in email template"""
        return f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #1976d2; color: white; padding: 20px; text-align: center; }}
        .content {{ padding: 20px; background: #f9f9f9; }}
        .footer {{ padding: 20px; text-align: center; font-size: 12px; color: #666; }}
        .button {{ display: inline-block; padding: 10px 20px; background: #1976d2; color: white; text-decoration: none; border-radius: 5px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Procurement Platform</h1>
        </div>
        <div class="content">
            {content}
        </div>
        <div class="footer">
            <p>This is an automated message from the Procurement Platform.</p>
            <p>Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
"""

    # Specific notification methods

    @staticmethod
    def send_tender_published_notification(
        recipient_email: str,
        tender_id: str,
        tender_name: str,
        submission_deadline: str
    ):
        """Notify vendors that tender is published"""
        subject = f"New Tender Published: {tender_name}"

        content = f"""
            <h2>New Tender Published</h2>
            <p>A new tender has been published that may interest you:</p>
            <p><strong>{tender_name}</strong></p>
            <p><strong>Submission Deadline:</strong> {submission_deadline}</p>
            <p>
                <a href="{NotificationService.BASE_URL}/tender/{tender_id}" class="button">
                    View Tender Details
                </a>
            </p>
        """

        html = NotificationService._get_email_template(content)

        NotificationService.send_email(
            recipient_email, subject, html,
            notification_type='tender_published',
            related_entity_id=tender_id
        )

    @staticmethod
    def send_response_received_notification(
        recipient_email: str,
        tender_id: str,
        tender_name: str,
        vendor_name: str
    ):
        """Notify organization that vendor response received"""
        subject = f"Vendor Response Received: {tender_name}"

        content = f"""
            <h2>Vendor Response Received</h2>
            <p>A vendor has submitted a response to your tender:</p>
            <p><strong>Tender:</strong> {tender_name}</p>
            <p><strong>Vendor:</strong> {vendor_name}</p>
            <p>
                <a href="{NotificationService.BASE_URL}/tender/{tender_id}/responses" class="button">
                    View Response
                </a>
            </p>
        """

        html = NotificationService._get_email_template(content)

        NotificationService.send_email(
            recipient_email, subject, html,
            notification_type='response_received',
            related_entity_id=tender_id
        )

    @staticmethod
    def send_auction_starting_notification(
        recipient_email: str,
        auction_id: str,
        tender_name: str,
        start_time: str
    ):
        """Notify vendors that auction is starting"""
        subject = f"Auction Starting Soon: {tender_name}"

        content = f"""
            <h2>Reverse Auction Starting</h2>
            <p>The reverse auction for the following tender is starting soon:</p>
            <p><strong>{tender_name}</strong></p>
            <p><strong>Start Time:</strong> {start_time}</p>
            <p>Please log in to participate in the auction.</p>
            <p>
                <a href="{NotificationService.BASE_URL}/auction/{auction_id}" class="button">
                    Go to Auction
                </a>
            </p>
        """

        html = NotificationService._get_email_template(content)

        NotificationService.send_email(
            recipient_email, subject, html,
            notification_type='auction_starting',
            related_entity_id=auction_id
        )

    @staticmethod
    def send_auction_outbid_notification(
        recipient_email: str,
        auction_id: str,
        tender_name: str,
        line_item_description: str
    ):
        """Notify vendor they've been outbid"""
        subject = f"You've been outbid: {tender_name}"

        content = f"""
            <h2>You've Been Outbid</h2>
            <p>Another vendor has submitted a lower bid for:</p>
            <p><strong>Tender:</strong> {tender_name}</p>
            <p><strong>Item:</strong> {line_item_description}</p>
            <p>Submit a new bid to stay competitive!</p>
            <p>
                <a href="{NotificationService.BASE_URL}/auction/{auction_id}" class="button">
                    Submit New Bid
                </a>
            </p>
        """

        html = NotificationService._get_email_template(content)

        NotificationService.send_email(
            recipient_email, subject, html,
            notification_type='auction_outbid',
            related_entity_id=auction_id
        )

    @staticmethod
    def send_auction_ending_notification(
        recipient_email: str,
        auction_id: str,
        tender_name: str,
        minutes_remaining: int
    ):
        """Notify vendors auction is ending soon"""
        subject = f"Auction Ending Soon: {tender_name}"

        content = f"""
            <h2>Auction Ending Soon</h2>
            <p>The auction is closing in {minutes_remaining} minutes!</p>
            <p><strong>{tender_name}</strong></p>
            <p>Submit your final bids now.</p>
            <p>
                <a href="{NotificationService.BASE_URL}/auction/{auction_id}" class="button">
                    Go to Auction
                </a>
            </p>
        """

        html = NotificationService._get_email_template(content)

        NotificationService.send_email(
            recipient_email, subject, html,
            notification_type='auction_ending',
            related_entity_id=auction_id
        )

    @staticmethod
    def send_award_notification(
        recipient_email: str,
        award_id: str,
        tender_name: str,
        vendor_name: str,
        items_awarded: int,
        total_value: float
    ):
        """Notify vendor they've won award"""
        subject = f"Congratulations! Award Notification: {tender_name}"

        content = f"""
            <h2>Award Notification</h2>
            <p>Congratulations! You have been awarded items in the following tender:</p>
            <p><strong>Tender:</strong> {tender_name}</p>
            <p><strong>Items Awarded:</strong> {items_awarded}</p>
            <p><strong>Total Value:</strong> £{total_value:,.2f}</p>
            <p>
                <a href="{NotificationService.BASE_URL}/award/{award_id}" class="button">
                    View Award Details
                </a>
            </p>
        """

        html = NotificationService._get_email_template(content)

        NotificationService.send_email(
            recipient_email, subject, html,
            notification_type='award_notification',
            related_entity_id=award_id
        )

    @staticmethod
    def send_message_notification(
        recipient_email: str,
        tender_name: str,
        message_subject: str,
        message_body: str,
        sender_name: str,
        tender_id: str,
        message_id: str
    ):
        """Notify about new message/question"""
        subject = f"New Message: {message_subject}"

        content = f"""
            <h2>New Message</h2>
            <p>You have received a new message regarding:</p>
            <p><strong>Tender:</strong> {tender_name}</p>
            <p><strong>From:</strong> {sender_name}</p>
            <p><strong>Subject:</strong> {message_subject}</p>
            <p><strong>Message:</strong></p>
            <blockquote style="border-left: 3px solid #1976d2; padding-left: 10px; margin: 10px 0;">
                {message_body[:200]}{'...' if len(message_body) > 200 else ''}
            </blockquote>
            <p>
                <a href="{NotificationService.BASE_URL}/tender/{tender_id}/messages/{message_id}" class="button">
                    View and Reply
                </a>
            </p>
        """

        html = NotificationService._get_email_template(content)

        NotificationService.send_email(
            recipient_email, subject, html,
            notification_type='message_received',
            related_entity_id=message_id
        )

    @staticmethod
    def send_bulk_notification(
        recipient_emails: List[str],
        subject: str,
        content: str,
        notification_type: str,
        related_entity_id: str = None
    ):
        """Send notification to multiple recipients"""
        html = NotificationService._get_email_template(content)

        for email in recipient_emails:
            NotificationService.send_email(
                email, subject, html,
                notification_type=notification_type,
                related_entity_id=related_entity_id
            )

    @staticmethod
    def send_welcome_email(recipient_email: str, full_name: str, role: str):
        """Send welcome email to new user"""
        subject = "Welcome to Procurement Platform"

        content = f"""
            <h2>Welcome to Procurement Platform!</h2>
            <p>Hello {full_name},</p>
            <p>Your account has been created successfully.</p>
            <p><strong>Role:</strong> {role}</p>
            <p>You can now log in and start using the platform.</p>
            <p>
                <a href="{NotificationService.BASE_URL}/login" class="button">
                    Log In Now
                </a>
            </p>
        """

        html = NotificationService._get_email_template(content)

        NotificationService.send_email(
            recipient_email, subject, html,
            notification_type='welcome',
            related_entity_id=None
        )
