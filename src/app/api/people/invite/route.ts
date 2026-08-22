import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/invite-email";
import { findUserById } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "owner") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    password?: string;
  } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "Missing person" }, { status: 400 });
  }

  const user = await findUserById(body.id);
  if (!user) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }
  if (!user.email) {
    return NextResponse.json(
      { error: "This person does not have an email yet." },
      { status: 400 },
    );
  }

  const invite = await sendInviteEmail({
    to: user.email,
    name: user.name,
    username: user.username,
    password: body.password,
    areas: user.areas,
  });
  if (!invite.sent) {
    return NextResponse.json(
      { error: invite.error || "Could not send the email." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
