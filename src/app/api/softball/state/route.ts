import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { softballContext } from "@/lib/softball";
import {
  ensureElksSeasonTeams,
  hydrateAccountSoftballState,
  persistAccountSoftballState,
} from "@/lib/softball-state";
import type { SoftballState } from "@/lib/elks-roster-seed";

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
    const hubTeams = await ensureElksSeasonTeams();
    const saved = await hydrateAccountSoftballState(
      auth.context.clubId,
      auth.context.teamId,
      hubTeams,
    );
    return NextResponse.json({
      state: saved.state,
      team: auth.context,
      updatedAt: saved.updatedAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        state: null,
        team: auth.context,
        error: err instanceof Error ? err.message : "Could not load the roster.",
      },
      { status: 200 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireSoftball();
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as {
    state?: SoftballState;
  } | null;
  if (!body?.state || typeof body.state !== "object") {
    return NextResponse.json({ error: "Missing softball data." }, { status: 400 });
  }
  try {
    const hubTeams = await ensureElksSeasonTeams();
    const saved = await persistAccountSoftballState(
      auth.context.clubId,
      body.state,
      hubTeams,
    );
    return NextResponse.json({ ok: true, state: saved.state });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Could not save the roster.",
      },
      { status: 400 },
    );
  }
}
