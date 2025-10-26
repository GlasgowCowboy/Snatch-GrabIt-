# Social Value Consultant Tool - User Guide

## Overview

The Social Value Consultant Tool helps UK public sector bodies manage social value commitments throughout the procurement lifecycle, from planning to delivery and reporting.

## Getting Started

### Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Install the package
pip install -e .
```

### Initialize the Database

Before using the tool, initialize the database and load the UK TOMs framework:

```bash
python -m social_value.cli init
```

or if installed:

```bash
social-value init
```

## Workflow

### 1. Planning Phase

#### Create a Contract

Define your procurement contract with social value requirements:

```bash
python -m social_value.cli contract create \
  --name "Road Maintenance 2025-2028" \
  --value 5000000 \
  --sv-percentage 10 \
  --description "3-year road maintenance contract" \
  --authority "City Council"
```

#### View Available Themes

List the TOMs framework themes available:

```bash
python -m social_value.cli theme list
```

You'll see themes like:
- JOBS: Promote local skills and employment
- GROWTH: Supporting growth of responsible regional business
- SOCIAL: Healthier, safer and more resilient communities
- ENVIRONMENT: Decarbonising and safeguarding our world
- INNOVATION: Promoting social innovation

#### View Contract Details

```bash
python -m social_value.cli contract show 1
```

### 2. Execution Phase

#### Register Vendors

Register vendors who are bidding on the contract:

```bash
python -m social_value.cli vendor create \
  --name "BuildCo Ltd" \
  --company-number "12345678" \
  --contact-name "John Smith" \
  --contact-email "john@buildco.com" \
  --is-sme \
  --is-local
```

#### Record Social Value Commitments

Record commitments made by vendors during the tender process:

```bash
# Example: Job creation commitment
python -m social_value.cli commitment add \
  --contract-id 1 \
  --vendor-id 1 \
  --theme-id 1 \
  --description "Create 10 local jobs for contract duration" \
  --target-value 10 \
  --target-unit "jobs" \
  --monetary-value 258830 \
  --is-mandatory

# Example: Apprenticeship commitment
python -m social_value.cli commitment add \
  --contract-id 1 \
  --vendor-id 1 \
  --theme-id 1 \
  --description "Provide 5 apprenticeships" \
  --target-value 5 \
  --target-unit "apprenticeships" \
  --monetary-value 71680

# Example: Carbon reduction
python -m social_value.cli commitment add \
  --contract-id 1 \
  --vendor-id 1 \
  --theme-id 4 \
  --description "Reduce CO2 emissions by 50 tonnes" \
  --target-value 50 \
  --target-unit "tonnes CO2e" \
  --monetary-value 3400
```

#### List All Commitments

```bash
# All commitments for a contract
python -m social_value.cli commitment list --contract-id 1

# All commitments from a vendor
python -m social_value.cli commitment list --vendor-id 1
```

### 3. Monitoring Phase

Once the contract is awarded, monitor progress against commitments:

#### Add Progress Updates

```bash
# Progress on job creation
python -m social_value.cli monitor update \
  --commitment-id 1 \
  --progress 7 \
  --status "On Track" \
  --description "7 out of 10 jobs created so far" \
  --evidence "Employment records reviewed" \
  --reported-by "Contract Manager"

# Progress on apprenticeships
python -m social_value.cli monitor update \
  --commitment-id 2 \
  --progress 5 \
  --status "Achieved" \
  --description "All 5 apprenticeships filled" \
  --evidence "Training records on file"
```

#### View Commitment Progress

```bash
python -m social_value.cli monitor show 1
```

### 4. Reporting Phase

#### Generate Contract Dashboard

Get a high-level overview:

```bash
python -m social_value.cli report dashboard 1
```

#### Generate Detailed Contract Report

```bash
# Text format (default)
python -m social_value.cli report contract 1

# JSON format
python -m social_value.cli report contract 1 --format json

# Table format
python -m social_value.cli report contract 1 --format table
```

#### Generate Vendor Report

```bash
python -m social_value.cli report vendor 1 --contract-id 1
```

#### Export to CSV

```bash
python -m social_value.cli report export 1 contract_report.csv
```

## Common Use Cases

### Use Case 1: Evaluating Vendor Bids

1. Create the contract
2. Register all bidding vendors
3. Record each vendor's social value commitments
4. Compare total monetary values to evaluate bids
5. Generate vendor reports for comparison

### Use Case 2: Contract Management

1. Award contract to winning vendor
2. Set up monitoring schedule (e.g., quarterly)
3. Collect progress updates from vendor
4. Add updates to the system
5. Generate dashboards for stakeholders

### Use Case 3: Annual Reporting

1. Generate contract reports for all active contracts
2. Export data to CSV for analysis
3. Identify at-risk commitments
4. Prepare compliance reports for PPN 06/20

## Tips and Best Practice

### Planning Tips

- Set realistic social value percentages (typically 10-20%)
- Align requirements with local priorities
- Use TOMs framework measures for consistency
- Make some commitments mandatory, others desirable

### Execution Tips

- Record all vendor commitments during evaluation
- Include proxy values for comparison
- Document evaluation scores
- Keep descriptions specific and measurable

### Monitoring Tips

- Set regular monitoring intervals
- Request evidence of delivery
- Mark updates as verified
- Address at-risk commitments quickly

### Reporting Tips

- Generate dashboards quarterly
- Share progress with stakeholders
- Use CSV exports for deeper analysis
- Document lessons learned

## TOMs Framework Reference

The National TOMs (Themes, Outcomes, Measures) framework provides standardized measures for social value. The tool includes common TOMs measures with proxy values.

### Proxy Values

Proxy values convert social value activities into monetary terms for comparison:

- Local job created: £25,883 per person year
- Apprenticeship: £14,336 per apprenticeship
- Training week: £496 per person week
- Volunteering hour: £15 per hour
- Carbon reduction: £68 per tonne CO2e

## Troubleshooting

### Database Issues

If you encounter database errors, try re-initializing:

```bash
rm social_value.db
python -m social_value.cli init
```

### Import Errors

Ensure all dependencies are installed:

```bash
pip install -r requirements.txt
```

### Permission Issues

Ensure you have write permissions in the directory where the database is stored.

## Support

For issues or questions, refer to the README.md or raise an issue in the project repository.
