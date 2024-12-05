from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import uuid


app = Flask(__name__)
CORS(app, origins=['chrome-extension://*'])

# In-memory storage for analysis results
analysis_storage = {}

# Route to receive and analyze code blocks
@app.route('/analyze_code_blocks', methods=['POST'])
def analyze_code_blocks():
    try:
        data = request.get_json()
        code_blocks = data.get('codeBlocks', [])
        provider = data.get('provider', 'openai')
        api_key = data.get('apiKey', '')

        if not api_key:
            return jsonify({"success": False, "error": "API key is required."}), 400

        if not code_blocks:
            return jsonify({"success": False, "error": "No suitable code blocks found for analysis."}), 400

        # TODO
        # For each code block, perform analysis
        analysis_results = []
        for code_block in code_blocks:
            code_content = code_block['content']
            code_id = code_block['id']

            # Perform analysis on code_content
            # Nothing here yet
            analysis_result = f"Analysis for code block {code_id}\n?????"

            analysis_results.append({
                'id': code_id,
                'code_block': code_content,
                'analysis_result': analysis_result
            })

        # Store the analysis results
        content_id = str(uuid.uuid4())
        analysis_storage[content_id] = {
            'type': 'analysis',
            'content': analysis_results,
            'content_label': 'Code Blocks Analysis'
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
        analysis_results = stored_data['content']
        content_label = stored_data['content_label']

        # Render the analysis result
        return render_template_string('''
            <!DOCTYPE html>
            <html>
            <head>
                <title>Tonkija Analysis</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Graduate&family=Indie+Flower&family=Marcellus&family=Paytone+One&family=Rubik+Iso&family=Teko:wght@300..700&display=swap" rel="stylesheet">

                <!-- Highlight.js CSS -->
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/styles/base16/default-dark.min.css">

                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                        background-color: #272a32;
                        color: #fffad3;
                    }
                    h1 {
                        text-align: center;
                        color: #75c492;
                        font-size: 45px;
                        font-family: "Rubik Iso", system-ui;
                        font-weight: 400;
                    }
                    pre {
                        background-color: #181818;
                        padding: 10px;
                        border: 1px solid #75c492;
                        overflow: auto;
                        color: #fffad3;
                    }
                    .code-block {
                        margin-bottom: 20px;
                    }
                    .code-title {
                        font-weight: bold;
                        margin-bottom: 5px;
                    }
                </style>
            </head>
            <body>
                <h1>Tonkija</h1>
                <p>{{ content_label }}:</p>
                {% for item in analysis_results %}
                    <div class="code-block">
                        <div class="code-title">Code Block {{ loop.index }}:</div>
                        <!-- Wrap code in <pre><code> and escape it -->
                        <pre><code>{{ item.code_block | e }}</code></pre>
                        <div class="code-title">Analysis:</div>
                        <pre>{{ item.analysis_result }}</pre>
                    </div>
                {% endfor %}

                <!-- Highlight.js Script -->
                <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/highlight.min.js"></script>
                <script>
                  // Initialize highlight.js
                  hljs.highlightAll();
                </script>
            </body>
            </html>
        ''', analysis_results=analysis_results, content_label=content_label)
    else:
        return "Content not found or expired.", 404

# Start the server
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
