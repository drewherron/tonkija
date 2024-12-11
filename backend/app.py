import os
import re
import uuid
import json
import mistune
import tempfile
import requests
import dns.resolver
import subprocess
import ssl, socket, json
from datetime import datetime
from urllib.parse import urlparse
from flask import Flask, request, jsonify, render_template_string, send_from_directory
from flask_cors import CORS
from langchain.agents import AgentExecutor, create_react_agent
from langchain import hub
from langchain.tools import tool
from langchain_google_genai import GoogleGenerativeAI, HarmCategory, HarmBlockThreshold

# Initialize Flask app and enable CORS for Chrome extension
app = Flask(__name__)
CORS(app, origins=['chrome-extension://*'])

# Get VirusTotal API key from environment variables
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
    """
    Normalize Markdown content by fixing spacing and unbalanced code fences.

    Args:
        md (str): The Markdown content to normalize.

    Returns:
        str: The normalized Markdown content with:
            - Excessive blank lines collapsed to a maximum of one (i.e, 2 newlines).
            - Unbalanced code fences closed with additional triple backticks if needed.
    """
    md = re.sub(r'\n{3,}', '\n\n', md)
    fence_count = len(re.findall(r'```', md))
    if fence_count % 2 != 0:
        md += "\n```"

    return md

@tool
def vt_analyze_code_snippet(code: str) -> str:
    """
    Use VirusTotal to check if a code snippet matches any known malicious files.
    Input: Code snippet as a string.
    Output: JSON string with VirusTotal analysis results.
    """
    print("Tool: vt_analyze_code_snippet")
    # Return early if no API key is configured
    if not VIRUSTOTAL_API_KEY:
        return json.dumps({"error": "No VirusTotal API key set."})

    # Prepare the code snippet for upload
    files = {
        "file": ("snippet.txt", code.encode('utf-8'), "text/plain")
    }

    try:
        # Submit code to VirusTotal API
        url = "https://www.virustotal.com/api/v3/files"
        headers = {"x-apikey": VIRUSTOTAL_API_KEY}
        response = requests.post(url, headers=headers, files=files)

        # Check for successful submission
        if response.status_code in (200, 201):
            return response.text
        else:
            return json.dumps({
                "error": f"VirusTotal returned status {response.status_code}",
                "details": response.text
            })
    except Exception as e:
        return json.dumps({"error": str(e)})

@tool
def url_report(url_str: str) -> str:
    """
    Analyze a URL's domain and IP information using ipwho.is.
    Input: URL as a string.
    Output: JSON string with domain and IP details.
    """
    print("Tool: url_report")
    # Extract domain from URL
    parsed = urlparse(url_str)
    host = parsed.netloc if parsed.netloc else parsed.path
    if not host:
        return json.dumps({"error": "Could not extract host from URL."})

    # Query ipwho.is API for domain info
    lookup_url = f"http://ipwho.is/{host}"
    response = requests.get(lookup_url)
    if response.status_code == 200:
        return response.text
    return json.dumps({"error": "Unable to retrieve info for this URL"})

@tool
def analyze_dns(domain: str) -> str:
    """
    Retrieve various DNS records (A, AAAA, MX, TXT, CNAME) for a domain.

    Input: Domain as a string.
    Output: JSON string containing the DNS records and their values.

    This tool attempts to resolve A, AAAA, MX, TXT, and CNAME records.
    If a particular record type doesn't exist, it returns an empty list for that type.
    """
    print("Tool: analyze_dns")
    record_types = ['A', 'AAAA', 'MX', 'TXT', 'CNAME']
    results = {}

    for rtype in record_types:
        try:
            answers = dns.resolver.resolve(domain, rtype)
            records = []
            for rdata in answers:
                if rtype == 'MX':
                    # MX record returns mail exchanger and preference
                    records.append({
                        'exchange': rdata.exchange.to_text(),
                        'preference': rdata.preference
                    })
                elif rtype == 'TXT':
                    # TXT record may consist of multiple strings combined
                    # rdata.strings is a tuple of bytes, decode them and join
                    txt_data = ''.join(s.decode('utf-8') for s in rdata.strings)
                    records.append(txt_data)
                else:
                    # For A, AAAA, CNAME just return the record text
                    records.append(rdata.to_text())
            results[rtype] = records
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
            # If no records of this type exist or domain doesn't resolve these records
            results[rtype] = []

    return json.dumps(results)

