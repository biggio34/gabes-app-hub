import { NextResponse } from "next/server";
import { gameManagerAllowed, getSession } from "@/lib/auth";
import { findUserById } from "@/lib/users";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const stored = await findUserById(session.id);
  if (!gameManagerAllowed({ role: stored?.role ?? session.role })) {
    return new NextResponse("You do not have access to Game Manager.", { status: 403 });
  }
  return NextResponse.redirect(new URL("/apps/game-manager", request.url));
}
