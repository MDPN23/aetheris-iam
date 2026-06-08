import express from "express";
import cors from "cors";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { Pool } from "pg";

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 8183;

// Configure JSON parser
app.use(express.json());
app.use(cors());

// Paths
const STORAGE_DIR = path.join(__dirname, "storage");
const BUNDLES_DIR = path.join(STORAGE_DIR, "bundles");
const DEFAULT_POLICY_FILE = path.resolve(__dirname, "..", "policies", "authz.rego");

// Database configuration
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = parseInt(process.env.DB_PORT || "5432");
const DB_USER = process.env.DB_USER || "aetheris_admin";
const DB_PASSWORD = process.env.DB_PASSWORD || "aetheris_password";
const DB_NAME = process.env.DB_NAME || "aetheris";

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
});

// Helper: Ensure directories exist
async function initDirs() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  await fs.mkdir(BUNDLES_DIR, { recursive: true });
}

// Helper: Clean tenant ID for DB schema
function getCleanTenantId(tenantId: string): string {
  return tenantId.replace(/-/g, "_");
}

// Helper: Build policy bundle
async function buildBundle(tenantId: string, regoContent: string): Promise<string> {
  const buildDir = path.join("/tmp", "aetheris-build", tenantId);
  await fs.mkdir(buildDir, { recursive: true });

  // Dynamically rewrite package namespace to isolate tenant policy path
  const cleanTenant = getCleanTenantId(tenantId);
  const tenantPackage = `package tenants.${cleanTenant}.aetheris.authz`;
  const modifiedRego = regoContent.replace(/package\s+aetheris\.authz/, tenantPackage);

  const regoFilePath = path.join(buildDir, "authz.rego");
  await fs.writeFile(regoFilePath, modifiedRego, "utf-8");

  // Create .manifest file to declare bundle roots
  const manifestPath = path.join(buildDir, ".manifest");
  const manifestContent = JSON.stringify({
    roots: [`tenants/${cleanTenant}`]
  });
  await fs.writeFile(manifestPath, manifestContent, "utf-8");

  // 1. Validate policy using `opa test`
  try {
    await execAsync(`/usr/local/bin/opa test authz.rego`, { cwd: buildDir });
  } catch (error: any) {
    throw new Error(`OPA validation (opa test) failed: ${error.stdout || error.message}`);
  }

  // 2. Compile bundle using `opa build`
  const tenantBundleDir = path.join(BUNDLES_DIR, tenantId);
  await fs.mkdir(tenantBundleDir, { recursive: true });
  const bundleOutputPath = path.join(tenantBundleDir, "bundle.tar.gz");

  try {
    // Compile using directory as bundle source (includes .manifest and authz.rego)
    await execAsync(`/usr/local/bin/opa build -b -o ${bundleOutputPath} .`, {
      cwd: buildDir
    });
  } catch (error: any) {
    throw new Error(`OPA compile (opa build) failed: ${error.stdout || error.stderr || error.message}`);
  }

  // Clean up build directory
  await fs.rm(buildDir, { recursive: true, force: true });

  return bundleOutputPath;
}

// ── ENDPOINTS ──

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "aetheris-control-plane" });
});

// Get Rego Policy from DB for a tenant
app.get("/api/policies/:tenantId", async (req, res) => {
  const { tenantId } = req.params;
  const schemaName = `aetheris_tenant_${getCleanTenantId(tenantId)}`;

  try {
    const query = `SELECT rego_content FROM ${schemaName}.policies WHERE id = 'default';`;
    const result = await pool.query(query);

    if (result.rows.length > 0) {
      res.json({ rego: result.rows[0].rego_content });
    } else {
      // Fallback to reading the global default policy file
      if (existsSync(DEFAULT_POLICY_FILE)) {
        const defaultRego = await fs.readFile(DEFAULT_POLICY_FILE, "utf-8");
        res.json({ rego: defaultRego });
      } else {
        res.status(404).json({ error: "Policy not found" });
      }
    }
  } catch (error: any) {
    console.error(`Error fetching policy for ${tenantId}:`, error);
    // Fallback if schema doesn't exist yet
    if (existsSync(DEFAULT_POLICY_FILE)) {
      const defaultRego = await fs.readFile(DEFAULT_POLICY_FILE, "utf-8");
      return res.json({ rego: defaultRego });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update Policy for a tenant (and rebuild bundle)
app.post("/api/policies/:tenantId", async (req, res) => {
  const { tenantId } = req.params;
  const { rego } = req.body;

  if (!rego) {
    return res.status(400).json({ error: "Rego policy content is required" });
  }

  try {
    // 1. Build and validate OPA bundle
    console.log(`Compiling bundle for tenant ${tenantId}...`);
    await buildBundle(tenantId, rego);

    // 2. Persist to PostgreSQL
    const schemaName = `aetheris_tenant_${getCleanTenantId(tenantId)}`;
    const query = `
      INSERT INTO ${schemaName}.policies (id, rego_content)
      VALUES ('default', $1)
      ON CONFLICT (id) DO UPDATE
      SET rego_content = EXCLUDED.rego_content, updated_at = CURRENT_TIMESTAMP;
    `;
    await pool.query(query, [rego]);

    res.json({ success: true, message: `Bundle compiled and saved for tenant: ${tenantId}` });
  } catch (error: any) {
    console.error(`Error saving policy for tenant ${tenantId}:`, error);
    res.status(400).json({ error: error.message });
  }
});

// Serve bundle for a tenant
app.get("/bundles/:tenantId/bundle.tar.gz", async (req, res) => {
  const { tenantId } = req.params;
  const bundlePath = path.join(BUNDLES_DIR, tenantId, "bundle.tar.gz");

  try {
    // If bundle doesn't exist on disk, attempt to build it from DB or file fallback
    if (!existsSync(bundlePath)) {
      console.log(`Bundle not found for tenant ${tenantId}, attempting to compile on-the-fly...`);
      const schemaName = `aetheris_tenant_${getCleanTenantId(tenantId)}`;
      let regoContent = "";

      try {
        const query = `SELECT rego_content FROM ${schemaName}.policies WHERE id = 'default';`;
        const result = await pool.query(query);
        if (result.rows.length > 0) {
          regoContent = result.rows[0].rego_content;
        }
      } catch (dbErr) {
        console.warn(`Could not read policy from DB for ${tenantId}, using global file fallback:`, dbErr);
      }

      if (!regoContent) {
        if (existsSync(DEFAULT_POLICY_FILE)) {
          regoContent = await fs.readFile(DEFAULT_POLICY_FILE, "utf-8");
        } else {
          return res.status(404).json({ error: "Policy bundle not found and no default fallback available." });
        }
      }

      await buildBundle(tenantId, regoContent);
    }

    // Send the bundle file
    res.download(bundlePath, "bundle.tar.gz");
  } catch (error: any) {
    console.error(`Error serving bundle for tenant ${tenantId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Start Server
initDirs().then(() => {
  app.listen(PORT, () => {
    console.log(`Aetheris OPA Bundle Control Plane listening on port ${PORT}`);
  });
});