import { NextResponse } from "next/server";
import { gameManagerAllowed, getSession } from "@/lib/auth";
import { softballContext } from "@/lib/softball";
import { findUserById } from "@/lib/users";

export async function requireGameManager() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  }
  const stored = await findUserById(session.id);
  if (!gameManagerAllowed({ role: stored?.role ?? session.role })) {
    return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  }
  const context = await softballContext(session);
  return { clubId: context.clubId, session };
}
