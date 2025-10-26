from setuptools import setup, find_packages

setup(
    name="social-value-consultant",
    version="1.0.0",
    description="Social Value Consultant Tool for UK Public Sector Procurement",
    author="Social Value Tools",
    packages=find_packages(),
    install_requires=[
        "click>=8.1.0",
        "sqlalchemy>=2.0.0",
        "pandas>=2.0.0",
        "tabulate>=0.9.0",
        "python-dateutil>=2.8.0",
        "pydantic>=2.0.0",
        "rich>=13.0.0",
    ],
    entry_points={
        "console_scripts": [
            "social-value=social_value.cli.main:cli",
        ],
    },
    python_requires=">=3.8",
)
