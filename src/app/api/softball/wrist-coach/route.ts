import { NextResponse } from "next/server";
import { getSession, wristCoachAllowed } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { readWristCoachBook, writeWristCoachBook } from "@/lib/wrist-coach-store";

export const runtime = "nodejs";

async function requireWristCoach() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  }
  const stored = await findUserById(session.id);
  if (
    !wristCoachAllowed({
      role: session.role,
      areas: stored?.areas ?? session.areas,
      features: stored?.features ?? session.features,
    })
  ) {
    return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  }
  return {
    session,
    title: stored?.name ? `${stored.name}'s signs` : `${session.name}'s signs`,
  };
}

export async function GET() {
  const auth = await requireWristCoach();
  if (auth.error) return auth.error;
  try {
    const result = await readWristCoachBook(auth.session.id, auth.title);
    return NextResponse.json({
      book: result.book,
      updatedAt: result.updatedAt,
      stored: result.stored,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read Wrist Coach." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireWristCoach();
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { book?: unknown } | null;
  if (!body?.book || typeof body.book !== "object") {
    return NextResponse.json({ error: "Missing Wrist Coach book." }, { status: 400 });
  }
  try {
    const result = await writeWristCoachBook(auth.session.id, body.book, auth.title);
    return NextResponse.json({ ok: true, stored: result.stored, book: result.book });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save Wrist Coach." },
      { status: 400 },
    );
  }
}
