import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { softballContext } from "@/lib/softball";
import { filterLineupsForViewer, filterPracticesForViewer, dropUnassignedPractices, readSoftballState, writeSoftballState } from "@/lib/softball-store";

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

export async function GET() {
  const auth = await requireSoftball();
  if (auth.error) return auth.error;
  try {
    const result = await readSoftballState(auth.context.clubId, auth.context.teamId);
    let state = result.state;
    if (state) {
      const practices = Array.isArray(state.practices) ? state.practices : [];
      const assigned = dropUnassignedPractices(practices);
      if (assigned.length !== practices.length) {
        try {
          await writeSoftballState(auth.context.clubId, auth.context.teamId, {
            ...state,
            practices: assigned,
          });
        } catch {
          // Still hide them in this response if the database write fails.
        }
        state = { ...state, practices: assigned };
      }
      state = {
        ...state,
        practices: filterPracticesForViewer(state.practices, auth.context),
        lineups: filterLineupsForViewer(state.lineups, auth.context),
      };
    }
    return NextResponse.json({
      state,
      team: auth.context,
      updatedAt: result.updatedAt,
      stored: result.stored,
    });
  } catch (err) {
    return NextResponse.json(
      {
        state: null,
        team: auth.context,
        error: err instanceof Error ? err.message : "Could not read softball data.",
      },
      { status: 200 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireSoftball();
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as {
    state?: Record<string, unknown>;
  } | null;
  if (!body?.state || typeof body.state !== "object") {
    return NextResponse.json({ error: "Missing softball data." }, { status: 400 });
  }
  try {
    const result = await writeSoftballState(
      auth.context.clubId,
      auth.context.teamId,
      body.state,
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save softball data." },
      { status: 400 },
    );
  }
}
