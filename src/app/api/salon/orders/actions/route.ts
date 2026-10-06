import { NextResponse } from "next/server";
import {
  bulkUpdateStatus,
  isOrderStatus,
  moveOpenItemsToNextMonth,
  moveOutOfStockToNextMonth,
  parseYearMonth,
  rollOpenItem,
  undoMonthCarry,
} from "@/lib/salon-orders";
import { canMarkOrdered } from "@/lib/salon-order-permission";
import { requireSalon } from "@/lib/salon-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { session, error } = await requireSalon();
  if (error || !session) return error;
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    year?: unknown;
    month?: unknown;
    vendor?: string;
    status?: string;
    fromStatus?: string;
    vendorOrderNumber?: string;
    id?: string;
    token?: string;
  } | null;
  try {
    if (body?.action === "roll-item") {
      if (!body.id) throw new Error("That request was not found.");
      const result = await rollOpenItem(body.id);
      return NextResponse.json(result);
    }
    if (body?.action === "undo-carry") {
      if (!canMarkOrdered(session)) {
        throw new Error("Only purchasing can move a whole month.");
      }
      if (!body.token) throw new Error("That undo expired.");
      await undoMonthCarry(body.token, session.id);
      return NextResponse.json({ ok: true });
    }
    const parsed = parseYearMonth(body?.year, body?.month);
    if (body?.action === "bulk-status") {
      if (!body.status || !isOrderStatus(body.status)) {
        throw new Error("That status is not valid.");
      }
      const updated = await bulkUpdateStatus(
        {
          ...parsed,
          vendor: body.vendor ?? "",
          status: body.status,
          fromStatus: body.fromStatus,
          vendorOrderNumber: body.vendorOrderNumber,
        },
        { canMarkOrdered: canMarkOrdered(session) },
      );
      return NextResponse.json({ updated });
    }
    if (body?.action === "move-out-of-stock") {
      const result = await moveOutOfStockToNextMonth(parsed.year, parsed.month);
      return NextResponse.json(result);
    }
    if (body?.action === "move-open") {
      const result = await moveOpenItemsToNextMonth(parsed.year, parsed.month, {
        canMarkOrdered: canMarkOrdered(session),
        id: session.id,
      });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update those requests." },
      { status: 400 },
    );
  }
}
