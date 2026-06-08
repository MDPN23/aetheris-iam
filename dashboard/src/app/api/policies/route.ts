import { NextResponse } from "next/server";
import { getRegoPolicy, saveRegoPolicy } from "@/lib/aetheris";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET() {
  try {
    const rego = await getRegoPolicy();
    return NextResponse.json({ rego });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rego } = body;

    if (!rego) {
      return NextResponse.json({ error: "rego content is required" }, { status: 400 });
    }

    // Save policy
    await saveRegoPolicy(rego);

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
