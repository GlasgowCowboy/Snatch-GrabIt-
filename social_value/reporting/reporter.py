"""Social Value Reporter for generating reports and analytics."""

from typing import List, Dict, Optional
from datetime import datetime
from tabulate import tabulate
import json
from social_value.models.contract import Contract
from social_value.models.vendor import Vendor
from social_value.models.commitment import Commitment
from social_value.models.theme import SocialValueTheme
from social_value.models.monitoring import MonitoringUpdate
from social_value.database import SessionLocal


class SocialValueReporter:
    """Handles generation of social value reports."""

    def __init__(self):
        self.db = SessionLocal()

    def generate_contract_report(self, contract_id: int, format: str = 'text') -> str:
        """
        Generate a comprehensive contract report.

        Args:
            contract_id: Contract ID
            format: Output format ('text', 'json', 'table')

        Returns:
            Formatted report string
        """
        contract = self.db.query(Contract).filter(Contract.id == contract_id).first()
        if not contract:
            return f"Contract {contract_id} not found"

        commitments = self.db.query(Commitment).filter(Commitment.contract_id == contract_id).all()

        report_data = {
            'contract': contract.to_dict(),
            'summary': self._generate_summary(contract, commitments),
            'commitments_by_theme': self._group_by_theme(commitments),
            'commitments_by_vendor': self._group_by_vendor(commitments),
            'performance': self._calculate_performance(commitments),
        }

        if format == 'json':
            return json.dumps(report_data, indent=2, default=str)
        elif format == 'table':
            return self._format_as_table(report_data)
        else:
            return self._format_as_text(report_data)

    def generate_vendor_report(self, vendor_id: int, contract_id: Optional[int] = None) -> str:
        """
        Generate a vendor performance report.

        Args:
            vendor_id: Vendor ID
            contract_id: Optional contract ID to filter

        Returns:
            Formatted report string
        """
        vendor = self.db.query(Vendor).filter(Vendor.id == vendor_id).first()
        if not vendor:
            return f"Vendor {vendor_id} not found"

        query = self.db.query(Commitment).filter(Commitment.vendor_id == vendor_id)
        if contract_id:
            query = query.filter(Commitment.contract_id == contract_id)

        commitments = query.all()

        report = f"\n{'='*60}\n"
        report += f"VENDOR PERFORMANCE REPORT\n"
        report += f"{'='*60}\n\n"
        report += f"Vendor: {vendor.name}\n"
        report += f"Contact: {vendor.contact_name} ({vendor.contact_email})\n"
        report += f"SME Status: {'Yes' if vendor.is_sme else 'No'}\n"
        report += f"Local: {'Yes' if vendor.is_local else 'No'}\n\n"
        report += f"Total Commitments: {len(commitments)}\n"

        if commitments:
            total_value = sum(c.monetary_value for c in commitments if c.monetary_value)
            report += f"Total Monetary Value: £{total_value:,.2f}\n\n"

            # Group by status
            status_counts = {}
            for c in commitments:
                status_counts[c.status] = status_counts.get(c.status, 0) + 1

            report += "Commitments by Status:\n"
            for status, count in status_counts.items():
                report += f"  - {status}: {count}\n"

        return report

    def generate_theme_report(self, theme_id: int, contract_id: Optional[int] = None) -> str:
        """
        Generate a report for a specific social value theme.

        Args:
            theme_id: Theme ID
            contract_id: Optional contract ID to filter

        Returns:
            Formatted report string
        """
        theme = self.db.query(SocialValueTheme).filter(SocialValueTheme.id == theme_id).first()
        if not theme:
            return f"Theme {theme_id} not found"

        query = self.db.query(Commitment).filter(Commitment.theme_id == theme_id)
        if contract_id:
            query = query.filter(Commitment.contract_id == contract_id)

        commitments = query.all()

        report = f"\n{'='*60}\n"
        report += f"THEME REPORT: {theme.name}\n"
        report += f"{'='*60}\n\n"
        report += f"Category: {theme.category}\n"
        report += f"Description: {theme.description or 'N/A'}\n\n"
        report += f"Total Commitments: {len(commitments)}\n"

        if commitments:
            total_value = sum(c.monetary_value for c in commitments if c.monetary_value)
            report += f"Total Monetary Value: £{total_value:,.2f}\n"

        return report

    def generate_dashboard(self, contract_id: int) -> str:
        """
        Generate a dashboard summary for a contract.

        Args:
            contract_id: Contract ID

        Returns:
            Formatted dashboard string
        """
        contract = self.db.query(Contract).filter(Contract.id == contract_id).first()
        if not contract:
            return f"Contract {contract_id} not found"

        commitments = self.db.query(Commitment).filter(Commitment.contract_id == contract_id).all()

        dashboard = f"\n{'='*70}\n"
        dashboard += f"SOCIAL VALUE DASHBOARD\n"
        dashboard += f"{'='*70}\n\n"
        dashboard += f"Contract: {contract.name}\n"
        dashboard += f"Value: £{contract.contract_value:,.2f}\n"
        dashboard += f"Social Value Target ({contract.social_value_percentage}%): £{contract.contract_value * contract.social_value_percentage / 100:,.2f}\n"
        dashboard += f"Status: {contract.status}\n\n"

        if commitments:
            total_committed = sum(c.monetary_value for c in commitments if c.monetary_value)
            dashboard += f"Total Committed Value: £{total_committed:,.2f}\n"
            dashboard += f"Target Achievement: {(total_committed / (contract.contract_value * contract.social_value_percentage / 100)) * 100:.1f}%\n\n"

            # Performance by status
            dashboard += "Performance Overview:\n"
            status_counts = {}
            for c in commitments:
                status_counts[c.status] = status_counts.get(c.status, 0) + 1

            for status, count in sorted(status_counts.items()):
                percentage = (count / len(commitments)) * 100
                dashboard += f"  {status:15s}: {count:3d} ({percentage:5.1f}%)\n"

            dashboard += "\n"

            # By theme
            theme_data = self._group_by_theme(commitments)
            if theme_data:
                dashboard += "Commitments by Theme:\n"
                for theme_name, theme_commitments in theme_data.items():
                    theme_value = sum(c.monetary_value for c in theme_commitments if c.monetary_value)
                    dashboard += f"  {theme_name:20s}: {len(theme_commitments):3d} commitments, £{theme_value:,.2f}\n"

        return dashboard

    def export_to_csv(self, contract_id: int, output_file: str) -> bool:
        """
        Export contract commitments to CSV.

        Args:
            contract_id: Contract ID
            output_file: Output CSV file path

        Returns:
            True if successful
        """
        try:
            import csv

            commitments = self.db.query(Commitment).filter(Commitment.contract_id == contract_id).all()

            with open(output_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)

                # Header
                writer.writerow([
                    'ID', 'Vendor ID', 'Theme ID', 'Description', 'Target Value',
                    'Target Unit', 'Monetary Value', 'Status', 'Progress',
                    'Delivery Date', 'Is Mandatory', 'Evaluation Score'
                ])

                # Data
                for c in commitments:
                    writer.writerow([
                        c.id, c.vendor_id, c.theme_id, c.description, c.target_value,
                        c.target_unit, c.monetary_value, c.status, c.current_progress,
                        c.delivery_date, c.is_mandatory, c.evaluation_score
                    ])

            return True
        except Exception as e:
            print(f"Error exporting to CSV: {e}")
            return False

    def _generate_summary(self, contract: Contract, commitments: List[Commitment]) -> Dict:
        """Generate summary statistics."""
        total_commitments = len(commitments)
        total_value = sum(c.monetary_value for c in commitments if c.monetary_value)
        target_value = contract.contract_value * (contract.social_value_percentage / 100)

        return {
            'total_commitments': total_commitments,
            'total_monetary_value': total_value,
            'target_value': target_value,
            'target_achievement_percentage': (total_value / target_value * 100) if target_value > 0 else 0,
        }

    def _group_by_theme(self, commitments: List[Commitment]) -> Dict[str, List[Commitment]]:
        """Group commitments by theme."""
        themes = {}
        for commitment in commitments:
            theme = self.db.query(SocialValueTheme).filter(
                SocialValueTheme.id == commitment.theme_id
            ).first()
            theme_name = theme.name if theme else f"Theme {commitment.theme_id}"

            if theme_name not in themes:
                themes[theme_name] = []
            themes[theme_name].append(commitment)

        return themes

    def _group_by_vendor(self, commitments: List[Commitment]) -> Dict[str, List[Commitment]]:
        """Group commitments by vendor."""
        vendors = {}
        for commitment in commitments:
            vendor = self.db.query(Vendor).filter(Vendor.id == commitment.vendor_id).first()
            vendor_name = vendor.name if vendor else f"Vendor {commitment.vendor_id}"

            if vendor_name not in vendors:
                vendors[vendor_name] = []
            vendors[vendor_name].append(commitment)

        return vendors

    def _calculate_performance(self, commitments: List[Commitment]) -> Dict:
        """Calculate performance metrics."""
        if not commitments:
            return {}

        total = len(commitments)
        on_track = len([c for c in commitments if c.status in ['Committed', 'In Progress', 'On Track']])
        achieved = len([c for c in commitments if c.status == 'Achieved'])
        at_risk = len([c for c in commitments if c.status == 'At Risk'])
        delayed = len([c for c in commitments if c.status == 'Delayed'])

        avg_progress = sum(c.current_progress for c in commitments) / total

        return {
            'on_track': on_track,
            'achieved': achieved,
            'at_risk': at_risk,
            'delayed': delayed,
            'average_progress': avg_progress,
            'success_rate': ((on_track + achieved) / total * 100) if total > 0 else 0,
        }

    def _format_as_text(self, report_data: Dict) -> str:
        """Format report as plain text."""
        contract = report_data['contract']
        summary = report_data['summary']
        performance = report_data.get('performance', {})

        text = f"\n{'='*70}\n"
        text += f"SOCIAL VALUE CONTRACT REPORT\n"
        text += f"{'='*70}\n\n"
        text += f"Contract: {contract['name']}\n"
        text += f"Reference: {contract.get('contract_reference', 'N/A')}\n"
        text += f"Authority: {contract.get('procuring_authority', 'N/A')}\n"
        text += f"Value: £{contract['contract_value']:,.2f}\n"
        text += f"Status: {contract['status']}\n\n"

        text += f"SUMMARY\n"
        text += f"{'-'*70}\n"
        text += f"Total Commitments: {summary['total_commitments']}\n"
        text += f"Total Monetary Value: £{summary['total_monetary_value']:,.2f}\n"
        text += f"Target Value: £{summary['target_value']:,.2f}\n"
        text += f"Target Achievement: {summary['target_achievement_percentage']:.1f}%\n\n"

        if performance:
            text += f"PERFORMANCE\n"
            text += f"{'-'*70}\n"
            text += f"On Track: {performance.get('on_track', 0)}\n"
            text += f"Achieved: {performance.get('achieved', 0)}\n"
            text += f"At Risk: {performance.get('at_risk', 0)}\n"
            text += f"Delayed: {performance.get('delayed', 0)}\n"
            text += f"Average Progress: {performance.get('average_progress', 0):.1f}%\n"
            text += f"Success Rate: {performance.get('success_rate', 0):.1f}%\n"

        return text

    def _format_as_table(self, report_data: Dict) -> str:
        """Format report as table."""
        # This would use tabulate to create nice tables
        return self._format_as_text(report_data)

    def close(self):
        """Close the database session."""
        self.db.close()
