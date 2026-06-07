"""
Aetheris - OPA Adapter
Translates OPA JSON decision bodies into HTTP status codes for Ory Oathkeeper
"""
import json
import os
import urllib.request
import urllib.parse
import urllib.error
from flask import Flask, request, jsonify

app = Flask(__name__)
SERVICE_NAME = "opa-adapter"

OPA_URL = "http://opa:8181/v1/data/aetheris/authz"


def is_token_active(token, issuer=None):
    if not token:
        return False
    # Strip Bearer prefix if present
    if token.startswith("Bearer "):
        token = token[7:]
    
    if not issuer:
        issuer = "http://localhost:8080/realms/aetheris"
    
    try:
        keycloak_url = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")
        url = f"{keycloak_url}/realms/aetheris/protocol/openid-connect/token/introspect"
        
        post_data = urllib.parse.urlencode({
            "token": token,
            "client_id": "oathkeeper",
            "client_secret": "oathkeeper-secret-dev"
        }).encode("utf-8")
        
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        if issuer:
            parsed = urllib.parse.urlparse(issuer)
            if parsed.netloc:
                headers["Host"] = parsed.netloc
                print(f"DEBUG: using Host header '{parsed.netloc}' for introspection", flush=True)
        
        req = urllib.request.Request(
            url,
            data=post_data,
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=2) as res:
            res_data = json.loads(res.read().decode("utf-8"))
            return res_data.get("active", False)
    except Exception as e:
        print(f"Error calling Keycloak token introspection: {e}", flush=True)
        # Fail-closed for security
        return False


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
    
    # Extract token and verify its active status in Keycloak (session revocation check)
    raw_token = payload.get("input", {}).get("token")
    token_claims = payload.get("input", {}).get("token_claims", {}) or {}
    issuer = token_claims.get("iss")
    
    if raw_token and raw_token.strip() and raw_token != "<no value>":
        if not is_token_active(raw_token, issuer):
            print("DEBUG: session revocation check failed - token is inactive", flush=True)
            return jsonify({
                "error": "unauthorized",
                "deny_reason": "token_revoked",
                "message": "The session has been revoked or logged out"
            }), 403

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
