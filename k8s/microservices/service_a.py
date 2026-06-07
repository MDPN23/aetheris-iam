"""
Aetheris - Microservice A (Protected Resource)
Demonstrates identity header injection from Oathkeeper IAP
"""
from flask import Flask, jsonify, request
import os

app = Flask(__name__)
SERVICE_NAME = "microservice-a"


def extract_identity():
    """Extract enriched identity headers injected by Oathkeeper IAP"""
    return {
        "subject": request.headers.get("X-Aetheris-Subject", "unknown"),
        "roles":   request.headers.get("X-Aetheris-Roles", "[]"),
        "service": request.headers.get("X-Aetheris-Service", SERVICE_NAME),
        "request_id": request.headers.get("X-Request-Id", "none"),
        "issuer":  request.headers.get("X-Aetheris-Issuer", "unknown")
    }


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": SERVICE_NAME}), 200


@app.route("/data", methods=["GET"])
def get_data():
    identity = extract_identity()
    return jsonify({
        "service":  SERVICE_NAME,
        "action":   "READ",
        "identity": identity,
        "data":     {"records": [{"id": 1, "value": "alpha"}, {"id": 2, "value": "beta"}]}
    }), 200


@app.route("/data", methods=["POST"])
def create_data():
    identity = extract_identity()
    body = request.get_json(silent=True) or {}
    return jsonify({
        "service":  SERVICE_NAME,
        "action":   "CREATE",
        "identity": identity,
        "created":  body
    }), 201


@app.route("/data/<int:item_id>", methods=["PUT"])
def update_data(item_id):
    identity = extract_identity()
    body = request.get_json(silent=True) or {}
    return jsonify({
        "service":  SERVICE_NAME,
        "action":   "UPDATE",
        "identity": identity,
        "updated":  {"id": item_id, **body}
    }), 200


@app.route("/data/<int:item_id>", methods=["DELETE"])
def delete_data(item_id):
    identity = extract_identity()
    return jsonify({
        "service":  SERVICE_NAME,
        "action":   "DELETE",
        "identity": identity,
        "deleted":  {"id": item_id}
    }), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
