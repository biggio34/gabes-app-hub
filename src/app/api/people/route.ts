import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isArea, type Area } from "@/lib/areas";
import { assignmentLabels, listOrgs } from "@/lib/clubs";
import { isInviteEmailConfigured, sendInviteEmail } from "@/lib/invite-email";
import {
  createUser,
  deleteUser,
  listUsers,
  publicUser,
  updateUser,
} from "@/lib/users";

export const runtime = "nodejs";

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
  const [users, orgs] = await Promise.all([listUsers(), listOrgs()]);
  return NextResponse.json({
    users: users.map(publicUser),
    clubs: orgs.clubs,
    teams: orgs.teams,
    emailReady: isInviteEmailConfigured(),
  });
}

export async function POST(request: Request) {
  const { error } = await requireOwner();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    name?: string;
    email?: string;
    password?: string;
    areas?: string[];
    clubIds?: string[];
    teamIds?: string[];
  } | null;
  try {
    const password = body?.password ?? "";
    const user = await createUser({
      username: body?.username ?? "",
      name: body?.name ?? "",
      email: body?.email ?? "",
      password,
      areas: (body?.areas ?? []).filter(isArea) as Area[],
      clubIds: body?.clubIds ?? [],
      teamIds: body?.teamIds ?? [],
    });
    const orgs = await listOrgs();
    const invite = await sendInviteEmail({
      to: user.email ?? "",
      name: user.name,
      username: user.username,
      password,
      areas: user.areas,
      assignments: assignmentLabels(user, orgs.clubs, orgs.teams),
    });
    return NextResponse.json({
      user: publicUser(user),
      emailSent: invite.sent,
      emailError: invite.error,
    });
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
    email?: string;
    password?: string;
    areas?: string[];
    clubIds?: string[];
    teamIds?: string[];
  } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "Missing user" }, { status: 400 });
  }
  try {
    const user = await updateUser(body.id, {
      name: body.name,
      email: body.email,
      password: body.password,
      areas: body.areas?.filter(isArea),
      clubIds: body.clubIds,
      teamIds: body.teamIds,
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