@tool
def analyze_certificate(domain: str) -> str:
    """
    Check the SSL/TLS certificate of a domain and return its details.
    Input: Domain name as a string.
    Output: JSON string with certificate details, including issuer, validity, and issues.
    """
    print("Tool: analyze_certificate")
    try:
        # Set up SSL context with default verification
        context = ssl.create_default_context()
        # Connect to domain on port 443 (HTTPS)
        with socket.create_connection((domain, 443), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=domain) as ssock:
                # Get certificate from connection
                cert = ssock.getpeercert()

                # Parse certificate fields
                issuer = dict(x[0] for x in cert['issuer'])
                subject = dict(x[0] for x in cert['subject'])

                # Parse certificate dates
                notBefore = datetime.strptime(cert['notBefore'], "%b %d %H:%M:%S %Y %Z")
                notAfter = datetime.strptime(cert['notAfter'], "%b %d %H:%M:%S %Y %Z")
                days_remaining = (notAfter - datetime.utcnow()).days

                # Compile certificate details
                details = {
                    "issuer": issuer,
                    "subject": subject,
                    "not_before": cert['notBefore'],
                    "not_after": cert['notAfter'],
                    "days_remaining": days_remaining,
                    "version": ssock.version(),
                    "cipher": ssock.cipher()
                }

                # Check for common certificate issues
                issues = []
                if days_remaining < 30:
                    issues.append("Certificate will expire soon.")
                if days_remaining < 0:
                    issues.append("Certificate is expired!")

                details["issues"] = issues

                return json.dumps(details)
    except Exception as e:
        return json.dumps({"error": str(e)})

@tool
def analyze_headers(url: str) -> str:
    """
    Analyze HTTP security headers of a webpage.
    Input: URL as a string.
    Output: JSON string with the status of key security headers.
    """
    print("Tool: analyze_headers")
    try:
        # Use HEAD request to get headers without downloading content
        response = requests.head(url)
        headers = response.headers

        # List of important security headers to check
        security_headers = {
            'Content-Security-Policy',
            'X-Frame-Options',
            'X-Content-Type-Options',
            'Strict-Transport-Security',
            'X-XSS-Protection',
            'Referrer-Policy',
            'Permissions-Policy',
            'Server'
        }

        # Check presence of each header
        result = {}
        for header in security_headers:
            result[header] = headers.get(header, 'Not set')

        return json.dumps(result)
    except Exception as e:
        return json.dumps({"error": str(e)})

