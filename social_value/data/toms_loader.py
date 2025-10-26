"""Load UK National TOMs framework reference data."""

from social_value.models.theme import SocialValueTheme, Outcome, Measure
from social_value.database import SessionLocal


def load_toms_framework():
    """Load the National TOMs framework themes, outcomes, and measures."""
    db = SessionLocal()

    # Check if already loaded
    existing = db.query(SocialValueTheme).first()
    if existing:
        print("TOMs framework already loaded")
        db.close()
        return

    # Define TOMs themes based on the National TOMs framework
    themes_data = [
        {
            'code': 'JOBS',
            'name': 'Jobs: Promote local skills and employment',
            'category': 'Employment',
            'description': 'Creating employment opportunities and promoting skills development',
        },
        {
            'code': 'GROWTH',
            'name': 'Growth: Supporting growth of responsible regional business',
            'category': 'Employment',
            'description': 'Supporting local businesses and supply chains',
        },
        {
            'code': 'SOCIAL',
            'name': 'Social: Healthier, safer and more resilient communities',
            'category': 'Social',
            'description': 'Improving community health, safety, and resilience',
        },
        {
            'code': 'ENVIRONMENT',
            'name': 'Environment: Decarbonising and safeguarding our world',
            'category': 'Environment',
            'description': 'Reducing carbon emissions and protecting the environment',
        },
        {
            'code': 'INNOVATION',
            'name': 'Innovation: Promoting social innovation',
            'category': 'Innovation',
            'description': 'Developing innovative solutions to social challenges',
        },
    ]

    # Create themes
    themes = {}
    for theme_data in themes_data:
        theme = SocialValueTheme(**theme_data)
        db.add(theme)
        db.flush()
        themes[theme_data['code']] = theme

    # Define sample outcomes for each theme
    outcomes_data = [
        # JOBS theme outcomes
        {
            'theme_code': 'JOBS',
            'code': 'JOBS-01',
            'name': 'Local employment',
            'description': 'Creating jobs for local people',
        },
        {
            'theme_code': 'JOBS',
            'code': 'JOBS-02',
            'name': 'Apprenticeships and training',
            'description': 'Providing apprenticeships and training opportunities',
        },
        {
            'theme_code': 'JOBS',
            'code': 'JOBS-03',
            'name': 'Employment for disadvantaged groups',
            'description': 'Creating employment for people facing barriers',
        },

        # GROWTH theme outcomes
        {
            'theme_code': 'GROWTH',
            'code': 'GROWTH-01',
            'name': 'Local supply chains',
            'description': 'Spending with local businesses and SMEs',
        },
        {
            'theme_code': 'GROWTH',
            'code': 'GROWTH-02',
            'name': 'Social enterprise support',
            'description': 'Supporting social enterprises',
        },

        # SOCIAL theme outcomes
        {
            'theme_code': 'SOCIAL',
            'code': 'SOCIAL-01',
            'name': 'Community initiatives',
            'description': 'Supporting community projects and initiatives',
        },
        {
            'theme_code': 'SOCIAL',
            'code': 'SOCIAL-02',
            'name': 'Volunteering',
            'description': 'Providing employee volunteering hours',
        },
        {
            'theme_code': 'SOCIAL',
            'code': 'SOCIAL-03',
            'name': 'Accessibility and inclusion',
            'description': 'Improving accessibility and promoting inclusion',
        },

        # ENVIRONMENT theme outcomes
        {
            'theme_code': 'ENVIRONMENT',
            'code': 'ENV-01',
            'name': 'Carbon reduction',
            'description': 'Reducing carbon emissions and energy use',
        },
        {
            'theme_code': 'ENVIRONMENT',
            'code': 'ENV-02',
            'name': 'Waste management',
            'description': 'Reducing waste and promoting recycling',
        },
        {
            'theme_code': 'ENVIRONMENT',
            'code': 'ENV-03',
            'name': 'Biodiversity',
            'description': 'Protecting and enhancing biodiversity',
        },

        # INNOVATION theme outcomes
        {
            'theme_code': 'INNOVATION',
            'code': 'INNOV-01',
            'name': 'Social innovation',
            'description': 'Developing innovative solutions to social challenges',
        },
    ]

    # Create outcomes
    outcomes = {}
    for outcome_data in outcomes_data:
        theme_code = outcome_data.pop('theme_code')
        outcome = Outcome(
            theme_id=themes[theme_code].id,
            **outcome_data
        )
        db.add(outcome)
        db.flush()
        outcomes[outcome_data['code']] = outcome

    # Define sample measures
    measures_data = [
        # Jobs measures
        {
            'outcome_code': 'JOBS-01',
            'code': 'NT1',
            'name': 'Local jobs created',
            'description': 'Number of local people (FTE) employed on contract',
            'unit': 'person years',
            'proxy_value': '£25,883',
        },
        {
            'outcome_code': 'JOBS-02',
            'code': 'NT2',
            'name': 'Apprenticeships created',
            'description': 'Number of apprenticeships created',
            'unit': 'apprenticeships',
            'proxy_value': '£14,336',
        },
        {
            'outcome_code': 'JOBS-02',
            'code': 'NT3',
            'name': 'Training weeks provided',
            'description': 'Weeks of training provided',
            'unit': 'person weeks',
            'proxy_value': '£496',
        },
        {
            'outcome_code': 'JOBS-03',
            'code': 'NT4',
            'name': 'Jobs for disadvantaged groups',
            'description': 'Number of staff hours spent on supporting unemployed people into work',
            'unit': 'hours',
            'proxy_value': '£15',
        },

        # Growth measures
        {
            'outcome_code': 'GROWTH-01',
            'code': 'NT5',
            'name': 'Local SME spend',
            'description': 'Total value of contract spent with local SMEs',
            'unit': 'GBP',
            'proxy_value': '£0.76 per £1 spent',
        },
        {
            'outcome_code': 'GROWTH-02',
            'code': 'NT6',
            'name': 'Social enterprise spend',
            'description': 'Total value spent with social enterprises',
            'unit': 'GBP',
            'proxy_value': '£0.60 per £1 spent',
        },

        # Social measures
        {
            'outcome_code': 'SOCIAL-02',
            'code': 'NT7',
            'name': 'Volunteering hours',
            'description': 'Number of hours volunteering in local community',
            'unit': 'hours',
            'proxy_value': '£15',
        },
        {
            'outcome_code': 'SOCIAL-01',
            'code': 'NT8',
            'name': 'Community donations',
            'description': 'Donations to local community projects',
            'unit': 'GBP',
            'proxy_value': '£1 per £1',
        },

        # Environment measures
        {
            'outcome_code': 'ENV-01',
            'code': 'NT9',
            'name': 'Carbon reduction',
            'description': 'CO2 emissions reduced',
            'unit': 'tonnes CO2e',
            'proxy_value': '£68',
        },
        {
            'outcome_code': 'ENV-02',
            'code': 'NT10',
            'name': 'Waste diverted from landfill',
            'description': 'Tonnes of waste diverted from landfill',
            'unit': 'tonnes',
            'proxy_value': '£100',
        },
    ]

    # Create measures
    for measure_data in measures_data:
        outcome_code = measure_data.pop('outcome_code')
        measure = Measure(
            outcome_id=outcomes[outcome_code].id,
            **measure_data
        )
        db.add(measure)

    db.commit()
    print("TOMs framework loaded successfully")
    print(f"  - {len(themes_data)} themes")
    print(f"  - {len(outcomes_data)} outcomes")
    print(f"  - {len(measures_data)} measures")

    db.close()


if __name__ == '__main__':
    load_toms_framework()
