#!/usr/bin/env python3
"""
Aetheris - Tenant Realm Provisioner (Modular)
Reads configuration from mockdata/ directory to create Keycloak realms.

Usage:
  python3 scripts/provision_tenant.py --tenant tenant-a
  python3 scripts/provision_tenant.py --all                   # provision all tenants from mockdata/tenants.json
  python3 scripts/provision_tenant.py --tenant tenant-a --recreate
"""
import sys
import json
import os
import urllib.request
import urllib.parse
import urllib.error
import argparse

KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
MOCKDATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mockdata")


def load_json(filepath):
    """Load and parse a JSON file."""
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"  ✗ Failed to load {filepath}: {e}")
        sys.exit(1)


def render_template(data, tenant_id, display_name=""):
    """Recursively replace {{TENANT_ID}} and {{TENANT_DISPLAY}} placeholders in data."""
    if isinstance(data, str):
        return data.replace("{{TENANT_ID}}", tenant_id).replace("{{TENANT_DISPLAY}}", display_name or tenant_id)
    elif isinstance(data, dict):
        return {k: render_template(v, tenant_id, display_name) for k, v in data.items()}
    elif isinstance(data, list):
        return [render_template(item, tenant_id, display_name) for item in data]
    return data


def get_admin_token():
    """Authenticate as Keycloak master admin."""
    url = f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
    data = urllib.parse.urlencode({
        "client_id": "admin-cli",
        "username": "admin",
        "password": "admin",
        "grant_type": "password"
    }).encode("utf-8")

    req = urllib.request.Request(url, data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read().decode("utf-8"))["access_token"]
    except Exception as e:
        print(f"  ✗ Admin auth failed: {e}")
        if isinstance(e, urllib.error.HTTPError):
            print(f"    {e.read().decode()}")
        sys.exit(1)


def delete_realm(token, realm_name):
    """Delete a realm by name (ignore 404)."""
    url = f"{KEYCLOAK_URL}/admin/realms/{realm_name}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=10):
            print(f"  ✓ Deleted existing realm: {realm_name}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"  - Realm {realm_name} not found (skip delete)")
        else:
            print(f"  ✗ Delete failed: {e.code} {e.read().decode()}")


def create_realm(token, realm_data):
    """Import a full realm JSON into Keycloak."""
    url = f"{KEYCLOAK_URL}/admin/realms"
    req = urllib.request.Request(url,
        data=json.dumps(realm_data).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15):
            print(f"  ✓ Created realm: {realm_data['realm']}")
    except urllib.error.HTTPError as e:
        if e.code == 409:
            print(f"  - Realm '{realm_data['realm']}' already exists (use --recreate)")
        else:
            print(f"  ✗ Create failed: {e.code} {e.read().decode()}")
            sys.exit(1)


def build_realm(tenant_id, display_name):
    """Build a full realm JSON from mockdata templates."""
    # Load templates
    realm = load_json(os.path.join(MOCKDATA_DIR, "realm-template.json"))
    users_data = load_json(os.path.join(MOCKDATA_DIR, "users.json"))

    # Render placeholders
    realm = render_template(realm, tenant_id, display_name)
    users_data = render_template(users_data, tenant_id, display_name)

    # Merge roles and users into realm
    realm["roles"] = {"realm": users_data.get("roles", [])}
    realm["users"] = users_data.get("users", [])

    return realm


def provision_tenant(token, tenant_id, display_name, recreate=False):
    """Provision a single tenant realm."""
    print(f"\n══ Provisioning: {tenant_id} ══")

    if recreate:
        delete_realm(token, tenant_id)

    realm_data = build_realm(tenant_id, display_name)
    create_realm(token, realm_data)


def main():
    parser = argparse.ArgumentParser(description="Aetheris - Tenant Realm Provisioner")
    parser.add_argument("--tenant", help="Single tenant ID to provision")
    parser.add_argument("--all", action="store_true", help="Provision all tenants from mockdata/tenants.json")
    parser.add_argument("--recreate", action="store_true", help="Delete and recreate realm if exists")
    args = parser.parse_args()

    if not args.tenant and not args.all:
        parser.error("Specify --tenant <id> or --all")

    print("Authenticating to Keycloak...")
    token = get_admin_token()

    if args.all:
        tenants = load_json(os.path.join(MOCKDATA_DIR, "tenants.json"))
        for t in tenants.get("tenants", []):
            if t.get("enabled", True):
                provision_tenant(token, t["id"], t.get("display_name", t["id"]), args.recreate)
    else:
        provision_tenant(token, args.tenant, args.tenant, args.recreate)

    print("\n✓ Provisioning complete.")


if __name__ == "__main__":
    main()
