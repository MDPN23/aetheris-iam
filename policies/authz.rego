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
    role_permitted
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
    not role_permitted
    reason := sprintf(
        "insufficient_privilege: user roles %v cannot %v on %v",
        [user_roles, input.method, input.service]
    )
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
