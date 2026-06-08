#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Aetheris IAM — Phase 1 & 2 Validation Script
# Usage: bash scripts/test-phases.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

KEYCLOAK_URL="http://localhost:8080"
OATHKEEPER_URL="http://localhost:4455"
OPA_URL="http://localhost:8181"
REALM="aetheris"
CLIENT_ID="oathkeeper"
CLIENT_SECRET="oathkeeper-secret-dev"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0

pass() { echo -e "${GREEN}  ✓ PASS${NC} — $1"; ((PASS++)) || true; }
fail() { echo -e "${RED}  ✗ FAIL${NC} — $1"; ((FAIL++)) || true; }
section() { echo -e "\n${YELLOW}══ $1 ══${NC}"; }

# ─────────────────────────────────────────────────────────────────
# HELPER: Get token for a given user
# ─────────────────────────────────────────────────────────────────
get_token() {
  local username=$1 password=$2
  local scope=${3:-openid}
  local realm_name=${4:-$REALM}
  curl -sf -X POST \
    "${KEYCLOAK_URL}/realms/${realm_name}/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=${CLIENT_ID}" \
    --data-urlencode "client_secret=${CLIENT_SECRET}" \
    --data-urlencode "username=${username}" \
    --data-urlencode "password=${password}" \
    --data-urlencode "scope=${scope}" | jq -r '.access_token'
}

# ─────────────────────────────────────────────────────────────────
# PHASE 1: OIDC Federation Tests
# ─────────────────────────────────────────────────────────────────
section "PHASE 1 — OIDC Federation (Keycloak)"

echo "  Checking OIDC discovery endpoint..."
STATUS=$(curl -so /dev/null -w "%{http_code}" "${KEYCLOAK_URL}/realms/${REALM}/.well-known/openid-configuration")
[[ "$STATUS" == "200" ]] && pass "OIDC discovery endpoint reachable" || fail "OIDC discovery unreachable (HTTP $STATUS)"

echo "  Fetching token for admin-user..."
ADMIN_TOKEN=$(get_token "admin-user" "Admin@123")
[[ -n "$ADMIN_TOKEN" && "$ADMIN_TOKEN" != "null" ]] && pass "admin-user token issued" || fail "admin-user token failed"

echo "  Fetching token for reader-user..."
READER_TOKEN=$(get_token "reader-user" "Reader@123")
[[ -n "$READER_TOKEN" && "$READER_TOKEN" != "null" ]] && pass "reader-user token issued" || fail "reader-user token failed"

echo "  Fetching token for service-a-only user..."
SVC_A_TOKEN=$(get_token "service-a-only" "SvcA@123")
[[ -n "$SVC_A_TOKEN" && "$SVC_A_TOKEN" != "null" ]] && pass "service-a-only token issued" || fail "service-a-only token failed"

echo "  Validating roles in admin JWT..."
ROLES=$(echo "$ADMIN_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq -r '.roles // [] | join(",")')
[[ "$ROLES" == *"aetheris-admin"* ]] && pass "roles claim present in JWT: $ROLES" || fail "roles claim missing from JWT"

# ─────────────────────────────────────────────────────────────────
# PHASE 2: IAP (Oathkeeper) + OPA Policy Tests
# ─────────────────────────────────────────────────────────────────
section "PHASE 2 — IAP (Oathkeeper) + OPA Policy Engine"

# Reset CARA mock risk scores at the start to ensure clean state
curl -s -X POST "http://localhost:5002/mock/reset" > /dev/null

echo "  Checking OPA health..."
OPA_STATUS=$(curl -so /dev/null -w "%{http_code}" "${OPA_URL}/health" || echo "000")
if [[ "$OPA_STATUS" == "200" ]]; then
  pass "OPA service healthy"
else
  # Fallback check via OPA adapter when OPA is not exposed (e.g. inside K8s)
  ADAPTER_HEALTH=$(curl -so /dev/null -w "%{http_code}" "http://localhost:8182/health" || echo "000")
  if [[ "$ADAPTER_HEALTH" == "200" ]]; then
    pass "OPA service healthy (verified via OPA Adapter)"
  else
    fail "OPA health check failed (directly and via OPA Adapter)"
  fi
fi

echo "  Checking Oathkeeper proxy health..."
OK_STATUS=$(curl -so /dev/null -w "%{http_code}" "http://localhost:4456/health/alive" || echo "000")
[[ "$OK_STATUS" == "200" ]] && pass "Oathkeeper proxy healthy" || fail "Oathkeeper health check failed"

echo ""
echo "  [2a] Admin → GET /api/microservice-a (expect 200)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "200" ]] && pass "admin GET svc-a → 200" || fail "admin GET svc-a → $STATUS (expected 200)"

echo "  [2b] Admin → DELETE /api/microservice-a (expect 200)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" -X DELETE \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-a/data/1")
[[ "$STATUS" == "200" ]] && pass "admin DELETE svc-a → 200" || fail "admin DELETE svc-a → $STATUS (expected 200)"

echo "  [2c] Reader → GET /api/microservice-a (expect 200)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $READER_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "200" ]] && pass "reader GET svc-a → 200" || fail "reader GET svc-a → $STATUS (expected 200)"

echo "  [2d] Reader → POST /api/microservice-a (expect 403)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $READER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}' \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "403" ]] && pass "reader POST svc-a → 403 (denied as expected)" || fail "reader POST svc-a → $STATUS (expected 403)"

echo "  [2e] SvcA-only → GET /api/microservice-b (expect 403 — cross-service isolation)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $SVC_A_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-b/events")
[[ "$STATUS" == "403" ]] && pass "svc-a-only blocked from svc-b → 403" || fail "svc-a-only accessed svc-b → $STATUS (expected 403)"

