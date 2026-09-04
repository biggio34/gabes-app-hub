import { NextResponse } from "next/server";
import { canAccessArea, getSession } from "@/lib/auth";
import { readCageCrushBoard, submitCageCrushScore } from "@/lib/cage-crush-store";
import { findUserById } from "@/lib/users";

export const runtime = "nodejs";

async function requireSoftball() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  }
  const stored = await findUserById(session.id);
  const user = {
    ...session,
    areas: stored?.areas ?? session.areas,
  };
  if (!canAccessArea(user, "softball")) {
    return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  }
  return {
    session,
    name: stored?.name || session.name,
  };
}

export async function GET() {
  const auth = await requireSoftball();
  if (auth.error) return auth.error;
  try {
    const result = await readCageCrushBoard();
    return NextResponse.json({
      board: result.board,
      stored: result.stored,
      userId: auth.session.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the board." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSoftball();
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { score?: unknown } | null;
  const score = Math.round(Number(body?.score) || 0);
  if (!Number.isFinite(score) || score <= 0) {
    return NextResponse.json({ error: "Missing score." }, { status: 400 });
  }
  try {
    const result = await submitCageCrushScore({
      userId: auth.session.id,
      name: auth.name,
      score,
    });
    return NextResponse.json({
      ok: true,
      improved: result.improved,
      board: result.board,
      stored: result.stored,
      userId: auth.session.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the score." },
      { status: 400 },
    );
  }
}
