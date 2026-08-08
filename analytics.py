import os
import re
import math
import pandas as pd
import numpy as np
from datetime import datetime

DEFAULT_CATEGORIES = {
    "Rent & Housing": ["rent", "landlord", "maintenance", "society", "lease", "housing", "property"],
    "Groceries & Food": ["supermarket", "grocery", "mart", "store", "bazaar", "provisions", "vegetables", "fruits", "dairy", "bakery"],
    "Dining & Delivery": ["restaurant", "cafe", "coffee", "baking", "swiggy", "zomato", "ubereats", "doordash", "kitchen", "diner", "pizza", "burger", "bistro"],
    "Transport & Fuel": ["petrol", "diesel", "fuel", "uber", "ola", "metro", "railway", "irctc", "transit", "bus", "toll", "parking", "cab", "taxi", "flight", "airline"],
    "Utilities & Bills": ["electric", "water", "gas", "electricity", "broadband", "wifi", "telecom", "recharge", "airtel", "jio", "vodafone", "utility", "billpay"],
    "Subscriptions & OTT": ["netflix", "spotify", "amazon prime", "youtube", "hulu", "disney", "apple", "google play", "cloud", "membership", "patreon", "sub"],
    "Shopping & Lifestyle": ["amazon", "flipkart", "myntra", "zara", "h&m", "retail", "fashion", "apparel", "shoes", "electronics", "mall"],
    "Health & Wellness": ["pharmacy", "chemist", "hospital", "clinic", "doctor", "lab", "gym", "fitness", "medical", "health", "medplus", "apollo"],
    "Entertainment & Leisure": ["cinema", "movie", "pvr", "inox", "bookmyshow", "gaming", "steam", "concert", "event", "bowling", "park"],
    "Fees & Charges": ["charge", "fee", "interest", "penalty", "gst", "tax", "atm fee", "annual fee"],
    "Income & Salary": ["salary", "payroll", "stipend", "dividend", "interest credit", "refund", "cashback", "reimbursement", "credit interest"],
    "Transfers & Investments": ["transfer", "upi", "neft", "rtgs", "imps", "sip", "mutual fund", "zerodha", "groww", "investment", "fd", "deposit"]
}