echo "  [2f] No token → GET /api/microservice-a (expect 401)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "401" ]] && pass "unauthenticated → 401" || fail "unauthenticated → $STATUS (expected 401)"

# ─────────────────────────────────────────────────────────────────
# PHASE 3: Risk-Based Step-Up MFA Tests
# ─────────────────────────────────────────────────────────────────
section "PHASE 3 — Risk-Based Step-Up MFA"

CARA_URL="http://localhost:5002"

echo "  Checking CARA mock service health..."
CARA_STATUS=$(curl -so /dev/null -w "%{http_code}" "${CARA_URL}/health")
[[ "$CARA_STATUS" == "200" ]] && pass "CARA service healthy" || fail "CARA health check failed"

# Reset any mock risks
curl -s -X POST "${CARA_URL}/mock/reset" > /dev/null

echo "  [3a] Low Risk Admin User → GET /api/microservice-a (expect 200)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "200" ]] && pass "low risk access permitted (200)" || fail "low risk access failed (HTTP $STATUS)"

echo "  [3b] Mocking Elevated Risk (0.85) for admin-user..."
MOCK_RES=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"admin-user","risk_score":0.85}' \
  "${CARA_URL}/mock/risk")
[[ "$MOCK_RES" == *"admin-user"* ]] && pass "elevated risk mocked successfully" || fail "failed to mock elevated risk"

# Flush Redis cache so the old risk score (0.1) is not served from cache
docker exec aetheris-redis redis-cli FLUSHDB > /dev/null 2>&1

echo "  [3c] High Risk Admin User without MFA → GET /api/microservice-a (expect 403 / mfa_required)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
# Since Ory Oathkeeper intercepts the 403 response and replaces the body, we verify Oathkeeper returns 403,
# and query the OPA Adapter directly to confirm it returns the correct step-up MFA payload.
ADAPTER_STATUS=$(curl -so /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"input\":{\"token\":\"$ADMIN_TOKEN\",\"token_claims\":{\"sub\":\"c8dd633e-4cd8-4429-83d4-e5bb299b0585\",\"preferred_username\":\"admin-user\",\"roles\":[\"service-a-writer\",\"service-b-writer\",\"aetheris-admin\"],\"iss\":\"http://localhost:8080/realms/aetheris\"},\"service\":\"microservice-a\",\"method\":\"GET\"}}" \
  "http://localhost:8182/authz")
ADAPTER_BODY=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"input\":{\"token\":\"$ADMIN_TOKEN\",\"token_claims\":{\"sub\":\"c8dd633e-4cd8-4429-83d4-e5bb299b0585\",\"preferred_username\":\"admin-user\",\"roles\":[\"service-a-writer\",\"service-b-writer\",\"aetheris-admin\"],\"iss\":\"http://localhost:8080/realms/aetheris\"},\"service\":\"microservice-a\",\"method\":\"GET\"}}" \
  "http://localhost:8182/authz")
[[ "$STATUS" == "403" && "$ADAPTER_STATUS" == "403" && "$ADAPTER_BODY" == *"mfa_required"* ]] && pass "access denied with mfa_required payload (403)" || fail "MFA enforcement failed (Oathkeeper: $STATUS, Adapter: $ADAPTER_STATUS, Adapter body: $ADAPTER_BODY)"

