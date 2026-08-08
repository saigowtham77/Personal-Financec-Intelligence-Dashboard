import os
import sys
import webbrowser
from threading import Timer
from flask import Flask, send_from_directory, jsonify, request
from analytics import FinanceAnalyticsEngine

app = Flask(__name__, static_folder='.')
engine = FinanceAnalyticsEngine()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/dashboard')
@app.route('/dashboard.html')
def dashboard():
    return send_from_directory(BASE_DIR, 'dashboard.html')

@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'css'), filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'js'), filename)

@app.route('/sample_data/<path:filename>')
def serve_sample_data(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'sample_data'), filename)

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'app': 'Python Finance Dashboard', 'version': '1.0.0'})

@app.route('/api/sample', methods=['GET'])
def get_sample_analysis():
    sample_file = os.path.join(BASE_DIR, 'sample_data', 'sample_transactions.csv')
    if not os.path.exists(sample_file):
        return jsonify({'error': 'Sample file not found'}), 404
        
    df = engine.parse_statement(sample_file)
    summary = engine.analyze_summary(df)
    transactions = df.to_dict(orient='records')
    return jsonify({
        'summary': summary,
        'transactions': transactions,
        'count': len(transactions)
    })

@app.route('/api/analyze', methods=['POST'])
def analyze_upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
        
    try:
        df = engine.parse_statement(file)
        summary = engine.analyze_summary(df)
        transactions = df.to_dict(orient='records')
        return jsonify({
            'success': True,
            'summary': summary,
            'transactions': transactions,
            'count': len(transactions)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def open_browser():
    webbrowser.open_new('http://localhost:5000/')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"==================================================")
    print(f"  Starting Finance Dashboard Python Server...")
    print(f"  Running on http://localhost:{port}")
    print(f"==================================================")
    
    # Auto open browser after 1.2s delay
    Timer(1.2, open_browser).start()
    app.run(host='0.0.0.0', port=port, debug=False)
