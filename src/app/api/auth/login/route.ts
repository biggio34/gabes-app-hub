import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { findUserByUsername, matchesOwnerPassword } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      username?: string;
      password?: string;
    } | null;
    const username = body?.username?.trim() ?? "";
    const password = body?.password ?? "";
    if (!username || !password) {
      return NextResponse.json(
        { error: "Enter your username and password." },
        { status: 400 },
      );
    }

    const user = await findUserByUsername(username);
    const passwordOk =
      !!user &&
      (matchesOwnerPassword(user, password) ||
        (await verifyPassword(password, user.passwordHash)));
    if (!user || !passwordOk) {
      return NextResponse.json(
        { error: "That username or password is wrong." },
        { status: 401 },
      );
    }

    const token = await createSessionToken({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      areas: user.areas,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Sign-in failed. Try again in a moment." },
      { status: 500 },
    );
  }
}
