# Social Value Consultant Tool

A comprehensive tool for UK public sector bodies to plan, execute, monitor, and report on social value commitments from vendors during procurement processes.

## Overview

This tool helps manage social value commitments aligned with the UK Public Services (Social Value) Act 2012 and the National TOMs (Themes, Outcomes, Measures) framework. It enables public sector organizations to:

- **Plan**: Define social value requirements and set targets for procurement contracts
- **Execute**: Track and record vendor commitments during the procurement process
- **Monitor**: Track progress against commitments throughout contract delivery
- **Report**: Generate comprehensive reports on social value delivery

## Features

### Planning Module
- Define social value themes (Employment, Environment, Social, Innovation)
- Set measurable outcomes and targets
- Create procurement-specific social value requirements
- Calculate minimum social value percentages

### Execution Module
- Register vendors and their proposals
- Record social value commitments by theme
- Compare vendor offerings against requirements
- Track evaluation scores

### Monitoring Module
- Log progress updates against commitments
- Track milestone achievements
- Record evidence of delivery
- Flag underperformance

### Reporting Module
- Generate contract performance reports
- Create dashboard summaries
- Export data for external reporting
- Compliance documentation

## UK TOMs Framework Integration

The tool includes reference data for the National TOMs framework covering:
- **Employment**: Jobs created, apprenticeships, work experience
- **Environment**: Carbon reduction, waste management, biodiversity
- **Social**: Community initiatives, volunteering, accessibility
- **Innovation**: New solutions, local SME engagement

## Installation

```bash
pip install -r requirements.txt
```

## Quick Start

```bash
# Initialize the database
python -m social_value.cli init

# Create a new contract
python -m social_value.cli contract create --name "Road Maintenance 2025" --value 5000000

# Add vendor commitments
python -m social_value.cli commitment add --vendor "BuildCo Ltd" --contract "Road Maintenance 2025"

# Monitor progress
python -m social_value.cli monitor update --commitment-id 1 --progress 75

# Generate reports
python -m social_value.cli report generate --contract "Road Maintenance 2025"
```

## Documentation

See the `/docs` directory for detailed usage guides and examples.

## Compliance

This tool supports compliance with:
- Public Services (Social Value) Act 2012
- Procurement Policy Note (PPN) 06/20
- National TOMs Framework
- Local Government Social Value Toolkit

## License

MIT License
