from flask import Flask, request, jsonify

app = Flask(__name__)

# HTML logging route
# This is just a test to see if we can get data
# From the extension popup into this Python code
@app.route('/log_html', methods=['POST'])
def log_html():
    try:
        # Extract data from the request
        data = request.get_json()
        html_content = data.get('html', '')

        # For now, just append the HTML to a log file
        with open('webpage.log', 'a') as log_file:
            log_file.write(html_content + '\n\n')

        # Respond with success
        return jsonify({"success": True, "message": "HTML logged successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Start the server
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
