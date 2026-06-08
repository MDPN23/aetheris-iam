package aetheris.authz

import future.keywords.in
import future.keywords.if

# ─────────────────────────────────────────────
# MAIN DECISION POINT
# allow = true  → request is permitted
# ─────────────────────────────────────────────
default allow := false

allow if {
    token_valid
    tenant_authorized
    role_permitted
    mfa_satisfied
}

# Extract tenant ID from token issuer URL
# e.g., "http://localhost:8080/realms/tenant-a" -> "tenant-a"
token_tenant := tenant if {
    iss := input.token_claims.iss
    contains(iss, "/realms/")
    parts := split(iss, "/realms/")
    parts_sub := split(parts[1], "/")
    tenant := parts_sub[0]
}

# Tenant authorization: verify X-Tenant-Id header matches the token's realm
tenant_authorized if {
    input.tenant == token_tenant
}

# If no tenant header was sent (null or empty), allow — backward compatible
tenant_authorized if {
    not input.tenant
}

tenant_authorized if {
    input.tenant == ""
}


# ─────────────────────────────────────────────
# RISK & STEP-UP MFA
# ─────────────────────────────────────────────

# Default risk score is low (0.0) if not provided
risk_score := input.risk_score if {
    input.risk_score != null
}

risk_score := 0.0 if {
    input.risk_score == null
}

is_high_risk if {
    risk_score >= 0.6
}

# Check if token has completed MFA (acr claim equals "mfa")
token_has_mfa if {
    input.token_claims.acr == "mfa"
}

default mfa_satisfied := false

mfa_satisfied if {
    not is_high_risk
}

mfa_satisfied if {
    is_high_risk
    token_has_mfa
}

# ─────────────────────────────────────────────
# TOKEN VALIDATION
# Validates that the JWT is present and not expired
# In production: OPA will verify signature via JWKS endpoint
# ─────────────────────────────────────────────
token_valid if {
    input.token != null
    input.token != ""
    not token_expired
}

token_expired if {
    now := time.now_ns() / 1000000000
    input.token_claims.exp < now
}

# ─────────────────────────────────────────────
# ROLE-BASED ACCESS CONTROL (RBAC)
# Maps: service × method → required_roles
# ─────────────────────────────────────────────

# Permission matrix — extend for new services
permission_matrix := {
    "microservice-a": {
        "GET":    ["service-a-reader", "service-a-writer", "aetheris-admin"],
        "POST":   ["service-a-writer", "aetheris-admin"],
        "PUT":    ["service-a-writer", "aetheris-admin"],
        "DELETE": ["aetheris-admin"]
    },
    "microservice-b": {
        "GET":    ["service-b-reader", "service-b-writer", "aetheris-admin"],
        "POST":   ["service-b-writer", "aetheris-admin"],
        "PUT":    ["service-b-writer", "aetheris-admin"],
        "DELETE": ["aetheris-admin"]
    }
}

# Extract user roles from JWT claims (Keycloak format)
user_roles := input.token_claims.roles

role_permitted if {
    required := permission_matrix[input.service][input.method]
    some role in user_roles
    role in required
}

# ─────────────────────────────────────────────
# DENY REASONS (for audit logging)
# Returns human-readable reason when deny occurs
# ─────────────────────────────────────────────
deny_reason := reason if {
    not token_valid
    reason := "invalid_or_missing_token"
}

deny_reason := reason if {
    token_valid
    not tenant_authorized
    reason := sprintf(
        "tenant_mismatch: requested tenant '%v' does not match token tenant '%v'",
        [input.tenant, token_tenant]
    )
}

deny_reason := reason if {
    token_valid
    tenant_authorized
    not role_permitted
    reason := sprintf(
        "insufficient_privilege: user roles %v cannot %v on %v",
        [user_roles, input.method, input.service]
    )
}

deny_reason := reason if {
    token_valid
    tenant_authorized
    role_permitted
    not mfa_satisfied
    reason := "step_up_mfa_required"
}

# ─────────────────────────────────────────────
# RESPONSE OBJECT
# Oathkeeper will query: /v1/data/aetheris/authz
# ─────────────────────────────────────────────
response := {
    "allow":        allow,
    "deny_reason":  deny_reason,
    "subject":      input.token_claims.sub,
    "service":      input.service,
    "method":       input.method,
    "evaluated_at": time.now_ns()
}
