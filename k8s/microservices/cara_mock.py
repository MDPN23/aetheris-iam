"""
Aetheris - CARA (Contextual & Adaptive Risk Assessment) Mock Service
Emits user risk scores to trigger step-up MFA.
"""
from flask import Flask, jsonify, request
import os

app = Flask(__name__)
SERVICE_NAME = "cara-mock"

# Memory store for mock risk scores (username -> float)
mocked_risks = {}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": SERVICE_NAME}), 200


@app.route("/assess", methods=["POST"])
def assess():
    body = request.get_json(silent=True) or {}
    username = body.get("username", "unknown")
    
    # Retrieve mock risk score if set, default to 0.1 (low risk)
    score = mocked_risks.get(username, 0.1)
    
    level = "high" if score >= 0.6 else "low"
    
    return jsonify({
        "username": username,
        "risk_score": score,
        "level": level
    }), 200


@app.route("/mock/risk", methods=["POST"])
def mock_risk():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    score = body.get("risk_score")
    
    if not username or score is None:
        return jsonify({"error": "Missing username or risk_score"}), 400
        
    try:
        score_val = float(score)
    except ValueError:
        return jsonify({"error": "risk_score must be a number"}), 400
        
    mocked_risks[username] = score_val
    return jsonify({
        "status": "ok",
        "mocked": {username: score_val}
    }), 200


@app.route("/mock/reset", methods=["POST"])
def mock_reset():
    mocked_risks.clear()
    return jsonify({"status": "ok", "message": "All mock risks cleared"}), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5002))
    app.run(host="0.0.0.0", port=port, debug=True)
