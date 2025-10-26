# Example Workflow: Road Maintenance Contract

This example demonstrates a complete workflow for managing social value on a road maintenance contract.

## Scenario

**City Council** is procuring a 3-year road maintenance contract worth £5 million. The council requires a minimum 10% social value commitment (£500,000 in TOMs proxy value).

Three vendors submit bids with different social value offerings.

## Step 1: Initialize the System

```bash
python -m social_value.cli init
```

## Step 2: Create the Contract

```bash
python -m social_value.cli contract create \
  --name "Road Maintenance 2025-2028" \
  --value 5000000 \
  --sv-percentage 10 \
  --description "3-year road maintenance contract covering main highways" \
  --authority "City Council" \
  --reference "RC-2025-001"
```

**Output:**
```
✓ Contract created successfully
  ID: 1
  Name: Road Maintenance 2025-2028
  Value: £5,000,000.00
  Social Value Target: £500,000.00 (10%)
```

## Step 3: Register Vendors

### Vendor A: BuildCo Ltd (Local SME)

```bash
python -m social_value.cli vendor create \
  --name "BuildCo Ltd" \
  --company-number "12345678" \
  --contact-name "Sarah Johnson" \
  --contact-email "sarah@buildco.com" \
  --contact-phone "01234 567890" \
  --is-sme \
  --is-local
```

### Vendor B: MegaConstruct PLC (Large National)

```bash
python -m social_value.cli vendor create \
  --name "MegaConstruct PLC" \
  --company-number "87654321" \
  --contact-name "David Brown" \
  --contact-email "david@megaconstruct.com"
```

### Vendor C: GreenRoads Ltd (Social Enterprise)

```bash
python -m social_value.cli vendor create \
  --name "GreenRoads Ltd" \
  --company-number "11223344" \
  --contact-name "Emma Green" \
  --contact-email "emma@greenroads.com" \
  --is-sme \
  --is-local
```

## Step 4: Record Vendor Commitments

### BuildCo Ltd Commitments

```bash
# 8 local jobs
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 1 --theme-id 1 \
  --description "Create 8 local jobs (FTE) for contract duration" \
  --target-value 24 --target-unit "person years" \
  --monetary-value 207064

# 3 apprenticeships
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 1 --theme-id 1 \
  --description "Provide 3 apprenticeships over contract period" \
  --target-value 3 --target-unit "apprenticeships" \
  --monetary-value 43008

# Local SME spend
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 1 --theme-id 2 \
  --description "Spend 20% of contract value with local SMEs" \
  --target-value 1000000 --target-unit "GBP" \
  --monetary-value 760000

# Volunteering
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 1 --theme-id 3 \
  --description "Provide 200 hours of employee volunteering" \
  --target-value 200 --target-unit "hours" \
  --monetary-value 3000
```

**BuildCo Total: £1,013,072**

### MegaConstruct PLC Commitments

```bash
# 12 jobs (not all local)
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 2 --theme-id 1 \
  --description "Create 12 jobs for contract duration" \
  --target-value 36 --target-unit "person years" \
  --monetary-value 310596

# 5 apprenticeships
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 2 --theme-id 1 \
  --description "Provide 5 apprenticeships" \
  --target-value 5 --target-unit "apprenticeships" \
  --monetary-value 71680

# Carbon reduction
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 2 --theme-id 4 \
  --description "Reduce CO2 emissions by 100 tonnes through electric vehicles" \
  --target-value 100 --target-unit "tonnes CO2e" \
  --monetary-value 6800

# Waste reduction
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 2 --theme-id 4 \
  --description "Divert 50 tonnes of waste from landfill" \
  --target-value 50 --target-unit "tonnes" \
  --monetary-value 5000
```

**MegaConstruct Total: £394,076**

### GreenRoads Ltd Commitments

```bash
# 10 jobs for disadvantaged groups
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 3 --theme-id 1 \
  --description "Create 10 jobs for long-term unemployed people" \
  --target-value 30 --target-unit "person years" \
  --monetary-value 258830

# Training
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 3 --theme-id 1 \
  --description "Provide 100 weeks of training" \
  --target-value 100 --target-unit "person weeks" \
  --monetary-value 49600

# Social enterprise spend
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 3 --theme-id 2 \
  --description "Spend 15% with social enterprises" \
  --target-value 750000 --target-unit "GBP" \
  --monetary-value 450000

# Community donations
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 3 --theme-id 3 \
  --description "£10,000 donations to community projects" \
  --target-value 10000 --target-unit "GBP" \
  --monetary-value 10000

# Volunteering
python -m social_value.cli commitment add \
  --contract-id 1 --vendor-id 3 --theme-id 3 \
  --description "Provide 400 hours employee volunteering" \
  --target-value 400 --target-unit "hours" \
  --monetary-value 6000
```

