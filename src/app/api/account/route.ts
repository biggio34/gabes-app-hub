import { NextResponse } from "next/server";
import { applySessionCookie, createSessionToken, getSession } from "@/lib/auth";
import { findUserById, publicUser, updateUser } from "@/lib/users";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const stored = await findUserById(session.id);
  if (!stored) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  return NextResponse.json({ user: publicUser(stored) });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;
  try {
    const user = await updateUser(session.id, {
      username: body?.username,
      password: body?.password,
    });
    const response = NextResponse.json({ user: publicUser(user) });
    const token = await createSessionToken({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      areas: user.areas,
    });
    return applySessionCookie(response, token);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update account" },
      { status: 400 },
    );
  }
}
