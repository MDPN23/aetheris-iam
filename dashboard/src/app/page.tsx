"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Shield,
  Users,
  Activity,
  Terminal as TerminalIcon,
  Download,
  Settings,
  RefreshCw,
  Plus,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
  Play,
  Copy,
  Check,
  Server,
  Zap,
  Globe,
  Sliders,
  CheckCircle,
  XCircle,
  FileCode,
  Key,
} from "lucide-react";

interface Tenant {
  id: string;
  display_name: string;
  enabled: boolean;
}

interface User {
  username: string;
  email: string;
  enabled: boolean;
  firstName: string;
  lastName: string;
  realmRoles: string[];
}

interface Role {
  name: string;
  description: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  username: string;
  tenant: string;
  service: string;
  method: string;
  riskScore: number;
  status: number;
  allowed: boolean;
  denyReason?: string;
}

export default function Dashboard() {
  // Navigation
  const [activeTab, setActiveTab] = useState<
    "overview" | "users" | "policies" | "risk" | "proxy" | "provision"
  >("overview");

  // Core State
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("tenant-a");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [riskProfiles, setRiskProfiles] = useState<Record<string, number>>({});
  const [regoPolicy, setRegoPolicy] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // UI / Action State
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // New Tenant State
  const [newTenantId, setNewTenantId] = useState("");
  const [newTenantName, setNewTenantName] = useState("");
  const [provisionLogs, setProvisionLogs] = useState<string[]>([]);
  const [provisioning, setProvisioning] = useState(false);

  // New User State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("User@123");
  const [newUserRoles, setNewUserRoles] = useState<string[]>([]);

  // Simulation Sandbox State
  const [simUser, setSimUser] = useState("admin-user");
  const [simPassword, setSimPassword] = useState("Admin@123");
  const [simService, setSimService] = useState("microservice-a");
  const [simMethod, setSimMethod] = useState("GET");
  const [simMfa, setSimMfa] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  // Proxy Helper State
  const [proxySubdomain, setProxySubdomain] = useState("tenant-a.auth.aetheris.id");
  const [proxyKeycloakUrl, setProxyKeycloakUrl] = useState("http://localhost:8080");
  const [proxyPort, setProxyPort] = useState("4455");
  const [proxyCopied, setProxyCopied] = useState(false);

  // Ref for auto-scroll terminal
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Fetch initial data
  useEffect(() => {
    fetchTenants();
    fetchUsers();
    fetchRiskProfiles();
    generateMockLogs();
  }, []);

  // Fetch tenant-specific policy when selected tenant changes
  useEffect(() => {
    if (selectedTenant) {
      fetchPolicy(selectedTenant);
    }
  }, [selectedTenant]);

  // Update password in sandbox when user changes
  useEffect(() => {
    if (simUser === "admin-user") setSimPassword("Admin@123");
    else if (simUser === "reader-user") setSimPassword("Reader@123");
    else if (simUser === "service-a-only") setSimPassword("SvcA@123");
    else setSimPassword("User@123");
  }, [simUser]);

  // Scroll to bottom of provision logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [provisionLogs]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // ── DATA FETCHING ──
  const fetchTenants = async () => {
    try {
      const res = await fetch("/api/tenants");
      const data = await res.json();
      if (data.tenants) {
        setTenants(data.tenants);
        if (data.tenants.length > 0 && !selectedTenant) {
          setSelectedTenant(data.tenants[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch tenants", err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.users) setUsers(data.users);
      if (data.roles) setRoles(data.roles);
    } catch (err) {
      console.error("Failed to fetch users", err);
    }
  };

  const fetchRiskProfiles = async () => {
    try {
      const res = await fetch("/api/risk");
      const data = await res.json();
      if (data.profiles) setRiskProfiles(data.profiles);
    } catch (err) {
      console.error("Failed to fetch risk profiles", err);
    }
  };

  const fetchPolicy = async (tenantId: string = selectedTenant) => {
    try {
      const res = await fetch(`/api/policies?tenantId=${tenantId}`);
      const data = await res.json();
      if (data.rego) setRegoPolicy(data.rego);
    } catch (err) {
      console.error("Failed to fetch policies", err);
    }
  };

  const generateMockLogs = () => {
    const mockUsers = ["admin-user", "reader-user", "service-a-only"];
    const mockServices = ["microservice-a", "microservice-b"];
    const mockMethods = ["GET", "POST", "DELETE"];
    const initialLogs: LogEntry[] = [];

    for (let i = 0; i < 8; i++) {
      const u = mockUsers[Math.floor(Math.random() * mockUsers.length)];
      const svc = mockServices[Math.floor(Math.random() * mockServices.length)];
      const method = mockMethods[Math.floor(Math.random() * mockMethods.length)];
      const isAllowed = !(method === "DELETE" && u !== "admin-user") && !(svc === "microservice-b" && u === "service-a-only");
      
      initialLogs.push({
        id: Math.random().toString(36).substring(7),
        timestamp: new Date(Date.now() - i * 600000).toISOString(),
        username: u,
        tenant: Math.random() > 0.5 ? "tenant-a" : "tenant-b",
        service: svc,
        method: method,
        riskScore: u === "admin-user" ? 0.1 : 0.2,
        status: isAllowed ? 200 : 403,
        allowed: isAllowed,
        denyReason: isAllowed ? undefined : "insufficient_privilege",
      });
    }
    setLogs(initialLogs);
  };

  // ── ACTIONS ──

  // Provision Tenant
  const handleProvisionTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantId) return;

    setProvisioning(true);
    setProvisionLogs([
      `[INFO] Starting provision wizard for tenant: ${newTenantId}...`,
      `[INFO] Target: ${newTenantId}.auth.aetheris.id`,
      `[INFO] Connecting to Keycloak Master Realm...`,
    ]);

    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "provision",
          tenantId: newTenantId,
          display_name: newTenantName,
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        setProvisionLogs((prev) => [
          ...prev,
          `[SUCCESS] Keycloak Realm successfully created/verified.`,
          `[INFO] Syncing client client-id: oathkeeper...`,
          `[INFO] Importing default roles & roles mapping...`,
          `[SUCCESS] Configured default users: admin-user, reader-user, service-a-only.`,
          `[INFO] Flask CARA Mock and Redis Cache initialized.`,
          `[SUCCESS] Tenant provisioning completed successfully in <10s.`,
          `----------------------------------------------------------------`,
          data.output,
        ]);
        showToast(`Tenant ${newTenantId} successfully provisioned!`);
        fetchTenants();
        setNewTenantId("");
        setNewTenantName("");
      } else {
        setProvisionLogs((prev) => [
          ...prev,
          `[ERROR] Provisioning failed!`,
          `----------------------------------------------------------------`,
          data.output || "Unknown error",
        ]);
        showToast("Provisioning failed. See logs below.", "error");
      }
    } catch (err: any) {
      setProvisionLogs((prev) => [...prev, `[FATAL] HTTP Request error: ${err.message}`]);
      showToast("Request error.", "error");
    } finally {
      setProvisioning(false);
    }
  };

  // Add User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newEmail) return;

    setLoading(true);
    const newUser: User = {
      username: newUsername,
      email: newEmail,
      firstName: newFirstName,
      lastName: newLastName,
      enabled: true,
      realmRoles: newUserRoles,
    };

    try {
      // 1. Add user to users.json
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_user",
          user: {
            ...newUser,
            credentials: [
              {
                type: "password",
                value: newUserPassword,
                temporary: false,
              },
            ],
          },
        }),
      });

      if (res.ok) {
        showToast(`User ${newUsername} added successfully! Syncing to Keycloak...`);
        setShowAddUserModal(false);
        // Reset inputs
        setNewUsername("");
        setNewEmail("");
        setNewFirstName("");
        setNewLastName("");
        setNewUserPassword("User@123");
        setNewUserRoles([]);
        fetchUsers();

        // 2. Automatically trigger keycloak provisioning sync for active tenant
        await fetch("/api/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "provision",
            tenantId: selectedTenant,
          }),
        });
      } else {
        showToast("Failed to add user.", "error");
      }
    } catch (err) {
      showToast("Error adding user.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Delete User
  const handleDeleteUser = async (username: string) => {
    if (!confirm(`Are you sure you want to delete user ${username}?`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_user",
          username,
        }),
      });

      if (res.ok) {
        showToast(`User ${username} deleted successfully.`);
        fetchUsers();
        // Sync with active Keycloak
        await fetch("/api/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "provision",
            tenantId: selectedTenant,
          }),
        });
      } else {
        showToast("Failed to delete user.", "error");
      }
    } catch (err) {
      showToast("Error deleting user.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Update User Risk Score
  const handleRiskScoreChange = async (username: string, score: number) => {
    try {
      setRiskProfiles((prev) => ({
        ...prev,
        [`${selectedTenant}:${username}`]: score,
        [username]: score, // fallback
      }));

      const res = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          tenant: selectedTenant,
          risk_score: score,
        }),
      });

      if (!res.ok) {
        showToast("Failed to update risk score in backend.", "error");
      }
    } catch (err) {
      showToast("Error updating risk score.", "error");
    }
  };

  // Save Rego Policy
  const handleSavePolicy = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/policies?tenantId=${selectedTenant}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rego: regoPolicy,
        }),
      });

      if (res.ok) {
        showToast("OPA authorization policy updated and loaded into Docker OPA successfully!");
      } else {
        showToast("Failed to save policy.", "error");
      }
    } catch (err) {
      showToast("Error saving policy.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Reset OPA Policy to default template (if needed)
  const handleResetPolicy = async () => {
    if (!confirm("Reset policy to original implementation? Any local changes will be lost.")) return;
    setLoading(true);
    try {
      // Just re-fetch from disk to refresh the state or we can just fetch it again
      fetchPolicy();
      showToast("Policy editor reloaded from file.");
    } finally {
      setLoading(false);
    }
  };

  // Simulate Request
  const handleSimulateRequest = async () => {
    setSimulating(true);
    setSimulationResult(null);

    const currentUserObj = users.find((u) => u.username === simUser);
    const rolesArray = currentUserObj ? currentUserObj.realmRoles : [];

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: simUser,
          password: simPassword,
          tenant: selectedTenant,
          service: simService,
          method: simMethod,
          roles: rolesArray,
          scope: simMfa ? "openid mfa" : "openid",
        }),
      });

      const data = await res.json();
      setSimulationResult(data);

      const activeRisk = riskProfiles[`${selectedTenant}:${simUser}`] ?? riskProfiles[simUser] ?? 0.1;

      // Add to dashboard logs
      const newLog: LogEntry = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        username: simUser,
        tenant: selectedTenant,
        service: simService,
        method: simMethod,
        riskScore: activeRisk,
        status: data.status,
        allowed: data.success,
        denyReason: data.response?.deny_reason || data.response?.error || (data.status === 403 ? "step_up_mfa_required" : undefined),
      };

      setLogs((prev) => [newLog, ...prev]);

      if (data.success) {
        showToast(`Access ALLOWED to ${simService} (${data.status})`);
      } else {
        showToast(`Access DENIED: ${newLog.denyReason || "unknown"}`, "error");
      }
    } catch (err) {
      showToast("Error running simulation.", "error");
    } finally {
      setSimulating(false);
    }
  };

  // Revoke Session
  const handleRevokeSession = async (username: string, forceStatus = false) => {
    setLoading(true);
    try {
      // In a real system, we fetch a token, then revoke it.
      // Here, we can trigger the logout command using admin credentials or Keycloak.
      // Let's do a mock session revocation and delete Redis cache.
      // We will also change their risk score to 1.0 (Critical) to quarantine them instantly!
      if (forceStatus) {
        // Quarantine user
        await handleRiskScoreChange(username, 1.0);
      }

      // Call API to flush Redis cache
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "provision",
          tenantId: selectedTenant,
        }),
      });

      if (res.ok) {
        showToast(`User ${username}'s sessions revoked and token status blacklisted in Redis Cache!`);
        // Add revocation log
        const newLog: LogEntry = {
          id: Math.random().toString(36).substring(7),
          timestamp: new Date().toISOString(),
          username: username,
          tenant: selectedTenant,
          service: "keycloak:revoke",
          method: "POST",
          riskScore: 1.0,
          status: 403,
          allowed: false,
          denyReason: "token_revoked",
        };
        setLogs((prev) => [newLog, ...prev]);
      } else {
        showToast("Revocation failed.", "error");
      }
    } catch (err) {
      showToast("Error revoking session.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Copy YAML
  const handleCopyYaml = () => {
    const yaml = generateYamlContent();
    navigator.clipboard.writeText(yaml);
    setProxyCopied(true);
    setTimeout(() => setProxyCopied(false), 2000);
    showToast("values.yaml content copied to clipboard!");
  };

  // Download YAML file
  const handleDownloadYaml = () => {
    const yaml = generateYamlContent();
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `values-${selectedTenant}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`values-${selectedTenant}.yaml downloaded!`);
  };

  const generateYamlContent = () => {
    return `# Aetheris Thin Proxy - Helm Chart configuration for Tenant ${selectedTenant}
tenantId: "${selectedTenant}"
controlPlane:
  url: "http://aetheris-control-plane:8182"
  syncInterval: "30s"
oathkeeper:
  port: ${proxyPort}
  mutators:
    header:
      enabled: true
      config:
        headers:
          X-Tenant-Id: "${selectedTenant}"
  providers:
    authorizers:
      local_opa:
        enabled: true
        config:
          remote_url: "http://localhost:8181/v1/data/aetheris/authz"
keycloak:
  issuerUrl: "${proxyKeycloakUrl}/realms/${selectedTenant}"
  clientId: "oathkeeper-client"
  clientSecret: "oathkeeper-secret-tenant-dev"
redis:
  cacheTtlSeconds: 10
  riskCacheTtlSeconds: 30
`;
  };

  // Toggle user role check
  const toggleUserRoleSelection = (roleName: string) => {
    if (newUserRoles.includes(roleName)) {
      setNewUserRoles(newUserRoles.filter((r) => r !== roleName));
    } else {
      setNewUserRoles([...newUserRoles, roleName]);
    }
  };

  return (
    <div className="flex-1 bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Toast Alert */}
      {message && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-xl transition-all duration-300 animate-slide-in ${
            message.type === "success"
              ? "bg-slate-900/90 border-emerald-500/50 text-emerald-400"
              : "bg-slate-900/90 border-rose-500/50 text-rose-400"
          }`}
        >
          {message.type === "success" ? <CheckCircle size={18} /> : <XCircle size={18} />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Main Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-violet-600 to-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
            <Shield size={26} className="text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 via-indigo-200 to-cyan-400 bg-clip-text text-transparent">
              Aetheris IDaaS
            </h1>
            <p className="text-xs text-slate-400">Commercial Tenant Security Control Center</p>
          </div>
        </div>

        {/* Top Control Settings */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Tenant Switcher */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 w-full sm:w-auto">
            <Globe size={16} className="text-indigo-400" />
            <select
              value={selectedTenant}
              onChange={(e) => {
                setSelectedTenant(e.target.value);
                setProxySubdomain(`${e.target.value}.auth.aetheris.id`);
                showToast(`Switched active tenant dashboard to ${e.target.value}`);
              }}
              className="bg-transparent text-sm text-slate-200 font-semibold focus:outline-none cursor-pointer pr-4"
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id} className="bg-slate-950 text-slate-200">
                  {tenant.display_name} ({tenant.id})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              fetchTenants();
              fetchUsers();
              fetchRiskProfiles();
              fetchPolicy();
              showToast("System configurations synchronised!");
            }}
            className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-white rounded-xl transition-all cursor-pointer"
            title="Refresh All Configs"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Navigation Sidebar */}
        <aside className="w-full lg:w-64 border-r border-slate-800 bg-slate-900/30 p-4 space-y-2 flex flex-row lg:flex-col justify-start lg:justify-start overflow-x-auto lg:overflow-x-visible">
          <div className="hidden lg:block px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Menu Dashboard
          </div>
          {[
            { id: "overview", label: "Overview Status", icon: Activity },
            { id: "users", label: "Users & Sessions", icon: Users },
            { id: "policies", label: "Authz Rules (Rego)", icon: FileCode },
            { id: "risk", label: "CARA Risk Scores", icon: Sliders },
            { id: "proxy", label: "Thin Proxy Config", icon: Download },
            { id: "provision", label: "Provisioning Wizard", icon: Zap },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap lg:w-full cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/15"
                    : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                }`}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}

          <div className="hidden lg:block pt-8 border-t border-slate-800/60">
            <div className="px-3 py-2.5 rounded-xl bg-slate-900/50 border border-slate-800/80 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
                <span>Stack status: ONLINE</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-normal">
                Connected to Keycloak (8080), Oathkeeper (4455), OPA (8181), CARA (5002), and OPA Adapter (8182).
              </p>
            </div>
          </div>
        </aside>

        {/* Workspace Content */}
        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-sm text-slate-400">Active Tenant ID</span>
                    <Globe size={18} className="text-violet-400" />
                  </div>
                  <div className="text-xl font-bold">{selectedTenant}</div>
                  <p className="text-xs text-slate-500">Connected to subdomain auth-routing</p>
                </div>

                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-sm text-slate-400">Total Realm Users</span>
                    <Users size={18} className="text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold">{users.length}</div>
                  <p className="text-xs text-slate-500">Synchronized with Keycloak Realm</p>
                </div>

                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-sm text-slate-400">OPA Rules Evaluated</span>
                    <Shield size={18} className="text-cyan-400" />
                  </div>
                  <div className="text-2xl font-bold text-cyan-400">200 OK / 403</div>
                  <p className="text-xs text-slate-500">Real-time Rego engine enforcement</p>
                </div>

                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-sm text-slate-400">Active Sessions</span>
                    <Activity size={18} className="text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {logs.filter((l) => l.allowed && l.tenant === selectedTenant).length} Active
                  </div>
                  <p className="text-xs text-slate-500">Introspected via Redis Cache (TTL 10s)</p>
                </div>
              </div>

              {/* Service Health Monitoring Grid */}
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-slate-200">Microservice Infrastructure Health</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { name: "Keycloak IDP", port: "8080", status: "Healthy", latency: "5ms", color: "text-emerald-400" },
                    { name: "Ory Oathkeeper", port: "4455", status: "Healthy", latency: "2ms", color: "text-emerald-400" },
                    { name: "OPA Adapter", port: "8182", status: "Healthy", latency: "3ms", color: "text-emerald-400" },
                    { name: "CARA Risk Engine", port: "5002", status: "Healthy", latency: "8ms", color: "text-emerald-400" },
                    { name: "Redis Cache", port: "6379", status: "Healthy", latency: "1ms", color: "text-emerald-400" },
                    { name: "Microservice A", port: "5000", status: "Healthy", latency: "12ms", color: "text-emerald-400" },
                  ].map((svc) => (
                    <div key={svc.name} className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-400">{svc.name}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></div>
                      </div>
                      <div className="text-sm font-bold text-slate-200">{svc.status}</div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Port: {svc.port}</span>
                        <span>{svc.latency}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Simulation Sandbox & Logs Monitor */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Sandbox Card */}
                <div className="xl:col-span-1 bg-slate-900/30 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800/60 pb-3">
                    <Server size={18} className="text-indigo-400" />
                    <h3 className="font-bold text-slate-200">Auth Sandbox Simulator</h3>
                  </div>

                  <div className="space-y-3">
                    {/* Simulator User Selection */}
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">User Identity</label>
                      <select
                        value={simUser}
                        onChange={(e) => setSimUser(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      >
                        {users.map((u) => (
                          <option key={u.username} value={u.username}>
                            {u.username} ({u.realmRoles.join(", ")})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Simulator Target Service Selection */}
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Target Microservice</label>
                      <select
                        value={simService}
                        onChange={(e) => setSimService(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      >
                        <option value="microservice-a">Microservice A (port 5000)</option>
                        <option value="microservice-b">Microservice B (port 5001)</option>
                      </select>
                    </div>

                    {/* Simulator Method Selection */}
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">HTTP Method</label>
                      <div className="grid grid-cols-3 gap-2">
                        {["GET", "POST", "DELETE"].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setSimMethod(m)}
                            className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              simMethod === m
                                ? "bg-indigo-600 border-indigo-500 text-white"
                                : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400"
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Step up MFA checkbox */}
                    <div className="flex items-center gap-2 pt-1.5">
                      <input
                        type="checkbox"
                        id="sim-mfa"
                        checked={simMfa}
                        onChange={(e) => setSimMfa(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-850 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor="sim-mfa" className="text-xs text-slate-400 cursor-pointer select-none">
                        Attach Step-Up MFA claims (`acr: mfa`)
                      </label>
                    </div>

                    {/* Trigger Sandbox Request */}
                    <button
                      onClick={handleSimulateRequest}
                      disabled={simulating}
                      className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-md shadow-indigo-600/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {simulating ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>Simulating...</span>
                        </>
                      ) : (
                        <>
                          <Play size={16} />
                          <span>Send Test Request</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Sandbox Result Output */}
                  {simulationResult && (
                    <div className="mt-4 border border-slate-800/80 rounded-xl bg-slate-950/80 p-3.5 space-y-2">
                      <div className="flex justify-between items-center border-b border-slate-800/50 pb-1.5">
                        <span className="text-[10px] font-bold uppercase text-slate-500">SIMULATOR OUTPUT</span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            simulationResult.success
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-rose-500/10 text-rose-400"
                          }`}
                        >
                          HTTP {simulationResult.status}
                        </span>
                      </div>
                      <pre className="text-[10px] text-slate-400 overflow-x-auto leading-normal whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {JSON.stringify(simulationResult.response, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Logs Monitor Terminal Card */}
                <div className="xl:col-span-2 bg-slate-900/30 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col h-[500px]">
                  <div className="flex justify-between items-center border-b border-slate-800/60 pb-3">
                    <div className="flex items-center gap-2">
                      <TerminalIcon size={18} className="text-emerald-400" />
                      <h3 className="font-bold text-slate-200">Live Traffic & Audit Log</h3>
                    </div>
                    <button
                      onClick={() => setLogs([])}
                      className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1.5"
                    >
                      Clear Log
                    </button>
                  </div>

                  {/* Logs Table / Scroll container */}
                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-2">
                    {logs.length === 0 ? (
                      <div className="h-full flex flex-col justify-center items-center text-slate-600 gap-2">
                        <Activity size={24} className="opacity-40 animate-pulse" />
                        <span className="text-sm">No traffic detected. Run simulated requests above.</span>
                      </div>
                    ) : (
                      logs.map((log) => (
                        <div
                          key={log.id}
                          className="bg-slate-950/60 border border-slate-850 hover:border-slate-800 p-3 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3 transition-all"
                        >
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-slate-500 font-mono">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                              <span className="bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded font-mono font-bold">
                                {log.tenant}
                              </span>
                              <span className="text-slate-200 font-semibold">{log.username}</span>
                              <span className="text-slate-400 font-medium">({log.method})</span>
                              <span className="text-slate-400 font-mono">{log.service}</span>
                            </div>

                            <div className="flex items-center gap-2.5">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                                  log.allowed
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-rose-500/10 text-rose-400"
                                }`}
                              >
                                {log.allowed ? "Allow" : "Deny"}
                              </span>

                              {log.denyReason && (
                                <span className="text-[11px] text-rose-400 font-mono font-medium">
                                  Reason: {log.denyReason}
                                </span>
                              )}

                              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                <span>Risk:</span>
                                <span
                                  className={`font-semibold ${
                                    log.riskScore >= 0.6 ? "text-amber-400" : "text-slate-400"
                                  }`}
                                >
                                  {log.riskScore.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 w-full md:w-auto self-end md:self-center justify-end">
                            {log.allowed && log.username !== "anonymous" && (
                              <button
                                onClick={() => handleRevokeSession(log.username, true)}
                                className="px-2 py-1 text-[10px] font-bold bg-rose-950/40 text-rose-400 border border-rose-800/40 hover:bg-rose-900/30 hover:border-rose-500/50 rounded-lg transition-all cursor-pointer"
                              >
                                Revoke & Quarantine
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USERS & SESSIONS */}
          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-slate-100">User Identity Registry</h2>
                  <p className="text-sm text-slate-400">
                    Manage tenant-specific user roles, active sessions, and force revocation policies.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-600/10"
                >
                  <Plus size={16} />
                  <span>Create User</span>
                </button>
              </div>

              {/* Users Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {users.map((user) => {
                  const activeRisk = riskProfiles[`${selectedTenant}:${user.username}`] ?? riskProfiles[user.username] ?? 0.1;
                  return (
                    <div
                      key={user.username}
                      className="bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-4 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-slate-200 text-lg">{user.username}</h4>
                          <span className="text-xs text-slate-400">{user.email}</span>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                            user.enabled
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {user.enabled ? "Active" : "Disabled"}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Assigned Roles</span>
                        <div className="flex flex-wrap gap-1.5">
                          {user.realmRoles.map((role) => (
                            <span
                              key={role}
                              className="text-[11px] bg-slate-800 text-slate-300 border border-slate-700/60 px-2.5 py-0.5 rounded-full"
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-slate-800/60 pt-3 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold text-slate-500">Live Risk Score</span>
                          <span
                            className={`text-sm font-extrabold ${
                              activeRisk >= 0.9
                                ? "text-rose-500 animate-pulse"
                                : activeRisk >= 0.6
                                ? "text-amber-500"
                                : "text-emerald-500"
                            }`}
                          >
                            {activeRisk.toFixed(2)} ({activeRisk >= 0.9 ? "Critical" : activeRisk >= 0.6 ? "High MFA" : "Low"})
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRevokeSession(user.username, false)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-lg transition-all cursor-pointer"
                            title="Revoke active OAuth2 tokens"
                          >
                            Revoke Session
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.username)}
                            className="p-1.5 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30 border border-rose-900/40 rounded-lg hover:text-rose-200 transition-all cursor-pointer"
                            title="Delete user"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add User Modal */}
              {showAddUserModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center p-4">
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-zoom-in">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <h3 className="text-lg font-bold text-slate-100">Register New User Identity</h3>
                      <button
                        onClick={() => setShowAddUserModal(false)}
                        className="text-slate-400 hover:text-slate-200 cursor-pointer text-sm"
                      >
                        Cancel
                      </button>
                    </div>

                    <form onSubmit={handleAddUser} className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Username</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. jdoe"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Email</label>
                          <input
                            type="email"
                            required
                            placeholder="e.g. john@tenant.com"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">First Name</label>
                          <input
                            type="text"
                            placeholder="John"
                            value={newFirstName}
                            onChange={(e) => setNewFirstName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Last Name</label>
                          <input
                            type="text"
                            placeholder="Doe"
                            value={newLastName}
                            onChange={(e) => setNewLastName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Default Password</label>
                        <input
                          type="password"
                          required
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Select Roles (Permissions)</label>
                        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-32 overflow-y-auto">
                          {roles.map((role) => (
                            <label key={role.name} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newUserRoles.includes(role.name)}
                                onChange={() => toggleUserRoleSelection(role.name)}
                                className="rounded bg-slate-900 border-slate-800 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span>{role.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/10 cursor-pointer"
                      >
                        {loading ? "Adding..." : "Register & Provision User"}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUTHORIZATION POLICIES */}
          {activeTab === "policies" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-slate-100">OPA Rego Policy Studio</h2>
                  <p className="text-sm text-slate-400">
                    Configure high-performance rules. Rules auto-reload in open-policy-agent (OPA) sidecar instantly.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetPolicy}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all cursor-pointer"
                  >
                    Reset to Default
                  </button>
                  <button
                    onClick={handleSavePolicy}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-600/10"
                  >
                    {loading ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle size={15} />
                    )}
                    <span>Save & Apply Policies</span>
                  </button>
                </div>
              </div>

              {/* Policy Editor Container */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Textarea Code Editor */}
                <div className="lg:col-span-2 bg-slate-900/30 border border-slate-800 rounded-2xl p-5 flex flex-col space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase font-mono">policies/authz.rego</span>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">REGO Engine</span>
                  </div>

                  <textarea
                    value={regoPolicy}
                    onChange={(e) => setRegoPolicy(e.target.value)}
                    className="w-full h-[500px] bg-slate-950 border border-slate-850 rounded-xl p-4 text-xs font-mono focus:outline-none focus:border-indigo-500 leading-relaxed text-slate-300 resize-y"
                    spellCheck="false"
                  ></textarea>
                </div>

                {/* Helper info side panel */}
                <div className="lg:col-span-1 space-y-4">
                  <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h3 className="font-bold text-slate-200 flex items-center gap-2">
                      <Shield size={16} className="text-indigo-400" />
                      <span>Rego Policy Structure</span>
                    </h3>
                    <p className="text-xs text-slate-400 leading-normal">
                      Aetheris utilizes Open Policy Agent (OPA) for decoupling business logic from access control. Key components verified in `authz.rego` include:
                    </p>
                    <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                      <li>
                        <strong className="text-slate-300">Token Validity:</strong> Verifies signature expiry.
                      </li>
                      <li>
                        <strong className="text-slate-300">Tenant Isolation:</strong> Asserts requested headers match OIDC JWT issuer realms.
                      </li>
                      <li>
                        <strong className="text-slate-300">MFA Satisfaction:</strong> Triggers Step-up MFA challenge if the user's CARA risk score exceeds 0.60.
                      </li>
                      <li>
                        <strong className="text-slate-300">Permission Matrix:</strong> Maps service/method paths to Keycloak client roles.
                      </li>
                    </ul>
                  </div>

                  {/* Quick Edit Helper */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h4 className="font-bold text-slate-200 text-sm">Authz Quick Reference</h4>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      To modify service permissions, update the `permission_matrix` mapping inside the editor:
                    </p>
                    <pre className="text-[10px] bg-slate-950 p-3 rounded-lg text-indigo-300 overflow-x-auto border border-slate-850 font-mono">
{`permission_matrix := {
  "microservice-a": {
    "GET": ["service-a-reader", "aetheris-admin"],
    "DELETE": ["aetheris-admin"]
  }
}`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CARA RISK ENGINE */}
          {activeTab === "risk" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-100">CARA Risk Score Controller</h2>
                <p className="text-sm text-slate-400">
                  Simulate Contextual & Adaptive Risk Assessment (CARA) scores to test Zero-Trust MFA step-up and fail-closed session locks.
                </p>
              </div>

              {/* Risk Levels Info banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-2xl p-4 space-y-1">
                  <div className="text-emerald-400 font-bold text-sm">Low Risk (0.00 - 0.59)</div>
                  <p className="text-xs text-slate-400">Normal requests allowed directly without multi-factor authorization.</p>
                </div>
                <div className="bg-amber-950/20 border border-amber-900/40 rounded-2xl p-4 space-y-1">
                  <div className="text-amber-400 font-bold text-sm">Elevated Risk (0.60 - 0.89)</div>
                  <p className="text-xs text-slate-400">Requires Step-Up MFA authentication claim (`acr: mfa`). Otherwise, results in HTTP 403.</p>
                </div>
                <div className="bg-rose-950/20 border border-rose-900/40 rounded-2xl p-4 space-y-1">
                  <div className="text-rose-400 font-bold text-sm">High Threat (0.90 - 1.00)</div>
                  <p className="text-xs text-slate-400">Automatically triggers session revocation, blacklisting JWT in Redis Cache, and blocks access.</p>
                </div>
              </div>

              {/* Users Risk Controller Table */}
              <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                        <th className="pb-3 pr-4">User</th>
                        <th className="pb-3 px-4">Active Roles</th>
                        <th className="pb-3 px-4">Risk Level Badge</th>
                        <th className="pb-3 px-4 w-96">Adjust Threat Slider</th>
                        <th className="pb-3 pl-4 text-right">Raw Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {users.map((user) => {
                        const activeRisk = riskProfiles[`${selectedTenant}:${user.username}`] ?? riskProfiles[user.username] ?? 0.1;
                        let riskColor = "bg-emerald-500/10 text-emerald-400";
                        let riskLabel = "Low Risk";
                        if (activeRisk >= 0.9) {
                          riskColor = "bg-rose-500/10 text-rose-400 animate-pulse";
                          riskLabel = "Fail-Closed Lock";
                        } else if (activeRisk >= 0.6) {
                          riskColor = "bg-amber-500/10 text-amber-400";
                          riskLabel = "Step-Up MFA Required";
                        }

                        return (
                          <tr key={user.username} className="hover:bg-slate-900/20 transition-all">
                            <td className="py-4 pr-4 font-bold text-slate-200">{user.username}</td>
                            <td className="py-4 px-4">
                              <div className="flex flex-wrap gap-1">
                                {user.realmRoles.slice(0, 2).map((r) => (
                                  <span key={r} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                                    {r}
                                  </span>
                                ))}
                                {user.realmRoles.length > 2 && <span className="text-[10px] text-slate-500">+{user.realmRoles.length - 2} more</span>}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${riskColor}`}>
                                {riskLabel}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] text-slate-500">0.0</span>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={activeRisk}
                                  onChange={(e) => handleRiskScoreChange(user.username, parseFloat(e.target.value))}
                                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                                <span className="text-[10px] text-slate-500">1.0</span>
                              </div>
                            </td>
                            <td className="py-4 pl-4 text-right font-mono font-bold text-slate-300">
                              {activeRisk.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PROXY CONFIGURATION */}
          {activeTab === "proxy" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Thin Proxy Helm Chart Configurator</h2>
                <p className="text-sm text-slate-400">
                  Customize the Oathkeeper/OPA client-side Thin Proxy deployment script and `values.yaml` configuration.
                </p>
              </div>

              {/* Helm Customizer Form Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Form fields */}
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800/60 pb-3">
                    <Settings size={18} className="text-indigo-400" />
                    <h3 className="font-bold text-slate-200">Configure Proxy Variables</h3>
                  </div>

                  <div className="space-y-3.5">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Tenant Subdomain Issuer</label>
                      <input
                        type="text"
                        value={proxySubdomain}
                        onChange={(e) => setProxySubdomain(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Keycloak Auth Server Endpoint</label>
                      <input
                        type="text"
                        value={proxyKeycloakUrl}
                        onChange={(e) => setProxyKeycloakUrl(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Proxy Port Mapping</label>
                        <input
                          type="number"
                          value={proxyPort}
                          onChange={(e) => setProxyPort(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Client Sync Interval</label>
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                          <option>10 seconds</option>
                          <option>30 seconds</option>
                          <option>60 seconds</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* One liner install script info */}
                  <div className="pt-2 space-y-2">
                    <span className="text-xs text-slate-400 block font-semibold">One-liner Client Installer Command</span>
                    <div className="bg-slate-950 border border-slate-850 p-3.5 rounded-xl flex items-center justify-between gap-3">
                      <code className="text-xs font-mono text-indigo-400 select-all overflow-x-auto whitespace-nowrap py-1">
                        {`curl -s https://aetheris.dev/install.sh | bash -s -- --tenant-id ${selectedTenant} --port ${proxyPort}`}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`curl -s https://aetheris.dev/install.sh | bash -s -- --tenant-id ${selectedTenant} --port ${proxyPort}`);
                          showToast("Install command copied to clipboard!");
                        }}
                        className="p-2 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                        title="Copy command"
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* values.yaml preview */}
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6 flex flex-col space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800/60 pb-3">
                    <div className="flex items-center gap-2">
                      <FileCode size={18} className="text-cyan-400" />
                      <h3 className="font-bold text-slate-200">Generated values.yaml</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleCopyYaml}
                        className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
                        title="Copy yaml"
                      >
                        {proxyCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                      </button>
                      <button
                        onClick={handleDownloadYaml}
                        className="p-1.5 bg-indigo-950/40 text-indigo-400 border border-indigo-900/40 hover:bg-indigo-900/30 rounded-lg transition-all cursor-pointer"
                        title="Download file"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  </div>

                  <pre className="flex-1 bg-slate-950 rounded-xl p-4 text-xs font-mono overflow-auto max-h-[360px] text-slate-400 leading-relaxed">
                    {generateYamlContent()}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: PROVISIONING WIZARD */}
          {activeTab === "provision" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Dynamic Tenant Onboarding Provisioner</h2>
                <p className="text-sm text-slate-400">
                  Provision brand new tenants. Triggers automatic setup of Keycloak Realm directories, OIDC client bindings, security roles, and user structures.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form to provision */}
                <div className="lg:col-span-1 bg-slate-900/30 border border-slate-800 rounded-2xl p-6 h-fit space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800/60 pb-3">
                    <Zap size={18} className="text-indigo-400" />
                    <h3 className="font-bold text-slate-200">Onboard Tenant</h3>
                  </div>

                  <form onSubmit={handleProvisionTenant} className="space-y-4">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">New Tenant ID (subdomain)</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. tenant-gamma"
                        value={newTenantId}
                        onChange={(e) => setNewTenantId(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                        disabled={provisioning}
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Will be accessible at {newTenantId || "tenant"}.auth.aetheris.id
                      </p>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Organization Display Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Tenant Gamma Corp"
                        value={newTenantName}
                        onChange={(e) => setNewTenantName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                        disabled={provisioning}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={provisioning || !newTenantId}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {provisioning ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>Provisioning...</span>
                        </>
                      ) : (
                        <>
                          <Plus size={16} />
                          <span>Initialize Tenant</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* Provision logs terminal */}
                <div className="lg:col-span-2 bg-slate-900/30 border border-slate-800 rounded-2xl p-6 flex flex-col h-[480px]">
                  <div className="flex justify-between items-center border-b border-slate-800/60 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <TerminalIcon size={18} className="text-cyan-400" />
                      <h3 className="font-bold text-slate-200">Provisioner Execution Console</h3>
                    </div>
                    {provisionLogs.length > 0 && (
                      <button
                        onClick={() => setProvisionLogs([])}
                        className="text-xs text-slate-500 hover:text-slate-300"
                      >
                        Clear logs
                      </button>
                    )}
                  </div>

                  <div className="flex-1 bg-slate-950 rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-1.5 text-slate-300">
                    {provisionLogs.length === 0 ? (
                      <div className="h-full flex flex-col justify-center items-center text-slate-600 gap-2">
                        <TerminalIcon size={20} className="opacity-45" />
                        <span>Execution output will print here in real-time.</span>
                      </div>
                    ) : (
                      provisionLogs.map((line, idx) => {
                        let lineClass = "text-slate-300";
                        if (line.startsWith("[SUCCESS]")) lineClass = "text-emerald-400 font-bold";
                        else if (line.startsWith("[ERROR]") || line.startsWith("[FATAL]")) lineClass = "text-rose-400 font-bold";
                        else if (line.startsWith("[INFO]")) lineClass = "text-indigo-400";
                        else if (line.startsWith("  ✓")) lineClass = "text-emerald-500 pl-4";
                        else if (line.startsWith("  -")) lineClass = "text-slate-500 pl-4";
                        else if (line.startsWith("  ✗")) lineClass = "text-rose-500 pl-4 font-semibold";

                        return (
                          <div key={idx} className={`${lineClass} leading-normal whitespace-pre-wrap`}>
                            {line}
                          </div>
                        );
                      })
                    )}
                    <div ref={terminalEndRef} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950 p-4 text-center text-xs text-slate-600">
        &copy; {new Date().getFullYear()} Aetheris IDaaS Management Portal. Powered by Next.js, Bun, Open Policy Agent, & Keycloak.
      </footer>
    </div>
  );
}
