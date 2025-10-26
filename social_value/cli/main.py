"""Main CLI interface for the Social Value Consultant Tool."""

import click
from datetime import datetime
from rich.console import Console
from rich.table import Table
from social_value.database import init_db
from social_value.planning import SocialValuePlanner
from social_value.execution import CommitmentTracker
from social_value.monitoring import ProgressMonitor
from social_value.reporting import SocialValueReporter

console = Console()


@click.group()
def cli():
    """Social Value Consultant Tool - Manage social value commitments in UK public sector procurement."""
    pass


@cli.command()
def init():
    """Initialize the database and load TOMs framework."""
    try:
        init_db()
        console.print("[green]✓ Database initialized successfully[/green]")

        # Load TOMs framework
        from social_value.data import load_toms_framework
        load_toms_framework()
        console.print("[green]✓ TOMs framework loaded successfully[/green]")
    except Exception as e:
        console.print(f"[red]✗ Error initializing: {e}[/red]")


# ============================================================================
# CONTRACT COMMANDS
# ============================================================================

@cli.group()
def contract():
    """Manage procurement contracts."""
    pass


@contract.command('create')
@click.option('--name', required=True, help='Contract name')
@click.option('--value', required=True, type=float, help='Contract value in GBP')
@click.option('--sv-percentage', default=10.0, type=float, help='Social value percentage (default: 10)')
@click.option('--description', help='Contract description')
@click.option('--authority', help='Procuring authority name')
@click.option('--reference', help='Contract reference number')
def create_contract(name, value, sv_percentage, description, authority, reference):
    """Create a new procurement contract."""
    try:
        planner = SocialValuePlanner()
        contract = planner.create_contract(
            name=name,
            contract_value=value,
            social_value_percentage=sv_percentage,
            description=description,
            procuring_authority=authority,
        )

        console.print(f"[green]✓ Contract created successfully[/green]")
        console.print(f"  ID: {contract.id}")
        console.print(f"  Name: {contract.name}")
        console.print(f"  Value: £{contract.contract_value:,.2f}")
        console.print(f"  Social Value Target: £{contract.contract_value * sv_percentage / 100:,.2f} ({sv_percentage}%)")

        planner.close()
    except Exception as e:
        console.print(f"[red]✗ Error creating contract: {e}[/red]")


@contract.command('list')
@click.option('--status', help='Filter by status')
def list_contracts(status):
    """List all contracts."""
    try:
        planner = SocialValuePlanner()
        contracts = planner.list_contracts(status=status)

        if not contracts:
            console.print("[yellow]No contracts found[/yellow]")
            planner.close()
            return

        table = Table(title="Procurement Contracts")
        table.add_column("ID", style="cyan")
        table.add_column("Name", style="green")
        table.add_column("Value", justify="right")
        table.add_column("SV %", justify="right")
        table.add_column("Status", style="yellow")

        for c in contracts:
            table.add_row(
                str(c.id),
                c.name,
                f"£{c.contract_value:,.2f}",
                f"{c.social_value_percentage}%",
                c.status
            )

        console.print(table)
        planner.close()
    except Exception as e:
        console.print(f"[red]✗ Error listing contracts: {e}[/red]")


@contract.command('show')
@click.argument('contract_id', type=int)
def show_contract(contract_id):
    """Show contract details."""
    try:
        planner = SocialValuePlanner()
        contract = planner.get_contract(contract_id=contract_id)

        if not contract:
            console.print(f"[red]✗ Contract {contract_id} not found[/red]")
            planner.close()
            return

        summary = planner.generate_planning_summary(contract)

        console.print(f"\n[bold]Contract Details[/bold]")
        console.print(f"  ID: {contract.id}")
        console.print(f"  Name: {contract.name}")
        console.print(f"  Description: {contract.description or 'N/A'}")
        console.print(f"  Value: £{contract.contract_value:,.2f}")
        console.print(f"  Social Value %: {contract.social_value_percentage}%")
        console.print(f"  Social Value Target: £{summary['social_value_target']:,.2f}")
        console.print(f"  Status: {contract.status}")
        console.print(f"  Authority: {contract.procuring_authority or 'N/A'}")

        planner.close()
    except Exception as e:
        console.print(f"[red]✗ Error showing contract: {e}[/red]")


# ============================================================================
# VENDOR COMMANDS
# ============================================================================

@cli.group()
def vendor():
    """Manage vendors/suppliers."""
    pass


