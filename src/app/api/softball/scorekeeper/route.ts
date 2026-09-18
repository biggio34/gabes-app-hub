import { NextResponse } from "next/server";
import { canAccessArea, getSession } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { readScorekeeperStore, writeScorekeeperStore } from "@/lib/scorekeeper-store";

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
  return { session };
}

export async function GET() {
  const auth = await requireSoftball();
  if (auth.error) return auth.error;
  try {
    const result = await readScorekeeperStore(auth.session.id);
    return NextResponse.json({
      store: result.store,
      updatedAt: result.updatedAt,
      stored: result.stored,
      userId: auth.session.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read Scorekeeper." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireSoftball();
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { store?: unknown } | null;
  if (!body?.store || typeof body.store !== "object") {
    return NextResponse.json({ error: "Missing Scorekeeper data." }, { status: 400 });
  }
  try {
    const result = await writeScorekeeperStore(auth.session.id, body.store);
    return NextResponse.json({
      ok: true,
      stored: result.stored,
      store: result.store,
      userId: auth.session.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save Scorekeeper." },
      { status: 400 },
    );
  }
}
