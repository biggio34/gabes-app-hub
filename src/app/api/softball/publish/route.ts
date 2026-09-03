import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { publishTryoutToRoster } from "@/lib/player-identity";
import { canUseSoftballTeam, softballContext } from "@/lib/softball";
import { readSoftballState, writeSoftballState } from "@/lib/softball-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const context = await softballContext(session);
  if (!context.canAccess) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (context.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can publish a tryout to the roster." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    tryoutId?: string;
    teamId?: string;
    year?: number;
    jerseys?: Record<string, string>;
  } | null;

  const tryoutId = body?.tryoutId?.trim() || "";
  const teamId = body?.teamId?.trim() || "";
  if (!tryoutId) {
    return NextResponse.json({ error: "Pick a tryout to publish." }, { status: 400 });
  }
  if (!teamId || teamId === "all" || teamId === "unassigned") {
    return NextResponse.json({ error: "Pick a team to publish onto." }, { status: 400 });
  }
  if (!canUseSoftballTeam(context, teamId)) {
    return NextResponse.json({ error: "That team is not available." }, { status: 400 });
  }

  const team = context.teams.find((item) => item.id === teamId);
  const teamName = team?.name || context.teamName;

  try {
    const current = await readSoftballState(context.clubId, context.teamId);
    if (!current.state) {
      return NextResponse.json({ error: "No softball roster to publish onto." }, { status: 400 });
    }
    const result = publishTryoutToRoster(current.state, {
      tryoutId,
      teamId,
      teamName,
      year: body?.year,
      jerseys: body?.jerseys || {},
      publishedBy: session.username,
    });
    await writeSoftballState(context.clubId, context.teamId, result.state, {
      canEditCoachNotes: true,
    });
    return NextResponse.json({
      ok: true,
      year: result.year,
      tryoutId: result.tryoutId,
      teamId: result.teamId,
      teamName,
      assignedPlayerIds: result.assignedPlayerIds,
      decisionCounts: result.decisionCounts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not publish that tryout." },
      { status: 400 },
    );
  }
}
