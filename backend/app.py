import os
import re
import uuid
import json
import mistune
import tempfile
import subprocess
import requests
from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS

from langchain.agents import AgentExecutor, create_react_agent
from langchain import hub
from langchain.tools import tool
from langchain_google_genai import GoogleGenerativeAI, HarmCategory, HarmBlockThreshold

app = Flask(__name__)
CORS(app, origins=['chrome-extension://*'])

VIRUSTOTAL_API_KEY = os.getenv("VIRUSTOTAL_API_KEY")

# Define the LLM
llm = GoogleGenerativeAI(
    model="gemini-1.5-pro-latest",
    temperature=0,
    safety_settings={
        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
    }
)

def normalize_markdown(md):
    # Collapse excessive blank lines (3 or more) into just two blank lines
    md = re.sub(r'\n{3,}', '\n\n', md)

    # Count occurrences of code fences
    fence_count = len(re.findall(r'```', md))
    # If there's an odd number of triple backticks, append one at the end to close it
    if fence_count % 2 != 0:
        md += "\n```"

    return md

@tool
def vt_analyze_code_snippet(code: str) -> str:
    """
    This tool takes a code snippet (as a string) and uploads it directly
    to VirusTotal to check if it matches any known malicious files.
    Returns the JSON response from VirusTotal as a string.
    """

    if not VIRUSTOTAL_API_KEY:
        return json.dumps({"error": "No VirusTotal API key set."})

    # The 'files' parameter in requests can take a tuple (filename, content, content_type)
    files = {
        "file": ("snippet.txt", code.encode('utf-8'), "text/plain")
    }

    try:
        url = "https://www.virustotal.com/api/v3/files"
        headers = {"x-apikey": VIRUSTOTAL_API_KEY}
        response = requests.post(url, headers=headers, files=files)

        if response.status_code in (200, 201):
            return response.text
        else:
            return json.dumps({
                "error": f"VirusTotal returned status {response.status_code}",
                "details": response.text
            })
    except Exception as e:
        return json.dumps({"error": str(e)})

# Set up the agent with the new vt_analyze_code_snippet tool
tools = [vt_analyze_code_snippet]

base_prompt = hub.pull("langchain-ai/react-agent-template")
prompt = base_prompt.partial(instructions="Answer the user's request utilizing at most 8 tool calls")

agent = create_react_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=False)

# In-memory storage for analysis results
analysis_storage = {}

def perform_analysis(content, provider, api_key, content_type):
    prompt = f"""
    You are a security auditor. Analyze the following {content_type} code snippet for potential security vulnerabilities.
    Use the vt_analyze_code_snippet tool to check if this code snippet appears malicious according to VirusTotal.
    Use this result, along with your own knowledge, to provide your report in **Markdown format**, using headings (start at level 3), bullet points, and code fences where appropriate. Do not repeat the full code snippet, it will be included from another source.
    If there are vulnerabilities, describe them briefly and provide recommendations. If appropriate, provide the corrected code.
    If no vulnerabilities are found, say 'No vulnerabilities found.'

    Code snippet:
    ```
    {content}
    ```
    """

    try:
        response = agent_executor.invoke({"input": prompt})
        print("Response keys:", response.keys())
        print("Full response:", response)

        analysis_result = response.get("output", "No output key found in response.")
        return analysis_result.strip()
    except Exception as e:
        return f"Error during analysis: {str(e)}"

# Route to receive and analyze code blocks
@app.route('/analyze_code_blocks', methods=['POST'])
def analyze_code_blocks():
    try:
        data = request.get_json()
        print(f"### request.get_json():\n{data}\n###")
        code_blocks = data.get('codeBlocks', [])
        provider = data.get('provider', 'openai')
        api_key = data.get('apiKey', '')

        if not api_key:
            return jsonify({"success": False, "error": "API key is required."}), 400

        if not code_blocks:
            return jsonify({"success": False, "error": "No suitable code blocks found for analysis."}), 400

        # For each code block, perform analysis
        analysis_results = []
        for code_block in code_blocks:
            code_content = code_block['content']
            code_id = code_block['id']

            # Perform analysis on code_content
            analysis_result = perform_analysis(code_content, provider, api_key, 'code')
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

# Create HTML renderer and Markdown instance
renderer = mistune.HTMLRenderer()
markdowner = mistune.create_markdown(renderer=renderer)

# Route to display the analysis result
@app.route('/display_analysis')
def display_analysis():
    content_id = request.args.get('id', None)

    if content_id and content_id in analysis_storage:
        stored_data = analysis_storage[content_id]
        analysis_results = stored_data['content']
        content_label = stored_data['content_label']

        # Convert analysis_result from Markdown to HTML
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
                    .code-block {
                        margin-bottom: 40px;
                        border: 1px solid #75c492;
                        padding: 20px;
                        background-color: #181818;
                    }
                    .code-title {
                        font-weight: bold;
                        margin-bottom: 10px;
                        font-size: 20px;
                        color: #75c492;
                    }
                    h2, h3, h4 {
                        color: #75c492;
                    }
                    p, li {
                        color: #fffad3;
                    }
                    code, pre {
                        background-color: #585858;
                        color: #fffad3;
                        padding: 2px 4px;
                        border-radius: 4px;
                    }
                    pre {
                        overflow: auto;
                    }
                    a {
                        color: #75c492;
                    }
                    a:hover {
                        text-decoration: underline;
                    }
                </style>
            </head>
            <body>
                <h1>Tonkija</h1>
                {% for item in analysis_results %}
                    <div class="code-block">
                        <div class="code-title">Code Block {{ loop.index }}:</div>
                        <pre><code>{{ item.code_block | e }}</code></pre>
                        <!-- Render the Markdown output as HTML -->
                        <div class="analysis-output">{{ item.analysis_html|safe }}</div>
                    </div>
                {% endfor %}

                <!-- Highlight.js Script -->
                <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/highlight.min.js"></script>
                <script>
                  hljs.highlightAll();
                </script>
            </body>
            </html>
        ''', analysis_results=[
            {
                **item,
                # Convert Markdown to HTML
                "analysis_html": markdowner(normalize_markdown(item['analysis_result']))
            } for item in analysis_results
        ], content_label=content_label)
    else:
        return "Content not found or expired.", 404

# Start the server
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
