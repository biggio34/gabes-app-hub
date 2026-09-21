import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canUseSoftballTeam, softballContext } from "@/lib/softball";
import { writeLineupForTeam } from "@/lib/softball-store";

export const runtime = "nodejs";

async function requireSoftball() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  }
  const context = await softballContext(session);
  if (!context.canAccess) {
    return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  }
  return { context };
}

export async function PUT(request: Request) {
  const auth = await requireSoftball();
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as {
    teamId?: unknown;
    lineup?: unknown;
  } | null;
  const teamKey = typeof body?.teamId === "string" ? body.teamId.trim() : "";
  if (!teamKey || !body?.lineup || typeof body.lineup !== "object" || Array.isArray(body.lineup)) {
    return NextResponse.json({ error: "Missing lineup." }, { status: 400 });
  }
  if (!canUseSoftballTeam(auth.context, teamKey)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  try {
    const result = await writeLineupForTeam(
      auth.context.clubId,
      auth.context.teamId,
      teamKey,
      body.lineup,
    );
    return NextResponse.json({
      ok: true,
      stored: result.stored,
      lineup: result.lineup,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the lineup." },
      { status: 400 },
    );
  }
}
