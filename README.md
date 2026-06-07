# Aetheris IAM — Phase 1 & 2 Dev Setup

## Architecture

```
[Client] ──► [Oathkeeper IAP :4455]
                  │
                  ├─ authenticator: JWT  ◄── [Keycloak :8080]  (Phase 1)
                  │                           OIDC/JWKS
                  │
                  ├─ authorizer: OPA  ◄────── [OPA :8181]      (Phase 2)
                  │              RBAC policy
                  │
                  ├─ mutator: header injection
                  │
                  ├──► [Microservice A :5000]
                  └──► [Microservice B :5001]
```

## Prerequisites

Make sure the following dependencies are installed before setting up the project:

| Dependency | Required Version / Status | Purpose |
| :--- | :--- | :--- |
| **Docker** | `>= 24.x` (with Compose v2) | Running services locally and building container images |
| **Kubernetes (k3d / minikube)** | Required (e.g. `k3d >= 5.x`) | Local Kubernetes cluster provider for Phase 4 deployment |
| **kubectl** | Required | Kubernetes command-line tool to deploy and manage cluster resources |
| **jq** | Required | Command-line JSON parser, used by the integration test scripts |
| **opa CLI** | Optional | Open Policy Agent CLI for running local policy unit tests |
| **curl** | Required | Command-line tool to interact with endpoints and obtain tokens |


## Run

```bash
# Start full stack
docker compose up --build

# Wait for Keycloak (~30s), then verify:
curl http://localhost:8080/realms/aetheris/.well-known/openid-configuration
```

## Test

```bash
# Unit test OPA policies locally (no docker needed)
opa test policies/ -v

# Full Phase 1-2 integration test
chmod +x scripts/test-phases.sh
bash scripts/test-phases.sh
```

## Manual Curl Flow

```bash
# 1. Get token
TOKEN=$(curl -s -X POST \
  http://localhost:8080/realms/aetheris/protocol/openid-connect/token \
  -d "grant_type=password&client_id=oathkeeper&client_secret=oathkeeper-secret-dev" \
  -d "username=admin-user&password=Admin@123&scope=openid" \
  | jq -r '.access_token')

# 2. Access protected resource via IAP
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4455/api/microservice-a/data

# 3. Test unauthorized (reader → DELETE → should 403)
READER=$(curl -s -X POST \
  http://localhost:8080/realms/aetheris/protocol/openid-connect/token \
  -d "grant_type=password&client_id=oathkeeper&client_secret=oathkeeper-secret-dev" \
  -d "username=reader-user&password=Reader@123&scope=openid" \
  | jq -r '.access_token')

curl -X DELETE \
  -H "Authorization: Bearer $READER" \
  http://localhost:4455/api/microservice-a/data/1
# Expected: 403 Forbidden
```

## Test Users

| Username       | Password    | Roles                                    |
|----------------|-------------|------------------------------------------|
| admin-user     | Admin@123   | aetheris-admin, svc-a/b writer           |
| reader-user    | Reader@123  | service-a-reader, service-b-reader       |
| service-a-only | SvcA@123    | service-a-reader only (isolation test)   |

## Ports

| Service     | Port |
|-------------|------|
| Keycloak    | 8080 |
| OPA         | 8181 |
| Oathkeeper  | 4455 (proxy), 4456 (mgmt) |

## Development Phases

The project is structured into four distinct development phases:

- **Phase 1: OIDC Federation**
  - Keycloak issues OIDC token (JWT) $\rightarrow$ Ory Oathkeeper acts as the Identity-Aware Proxy (IAP) to validate incoming tokens.
- **Phase 2: Fine-Grained Authorization**
  - Open Policy Agent (OPA) enforces least-privilege authorization policies per service based on user roles and requested resources.
- **Phase 3: Risk-Based Step-Up MFA**
  - CARA mock service emits user risk scores $\rightarrow$ elevated scores trigger a step-up Multi-Factor Authentication (MFA) flow.
- **Phase 4: Session Revocation & Kubernetes**
  - End-to-end session revocation flow integration.
  - Kubernetes manifest configurations for deployment on a local `k3d` cluster.

