import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Absolute paths to directories
const PROJECT_ROOT = path.resolve(process.cwd(), "..");
const MOCKDATA_DIR = path.join(PROJECT_ROOT, "mockdata");
const POLICIES_DIR = path.join(PROJECT_ROOT, "policies");
const SCRIPTS_DIR = path.join(PROJECT_ROOT, "scripts");

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080";
const CARA_URL = process.env.CARA_URL || "http://localhost:5002";
const OPA_ADAPTER_URL = process.env.OPA_ADAPTER_URL || "http://localhost:8182";

export interface Tenant {
  id: string;
  display_name: string;
  enabled: boolean;
}

export interface UserCredential {
  type: string;
  value: string;
  temporary: boolean;
}

export interface User {
  username: string;
  email: string;
  enabled: boolean;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  credentials: UserCredential[];
  realmRoles: string[];
}

export interface Role {
  name: string;
  description: string;
}

export interface UsersData {
  roles: Role[];
  users: User[];
}

export interface RiskProfiles {
  defaults: {
    risk_score: number;
    level: string;
  };
  profiles: Record<string, number>;
}

// ── TENANT MANAGEMENT ──
export async function getTenants(): Promise<Tenant[]> {
  const filePath = path.join(MOCKDATA_DIR, "tenants.json");
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data).tenants || [];
  } catch (error) {
    console.error("Error reading tenants.json:", error);
    return [];
  }
}

export async function saveTenants(tenants: Tenant[]): Promise<void> {
  const filePath = path.join(MOCKDATA_DIR, "tenants.json");
  await fs.writeFile(filePath, JSON.stringify({ tenants }, null, 2), "utf-8");
}

export async function provisionTenant(tenantId: string): Promise<{ success: boolean; output: string }> {
  try {
    const pythonScript = path.join(SCRIPTS_DIR, "provision_tenant.py");
    // Run the provision script with python3
    const { stdout, stderr } = await execAsync(`python3 ${pythonScript} --tenant ${tenantId} --recreate`, {
      env: { ...process.env, KEYCLOAK_URL },
    });
    
    // Also trigger redis flush to clear any cached states
    try {
      await execAsync("docker exec aetheris-redis redis-cli FLUSHDB");
    } catch (redisError) {
      console.warn("Failed to flush redis during provisioning:", redisError);
    }

    return {
      success: true,
      output: stdout + (stderr ? "\nSTDERR:\n" + stderr : ""),
    };
  } catch (error: any) {
    console.error("Error provisioning tenant:", error);
    return {
      success: false,
      output: error.stdout + "\nERROR:\n" + error.message,
    };
  }
}

// ── USER MANAGEMENT ──
export async function getUsersData(): Promise<UsersData> {
  const filePath = path.join(MOCKDATA_DIR, "users.json");
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading users.json:", error);
    return { roles: [], users: [] };
  }
}

export async function saveUsersData(data: UsersData): Promise<void> {
  const filePath = path.join(MOCKDATA_DIR, "users.json");
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ── RISK PROFILES ──
export async function getRiskProfiles(): Promise<RiskProfiles> {
  const filePath = path.join(MOCKDATA_DIR, "risk-profiles.json");
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading risk-profiles.json:", error);
    return { defaults: { risk_score: 0.1, level: "low" }, profiles: {} };
  }
}

export async function saveRiskProfiles(profiles: RiskProfiles): Promise<void> {
  const filePath = path.join(MOCKDATA_DIR, "risk-profiles.json");
  await fs.writeFile(filePath, JSON.stringify(profiles, null, 2), "utf-8");
}

export async function updateCaraMockRisk(username: string, tenant: string, score: number): Promise<boolean> {
  const key = `${tenant}:${username}`;
  try {
    const response = await fetch(`${CARA_URL}/mock/risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        tenant,
        risk_score: score,
      }),
    });
    
    // Also invalidate Redis cache for this user risk score to ensure fresh evaluation
    try {
      await execAsync(`docker exec aetheris-redis redis-cli DEL "risk:score:${tenant}:${username}"`);
    } catch (err) {
      console.warn("Failed to delete redis risk cache:", err);
    }
    
    return response.ok;
  } catch (error) {
    console.error("Error calling CARA mock risk API:", error);
    return false;
  }
}

// ── REGO POLICY MANAGEMENT ──
export async function getRegoPolicy(): Promise<string> {
  const filePath = path.join(POLICIES_DIR, "authz.rego");
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    console.error("Error reading authz.rego:", error);
    return "";
  }
}

export async function saveRegoPolicy(content: string): Promise<void> {
  const filePath = path.join(POLICIES_DIR, "authz.rego");
  await fs.writeFile(filePath, content, "utf-8");
}

// ── SIMULATION & AUTH FLOWS ──
export async function getClientToken(username: string, password: string, tenant: string, scope = "openid"): Promise<string> {
  try {
    const url = `${KEYCLOAK_URL}/realms/${tenant}/protocol/openid-connect/token`;
    const params = new URLSearchParams();
    params.append("grant_type", "password");
    params.append("client_id", "oathkeeper");
    params.append("client_secret", "oathkeeper-secret-dev");
    params.append("username", username);
    params.append("password", password);
    params.append("scope", scope);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Token fetch failed: ${res.status} ${errText}`);
    }

    const data = await res.json();
    return data.access_token;
  } catch (error: any) {
    console.error("Error fetching token from Keycloak:", error.message);
    throw error;
  }
}

export async function simulateAuthorize(token: string, username: string, tenant: string, service: string, method: string, roles: string[]): Promise<any> {
  try {
    const issuer = `${KEYCLOAK_URL}/realms/${tenant}`;
    const payload = {
      input: {
        token: token,
        token_claims: {
          sub: "simulated-sub-id",
          preferred_username: username,
          roles: roles,
          iss: issuer,
        },
        service,
        method,
        tenant,
      },
    };

    const res = await fetch(`${OPA_ADAPTER_URL}/authz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json();
    return {
      status: res.status,
      body,
    };
  } catch (error: any) {
    console.error("Error calling OPA Adapter for simulation:", error);
    return {
      status: 500,
      body: { error: "Simulation failed", details: error.message },
    };
  }
}

export async function revokeTokenKeycloak(token: string, tenant: string): Promise<boolean> {
  try {
    const url = `${KEYCLOAK_URL}/realms/${tenant}/protocol/openid-connect/revoke`;
    const params = new URLSearchParams();
    params.append("client_id", "oathkeeper");
    params.append("client_secret", "oathkeeper-secret-dev");
    params.append("token", token);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    
    // Invalidate Redis cache
    try {
      await execAsync("docker exec aetheris-redis redis-cli FLUSHDB");
    } catch (err) {
      console.warn("Failed to flush redis cache after revoke:", err);
    }

    return res.ok;
  } catch (error) {
    console.error("Error revoking token in Keycloak:", error);
    return false;
  }
}

export async function logoutUserKeycloak(refreshToken: string, tenant: string): Promise<boolean> {
  try {
    const url = `${KEYCLOAK_URL}/realms/${tenant}/protocol/openid-connect/logout`;
    const params = new URLSearchParams();
    params.append("client_id", "oathkeeper");
    params.append("client_secret", "oathkeeper-secret-dev");
    params.append("refresh_token", refreshToken);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    
    // Invalidate Redis cache
    try {
      await execAsync("docker exec aetheris-redis redis-cli FLUSHDB");
    } catch (err) {
      console.warn("Failed to flush redis cache after logout:", err);
    }

    return res.status === 204 || res.ok;
  } catch (error) {
    console.error("Error logging out user in Keycloak:", error);
    return false;
  }
}
