package aetheris.authz_test

import future.keywords.if
import data.aetheris.authz.allow
import data.aetheris.authz.deny_reason

# ─────────────────────────────────────────────
# TEST FIXTURES
# ─────────────────────────────────────────────
mock_admin_token := {
    "sub": "user-admin-001",
    "roles": ["aetheris-admin", "service-a-writer", "service-b-writer"],
    "exp": 9999999999,
    "iss": "http://keycloak:8080/realms/aetheris"
}

mock_reader_token := {
    "sub": "user-reader-002",
    "roles": ["service-a-reader", "service-b-reader"],
    "exp": 9999999999,
    "iss": "http://keycloak:8080/realms/aetheris"
}

mock_svc_a_only_token := {
    "sub": "user-svc-a-003",
    "roles": ["service-a-reader"],
    "exp": 9999999999,
    "iss": "http://keycloak:8080/realms/aetheris"
}

mock_expired_token := {
    "sub": "user-expired-004",
    "roles": ["aetheris-admin"],
    "exp": 1000000000,
    "iss": "http://keycloak:8080/realms/aetheris"
}

mock_admin_mfa_token := {
    "sub": "user-admin-001",
    "roles": ["aetheris-admin", "service-a-writer", "service-b-writer"],
    "exp": 9999999999,
    "iss": "http://keycloak:8080/realms/aetheris",
    "acr": "mfa"
}

# ─────────────────────────────────────────────
# P1: OIDC FEDERATION — Token validation tests
# ─────────────────────────────────────────────
test_valid_token_passes if {
    allow with input as {
        "token": "valid.jwt.token",
        "token_claims": mock_admin_token,
        "service": "microservice-a",
        "method": "GET"
    }
}

test_expired_token_denied if {
    not allow with input as {
        "token": "expired.jwt.token",
        "token_claims": mock_expired_token,
        "service": "microservice-a",
        "method": "GET"
    }
}

test_missing_token_denied if {
    not allow with input as {
        "token": "",
        "token_claims": {},
        "service": "microservice-a",
        "method": "GET"
    }
}

# ─────────────────────────────────────────────
# P2: OPA POLICY — Least-privilege RBAC tests
# ─────────────────────────────────────────────

# Admin: full access
test_admin_can_delete_service_a if {
    allow with input as {
        "token": "valid.jwt.token",
        "token_claims": mock_admin_token,
        "service": "microservice-a",
        "method": "DELETE"
    }
}

# Reader: GET allowed
test_reader_can_get_service_a if {
    allow with input as {
        "token": "valid.jwt.token",
        "token_claims": mock_reader_token,
        "service": "microservice-a",
        "method": "GET"
    }
}

# Reader: POST denied
test_reader_cannot_post_service_a if {
    not allow with input as {
        "token": "valid.jwt.token",
        "token_claims": mock_reader_token,
        "service": "microservice-a",
        "method": "POST"
    }
}

# svc-a-only: denied on service-b
test_svc_a_user_cannot_access_service_b if {
    not allow with input as {
        "token": "valid.jwt.token",
        "token_claims": mock_svc_a_only_token,
        "service": "microservice-b",
        "method": "GET"
    }
}

# Deny reason is populated on failure
test_deny_reason_on_insufficient_privilege if {
    r := deny_reason with input as {
        "token": "valid.jwt.token",
        "token_claims": mock_reader_token,
        "service": "microservice-a",
        "method": "DELETE"
    }
    r != null
}

# ─────────────────────────────────────────────
# P3: RISK-BASED STEP-UP MFA — Policy tests
# ─────────────────────────────────────────────

test_low_risk_no_mfa_passes if {
    allow with input as {
        "token": "valid.jwt.token",
        "token_claims": mock_admin_token,
        "service": "microservice-a",
        "method": "GET",
        "risk_score": 0.2
    }
}

test_high_risk_no_mfa_denied if {
    not allow with input as {
        "token": "valid.jwt.token",
        "token_claims": mock_admin_token,
        "service": "microservice-a",
        "method": "GET",
        "risk_score": 0.8
    }
}

test_high_risk_with_mfa_passes if {
    allow with input as {
        "token": "valid.jwt.token",
        "token_claims": mock_admin_mfa_token,
        "service": "microservice-a",
        "method": "GET",
        "risk_score": 0.8
    }
}

test_deny_reason_on_mfa_required if {
    r := deny_reason with input as {
        "token": "valid.jwt.token",
        "token_claims": mock_admin_token,
        "service": "microservice-a",
        "method": "GET",
        "risk_score": 0.8
    }
    r == "step_up_mfa_required"
}
