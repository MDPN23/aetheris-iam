"""
Aetheris - CARA (Contextual & Adaptive Risk Assessment) Mock Service
Emits user risk scores to trigger step-up MFA.
Loads default profiles from /mockdata/risk-profiles.json if available.
"""
from flask import Flask, jsonify, request
import json
import os

app = Flask(__name__)
SERVICE_NAME = "cara-mock"

# Memory store for mock risk scores (key -> float)
mocked_risks = {}

# Default risk score from config
DEFAULT_RISK_SCORE = 0.1

# Load risk profiles from mockdata if available
MOCKDATA_PATH = os.getenv("MOCKDATA_PATH", "/mockdata")
try:
    profile_file = os.path.join(MOCKDATA_PATH, "risk-profiles.json")
    if os.path.exists(profile_file):
        with open(profile_file, "r") as f:
            risk_config = json.load(f)
            DEFAULT_RISK_SCORE = risk_config.get("defaults", {}).get("risk_score", 0.1)
            # Pre-load any configured profiles
            for key, score in risk_config.get("profiles", {}).items():
                mocked_risks[key] = float(score)
            print(f"Loaded risk profiles from {profile_file}", flush=True)
except Exception as e:
    print(f"No risk profiles loaded (using defaults): {e}", flush=True)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": SERVICE_NAME}), 200


@app.route("/assess", methods=["POST"])
def assess():
    body = request.get_json(silent=True) or {}
    username = body.get("username", "unknown")
    tenant = body.get("tenant", "aetheris")

    # Retrieve mock risk score: tenant:username -> username -> default
    key = f"{tenant}:{username}"
    score = mocked_risks.get(key, mocked_risks.get(username, DEFAULT_RISK_SCORE))

    level = "high" if score >= 0.6 else "low"

    return jsonify({
        "username": username,
        "tenant": tenant,
        "risk_score": score,
        "level": level
    }), 200


@app.route("/mock/risk", methods=["POST"])
def mock_risk():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    tenant = body.get("tenant")
    score = body.get("risk_score")

    if not username or score is None:
        return jsonify({"error": "Missing username or risk_score"}), 400

    try:
        score_val = float(score)
    except ValueError:
        return jsonify({"error": "risk_score must be a number"}), 400

    if tenant:
        key = f"{tenant}:{username}"
    else:
        key = username

    mocked_risks[key] = score_val
    return jsonify({
        "status": "ok",
        "mocked": {key: score_val}
    }), 200


@app.route("/mock/reset", methods=["POST"])
def mock_reset():
    mocked_risks.clear()
    return jsonify({"status": "ok", "message": "All mock risks cleared"}), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5002))
    app.run(host="0.0.0.0", port=port, debug=True)
