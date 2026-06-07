"""
Aetheris - Microservice B (Protected Resource)
"""
from flask import Flask, jsonify, request
import os

app = Flask(__name__)
SERVICE_NAME = "microservice-b"


def extract_identity():
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


@app.route("/events", methods=["GET"])
def get_events():
    identity = extract_identity()
    return jsonify({
        "service":  SERVICE_NAME,
        "action":   "READ",
        "identity": identity,
        "data":     {"events": [{"id": "e1", "type": "login"}, {"id": "e2", "type": "access"}]}
    }), 200


@app.route("/events", methods=["POST"])
def create_event():
    identity = extract_identity()
    body = request.get_json(silent=True) or {}
    return jsonify({
        "service":  SERVICE_NAME,
        "action":   "CREATE",
        "identity": identity,
        "event":    body
    }), 201


@app.route("/events/<string:event_id>", methods=["DELETE"])
def delete_event(event_id):
    identity = extract_identity()
    return jsonify({
        "service":  SERVICE_NAME,
        "action":   "DELETE",
        "identity": identity,
        "deleted":  {"id": event_id}
    }), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
