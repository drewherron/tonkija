from flask import Flask, jsonify

# Initialize the Flask app
app = Flask(__name__)

# Basic route
@app.route('/')
def home():
    return jsonify({"message": "Welcome to the Flask server!", "status": "Running"})

# Placeholder
@app.route('/example', methods=['GET'])
def example_route():
    return jsonify({"message": "This is an example route.", "status": "Not implemented yet"})

# Start the server
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
