import { NextResponse } from "next/server";
import { revokeTokenKeycloak, logoutUserKeycloak } from "@/lib/aetheris";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, token, refreshToken, tenant } = body;

    if (!tenant) {
      return NextResponse.json({ error: "tenant is required" }, { status: 400 });
    }

    if (action === "revoke") {
      if (!token) {
        return NextResponse.json({ error: "token is required for revocation" }, { status: 400 });
      }
      const success = await revokeTokenKeycloak(token, tenant);
      return NextResponse.json({ success });
    } else if (action === "logout") {
      if (!refreshToken) {
        return NextResponse.json({ error: "refreshToken is required for logout" }, { status: 400 });
      }
      const success = await logoutUserKeycloak(refreshToken, tenant);
      return NextResponse.json({ success });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
