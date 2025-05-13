from flask import Flask, render_template, request, redirect, url_for, jsonify, send_file
import os
import io
import json
import tempfile
from werkzeug.utils import secure_filename
import opens3

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()

# Global variable to store client
client = None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/connect', methods=['POST'])
def connect():
    global client
    data = request.get_json()
    host = data.get('host')
    port = data.get('port')
    access_key_id = data.get('access_key_id', 'admin')
    secret_access_key = data.get('secret_access_key', 'password')
    
    try:
        endpoint_url = f"http://{host}:{port}"
        
        # Use AWS-style credentials for OpenS3 authentication
        client = opens3.client('s3', 
                          endpoint_url=endpoint_url,
                          aws_access_key_id=access_key_id,
                          aws_secret_access_key=secret_access_key)
        
        # Test connection by listing buckets
        client.list_buckets()
        
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/buckets', methods=['GET'])
def list_buckets():
    if not client:
        return jsonify({"status": "error", "message": "Not connected to OpenS3 server"}), 400
    
    try:
        response = client.list_buckets()
        # Extract bucket names from boto3-like response
        buckets = [bucket['Name'] for bucket in response.get('Buckets', [])]
        return jsonify({"status": "success", "buckets": buckets})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/buckets', methods=['POST'])
def create_bucket():
    if not client:
        return jsonify({"status": "error", "message": "Not connected to OpenS3 server"}), 400
    
    data = request.get_json()
    bucket_name = data.get('bucket_name')
    
    try:
        client.create_bucket(Bucket=bucket_name)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/buckets/<bucket_name>', methods=['DELETE'])
def delete_bucket(bucket_name):
    if not client:
        return jsonify({"status": "error", "message": "Not connected to OpenS3 server"}), 400
    
    try:
        client.delete_bucket(Bucket=bucket_name)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/buckets/<bucket_name>/objects', methods=['GET'])
def list_objects(bucket_name):
    if not client:
        return jsonify({"status": "error", "message": "Not connected to OpenS3 server"}), 400
    
    prefix = request.args.get('prefix', '')
    
    try:
        response = client.list_objects(Bucket=bucket_name, Prefix=prefix)
        # Extract object info from boto3-like response
        objects = []
        for obj in response.get('Contents', []):
            objects.append({
                'key': obj.get('Key', ''),
                'size': obj.get('Size', 0),
                'last_modified': obj.get('LastModified', '').isoformat() if hasattr(obj.get('LastModified', ''), 'isoformat') else obj.get('LastModified', '')
            })
        return jsonify({"status": "success", "objects": objects})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/buckets/<bucket_name>/objects', methods=['POST'])
def upload_object(bucket_name):
    if not client:
        return jsonify({"status": "error", "message": "Not connected to OpenS3 server"}), 400
    
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No selected file"}), 400
    
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    
    object_key = request.form.get('object_key', filename)
    metadata = json.loads(request.form.get('metadata', '{}'))
    
    try:
        with open(filepath, 'rb') as f:
            client.put_object(Bucket=bucket_name, Key=object_key, Body=f, Metadata=metadata)
        os.remove(filepath)  # Clean up the temp file
        return jsonify({"status": "success"})
    except Exception as e:
        os.remove(filepath)  # Clean up the temp file
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/buckets/<bucket_name>/objects/<path:object_key>', methods=['GET'])
def get_object(bucket_name, object_key):
    if not client:
        return jsonify({"status": "error", "message": "Not connected to OpenS3 server"}), 400
    
    try:
        response = client.get_object(Bucket=bucket_name, Key=object_key)
        content = response['Body'].content
        content_type = response.get('ContentType', 'application/octet-stream')
        
        # Create a file-like object in memory
        file_obj = io.BytesIO(content)
        
        # Send the file
        return send_file(
            file_obj,
            as_attachment=True,
            download_name=os.path.basename(object_key),
            mimetype=content_type
        )
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/buckets/<bucket_name>/objects/<path:object_key>/metadata', methods=['GET'])
def get_object_metadata(bucket_name, object_key):
    if not client:
        return jsonify({"status": "error", "message": "Not connected to OpenS3 server"}), 400
    
    try:
        response = client.head_object(Bucket=bucket_name, Key=object_key)
        metadata = response.get('Metadata', {})
        # Also include content type and other relevant headers
        metadata['Content-Type'] = response.get('ContentType', 'application/octet-stream')
        if 'ContentLength' in response:
            metadata['Content-Length'] = response['ContentLength']
        if 'LastModified' in response:
            metadata['Last-Modified'] = response['LastModified'].isoformat() if hasattr(response['LastModified'], 'isoformat') else response['LastModified']
        return jsonify({"status": "success", "metadata": metadata})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/buckets/<bucket_name>/objects/<path:object_key>', methods=['DELETE'])
def delete_object(bucket_name, object_key):
    if not client:
        return jsonify({"status": "error", "message": "Not connected to OpenS3 server"}), 400
    
    try:
        client.delete_object(Bucket=bucket_name, Key=object_key)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True)
