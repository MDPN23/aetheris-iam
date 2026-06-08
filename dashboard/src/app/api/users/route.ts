import { NextResponse } from "next/server";
import { getUsersData, saveUsersData } from "@/lib/aetheris";

export async function GET() {
  try {
    const data = await getUsersData();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, user, username, role, roles } = body;

    const data = await getUsersData();

    if (action === "save_user") {
      if (!user || !user.username) {
        return NextResponse.json({ error: "User object with username is required" }, { status: 400 });
      }

      const existingIndex = data.users.findIndex((u) => u.username === user.username);
      if (existingIndex > -1) {
        data.users[existingIndex] = { ...data.users[existingIndex], ...user };
      } else {
        data.users.push(user);
      }

      await saveUsersData(data);
      return NextResponse.json({ success: true, users: data.users });
    } else if (action === "delete_user") {
      if (!username) {
        return NextResponse.json({ error: "Username is required" }, { status: 400 });
      }

      data.users = data.users.filter((u) => u.username !== username);
      await saveUsersData(data);
      return NextResponse.json({ success: true, users: data.users });
    } else if (action === "save_roles") {
      if (!roles) {
        return NextResponse.json({ error: "Roles array is required" }, { status: 400 });
      }
      data.roles = roles;
      await saveUsersData(data);
      return NextResponse.json({ success: true, roles: data.roles });
    } else if (action === "add_role") {
      if (!role || !role.name) {
        return NextResponse.json({ error: "Role name is required" }, { status: 400 });
      }
      if (data.roles.find((r) => r.name === role.name)) {
        return NextResponse.json({ error: "Role already exists" }, { status: 400 });
      }
      data.roles.push(role);
      await saveUsersData(data);
      return NextResponse.json({ success: true, roles: data.roles });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
