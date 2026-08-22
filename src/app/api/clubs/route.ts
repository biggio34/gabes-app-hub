import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { clubWithTeams, createClub, deleteClub, listOrgs } from "@/lib/clubs";

export const runtime = "nodejs";

async function requireOwner() {
  const session = await getSession();
  if (!session || session.role !== "owner") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const error = await requireOwner();
  if (error) return error;
  const { clubs, teams } = await listOrgs();
  return NextResponse.json({ clubs: clubWithTeams(clubs, teams), teams });
}

export async function POST(request: Request) {
  const error = await requireOwner();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  try {
    const club = await createClub(body?.name ?? "");
    return NextResponse.json({ club });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add club" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const error = await requireOwner();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "Missing club" }, { status: 400 });
  }
  try {
    await deleteClub(body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not remove club" },
      { status: 400 },
    );
  }
}
