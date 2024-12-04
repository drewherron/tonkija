from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import uuid


app = Flask(__name__)
CORS(app, origins=['chrome-extension://*'])

# In-memory storage for analysis results
analysis_storage = {}

# Route to receive and store code content
@app.route('/analyze_code', methods=['POST'])
def analyze_code():
    try:
        data = request.get_json()
        code_content = data.get('code', '')
        provider = data.get('provider', 'openai')
        # api_key = data.get('apiKey', '')

        if not code_content:
            return jsonify({"success": False, "error": "No code content received."}), 400

        # No analysis for now
        # Just store the code_content as is, for testing
        analysis_result = code_content

        # Store the code content
        content_id = str(uuid.uuid4())
        analysis_storage[content_id] = {
            'type': 'code',
            'content': analysis_result,
            'content_label': 'Extracted Code Snippets'
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
