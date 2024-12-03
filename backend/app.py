from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import uuid


app = Flask(__name__)
CORS(app, origins=['chrome-extension://*'])

# In-memory storage for analysis results
analysis_storage = {}

def perform_analysis(content, provider, api_key, content_type):
    # TODO: Implement actual analysis logic here
    # Just a placeholder for now
    if content_type == 'html':
        analysis_result = f"Performed HTML analysis using {provider}."
    else:
        analysis_result = f"Performed code analysis using {provider}."
    return analysis_result


# Route to receive and analyze HTML content
@app.route('/analyze_page', methods=['POST'])
def analyze_page():
    try:
        data = request.get_json()
        html_content = data.get('html', '')
        provider = data.get('provider', 'openai')
        api_key = data.get('apiKey', '')

        if not api_key:
            return jsonify({"success": False, "error": "API key is required."}), 400

        # Perform analysis using the provided API key and provider
        analysis_result = perform_analysis(html_content, provider, api_key, 'html')

        # Store the analysis result
        content_id = str(uuid.uuid4())
        analysis_storage[content_id] = {
            'type': 'analysis',
            'content': analysis_result,
            'content_label': 'Webpage Analysis'
        }

        return jsonify({"success": True, "content_id": content_id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Route to receive and analyze code content
@app.route('/analyze_code', methods=['POST'])
def analyze_code():
    try:
        data = request.get_json()
        code_content = data.get('code', '')
        provider = data.get('provider', 'openai')
        api_key = data.get('apiKey', '')

        if not api_key:
            return jsonify({"success": False, "error": "API key is required."}), 400

        # Perform analysis using the provided API key and provider
        analysis_result = perform_analysis(code_content, provider, api_key, 'code')

        # Store the analysis result
        content_id = str(uuid.uuid4())
        analysis_storage[content_id] = {
            'type': 'analysis',
            'content': analysis_result,
            'content_label': 'Code Analysis'
        }

        return jsonify({"success": True, "content_id": content_id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Route to display the analysis result
@app.route('/display_analysis')
def display_analysis():
    # Get the content ID from the query parameters
    content_id = request.args.get('id', None)

    if content_id and content_id in analysis_storage:
        stored_data = analysis_storage[content_id]
        analysis_result = stored_data['content']
        content_label = stored_data['content_label']

        # Render the analysis result
        return render_template_string('''
            <!DOCTYPE html>
            <html>
            <head>
                <title>Tonkija Analysis</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                    }
                    h1 {
                        color: #333;
                    }
                    pre {
                        background-color: #f4f4f4;
                        padding: 10px;
                        border: 1px solid #ddd;
                        overflow: auto;
                    }
                </style>
            </head>
            <body>
                <h1>Tonkija</h1>
                <p>{{ content_label }}:</p>
                <pre>{{ analysis_result }}</pre>
            </body>
            </html>
        ''', analysis_result=analysis_result, content_label=content_label)
    else:
        return "Content not found or expired.", 404

# Start the server
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
