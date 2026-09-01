import { NextResponse } from "next/server";
import {
  bulkUpdateStatus,
  isOrderStatus,
  moveOutOfStockToNextMonth,
  parseYearMonth,
} from "@/lib/salon-orders";
import { requireSalon } from "@/lib/salon-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { error } = await requireSalon();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    year?: unknown;
    month?: unknown;
    vendor?: string;
    status?: string;
    fromStatus?: string;
    vendorOrderNumber?: string;
  } | null;
  try {
    const parsed = parseYearMonth(body?.year, body?.month);
    if (body?.action === "bulk-status") {
      if (!body.status || !isOrderStatus(body.status)) {
        throw new Error("That status is not valid.");
      }
      const updated = await bulkUpdateStatus({
        ...parsed,
        vendor: body.vendor ?? "",
        status: body.status,
        fromStatus: body.fromStatus,
        vendorOrderNumber: body.vendorOrderNumber,
      });
      return NextResponse.json({ updated });
    }
    if (body?.action === "move-out-of-stock") {
      const result = await moveOutOfStockToNextMonth(parsed.year, parsed.month);
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
