# Installation Guide

## Prerequisites

- Python 3.8 or higher
- pip (Python package installer)
- Git (optional, for cloning the repository)

## Installation Steps

### 1. Clone or Download the Repository

```bash
git clone <repository-url>
cd Snatch-GrabIt-
```

### 2. Create a Virtual Environment (Recommended)

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Linux/Mac:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Install the Package

For development mode (recommended):

```bash
pip install -e .
```

For production:

```bash
pip install .
```

### 5. Initialize the Database

```bash
python -m social_value.cli init
```

Or if you installed the package:

```bash
social-value init
```

This will:
- Create the SQLite database (`social_value.db`)
- Load the UK National TOMs framework reference data

## Verification

Verify the installation by running:

```bash
# List available themes
python -m social_value.cli theme list

# Or with installed package:
social-value theme list
```

You should see the TOMs framework themes displayed.

## Configuration

### Database Location

By default, the database is created as `social_value.db` in the current directory.

To use a different location, set the `SOCIAL_VALUE_DB` environment variable:

```bash
export SOCIAL_VALUE_DB=/path/to/your/database.db
```

## Troubleshooting

### Import Errors

If you get import errors, ensure all dependencies are installed:

```bash
pip install -r requirements.txt --upgrade
```

### Permission Errors

Ensure you have write permissions in the directory where you're running the tool.

### Database Already Exists

If you need to reset the database:

```bash
rm social_value.db
python -m social_value.cli init
```

**Warning:** This will delete all existing data.

## Next Steps

After installation, see:
- [User Guide](USER_GUIDE.md) for detailed usage instructions
- [Example Workflow](EXAMPLE_WORKFLOW.md) for a complete worked example