**GreenRoads Total: £774,430**

## Step 5: Compare Vendor Offerings

```bash
# View all commitments
python -m social_value.cli commitment list --contract-id 1

# Generate vendor reports
python -m social_value.cli report vendor 1 --contract-id 1
python -m social_value.cli report vendor 2 --contract-id 1
python -m social_value.cli report vendor 3 --contract-id 1
```

### Evaluation Summary

| Vendor | Social Value Offer | % of Target | Commercial Score | Overall |
|--------|-------------------|-------------|------------------|---------|
| BuildCo | £1,013,072 | 203% | 85 | Winner |
| MegaConstruct | £394,076 | 79% | 90 | - |
| GreenRoads | £774,430 | 155% | 80 | - |

**Decision:** BuildCo Ltd wins - highest social value offer (203% of target) with strong commercial score.

## Step 6: Contract Award & Monitoring

Update contract status:

```bash
python -m social_value.cli contract show 1
# Manually update status in database to "Awarded"
```

## Step 7: Monitor Progress (Year 1, Q1)

After 3 months, collect updates from BuildCo:

```bash
# Jobs: 6 of 8 created
python -m social_value.cli monitor update \
  --commitment-id 1 \
  --progress 6 \
  --status "On Track" \
  --description "6 local jobs created, 2 more planned for Q2" \
  --evidence "Employment contracts on file" \
  --reported-by "Sarah Johnson"

# Apprenticeships: 1 started
python -m social_value.cli monitor update \
  --commitment-id 2 \
  --progress 1 \
  --status "On Track" \
  --description "1 apprentice started, 2 more starting Q3" \
  --evidence "Apprenticeship agreement signed" \
  --reported-by "Sarah Johnson"

# SME spend: On track
python -m social_value.cli monitor update \
  --commitment-id 3 \
  --progress 250000 \
  --status "On Track" \
  --description "£250k spent with local SMEs so far" \
  --evidence "Purchase orders and invoices" \
  --reported-by "Sarah Johnson"

# Volunteering: Started
python -m social_value.cli monitor update \
  --commitment-id 4 \
  --progress 30 \
  --status "On Track" \
  --description "30 hours volunteering completed (beach cleanup, school visits)" \
  --evidence "Volunteer timesheets and photos" \
  --reported-by "Sarah Johnson"
```

## Step 8: Generate Q1 Report

```bash
# Dashboard overview
python -m social_value.cli report dashboard 1

# Detailed report
python -m social_value.cli report contract 1

# Export for stakeholders
python -m social_value.cli report export 1 q1_report.csv
```

## Step 9: Year-End Review

After 12 months:

```bash
# Check progress on all commitments
python -m social_value.cli commitment list --contract-id 1

# Generate annual report
python -m social_value.cli report contract 1 --format json > annual_report.json

# Identify any at-risk commitments
# (Would need to query the database or add a CLI command for this)
```

## Results Summary

At end of Year 1:
- ✓ 8/8 local jobs created (100%)
- ✓ 2/3 apprenticeships filled (67%, on track for year 2)
- ✓ £1.1M spent with local SMEs (110% - exceeded target)
- ✓ 250 volunteering hours (125% - exceeded target)

**Overall:** BuildCo is exceeding commitments. Contract is delivering strong social value for the community.

## Lessons Learned

1. **Clear targets:** Specific, measurable commitments made monitoring easier
2. **Regular updates:** Quarterly reviews kept vendor accountable
3. **Evidence required:** Requesting evidence ensured commitments were genuine
4. **Local SME support:** BuildCo's local connections delivered real economic benefit
5. **Exceeded expectations:** Good vendor selection led to over-delivery

## Next Steps

- Continue quarterly monitoring
- Share success stories with community
- Use learnings for next procurement
- Consider increasing social value % for future contracts
