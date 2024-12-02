from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import uuid

app = Flask(__name__)
CORS(app, origins=['chrome-extension://*'])

# In-memory storage for HTML content, mapping IDs to content
html_storage = {}

# Route to receive and store HTML content
@app.route('/analyze_page', methods=['POST'])
def analyze_html():
    try:
        data = request.get_json()
        html_content = data.get('html', '')

        # Generate a unique ID for this content
        content_id = str(uuid.uuid4())

        # Store the HTML content in the dictionary
        html_storage[content_id] = html_content

        # Return the content ID to the client
        return jsonify({"success": True, "content_id": content_id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Route to display the analysis page
@app.route('/display_analysis')
def display_html():
    # Get the content ID from the query parameters
    content_id = request.args.get('id', None)

    if content_id and content_id in html_storage:
        html_content = html_storage[content_id]

        # Render the analysis page
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
                <p>Here's the analysis:</p>
                <pre>{{ html_content }}</pre>
            </body>
            </html>
        ''', html_content=html_content)
    else:
        return "Content not found or expired.", 404

# Start the server
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
