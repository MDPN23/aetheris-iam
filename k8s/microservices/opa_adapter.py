"""
Aetheris - OPA Adapter
Translates OPA JSON decision bodies into HTTP status codes for Ory Oathkeeper
"""
import json
import urllib.request
import urllib.error
from flask import Flask, request, jsonify

app = Flask(__name__)
SERVICE_NAME = "opa-adapter"

OPA_URL = "http://opa:8181/v1/data/aetheris/authz"


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": SERVICE_NAME}), 200


def get_risk_score(username):
    try:
        cara_req = urllib.request.Request(
            "http://cara-mock:5002/assess",
            data=json.dumps({"username": username}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(cara_req, timeout=2) as res:
            data = json.loads(res.read().decode("utf-8"))
            return data.get("risk_score", 0.1)
    except Exception as e:
        print(f"Error querying CARA: {e}", flush=True)
        return 0.1


@app.route("/authz", methods=["POST"])
def authz():
    payload = request.get_json() or {}
    print(f"DEBUG: payload received: {json.dumps(payload)}", flush=True)
    
    # Extract username and fetch risk score from CARA
    token_claims = payload.get("input", {}).get("token_claims", {}) or {}
    username = token_claims.get("preferred_username") or token_claims.get("sub")
    print(f"DEBUG: extracted username: {username}", flush=True)
    
    risk_score = 0.1
    if username:
        risk_score = get_risk_score(username)
        
    # Inject risk_score into OPA payload
    if "input" not in payload:
        payload["input"] = {}
    payload["input"]["risk_score"] = risk_score
    
    # Forward the request to OPA
    req_body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        OPA_URL,
        data=req_body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as res:
            response_body = res.read().decode("utf-8")
            data = json.loads(response_body)
            
            result = data.get("result", {})
            allowed = result.get("allow", False)
            
            if allowed:
                return jsonify(result), 200
            else:
                reason = result.get("deny_reason", "Access Denied")
                if reason == "step_up_mfa_required":
                    return jsonify({
                        "error": "mfa_required",
                        "deny_reason": reason,
                        "message": "Step-up MFA required due to elevated risk"
                    }), 403
                return jsonify({
                    "error": "Forbidden",
                    "deny_reason": reason
                }), 403
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        return jsonify({"error": "OPA Error", "details": err_body}), e.code
    except Exception as e:
        return jsonify({"error": "Internal Error", "details": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8182, debug=True)
