#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Aetheris IAM — Phase 4 Kubernetes Deployment Script
# Usage: bash scripts/deploy-k8s.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

CLUSTER_NAME="aetheris-cluster"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${YELLOW}=== 1. Building Docker Images locally ===${NC}"
docker build -t aetheris-svc-a:local --build-arg SERVICE_FILE=service_a.py --build-arg SERVICE_PORT=5000 ./k8s/microservices
docker build -t aetheris-svc-b:local --build-arg SERVICE_FILE=service_b.py --build-arg SERVICE_PORT=5001 ./k8s/microservices
docker build -t aetheris-cara-mock:local --build-arg SERVICE_FILE=cara_mock.py --build-arg SERVICE_PORT=5002 ./k8s/microservices
docker build -t aetheris-opa-adapter:local --build-arg SERVICE_FILE=opa_adapter.py --build-arg SERVICE_PORT=8182 ./k8s/microservices

echo -e "\n${YELLOW}=== 2. Checking k3d Cluster ===${NC}"
if ! k3d cluster list | grep -q "$CLUSTER_NAME"; then
  echo -e "Creating k3d cluster '${CLUSTER_NAME}' with required port mappings..."
  k3d cluster create "$CLUSTER_NAME" \
    -p "8080:30080@server:0" \
    -p "4455:30455@server:0" \
    -p "4456:30456@server:0" \
    -p "5002:30002@server:0" \
    -p "8182:30182@server:0"
else
  echo -e "${GREEN}k3d cluster '${CLUSTER_NAME}' already exists.${NC}"
fi

echo -e "\n${YELLOW}=== 3. Importing Images into k3d ===${NC}"
k3d image import \
  aetheris-svc-a:local \
  aetheris-svc-b:local \
  aetheris-cara-mock:local \
  aetheris-opa-adapter:local \
  -c "$CLUSTER_NAME"

echo -e "\n${YELLOW}=== 4. Applying Kubernetes Manifests ===${NC}"
kubectl apply -f k8s/manifests/

echo -e "\n${YELLOW}=== 5. Waiting for Deployments to be Ready ===${NC}"
echo "Waiting for Keycloak (this may take up to 60-90s to pull and start)..."
kubectl rollout status deployment/keycloak -n aetheris --timeout=120s

echo "Waiting for other deployments..."
kubectl rollout status deployment/oathkeeper -n aetheris
kubectl rollout status deployment/opa -n aetheris
kubectl rollout status deployment/opa-adapter -n aetheris
kubectl rollout status deployment/cara-mock -n aetheris
kubectl rollout status deployment/microservice-a -n aetheris
kubectl rollout status deployment/microservice-b -n aetheris

echo -e "\n${GREEN}═══ Kubernetes deployment complete and healthy! ═══${NC}"
echo -e "You can now run the validation script: ${YELLOW}bash scripts/test-phases.sh${NC}"
