from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import uuid

app = Flask(__name__)
CORS(app, origins=['chrome-extension://*'])

# In-memory storage for content, mapping IDs to content and type
content_storage = {}

# Route to receive and store HTML content
@app.route('/analyze_page', methods=['POST'])
def analyze_page():
    try:
        data = request.get_json()
        html_content = data.get('html', '')

        # Generate a unique ID for this content
        content_id = str(uuid.uuid4())

        # Store the content with its type
        content_storage[content_id] = {
            'type': 'html',
            'content': html_content
        }

        # Return the content ID to the client
        return jsonify({"success": True, "content_id": content_id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Route to receive and store code content
@app.route('/analyze_code', methods=['POST'])
def analyze_code():
    try:
        data = request.get_json()
        code_content = data.get('code', '')

        # Generate a unique ID for this content
        content_id = str(uuid.uuid4())

        # Store the content with its type
        content_storage[content_id] = {
            'type': 'code',
            'content': code_content
        }

        # Return the content ID to the client
        return jsonify({"success": True, "content_id": content_id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Route to display the analysis page
@app.route('/display_analysis')
def display_analysis():
    # Get the content ID from the query parameters
    content_id = request.args.get('id', None)

    if content_id and content_id in content_storage:
        stored_data = content_storage[content_id]
        content_type = stored_data['type']
        content = stored_data['content']

        # Render the analysis page based on content type
        if content_type == 'html':
            display_content = content  # For now, display the raw HTML
            content_label = 'HTML Content'
        elif content_type == 'code':
            display_content = content
            content_label = 'Code Content'
        else:
            return "Invalid content type.", 400

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
                <p>Here's the analysis of your {{ content_label }}:</p>
                <pre>{{ display_content }}</pre>
            </body>
            </html>
        ''', display_content=display_content, content_label=content_label)
    else:
        return "Content not found or expired.", 404

# Start the server
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
