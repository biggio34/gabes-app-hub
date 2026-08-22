import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isArea, type Area } from "@/lib/areas";
import {
  createUser,
  deleteUser,
  listUsers,
  publicUser,
  updateUser,
} from "@/lib/users";

function requireOwner() {
  return getSession().then((session) => {
    if (!session || session.role !== "owner") {
      return { session: null, error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
    }
    return { session, error: null };
  });
}

export async function GET() {
  const { error } = await requireOwner();
  if (error) return error;
  const users = await listUsers();
  return NextResponse.json({ users: users.map(publicUser) });
}

export async function POST(request: Request) {
  const { error } = await requireOwner();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    name?: string;
    password?: string;
    areas?: string[];
  } | null;
  try {
    const user = await createUser({
      username: body?.username ?? "",
      name: body?.name ?? "",
      password: body?.password ?? "",
      areas: (body?.areas ?? []).filter(isArea) as Area[],
    });
    return NextResponse.json({ user: publicUser(user) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create user" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const { error } = await requireOwner();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    name?: string;
    password?: string;
    areas?: string[];
  } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "Missing user" }, { status: 400 });
  }
  try {
    const user = await updateUser(body.id, {
      name: body.name,
      password: body.password,
      areas: body.areas?.filter(isArea),
    });
    return NextResponse.json({ user: publicUser(user) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update user" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const { error } = await requireOwner();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "Missing user" }, { status: 400 });
  }
  try {
    await deleteUser(body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete user" },
      { status: 400 },
    );
  }
}
