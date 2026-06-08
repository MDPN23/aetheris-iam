#!/usr/bin/env python3
"""
Aetheris - Database Tenant Schema Migration Runner
Creates a dedicated PostgreSQL schema for a given tenant,
sets up the segregated tables, and populates initial default data.

Usage:
  python3 scripts/db_migrate_tenant.py --tenant tenant-a
  python3 scripts/db_migrate_tenant.py --tenant tenant-b --recreate
"""
import sys
import os
import argparse
import subprocess
import json

MOCKDATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mockdata")

def run_sql(sql_content):
    """Execute SQL query inside the aetheris-postgres docker container."""
    try:
        # Run docker exec feeding sql_content to stdin of psql
        process = subprocess.Popen(
            ["docker", "exec", "-i", "aetheris-postgres", "psql", "-U", "aetheris_admin", "-d", "aetheris"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdout, stderr = process.communicate(input=sql_content)
        if process.returncode != 0:
            raise Exception(f"psql execution failed: {stderr}")
        return stdout, stderr
    except Exception as e:
        print(f"  ✗ SQL Execution Error: {e}")
        sys.exit(1)

def migrate_tenant(tenant_id, recreate=False):
    schema_name = f"aetheris_tenant_{tenant_id.replace('-', '_')}"
    print(f"══ Migrating Database for Tenant: {tenant_id} (Schema: {schema_name}) ══")

    sql_statements = []

    if recreate:
        print(f"  - Dropping existing schema {schema_name}...")
        sql_statements.append(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE;")

    # Create Schema
    sql_statements.append(f"CREATE SCHEMA IF NOT EXISTS {schema_name};")

    # Create Tables
    sql_statements.append(f"""
    CREATE TABLE IF NOT EXISTS {schema_name}.users (
        username VARCHAR(50) PRIMARY KEY,
        email VARCHAR(100),
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    sql_statements.append(f"""
    CREATE TABLE IF NOT EXISTS {schema_name}.roles (
        name VARCHAR(50) PRIMARY KEY,
        description TEXT
    );
    """)

    sql_statements.append(f"""
    CREATE TABLE IF NOT EXISTS {schema_name}.user_roles (
        username VARCHAR(50) REFERENCES {schema_name}.users(username) ON DELETE CASCADE,
        role_name VARCHAR(50) REFERENCES {schema_name}.roles(name) ON DELETE CASCADE,
        PRIMARY KEY (username, role_name)
    );
    """)

    sql_statements.append(f"""
    CREATE TABLE IF NOT EXISTS {schema_name}.risk_profiles (
        username VARCHAR(50) REFERENCES {schema_name}.users(username) ON DELETE CASCADE,
        risk_score NUMERIC(3, 2) DEFAULT 0.1,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (username)
    );
    """)

    sql_statements.append(f"""
    CREATE TABLE IF NOT EXISTS {schema_name}.audit_logs (
        id VARCHAR(50) PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        username VARCHAR(50),
        service VARCHAR(100),
        method VARCHAR(10),
        risk_score NUMERIC(3, 2),
        status INT,
        allowed BOOLEAN,
        deny_reason VARCHAR(100)
    );
    """)

    sql_statements.append(f"""
    CREATE TABLE IF NOT EXISTS {schema_name}.policies (
        id VARCHAR(50) PRIMARY KEY,
        rego_content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Combine table creation statements
    run_sql("\n".join(sql_statements))
    print(f"  ✓ Schema and tables created.")

    # Load initial users and roles templates
    users_file = os.path.join(MOCKDATA_DIR, "users.json")
    if not os.path.exists(users_file):
        print(f"  ✗ Users template file not found at {users_file}")
        sys.exit(1)

    with open(users_file, "r") as f:
        data = json.load(f)

    # Populate Roles
    print("  - Inserting default roles...")
    roles_sql = []
    for role in data.get("roles", []):
        name = role["name"]
        desc = role.get("description", "")
        roles_sql.append(f"INSERT INTO {schema_name}.roles (name, description) VALUES ('{name}', '{desc}') ON CONFLICT (name) DO NOTHING;")
    run_sql("\n".join(roles_sql))

    # Populate Users, User Roles, and Default Risk Profiles
    print("  - Inserting default users & risk profiles...")
    users_sql = []
    for user in data.get("users", []):
        username = user["username"]
        email = user["email"].replace("{{TENANT_ID}}", tenant_id)
        first_name = user["firstName"]
        last_name = user["lastName"].replace("{{TENANT_DISPLAY}}", tenant_id)
        enabled = "TRUE" if user.get("enabled", True) else "FALSE"

        users_sql.append(f"INSERT INTO {schema_name}.users (username, email, first_name, last_name, enabled) VALUES ('{username}', '{email}', '{first_name}', '{last_name}', {enabled}) ON CONFLICT (username) DO NOTHING;")
        
        # User Roles mapping
        for role_name in user.get("realmRoles", []):
            users_sql.append(f"INSERT INTO {schema_name}.user_roles (username, role_name) VALUES ('{username}', '{role_name}') ON CONFLICT (username, role_name) DO NOTHING;")
        
        # Risk profile defaults
        users_sql.append(f"INSERT INTO {schema_name}.risk_profiles (username, risk_score) VALUES ('{username}', 0.1) ON CONFLICT (username) DO NOTHING;")
        
    run_sql("\n".join(users_sql))
    
    # Load default rego policy
    policies_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "policies")
    rego_file = os.path.join(policies_dir, "authz.rego")
    if os.path.exists(rego_file):
        print("  - Inserting default authz.rego policy...")
        with open(rego_file, "r") as f:
            rego_content = f.read()
        # Escaping single quotes in SQL
        rego_escaped = rego_content.replace("'", "''")
        run_sql(f"INSERT INTO {schema_name}.policies (id, rego_content) VALUES ('default', '{rego_escaped}') ON CONFLICT (id) DO UPDATE SET rego_content = EXCLUDED.rego_content;")

    print(f"  ✓ Default dataset populated for {schema_name}.")

def main():
    parser = argparse.ArgumentParser(description="Aetheris - Database Tenant Schema Migration Runner")
    parser.add_argument("--tenant", required=True, help="Tenant ID to migrate")
    parser.add_argument("--recreate", action="store_true", help="Drop schema and recreate if it already exists")
    args = parser.parse_args()

    migrate_tenant(args.tenant, args.recreate)
    print("✓ Schema migration complete.")

if __name__ == "__main__":
    main()
