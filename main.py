import os
import sys
import argparse
from analytics import FinanceAnalyticsEngine

def main():
    parser = argparse.ArgumentParser(description="Finance Dashboard Python CLI & Launcher")
    parser.add_argument('--serve', action='store_true', help="Start the Flask Web Dashboard server")
    parser.add_argument('--file', type=str, help="Path to CSV statement file to analyze")
    parser.add_argument('--port', type=int, default=5000, help="Port to run web server on")

    args = parser.parse_args()

    engine = FinanceAnalyticsEngine()

    if args.file:
        if not os.path.exists(args.file):
            print(f"Error: File '{args.file}' does not exist.")
            sys.exit(1)
        print(f"Analyzing statement: {args.file}")
        df = engine.parse_statement(args.file)
        summary = engine.analyze_summary(df)
        print("\n================ STATEMENT SUMMARY ================")
        print(f" Total Income       : ${summary['total_income']:>12,.2f}")
        print(f" Total Expenses     : ${summary['total_expense']:>12,.2f}")
        print(f" Net Savings        : ${summary['net_savings']:>12,.2f}")
        print(f" Savings Rate       : {summary['savings_rate']:>11.1f}%")
        print(f" Health Score       : {summary['health_score']:>11d}/100")
        print("--------------------------------------------------")
        print(" Top Spending Categories:")
        for cat, val in sorted(summary['category_breakdown'].items(), key=lambda x: x[1], reverse=True):
            print(f"   - {cat:<24}: ${val:>10,.2f}")
        print("==================================================\n")
    else:
        # Default behavior: run app.py server
        from app import app
        os.environ['PORT'] = str(args.port)
        print("Launching Python Finance Dashboard Web App...")
        app.run(host='0.0.0.0', port=args.port, debug=False)

if __name__ == '__main__':
    main()
