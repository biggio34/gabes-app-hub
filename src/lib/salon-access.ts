import { NextResponse } from "next/server";
import { canAccessArea, getSession } from "@/lib/auth";

export async function requireSalon() {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "Sign in first." }, { status: 401 }),
    };
  }
  if (!canAccessArea(session, "luna-haus")) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "You do not have access to Luna Haus." },
        { status: 403 },
      ),
    };
  }
  return { session, error: null };
}