echo "  [3d] Fetching Step-up MFA token for admin-user..."
ADMIN_MFA_TOKEN=$(get_token "admin-user" "Admin@123" "openid mfa")
[[ -n "$ADMIN_MFA_TOKEN" && "$ADMIN_MFA_TOKEN" != "null" ]] && pass "admin-user step-up token issued" || fail "step-up token issue failed"

echo "  [3e] High Risk Admin User with MFA → GET /api/microservice-a (expect 200)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_MFA_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "200" ]] && pass "high risk + MFA access permitted (200)" || fail "high risk + MFA access failed (HTTP $STATUS)"

# Reset mock risks
curl -s -X POST "${CARA_URL}/mock/reset" > /dev/null
# Flush Redis cache to clear any cached risk scores from Phase 3
docker exec aetheris-redis redis-cli FLUSHDB > /dev/null 2>&1

# ─────────────────────────────────────────────────────────────────
# PHASE 4: Session Revocation Tests
# ─────────────────────────────────────────────────────────────────
section "PHASE 4 — Session Revocation"

echo "  [4a] Issue token for admin-user..."
REVOKE_TEST_TOKEN=$(get_token "admin-user" "Admin@123")
[[ -n "$REVOKE_TEST_TOKEN" && "$REVOKE_TEST_TOKEN" != "null" ]] && pass "token issued successfully" || fail "token issue failed"

echo "  [4b] Access protected resource before revocation (expect 200)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $REVOKE_TEST_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "200" ]] && pass "access permitted (200)" || fail "access failed (HTTP $STATUS)"

echo "  [4c] Revoke token using Keycloak OIDC Revoke Endpoint..."
REVOKE_STATUS=$(curl -so /dev/null -w "%{http_code}" -X POST \
  "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/revoke" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}" \
  --data-urlencode "token=${REVOKE_TEST_TOKEN}")
[[ "$REVOKE_STATUS" == "200" ]] && pass "revoke endpoint returned 200" || fail "revoke failed (HTTP $REVOKE_STATUS)"

# Flush Redis cache so cached active=true is invalidated after revocation
docker exec aetheris-redis redis-cli FLUSHDB > /dev/null 2>&1

echo "  [4d] Access protected resource after revocation (expect 403)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $REVOKE_TEST_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "403" ]] && pass "access denied (403)" || fail "access allowed or wrong status (HTTP $STATUS)"

echo "  [4e] Test Backchannel Logout: Issue new access & refresh tokens..."
TOKENS=$(curl -sf -X POST \
  "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}" \
  --data-urlencode "username=admin-user" \
  --data-urlencode "password=Admin@123" \
  --data-urlencode "scope=openid")

ACCESS_TOKEN=$(echo "$TOKENS" | jq -r '.access_token')
REFRESH_TOKEN=$(echo "$TOKENS" | jq -r '.refresh_token')

[[ -n "$ACCESS_TOKEN" && "$ACCESS_TOKEN" != "null" && -n "$REFRESH_TOKEN" && "$REFRESH_TOKEN" != "null" ]] && pass "access and refresh tokens issued" || fail "token exchange failed"

echo "  [4f] Access resource with new token (expect 200)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "200" ]] && pass "access permitted (200)" || fail "access failed (HTTP $STATUS)"

echo "  [4g] Logout user session using OIDC Logout Endpoint with refresh token..."
LOGOUT_STATUS=$(curl -so /dev/null -w "%{http_code}" -X POST \
  "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/logout" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}" \
  --data-urlencode "refresh_token=${REFRESH_TOKEN}")
# Keycloak returns 204 No Content for successful backchannel logout
[[ "$LOGOUT_STATUS" == "204" ]] && pass "logout endpoint returned 204" || fail "logout failed (HTTP $LOGOUT_STATUS)"

# Flush Redis cache so cached active=true is invalidated after logout
docker exec aetheris-redis redis-cli FLUSHDB > /dev/null 2>&1

echo "  [4h] Access resource with access token after logout (expect 403)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "403" ]] && pass "access denied after logout (403)" || fail "access allowed or wrong status after logout (HTTP $STATUS)"

# ─────────────────────────────────────────────────────────────────
# PHASE 5: Multi-Tenancy Routing & Isolation (Header-Based)
# ─────────────────────────────────────────────────────────────────
section "PHASE 5 — Multi-Tenancy (X-Tenant-Id Header)"

