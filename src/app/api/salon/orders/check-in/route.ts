import { NextResponse } from "next/server";
import { readCheckInUndo } from "@/lib/salon-check-in-token";
import { requireSalon } from "@/lib/salon-access";
import {
  checkInDeliveries,
  getCheckInView,
  undoCheckInSnapshots,
  undoSavedCheckIn,
  undoSavedDelivery,
} from "@/lib/salon-orders";

export const runtime = "nodejs";

export async function GET() {
  const { session, error } = await requireSalon();
  if (error || !session) return error;
  try {
    const view = await getCheckInView(session.id);
    return NextResponse.json(view);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load deliveries." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireSalon();
  if (error || !session) return error;
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    lines?: { id: string; receivedQty: unknown; choice?: string }[];
    token?: string;
    id?: string;
    key?: string;
  } | null;
  try {
    if (body?.action === "check-in") {
      const result = await checkInDeliveries({
        actor: { id: session.id, name: session.name },
        lines: body.lines ?? [],
      });
      return NextResponse.json(result);
    }
    if (body?.action === "undo") {
      if (!body.token) throw new Error("That undo expired.");
      const lines = await readCheckInUndo(body.token, session.id);
      await undoCheckInSnapshots(lines);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "undo-saved") {
      if (!body.id) throw new Error("Missing request.");
      await undoSavedCheckIn(body.id, session.id);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "undo-delivery") {
      if (!body.key) throw new Error("Missing delivery.");
      await undoSavedDelivery(body.key, session.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not check in that delivery." },
      { status: 400 },
    );
  }
}