@vendor.command('create')
@click.option('--name', required=True, help='Vendor name')
@click.option('--company-number', help='Companies House number')
@click.option('--contact-name', help='Contact person name')
@click.option('--contact-email', help='Contact email')
@click.option('--contact-phone', help='Contact phone')
@click.option('--is-sme', is_flag=True, help='Is SME')
@click.option('--is-local', is_flag=True, help='Is local')
def create_vendor(name, company_number, contact_name, contact_email, contact_phone, is_sme, is_local):
    """Register a new vendor."""
    try:
        tracker = CommitmentTracker()
        vendor = tracker.create_vendor(
            name=name,
            company_number=company_number,
            contact_name=contact_name,
            contact_email=contact_email,
            contact_phone=contact_phone,
            is_sme=is_sme,
            is_local=is_local,
        )

        console.print(f"[green]✓ Vendor created successfully[/green]")
        console.print(f"  ID: {vendor.id}")
        console.print(f"  Name: {vendor.name}")
        console.print(f"  SME: {'Yes' if vendor.is_sme else 'No'}")
        console.print(f"  Local: {'Yes' if vendor.is_local else 'No'}")

        tracker.close()
    except Exception as e:
        console.print(f"[red]✗ Error creating vendor: {e}[/red]")


@vendor.command('list')
def list_vendors():
    """List all vendors."""
    try:
        tracker = CommitmentTracker()
        vendors = tracker.list_vendors()

        if not vendors:
            console.print("[yellow]No vendors found[/yellow]")
            tracker.close()
            return

        table = Table(title="Registered Vendors")
        table.add_column("ID", style="cyan")
        table.add_column("Name", style="green")
        table.add_column("Contact", style="white")
        table.add_column("SME", justify="center")
        table.add_column("Local", justify="center")

        for v in vendors:
            table.add_row(
                str(v.id),
                v.name,
                v.contact_email or 'N/A',
                "✓" if v.is_sme else "✗",
                "✓" if v.is_local else "✗"
            )

        console.print(table)
        tracker.close()
    except Exception as e:
        console.print(f"[red]✗ Error listing vendors: {e}[/red]")


# ============================================================================
# COMMITMENT COMMANDS
# ============================================================================

@cli.group()
def commitment():
    """Manage social value commitments."""
    pass


@commitment.command('add')
@click.option('--contract-id', required=True, type=int, help='Contract ID')
@click.option('--vendor-id', required=True, type=int, help='Vendor ID')
@click.option('--theme-id', required=True, type=int, help='Theme ID')
@click.option('--description', required=True, help='Commitment description')
@click.option('--target-value', type=float, help='Target value')
@click.option('--target-unit', help='Target unit (e.g., jobs, hours)')
@click.option('--monetary-value', type=float, help='Monetary value in GBP')
@click.option('--is-mandatory', is_flag=True, help='Is mandatory requirement')
def add_commitment(contract_id, vendor_id, theme_id, description, target_value, target_unit, monetary_value, is_mandatory):
    """Add a social value commitment."""
    try:
        tracker = CommitmentTracker()
        commitment = tracker.create_commitment(
            contract_id=contract_id,
            vendor_id=vendor_id,
            theme_id=theme_id,
            description=description,
            target_value=target_value,
            target_unit=target_unit,
            monetary_value=monetary_value,
            is_mandatory=is_mandatory,
        )

        console.print(f"[green]✓ Commitment created successfully[/green]")
        console.print(f"  ID: {commitment.id}")
        console.print(f"  Description: {commitment.description}")
        console.print(f"  Target: {commitment.target_value} {commitment.target_unit or ''}")
        if commitment.monetary_value:
            console.print(f"  Value: £{commitment.monetary_value:,.2f}")

        tracker.close()
    except Exception as e:
        console.print(f"[red]✗ Error creating commitment: {e}[/red]")


@commitment.command('list')
@click.option('--contract-id', type=int, help='Filter by contract')
@click.option('--vendor-id', type=int, help='Filter by vendor')
@click.option('--status', help='Filter by status')
def list_commitments(contract_id, vendor_id, status):
    """List commitments."""
    try:
        tracker = CommitmentTracker()
        commitments = tracker.list_commitments(
            contract_id=contract_id,
            vendor_id=vendor_id,
            status=status
        )

        if not commitments:
            console.print("[yellow]No commitments found[/yellow]")
            tracker.close()
            return

        table = Table(title="Social Value Commitments")
        table.add_column("ID", style="cyan")
        table.add_column("Contract", style="green")
        table.add_column("Vendor", style="green")
        table.add_column("Description")
        table.add_column("Target")
        table.add_column("Status", style="yellow")
        table.add_column("Progress", justify="right")

        for c in commitments:
            target_str = f"{c.target_value} {c.target_unit}" if c.target_value and c.target_unit else "N/A"
            table.add_row(
                str(c.id),
                str(c.contract_id),
                str(c.vendor_id),
                c.description[:50] + "..." if len(c.description) > 50 else c.description,
                target_str,
                c.status,
                f"{c.current_progress:.1f}%"
            )

        console.print(table)
        tracker.close()
    except Exception as e:
        console.print(f"[red]✗ Error listing commitments: {e}[/red]")


# ============================================================================
# MONITORING COMMANDS
# ============================================================================

@cli.group()
def monitor():
    """Monitor commitment progress."""
    pass


