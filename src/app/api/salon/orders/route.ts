import { NextResponse } from "next/server";
import { requireSalon } from "@/lib/salon-access";
import {
  currentYearMonth,
  getMonthView,
  getOrCreateOrder,
  parseYearMonth,
} from "@/lib/salon-orders";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { session, error } = await requireSalon();
  if (error || !session) return error;
  const url = new URL(request.url);
  try {
    const today = currentYearMonth();
    const year = url.searchParams.get("year") ?? String(today.year);
    const month = url.searchParams.get("month") ?? String(today.month);
    const parsed = parseYearMonth(year, month);
    const view = await getMonthView(parsed.year, parsed.month);
    return NextResponse.json({
      ...view,
      isOwner: session.role === "owner",
      viewerName: session.name,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load orders." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const { error } = await requireSalon();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as {
    year?: unknown;
    month?: unknown;
    name?: string;
  } | null;
  try {
    const parsed = parseYearMonth(body?.year, body?.month);
    const order = await getOrCreateOrder(parsed.year, parsed.month, body?.name);
    return NextResponse.json({ order });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the order name." },
      { status: 400 },
    );
  }
}
