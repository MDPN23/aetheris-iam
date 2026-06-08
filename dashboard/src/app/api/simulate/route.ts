import { NextResponse } from "next/server";
import { getClientToken, simulateAuthorize } from "@/lib/aetheris";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, tenant, service, method, roles, useRawToken, rawToken } = body;

    let token = "";
    let tokenFetched = false;
    let tokenError = "";

    // 1. Fetch token if password is provided
    if (useRawToken) {
      token = rawToken || "";
    } else if (username && password && tenant) {
      try {
        token = await getClientToken(username, password, tenant);
        tokenFetched = true;
      } catch (err: any) {
        tokenError = err.message;
        console.warn("Failed to get Keycloak token for simulation:", err.message);
      }
    }

    // 2. Call OPA Adapter authz endpoint
    const result = await simulateAuthorize(token, username || "anonymous", tenant || "aetheris", service, method, roles || []);

    return NextResponse.json({
      success: result.status === 200,
      tokenFetched,
      tokenError,
      tokenSnippet: token ? token.substring(0, 15) + "..." : null,
      status: result.status,
      response: result.body,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
