import { NextResponse } from "next/server";
import { getRiskProfiles, saveRiskProfiles, updateCaraMockRisk } from "@/lib/aetheris";

export async function GET() {
  try {
    const profiles = await getRiskProfiles();
    return NextResponse.json(profiles);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, tenant, risk_score } = body;

    if (!username || risk_score === undefined) {
      return NextResponse.json({ error: "username and risk_score are required" }, { status: 400 });
    }

    const score = parseFloat(risk_score);
    if (isNaN(score) || score < 0 || score > 1) {
      return NextResponse.json({ error: "risk_score must be a number between 0 and 1" }, { status: 400 });
    }

    // Update risk-profiles.json
    const config = await getRiskProfiles();
    const key = tenant ? `${tenant}:${username}` : username;
    
    config.profiles[key] = score;
    await saveRiskProfiles(config);

    // Also update CARA Mock running service
    const serviceUpdated = await updateCaraMockRisk(username, tenant || "aetheris", score);

    return NextResponse.json({
      success: true,
      key,
      risk_score: score,
      serviceUpdated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
