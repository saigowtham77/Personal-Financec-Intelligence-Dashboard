# Ledgerline — Personal Finance Intelligence (Python & Web)

A personal finance intelligence dashboard that cleans and categorizes bank/credit card statement CSVs, calculates financial health scores, predicts next month's expenses using linear regression models, and visualizes income vs. expenses.

## Project Location
Saved in Desktop folder: `C:\Users\MY PC\Desktop\finance dashboard python`

## Quick Start (How to Run)

### Option 1: Double-Click Launcher (Windows)
Double-click `run.bat` in the project folder. It will start the Python server and automatically open your web browser to `http://localhost:5000`.

### Option 2: Python Command Line
```bash
cd "C:\Users\MY PC\Desktop\finance dashboard python"
python app.py
```
Then open `http://localhost:5000` in your web browser.

### Option 3: Command Line Statement Analysis
Analyze any CSV statement file directly from your terminal:
```bash
python main.py --file sample_data/sample_transactions.csv
```

## Features

- **Python Data Engine (`analytics.py`)**: Uses Pandas & NumPy for automatic column detection (Date, Description, Amount, Debit/Credit), data cleaning, keyword-based categorization, monthly trend aggregation, and linear regression prediction models.
- **Flask REST API (`app.py`)**: Web server providing endpoints (`/api/health`, `/api/sample`, `/api/analyze`) for live statement parsing and analytics.
- **Interactive Web Interface (`dashboard.html` / `index.html`)**: Responsive UI with dark mode, interactive Chart.js visualizations, financial health scores, category breakdowns, and PDF/CSV report exports.
- **Sample Data (`sample_data/sample_transactions.csv`)**: Realistic demo transactions for quick testing.

## File Structure

```
finance dashboard python/
├── app.py                     # Flask web app & REST API
├── analytics.py               # Pandas/NumPy financial analysis & prediction engine
├── main.py                    # CLI runner & analysis tool
├── run.bat                    # One-click Windows startup batch script
├── requirements.txt           # Python package dependencies
├── README.md                  # Project documentation
├── index.html                 # Login / landing view
├── dashboard.html             # Interactive finance dashboard UI
├── css/
│   └── style.css              # Design system & dark mode CSS
├── js/                        # Client-side web interactivity modules
│   ├── analytics.js
│   ├── app.js
│   ├── auth.js
│   ├── categorize.js
│   ├── charts.js
│   ├── parser.js
│   └── storage.js
└── sample_data/
    └── sample_transactions.csv # Demo bank statement CSV
```