echo "  Provisioning all tenants from mockdata/tenants.json..."
python3 scripts/provision_tenant.py --all --recreate

echo "  Fetching token for admin-user under tenant-a..."
TENANT_A_TOKEN=$(get_token "admin-user" "Admin@123" "openid" "tenant-a")
[[ -n "$TENANT_A_TOKEN" && "$TENANT_A_TOKEN" != "null" ]] && pass "tenant-a token issued" || fail "tenant-a token failed"

echo "  Fetching token for admin-user under tenant-b..."
TENANT_B_TOKEN=$(get_token "admin-user" "Admin@123" "openid" "tenant-b")
[[ -n "$TENANT_B_TOKEN" && "$TENANT_B_TOKEN" != "null" ]] && pass "tenant-b token issued" || fail "tenant-b token failed"

echo "  [5a] Tenant-A admin → GET /api/microservice-a with X-Tenant-Id: tenant-a (expect 200)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TENANT_A_TOKEN" \
  -H "X-Tenant-Id: tenant-a" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "200" ]] && pass "tenant-a access permitted (200)" || fail "tenant-a access failed (HTTP $STATUS)"

echo "  [5b] Tenant-B admin → GET /api/microservice-a with X-Tenant-Id: tenant-b (expect 200)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TENANT_B_TOKEN" \
  -H "X-Tenant-Id: tenant-b" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "200" ]] && pass "tenant-b access permitted (200)" || fail "tenant-b access failed (HTTP $STATUS)"

echo "  [5c] Cross-Tenant: Tenant-A token + X-Tenant-Id: tenant-b (expect 403 / tenant_mismatch)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TENANT_A_TOKEN" \
  -H "X-Tenant-Id: tenant-b" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
# Also verify via OPA Adapter directly for exact deny_reason
ADAPTER_BODY=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"input\":{\"token\":\"$TENANT_A_TOKEN\",\"token_claims\":{\"preferred_username\":\"admin-user\",\"roles\":[\"service-a-writer\",\"service-b-writer\",\"aetheris-admin\"],\"iss\":\"http://localhost:8080/realms/tenant-a\"},\"service\":\"microservice-a\",\"method\":\"GET\",\"tenant\":\"tenant-b\"}}" \
  "http://localhost:8182/authz")
[[ "$STATUS" == "403" && "$ADAPTER_BODY" == *"tenant_mismatch"* ]] && pass "cross-tenant denied with tenant_mismatch (403)" || fail "cross-tenant isolation failed (HTTP $STATUS, Body: $ADAPTER_BODY)"

echo "  [5d] No X-Tenant-Id header + aetheris token → should fallback to 'aetheris' (expect 200)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "${OATHKEEPER_URL}/api/microservice-a/data")
[[ "$STATUS" == "200" ]] && pass "fallback to aetheris tenant (200)" || fail "fallback failed (HTTP $STATUS)"

echo "  [5e] Redis Latency Test: 5 cached requests via OPA Adapter..."
START_TIME=$(date +%s%N)
for i in {1..5}; do
  curl -so /dev/null -X POST \
    -H "Content-Type: application/json" \
    -d "{\"input\":{\"token\":\"$TENANT_A_TOKEN\",\"token_claims\":{\"preferred_username\":\"admin-user\",\"roles\":[\"service-a-writer\",\"service-b-writer\",\"aetheris-admin\"],\"iss\":\"http://localhost:8080/realms/tenant-a\"},\"service\":\"microservice-a\",\"method\":\"GET\",\"tenant\":\"tenant-a\"}}" \
    "http://localhost:8182/authz"
done
END_TIME=$(date +%s%N)
ELAPSED=$(( (END_TIME - START_TIME) / 1000000 ))
echo "  Total elapsed for 5 requests: ${ELAPSED}ms"
[[ $ELAPSED -lt 500 ]] && pass "Redis cache working (total ${ELAPSED}ms for 5 requests)" || fail "latency too high (${ELAPSED}ms for 5 requests)"

# ─────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────
echo ""
echo "═════════════════════════════════════════"
echo -e "  Results: ${GREEN}${PASS} passed${NC} / ${RED}${FAIL} failed${NC}"
echo "═════════════════════════════════════════"
[[ "$FAIL" -eq 0 ]] && echo -e "${GREEN}  All tests passed. Phase 1-5 validated.${NC}" || \
  echo -e "${RED}  Some tests failed. Check service logs.${NC}"

