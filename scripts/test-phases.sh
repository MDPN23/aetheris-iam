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
  curl -sf -X POST \
    "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=${CLIENT_ID}" \
    -d "client_secret=${CLIENT_SECRET}" \
    -d "username=${username}" \
    -d "password=${password}" \
    -d "scope=openid" | jq -r '.access_token'
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

echo "  Checking OPA health..."
OPA_STATUS=$(curl -so /dev/null -w "%{http_code}" "${OPA_URL}/health")
[[ "$OPA_STATUS" == "200" ]] && pass "OPA service healthy" || fail "OPA health check failed"

echo "  Checking Oathkeeper proxy health..."
OK_STATUS=$(curl -so /dev/null -w "%{http_code}" "http://localhost:4456/health/alive")
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
# SUMMARY
# ─────────────────────────────────────────────────────────────────
echo ""
echo "═════════════════════════════════════════"
echo -e "  Results: ${GREEN}${PASS} passed${NC} / ${RED}${FAIL} failed${NC}"
echo "═════════════════════════════════════════"
[[ "$FAIL" -eq 0 ]] && echo -e "${GREEN}  All tests passed. Phase 1-2 validated.${NC}" || \
  echo -e "${RED}  Some tests failed. Check service logs.${NC}"
