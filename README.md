# Aetheris IAM — End-to-End Security Suite

> 💡 **Confused about how this system works?**
> Please read the high-level system explanation and analogy in [Aetheris-info.md](Aetheris-info.md) first.

Aetheris IAM is a comprehensive identity and access management (IAM) system implementing OIDC federation, fine-grained RBAC authorization, risk-based step-up multi-factor authentication (MFA), and real-time session revocation.

---

## 🏗️ Architecture

```
                               ┌────────────────────────────────┐
                               │       Keycloak (:8080)         │
                               │      (OIDC / Revocation)       │
                               └────────────────┬───────────────┘
                                                │ Introspect
                                                ▼
[Client] ──► [Oathkeeper IAP :4455] ──► [OPA Adapter :8182] ──► [OPA :8181]
                  │                             │ (Authz Check)   (RBAC Policy)
                  │                             ├─► [CARA Mock :5002]
                  │                             │   (Risk Assessment)
                  │                             ▼
                  ├──► [Microservice A :5000] ──┴── (If Authorized)
                  └──► [Microservice B :5001]
```

---

## 🚀 Development Phases

The project implements four core security pillars:

### 🔐 Phase 1: OIDC Federation
Keycloak acts as the Identity Provider (IdP) to issue OIDC JSON Web Tokens (JWTs). Ory Oathkeeper acts as the Identity-Aware Proxy (IAP) to intercept client requests, authenticate them via JWKS validation, and extract claims.

### 🛡️ Phase 2: Fine-Grained Authorization
Open Policy Agent (OPA) evaluates access rules written in Rego based on HTTP method, path, and user roles. Oathkeeper proxies these decisions through the OPA Adapter.

### ⚠️ Phase 3: Risk-Based Step-Up MFA
If a user is flagged with an elevated risk score (>= 0.6) by the **CARA Risk Engine**, OPA rejects the request with an `mfa_required` response unless the user's token contains the `acr: mfa` claim (indicating step-up MFA was completed).

### 🚫 Phase 4: Session Revocation & Kubernetes
*   **Fail-Closed Revocation**: OPA Adapter verifies token validity in real-time via Keycloak Introspection (`/token/introspect`). Tokens revoked via OIDC `/revoke` or user logouts (`/logout`) are immediately blocked.
*   **Kubernetes Migration**: Fully containerized services deployed on a local `k3d` Kubernetes cluster with automated ingress node-ports and configuration maps.

---

## 🛠️ Prerequisites

Ensure the following tools are installed locally:

| Dependency | Required Version | Purpose |
| :--- | :--- | :--- |
| **Docker** | `>= 24.x` | Running containers and building local images |
| **k3d** | `>= 5.x` | Orchestrating local Kubernetes clusters |
| **kubectl** | Required | Managing Kubernetes resources |
| **jq** | Required | JSON parsing in test scripts |
| **opa CLI** | Optional | Testing Rego policies locally (`opa test`) |
| **curl** | Required | Executing validation requests |

---

## ⚙️ Getting Started

You can run Aetheris IAM in two environments:

### Option A: Local Docker Compose (Development)
To run the entire stack natively on your host machine ports:
```bash
# Start the services
docker compose up --build

# Wait for Keycloak (~30s), then verify OIDC Discovery:
curl http://localhost:8080/realms/aetheris/.well-known/openid-configuration
```

### Option B: Local Kubernetes Cluster (k3d)
We provide a comprehensive deployment orchestration script that automates cluster creation, image builds, registry importing, and resource rollouts:
```bash
# Build, import images, create cluster, and deploy manifests
bash scripts/deploy-k8s.sh
```

---

## 🧪 Testing & Validation

### 1. OPA Unit Testing (Local)
Verify policy correctness locally without starting any containers:
```bash
opa test policies/ -v
```

### 2. End-to-End Integration Suite
Validate all 4 Phases (OIDC, RBAC, Step-Up MFA, and Session Revocation) against either the Docker Compose or k3d environment:
```bash
bash scripts/test-phases.sh
```

### 3. Interactive Visual Dashboard (No Stack Needed)
We have built an offline-first visual simulator for quick presentations and client demonstrations. This allows you to visually test the OIDC, RBAC, Step-Up MFA, and Session Revocation logic directly in your browser:
*   Open the [demo.html](demo.html) file directly in your web browser (double-click it).
*   Alternatively, serve it locally using Python:
    ```bash
    python3 -m http.server 8000
    # Navigate to: http://localhost:8000/demo.html
    ```

---

## 👥 Test Users

| Username       | Password    | Roles / Capabilities                     |
|----------------|-------------|------------------------------------------|
| `admin-user`     | `Admin@123`   | Full admin access, writer on both services |
| `reader-user`    | `Reader@123`  | Read-only access to A & B                |
| `service-a-only` | `SvcA@123`    | Isolation test user (read-only on A only) |

---

## 🔌 Port Mapping Reference

| Service | Host Port (Docker Compose) | K8s NodePort | Internal Port |
| :--- | :--- | :--- | :--- |
| **Keycloak** | `8080` | `30080` | `8080` |
| **Oathkeeper Proxy** | `4455` | `30455` | `4455` |
| **Oathkeeper Mgmt API** | `4456` | `30456` | `4456` |
| **CARA Mock** | `5002` | `30002` | `5002` |
| **OPA Adapter** | `8182` | `30182` | `8182` |
| **OPA (Engine)** | `8181` | *N/A (ClusterIP)* | `8181` |
