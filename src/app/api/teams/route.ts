import { NextResponse } from "next/server";
import { canAccessArea, getSession } from "@/lib/auth";
import { createTeam, deleteTeam, renameTeam } from "@/lib/clubs";
import { softballContext } from "@/lib/softball";

export const runtime = "nodejs";

async function requireOwner() {
  const session = await getSession();
  if (!session || session.role !== "owner") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return null;
}

export async function POST(request: Request) {
  const error = await requireOwner();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as {
    clubId?: string;
    name?: string;
  } | null;
  try {
    const team = await createTeam(body?.clubId ?? "", body?.name ?? "");
    return NextResponse.json({ team });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add team" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  if (!canAccessArea(session, "softball")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    name?: string;
  } | null;
  const softball = await softballContext(session);
  const id = String(body?.id || "").trim();
  if (!id || (session.role !== "owner" && id !== softball.teamId)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  try {
    const team = await renameTeam(id, body?.name ?? "");
    return NextResponse.json({ team });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not rename team" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const error = await requireOwner();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "Missing team" }, { status: 400 });
  }
  try {
    await deleteTeam(body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not remove team" },
      { status: 400 },
    );
  }
}
