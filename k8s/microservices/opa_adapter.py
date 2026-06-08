"""
Aetheris - OPA Adapter
Translates OPA JSON decision bodies into HTTP status codes for Ory Oathkeeper
"""
import json
import os
import urllib.request
import urllib.parse
import urllib.error
import redis
import hashlib
from flask import Flask, request, jsonify

app = Flask(__name__)
SERVICE_NAME = "opa-adapter"

OPA_URL = "http://opa:8181/v1/data/aetheris/authz"

# Initialize Redis client
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
try:
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)
    print(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}", flush=True)
except Exception as e:
    print(f"Failed to connect to Redis: {e}", flush=True)
    r = None


def is_token_active(token, issuer=None):
    if not token:
        return False
    # Strip Bearer prefix if present
    if token.startswith("Bearer "):
        token = token[7:]
    
    # Generate cache key
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    cache_key = f"token:introspect:{token_hash}"
    
    if r:
        try:
            cached_val = r.get(cache_key)
            if cached_val is not None:
                print(f"DEBUG: Token status hit in Redis cache: {cached_val}", flush=True)
                return cached_val == "true"
        except Exception as e:
            print(f"Error reading token status cache: {e}", flush=True)

    # Extract realm from issuer
    realm = "aetheris"
    if issuer and "/realms/" in issuer:
        parts = issuer.split("/realms/")
        if len(parts) > 1:
            realm = parts[1].split("/")[0]
    
    try:
        keycloak_url = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")
        url = f"{keycloak_url}/realms/{realm}/protocol/openid-connect/token/introspect"
        
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
            active = res_data.get("active", False)
            if r:
                try:
                    r.setex(cache_key, 10, "true" if active else "false")
                    print(f"DEBUG: Token status cached in Redis for 10s: {active}", flush=True)
                except Exception as cache_err:
                    print(f"Error caching token status: {cache_err}", flush=True)
            return active
    except Exception as e:
        print(f"Error calling Keycloak token introspection: {e}", flush=True)
        # Fail-closed for security
        return False


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": SERVICE_NAME}), 200


def get_risk_score(username, tenant="aetheris"):
    cache_key = f"risk:score:{tenant}:{username}"
    if r:
        try:
            cached_val = r.get(cache_key)
            if cached_val is not None:
                print(f"DEBUG: Risk score hit in Redis cache for {tenant}:{username}: {cached_val}", flush=True)
                return float(cached_val)
        except Exception as e:
            print(f"Error reading risk score cache: {e}", flush=True)

    try:
        cara_req = urllib.request.Request(
            "http://cara-mock:5002/assess",
            data=json.dumps({"username": username, "tenant": tenant}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(cara_req, timeout=2) as res:
            data = json.loads(res.read().decode("utf-8"))
            score = data.get("risk_score", 0.1)
            if r:
                try:
                    r.setex(cache_key, 30, str(score))
                    print(f"DEBUG: Risk score cached in Redis for 30s: {score}", flush=True)
                except Exception as cache_err:
                    print(f"Error caching risk score: {cache_err}", flush=True)
            return score
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
    
    # Extract tenant from payload input or fall back to extracting it from issuer
    tenant = payload.get("input", {}).get("tenant")
    if not tenant and issuer and "/realms/" in issuer:
        parts = issuer.split("/realms/")
        if len(parts) > 1:
            tenant = parts[1].split("/")[0]
    if not tenant:
        tenant = "aetheris"
        
    if raw_token and raw_token.strip() and raw_token != "<no value>":
        if not is_token_active(raw_token, issuer):
            print("DEBUG: session revocation check failed - token is inactive", flush=True)
            return jsonify({
                "error": "unauthorized",
                "deny_reason": "token_revoked",
                "message": "The session has been revoked or logged out"
            }), 403

    # Extract username and fetch risk score from CARA
    username = token_claims.get("preferred_username") or token_claims.get("sub")
    print(f"DEBUG: extracted username: {username}, tenant: {tenant}", flush=True)
    
    risk_score = 0.1
    if username:
        risk_score = get_risk_score(username, tenant)
        
    # Inject risk_score and tenant into OPA payload
    if "input" not in payload:
        payload["input"] = {}
    payload["input"]["risk_score"] = risk_score
    if "tenant" not in payload["input"]:
        payload["input"]["tenant"] = tenant
    
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