class FinanceAnalyticsEngine:
    """Finance Analytics engine for statement processing, categorization, and health scoring."""
    
    def __init__(self, category_rules=None):
        self.category_rules = category_rules or DEFAULT_CATEGORIES

    def clean_amount(self, val):
        """Converts strings with currency symbols, commas, or parens to float."""
        if pd.isna(val) or val is None:
            return 0.0
        if isinstance(val, (int, float)):
            return float(val)
        
        s = str(val).strip()
        is_neg = False
        if s.startswith('(') and s.endswith(')'):
            is_neg = True
            s = s[1:-1]
        elif s.startswith('-'):
            is_neg = True
            s = s[1:]
        
        # Remove currency symbols and non-numeric chars except dot
        s = re.sub(r'[^\d.]', '', s)
        try:
            amt = float(s) if s else 0.0
            return -amt if is_neg else amt
        except ValueError:
            return 0.0

    def auto_detect_columns(self, df):
        """Identifies Date, Amount, Description, and Debit/Credit columns dynamically."""
        col_map = {'date': None, 'desc': None, 'amount': None, 'debit': None, 'credit': None, 'type': None}
        
        for col in df.columns:
            c_lower = str(col).strip().lower()
            if not col_map['date'] and any(k in c_lower for k in ['date', 'time', 'txndate', 'value date']):
                col_map['date'] = col
            elif not col_map['desc'] and any(k in c_lower for k in ['desc', 'particulars', 'narration', 'detail', 'payee', 'merchant', 'remark']):
                col_map['desc'] = col
            elif not col_map['amount'] and c_lower in ['amount', 'amt', 'total', 'transaction amount']:
                col_map['amount'] = col
            elif not col_map['debit'] and any(k in c_lower for k in ['debit', 'dr', 'withdrawal', 'outflow']):
                col_map['debit'] = col
            elif not col_map['credit'] and any(k in c_lower for k in ['credit', 'cr', 'deposit', 'inflow']):
                col_map['credit'] = col
            elif not col_map['type'] and c_lower in ['type', 'txn type', 'd/c']:
                col_map['type'] = col
                
        return col_map

    def parse_statement(self, filepath_or_buffer):
        """Reads CSV, cleans columns, normalizes amounts and dates."""
        if isinstance(filepath_or_buffer, str):
            df = pd.read_csv(filepath_or_buffer)
        else:
            df = pd.read_csv(filepath_or_buffer)
            
        df.columns = [str(c).strip() for c in df.columns]
        cols = self.auto_detect_columns(df)
        
        txns = []
        for idx, row in df.iterrows():
            # Date parsing
            raw_date = row.get(cols['date']) if cols['date'] else None
            date_str = str(raw_date).strip() if pd.notna(raw_date) else datetime.now().strftime('%Y-%m-%d')
            
            try:
                dt = pd.to_datetime(date_str, errors='coerce')
                formatted_date = dt.strftime('%Y-%m-%d') if pd.notna(dt) else date_str
            except Exception:
                formatted_date = date_str
                
            # Description
            desc = str(row.get(cols['desc'])).strip() if cols['desc'] and pd.notna(row.get(cols['desc'])) else f"Transaction #{idx+1}"
            
            # Amount handling
            amount = 0.0
            txn_type = 'expense'
            
            if cols['amount']:
                raw_amt = self.clean_amount(row.get(cols['amount']))
                if cols['type']:
                    t_val = str(row.get(cols['type'])).lower()
                    if 'credit' in t_val or 'cr' in t_val or 'inflow' in t_val:
                        txn_type = 'income'
                        amount = abs(raw_amt)
                    else:
                        txn_type = 'expense'
                        amount = -abs(raw_amt)
                else:
                    if raw_amt >= 0:
                        amount = raw_amt
                        txn_type = 'income' if 'salary' in desc.lower() or 'credit' in desc.lower() else 'expense'
                    else:
                        amount = raw_amt
                        txn_type = 'expense'
            elif cols['debit'] or cols['credit']:
                deb = self.clean_amount(row.get(cols['debit'])) if cols['debit'] else 0.0
                cred = self.clean_amount(row.get(cols['credit'])) if cols['credit'] else 0.0
                
                if cred > 0:
                    amount = cred
                    txn_type = 'income'
                elif deb > 0:
                    amount = -deb
                    txn_type = 'expense'
                    
            category = self.categorize_transaction(desc, txn_type, amount)
            
            txns.append({
                'id': idx + 1,
                'date': formatted_date,
                'description': desc,
                'amount': abs(amount),
                'raw_amount': amount,
                'type': txn_type,
                'category': category
            })
            
        return pd.DataFrame(txns)

    def categorize_transaction(self, desc, txn_type, amount):
        """Matches transaction description against category keywords."""
        d_lower = desc.lower()
        if txn_type == 'income' or 'salary' in d_lower or 'payroll' in d_lower:
            return 'Income & Salary'
            
        for cat, keywords in self.category_rules.items():
            if cat == 'Income & Salary' and txn_type != 'income':
                continue
            for kw in keywords:
                if kw in d_lower:
                    return cat
        return 'Uncategorized'

    def analyze_summary(self, df_txns):
        """Calculates total income, expenses, savings rate, and category breakdowns."""
        if df_txns.empty:
            return {
                'total_income': 0,
                'total_expense': 0,
                'net_savings': 0,
                'savings_rate': 0,
                'category_breakdown': {},
                'monthly_trend': {},
                'health_score': 50
            }
            
        income_df = df_txns[df_txns['type'] == 'income']
        expense_df = df_txns[df_txns['type'] == 'expense']
        
        tot_income = float(income_df['amount'].sum()) if not income_df.empty else 0.0
        tot_expense = float(expense_df['amount'].sum()) if not expense_df.empty else 0.0
        net_savings = tot_income - tot_expense
        savings_rate = (net_savings / tot_income * 100) if tot_income > 0 else (0.0 if tot_expense > 0 else 100.0)
        
        # Category Breakdown
        cat_group = expense_df.groupby('category')['amount'].sum().to_dict() if not expense_df.empty else {}
        
        # Monthly Trends
        df_txns['month'] = pd.to_datetime(df_txns['date'], errors='coerce').dt.strftime('%Y-%m')
        monthly_trend = {}
        for m, group in df_txns.groupby('month'):
            if pd.isna(m): continue
            m_inc = float(group[group['type'] == 'income']['amount'].sum())
            m_exp = float(group[group['type'] == 'expense']['amount'].sum())
            monthly_trend[m] = {'income': m_inc, 'expense': m_exp, 'net': m_inc - m_exp}
            
        # Prediction for next month
        exp_list = [v['expense'] for k, v in sorted(monthly_trend.items())]
        predicted_next_month_expense = self.predict_next_month(exp_list)
        
        # Financial Health Score (0 - 100)
        health_score, score_breakdown = self.calculate_health_score(tot_income, tot_expense, savings_rate, cat_group, monthly_trend)
        
        return {
            'total_income': round(tot_income, 2),
            'total_expense': round(tot_expense, 2),
            'net_savings': round(net_savings, 2),
            'savings_rate': round(savings_rate, 1),
            'predicted_next_month_expense': round(predicted_next_month_expense, 2),
            'category_breakdown': {k: round(v, 2) for k, v in cat_group.items()},
            'monthly_trend': monthly_trend,
            'health_score': health_score,
            'score_breakdown': score_breakdown
        }

    def predict_next_month(self, expense_history):
        """Predicts next month expense using weighted moving average + linear trend."""
        if not expense_history:
            return 0.0
        if len(expense_history) == 1:
            return expense_history[0]
            
        # Linear regression trend
        x = np.arange(len(expense_history))
        y = np.array(expense_history)
        slope, intercept = np.polyfit(x, y, 1)
        lr_pred = slope * len(expense_history) + intercept
        
        # Recency-weighted moving average
        weights = np.exp(np.linspace(-1., 0., len(expense_history)))
        weights /= weights.sum()
        wma_pred = np.sum(weights * y)
        
        # Blended model
        blend = 0.6 * wma_pred + 0.4 * lr_pred
        return max(0.0, float(blend))

    def calculate_health_score(self, total_income, total_expense, savings_rate, category_breakdown, monthly_trend):
        """Computes composite health score from savings rate, stability, and concentration."""
        score = 0
        breakdown = {}
        
        # 1. Savings rate score (max 40 pts)
        if savings_rate >= 30:
            sr_pts = 40
        elif savings_rate >= 20:
            sr_pts = 32
        elif savings_rate >= 10:
            sr_pts = 24
        elif savings_rate >= 0:
            sr_pts = 15
        else:
            sr_pts = max(0, 15 + int(savings_rate))
        score += sr_pts
        breakdown['Savings Rate'] = f"{sr_pts}/40 ({savings_rate:.1f}%)"
        
        # 2. Spending stability (max 30 pts)
        exp_vals = [v['expense'] for k, v in monthly_trend.items()]
        if len(exp_vals) > 1:
            std_dev = np.std(exp_vals)
            avg_exp = np.mean(exp_vals)
            cv = (std_dev / avg_exp) if avg_exp > 0 else 0
            if cv < 0.15:
                stab_pts = 30
            elif cv < 0.3:
                stab_pts = 24
            elif cv < 0.5:
                stab_pts = 16
            else:
                stab_pts = 8
        else:
            stab_pts = 20
        score += stab_pts
        breakdown['Spending Stability'] = f"{stab_pts}/30"
        
        # 3. Category Concentration (max 30 pts)
        if total_expense > 0 and category_breakdown:
            max_cat_pct = max(category_breakdown.values()) / total_expense * 100
            if max_cat_pct <= 35:
                conc_pts = 30
            elif max_cat_pct <= 50:
                conc_pts = 22
            elif max_cat_pct <= 70:
                conc_pts = 14
            else:
                conc_pts = 6
        else:
            conc_pts = 20
        score += conc_pts
        breakdown['Category Concentration'] = f"{conc_pts}/30"
        
        return min(100, max(0, score)), breakdown

if __name__ == '__main__':
    sample_file = os.path.join(os.path.dirname(__file__), 'sample_data', 'sample_transactions.csv')
    if os.path.exists(sample_file):
        engine = FinanceAnalyticsEngine()
        df = engine.parse_statement(sample_file)
        summary = engine.analyze_summary(df)
        print("--- Python Finance Analytics Summary ---")
        print(f"Total Transactions: {len(df)}")
        print(f"Total Income: ${summary['total_income']:,.2f}")
        print(f"Total Expense: ${summary['total_expense']:,.2f}")
        print(f"Net Savings: ${summary['net_savings']:,.2f}")
        print(f"Savings Rate: {summary['savings_rate']}%")
        print(f"Health Score: {summary['health_score']}/100")
