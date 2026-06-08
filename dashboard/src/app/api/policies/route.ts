import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || "http://localhost:8183";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") || "tenant-a";

  try {
    const res = await fetch(`${CONTROL_PLANE_URL}/api/policies/${tenantId}`);
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch policy from control plane" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ rego: data.rego });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") || "tenant-a";

  try {
    const body = await request.json();
    const { rego } = body;

    if (!rego) {
      return NextResponse.json({ error: "rego content is required" }, { status: 400 });
    }

    // Forward to Control Plane
    const res = await fetch(`${CONTROL_PLANE_URL}/api/policies/${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rego }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: errText || "Failed to save policy to control plane" }, { status: res.status });
    }

    // Invalidate Redis cache to ensure OPA adapter uses the new rules
    try {
      await execAsync("docker exec aetheris-redis redis-cli FLUSHDB");
    } catch (err) {
      console.warn("Failed to flush redis cache after policy update:", err);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