@monitor.command('update')
@click.option('--commitment-id', required=True, type=int, help='Commitment ID')
@click.option('--progress', required=True, type=float, help='Progress value')
@click.option('--status', help='Status (On Track, At Risk, Delayed, Achieved)')
@click.option('--description', help='Update description')
@click.option('--evidence', help='Evidence of delivery')
@click.option('--reported-by', help='Person reporting')
def update_progress(commitment_id, progress, status, description, evidence, reported_by):
    """Add a progress update."""
    try:
        monitor = ProgressMonitor()
        update = monitor.add_update(
            commitment_id=commitment_id,
            progress_value=progress,
            status=status,
            description=description,
            evidence=evidence,
            reported_by=reported_by,
        )

        console.print(f"[green]✓ Progress update recorded[/green]")
        console.print(f"  Update ID: {update.id}")
        console.print(f"  Progress: {update.progress_value}")
        console.print(f"  Status: {update.status or 'N/A'}")

        monitor.close()
    except Exception as e:
        console.print(f"[red]✗ Error updating progress: {e}[/red]")


@monitor.command('show')
@click.argument('commitment_id', type=int)
def show_progress(commitment_id):
    """Show progress for a commitment."""
    try:
        monitor = ProgressMonitor()
        progress = monitor.get_commitment_progress(commitment_id)

        if not progress:
            console.print(f"[red]✗ Commitment {commitment_id} not found[/red]")
            monitor.close()
            return

        console.print(f"\n[bold]Commitment Progress[/bold]")
        console.print(f"  ID: {progress['commitment_id']}")
        console.print(f"  Description: {progress['description']}")
        console.print(f"  Target: {progress['target_value']} {progress['target_unit'] or ''}")
        console.print(f"  Current Progress: {progress['current_progress']}")
        console.print(f"  Progress: {progress['progress_percentage']:.1f}%")
        console.print(f"  Status: {progress['status']}")
        console.print(f"  Total Updates: {progress['total_updates']}")
        console.print(f"  Verified Updates: {progress['verified_updates']}")

        monitor.close()
    except Exception as e:
        console.print(f"[red]✗ Error showing progress: {e}[/red]")


# ============================================================================
# REPORTING COMMANDS
# ============================================================================

@cli.group()
def report():
    """Generate reports."""
    pass


@report.command('contract')
@click.argument('contract_id', type=int)
@click.option('--format', default='text', type=click.Choice(['text', 'json', 'table']), help='Output format')
def contract_report(contract_id, format):
    """Generate a contract report."""
    try:
        reporter = SocialValueReporter()
        report_output = reporter.generate_contract_report(contract_id, format=format)
        console.print(report_output)
        reporter.close()
    except Exception as e:
        console.print(f"[red]✗ Error generating report: {e}[/red]")


@report.command('dashboard')
@click.argument('contract_id', type=int)
def dashboard(contract_id):
    """Show contract dashboard."""
    try:
        reporter = SocialValueReporter()
        dashboard_output = reporter.generate_dashboard(contract_id)
        console.print(dashboard_output)
        reporter.close()
    except Exception as e:
        console.print(f"[red]✗ Error generating dashboard: {e}[/red]")


@report.command('vendor')
@click.argument('vendor_id', type=int)
@click.option('--contract-id', type=int, help='Filter by contract')
def vendor_report(vendor_id, contract_id):
    """Generate a vendor report."""
    try:
        reporter = SocialValueReporter()
        report_output = reporter.generate_vendor_report(vendor_id, contract_id=contract_id)
        console.print(report_output)
        reporter.close()
    except Exception as e:
        console.print(f"[red]✗ Error generating report: {e}[/red]")


@report.command('export')
@click.argument('contract_id', type=int)
@click.argument('output_file')
def export_csv(contract_id, output_file):
    """Export contract data to CSV."""
    try:
        reporter = SocialValueReporter()
        success = reporter.export_to_csv(contract_id, output_file)

        if success:
            console.print(f"[green]✓ Data exported to {output_file}[/green]")
        else:
            console.print(f"[red]✗ Export failed[/red]")

        reporter.close()
    except Exception as e:
        console.print(f"[red]✗ Error exporting data: {e}[/red]")


# ============================================================================
# THEME COMMANDS
# ============================================================================

@cli.group()
def theme():
    """Manage social value themes."""
    pass


@theme.command('list')
@click.option('--category', help='Filter by category')
def list_themes(category):
    """List available themes."""
    try:
        planner = SocialValuePlanner()
        themes = planner.get_available_themes(category=category)

        if not themes:
            console.print("[yellow]No themes found. Run 'init' to load TOMs framework[/yellow]")
            planner.close()
            return

        table = Table(title="Social Value Themes (TOMs Framework)")
        table.add_column("ID", style="cyan")
        table.add_column("Code", style="green")
        table.add_column("Name", style="white")
        table.add_column("Category", style="yellow")

        for t in themes:
            table.add_row(
                str(t.id),
                t.code,
                t.name,
                t.category or 'N/A'
            )

        console.print(table)
        planner.close()
    except Exception as e:
        console.print(f"[red]✗ Error listing themes: {e}[/red]")


if __name__ == '__main__':
    cli()