@tool
def analyze_csp(url: str) -> str:
    """
    Analyze Content Security Policy and external resources of a webpage.
    Input: URL as a string.
    Output: JSON with CSP and lists of external scripts, styles, images, and fonts.
    """
    print("Tool: analyze_csp")
    try:
        # Get full page content for analysis
        response = requests.get(url)
        # Extract Content Security Policy header
        csp = response.headers.get('Content-Security-Policy', '')

        # Extract all external resources from HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        resources = {
            'scripts': [s.get('src', '') for s in soup.find_all('script', src=True)],
            'styles': [s.get('href', '') for s in soup.find_all('link', rel='stylesheet')],
            'images': [s.get('src', '') for s in soup.find_all('img', src=True)],
            'fonts': [s.get('href', '') for s in soup.find_all('link', rel='font')],
        }

        return json.dumps({
            "csp": csp,
            "external_resources": resources
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

# Set up the agent with the tools
tools = [vt_analyze_code_snippet, url_report, analyze_dns, analyze_certificate, analyze_csp, analyze_headers]

# Load and customize the base prompt template
base_prompt = hub.pull("langchain-ai/react-agent-template")
prompt = base_prompt.partial(instructions="Answer the user's request utilizing at most 8 tool calls")

# Create the LangChain agent
agent = create_react_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=False)

# In-memory storage for analysis results
analysis_storage = {}

def analyze_code(code_content, provider, api_key):
    """
    Analyze a code snippet for security vulnerabilities.

    This function generates a prompt for the LLM agent to analyze the given code snippet,
    checking for malicious patterns and providing a security assessment.

    Args:
        code_content (str): The code snippet to analyze.
        provider (str): The LLM provider being used (e.g., 'openai').
        api_key (str): The API key for authentication with the provider.

    Returns:
        str: A security analysis report in Markdown format. The report may include:
            - Vulnerabilities found and their descriptions.
            - Recommendations for mitigation.
            - Corrected code examples (if applicable).
            - A message indicating no vulnerabilities if the code is safe.

    Raises:
        Exception: If the LLM agent invocation fails or encounters an unexpected error.
    """
    # Create analysis prompt for the LLM
    prompt = f"""
    You are a security auditor. Analyze the following code for potential security vulnerabilities.
    Use the vt_analyze_code_snippet tool to check if this code appears malicious according to VirusTotal.

    Provide your report in **Markdown format**, using headings (start at level 3), bullet points, and code fences where appropriate.
    Do not repeat the full code snippet as it will be included from another source.
    If there are vulnerabilities:
    - Describe them briefly
    - Provide specific recommendations
    - If appropriate, provide corrected code examples
    If no vulnerabilities are found, say 'No vulnerabilities found.'

    Code to analyze:
    ```
    {code_content}
    ```
    """

    try:
        # Run analysis using LangChain agent
        response = agent_executor.invoke({"input": prompt})
        print("Response keys:", response.keys())
        print("Full response:", response)

        # Extract analysis result
        analysis_result = response.get("output", "No output key found in response.")
        return analysis_result.strip()
    except Exception as e:
        return f"Error during analysis: {str(e)}"

# Route to receive and analyze code blocks
@app.route('/analyze_code_blocks', methods=['POST'])
def analyze_code_blocks():
    try:
        # Get request data and validate inputs
        data = request.get_json()
        print(f"### request.get_json():\n{data}\n###")
        code_blocks = data.get('codeBlocks', [])
        provider = data.get('provider', 'openai')
        api_key = data.get('apiKey', '')

        # Validate required fields
        if not api_key:
            return jsonify({"success": False, "error": "API key is required."}), 400

        if not code_blocks:
            return jsonify({"success": False, "error": "No suitable code blocks found for analysis."}), 400

        # Analyze each code block
        analysis_results = []
        for code_block in code_blocks:
            code_content = code_block['content']
            code_id = code_block['id']

            # Perform analysis on code_content
            analysis_result = analyze_code(code_content, provider, api_key)
            analysis_results.append({
                'id': code_id,
                'code_block': code_content,
                'analysis_result': analysis_result
            })

        # Store results with unique ID
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

# Route to handle 'Analyze Server' button
@app.route('/analyze_server', methods=['POST'])
def analyze_server():
    try:
        # Get and validate request data
        data = request.get_json()
        print(f"### request.get_json():\n{data}\n###")
        provider = data.get('provider', 'openai')
        api_key = data.get('apiKey', '')
        url_content = data.get('url', '')
        domain = data.get('domain', '')

        # Validate required fields
        if not api_key:
            return jsonify({"success": False, "error": "API key is required."}), 400
        if not url_content or not domain:
            return jsonify({"success": False, "error": "URL and domain are required."}), 400

        # Create analysis prompt for server security
        prompt = f"""
        You are a security auditor. Analyze this server's security profile by:
        1. Using the url_report tool to analyze the domain and IP information
        2. Using the analyze_certificate tool to check the SSL/TLS certificate configuration
        3. Using the analyze_dns tool to retrieve and evaluate DNS records (A, AAAA, MX, TXT, CNAME) for potential misconfigurations, vulnerabilities, or security issues
        Provide a comprehensive security assessment in Markdown format that covers:
        - Domain and hosting information
        - DNS records and IP details
        - Certificate validity and configuration
        - TLS version and cipher security
        - Any security concerns or recommendations
        - Overall security rating (High/Medium/Low risk)

        URL to analyze: {url_content}
        Domain: {domain}
        """

        try:
            # Execute analysis
            response = agent_executor.invoke({"input": prompt})
            analysis_result = response.get("output", "No output from analysis.")

            # Store results with unique ID
            content_id = str(uuid.uuid4())
            analysis_storage[content_id] = {
                'type': 'analysis',
                'content': [{
                    'id': 'server-analysis',
                    'code_block': f"URL: {url_content}\nDomain: {domain}",
                    'analysis_result': analysis_result,
                    'is_page_analysis': True
                }],
                'content_label': 'Server Security Analysis'
            }

            return jsonify({"success": True, "content_id": content_id})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Route to handle 'Analyze Page' button
@app.route('/analyze_page', methods=['POST'])
def analyze_page():
    try:
        # Get and validate request data
        data = request.get_json()
        print(f"### request.get_json():\n{data}\n###")
        provider = data.get('provider', 'openai')
        api_key = data.get('apiKey', '')
        url_content = data.get('url', '')
        domain = data.get('domain', '')

        # Validate required fields
        if not api_key:
            return jsonify({"success": False, "error": "API key is required."}), 400
        if not url_content:
            return jsonify({"success": False, "error": "URL is required."}), 400

        # Create prompt that uses new tools for page security analysis
        prompt = f"""
        You are a security auditor. Analyze this webpage's content security by:
        1. Using analyze_headers to check HTTP security headers
        2. Using analyze_csp to evaluate Content Security Policy and external resources

        Provide a comprehensive security assessment in Markdown format that covers:
        - Analysis of present and missing security headers
        - Evaluation of Content Security Policy
        - Assessment of external resource usage and risks
        - Specific recommendations for improvement
        - Overall content security rating (High/Medium/Low risk)

        URL to analyze: {url_content}
        """

        try:
            # Execute analysis using LangChain agent
            response = agent_executor.invoke({"input": prompt})
            analysis_result = response.get("output", "No output from analysis.")

            # Generate unique ID and store results
            content_id = str(uuid.uuid4())
            analysis_storage[content_id] = {
                'type': 'analysis',
                'content': [{
                    'id': 'page-analysis',
                    'code_block': f"URL: {url_content}",
                    'analysis_result': analysis_result,
                    'is_page_analysis': True
                }],
                'content_label': 'Page Security Analysis'
            }
            return jsonify({"success": True, "content_id": content_id})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Route to display the analysis result
@app.route('/display_analysis')
def display_analysis():
    # Get analysis ID from URL parameters
    content_id = request.args.get('id', None)

    # Check if analysis exists
    if content_id and content_id in analysis_storage:
        stored_data = analysis_storage[content_id]
        analysis_results = stored_data['content']
        content_label = stored_data['content_label']

        def clean_analysis_result(md):
            # Remove any standalone code fences that might interfere with formatting
            md = re.sub(r'^```[a-zA-Z0-9_-]*\n?', '', md)
            md = re.sub(r'\n```$', '', md)
            return md

        # Render analysis results with custom template
        return render_template_string('''
            <!DOCTYPE html>
            <html>
            <head>
                <title>Tonkija Analysis</title>
                <!-- Favicon setup -->
                <link rel="icon" type="image/x-icon" href="{{ url_for('static', filename='favicon.ico') }}">
                <link rel="shortcut icon" type="image/x-icon" href="{{ url_for('static', filename='favicon.ico') }}">
                <!-- Google Fonts setup -->
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Graduate&family=Indie+Flower&family=Marcellus&family=Paytone+One&family=Rubik+Iso&family=Teko:wght@300..700&display=swap" rel="stylesheet">
                <!-- Syntax highlighting -->
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/styles/base16/default-dark.min.css">

                <style>
                    /* Dark theme styling */
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                        background-color: #272a32;
                        color: #fffad3;
                    }
                    /* Title styling with custom font */
                    h1 {
                        text-align: center;
                        color: #75c492;
                        font-size: 45px;
                        font-family: "Rubik Iso", system-ui;
                        font-weight: 400;
                    }
                    /* Container for each analysis block */
                    .code-block {
                        margin-bottom: 40px;
                        border: 1px solid #75c492;
                        padding: 20px;
                        background-color: #181818;
                    }
                    /* Title for each analysis section */
                    .code-title {
                        font-weight: bold;
                        margin-bottom: 10px;
                        font-size: 20px;
                        color: #75c492;
                    }
                    /* Heading colors */
                    h2, h3, h4 {
                        color: #75c492;
                    }
                    /* Text colors */
                    p, li {
                        color: #fffad3;
                    }
                    /* Code block styling */
                    code, pre {
                        background-color: #585858;
                        color: #fffad3;
                        padding: 2px 4px;
                        border-radius: 4px;
                    }
                    pre {
                        overflow: auto;
                    }
                    /* Link styling */
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
                        <div class="code-title">
                            {% if item.get('is_page_analysis') %}
                                Page Info:
                            {% else %}
                                Code Block {{ loop.index }}:
                            {% endif %}
                        </div>
                        <pre><code>{{ item.code_block | e }}</code></pre>
                        <div class="analysis-output">{{ item.analysis_html|safe }}</div>
                    </div>
                {% endfor %}

                <!-- Initialize syntax highlighting -->
                <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/highlight.min.js"></script>
                <script>
                  hljs.highlightAll();
                </script>
            </body>
            </html>
        ''', analysis_results=[
            {
                **item,
                # Process markdown content into HTML for display
                "analysis_html": markdowner(normalize_markdown(clean_analysis_result(item['analysis_result'])))
            } for item in analysis_results
        ], content_label=content_label)
    else:
        return "Content not found or expired.", 404

@app.route('/favicon.ico')
def favicon():
    # Serve favicon from static directory
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico', mimetype='image/png')

# Start the server
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
