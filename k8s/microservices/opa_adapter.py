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


@app.route("/authz", methods=["POST"])
def authz():
    payload = request.get_json() or {}
    
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
                return jsonify({
                    "error": "Forbidden",
                    "deny_reason": result.get("deny_reason", "Access Denied")
                }), 403
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        return jsonify({"error": "OPA Error", "details": err_body}), e.code
    except Exception as e:
        return jsonify({"error": "Internal Error", "details": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8182, debug=True)
