import { NextResponse } from "next/server";
import { getTenants, provisionTenant, saveTenants } from "@/lib/aetheris";

export async function GET() {
  try {
    const tenants = await getTenants();
    return NextResponse.json({ tenants });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tenantId, display_name, action } = body;

    if (action === "provision") {
      if (!tenantId) {
        return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
      }

      // Add to tenants.json list first if not exists
      const tenants = await getTenants();
      if (!tenants.find((t) => t.id === tenantId)) {
        tenants.push({
          id: tenantId,
          display_name: display_name || tenantId,
          enabled: true,
        });
        await saveTenants(tenants);
      }

      // Call provision script
      const result = await provisionTenant(tenantId);
      return NextResponse.json(result);
    } else if (action === "create") {
      if (!tenantId) {
        return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
      }

      const tenants = await getTenants();
      if (tenants.find((t) => t.id === tenantId)) {
        return NextResponse.json({ error: "Tenant already exists" }, { status: 400 });
      }

      tenants.push({
        id: tenantId,
        display_name: display_name || tenantId,
        enabled: true,
      });
      await saveTenants(tenants);
      return NextResponse.json({ success: true, tenants });
    } else if (action === "delete") {
      if (!tenantId) {
        return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
      }

      let tenants = await getTenants();
      tenants = tenants.filter((t) => t.id !== tenantId);
      await saveTenants(tenants);
      return NextResponse.json({ success: true, tenants });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
