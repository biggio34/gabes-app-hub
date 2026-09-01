import { NextResponse } from "next/server";
import { requireSalon } from "@/lib/salon-access";
import { addItem, deleteItem, parseYearMonth, updateItem } from "@/lib/salon-orders";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { session, error } = await requireSalon();
  if (error || !session) return error;
  const body = (await request.json().catch(() => null)) as {
    year?: unknown;
    month?: unknown;
    preferredVendor?: string;
    brand?: string;
    product?: string;
    size?: string;
    shade?: string;
    sku?: string;
    qty?: unknown;
    note?: string;
  } | null;
  try {
    const parsed = parseYearMonth(body?.year, body?.month);
    const item = await addItem({
      ...parsed,
      preferredVendor: body?.preferredVendor,
      brand: body?.brand,
      product: body?.product,
      size: body?.size,
      shade: body?.shade,
      sku: body?.sku,
      qty: body?.qty,
      note: body?.note,
      requestedByUserId: session.id,
      requestedByName: session.name,
    });
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add that request." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const { error } = await requireSalon();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    preferredVendor?: string;
    brand?: string;
    product?: string;
    size?: string;
    shade?: string;
    sku?: string;
    qty?: unknown;
    note?: string;
    actualVendor?: string;
    vendorOrderNumber?: string;
    orderedQty?: unknown;
    receivedQty?: unknown;
    leftover?: string;
    status?: string;
  } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "Missing request." }, { status: 400 });
  }
  try {
    const item = await updateItem(body.id, body);
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update that request." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const { session, error } = await requireSalon();
  if (error || !session) return error;
  if (session.role !== "owner") {
    return NextResponse.json(
      { error: "Only Gabe can delete requests." },
      { status: 403 },
    );
  }
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "Missing request." }, { status: 400 });
  }
  try {
    await deleteItem(body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete that request." },
      { status: 400 },
    );
  }
}
