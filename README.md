# Tonkija

Tonkija is a Chrome extension for automated security analysis of web pages, servers, and code snippets. 

## Features

- **Server Security Analysis**
  - Examine SSL/TLS certificates for validity, expiration, and configuration issues.
  - Retrieve detailed domain and IP information using DNS and hosting records.
  - Analyze DNS records, including A, AAAA, MX, TXT, and CNAME entries.

- **Webpage Security Evaluation**
  - Check HTTP security headers for vulnerabilities.
  - Assess the Content Security Policy (CSP) for proper configurations.
  - Identify external resource usage (scripts, stylesheets, images, fonts).
  - Provide a comprehensive content security rating.

- **Code Security Analysis**
  - Analyze code snippets for potential security vulnerabilities.
  - Check for malicious patterns using VirusTotal API integration.
  - Automatically extract and evaluate code blocks from visited web pages.

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the directory containing the extension

## Configuration

Before using Tonkija, you'll need to provide an LLM API key:

1. Click the extension icon to open the popup
2. Click the gear icon in the top right corner
3. Select your preferred AI provider (OpenAI, Anthropic, or Google)
4. Enter your API key
5. Click "Save Settings"

API keys are stored securely in Chrome's storage sync API. You can switch providers without losing the stored key.

## Usage

### Analyze Server
The "Analyze Server" button examines the security configuration of the current website's server:
- SSL/TLS certificate validation
- Domain and hosting information
- DNS configuration

### Analyze Page
The "Analyze Page" button evaluates the security of the current webpage:
- HTTP security headers
- Content Security Policy
- External resource usage
- Content security rating

### Code Analysis
The "Analyze Code" button performs a security analysis on code, using:
1. **Direct Input**: Enter code in the text box for analysis
2. **Page Scan**: Without any input, it automatically finds and analyzes code blocks on the current page

## Backend Setup

1. Install required Python packages:
```bash
pip install -r requirements.txt
```

2. Set up VirusTotal environment variable:
```bash
export VIRUSTOTAL_API_KEY="your_key_here"
```

3. Run the Flask server:
```bash
python app.py
```
