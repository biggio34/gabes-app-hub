import { getSupabase, throwIfError } from "./supabase";
import type { Leftover, SalonOrder, SalonOrderItem } from "@/lib/salon-order-model";

type OrderRow = {
  id: string;
  year: number;
  month: number;
  name: string;
  created_at: string;
};

type ItemRow = {
  id: string;
  order_id: string;
  preferred_vendor: string;
  brand: string;
  product: string;
  size: string;
  shade: string;
  qty: number;
  ordered_qty?: number | null;
  received_qty?: number | null;
  leftover?: string | null;
  sku: string;
  note: string;
  actual_vendor: string;
  vendor_order_number: string;
  status: string;
  requested_by_user_id: string;
  requested_by_name: string;
  created_at: string;
  updated_at: string;
};

function mapOrder(row: OrderRow): SalonOrder {
  return {
    id: row.id,
    year: Number(row.year),
    month: Number(row.month),
    name: row.name,
    createdAt: row.created_at,
  };
}

function mapItem(row: ItemRow): SalonOrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    preferredVendor: row.preferred_vendor ?? "",
    brand: row.brand ?? "",
    product: row.product,
    size: row.size ?? "",
    shade: row.shade ?? "",
    qty: Number(row.qty) || 1,
    orderedQty: Number(row.ordered_qty) || 0,
    receivedQty: Number(row.received_qty) || 0,
    leftover: (row.leftover ?? "") as Leftover,
    sku: row.sku ?? "",
    note: row.note ?? "",
    actualVendor: row.actual_vendor ?? "",
    vendorOrderNumber: row.vendor_order_number ?? "",
    status: row.status as SalonOrderItem["status"],
    requestedByUserId: row.requested_by_user_id,
    requestedByName: row.requested_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function salonError(fallback: string) {
  return (result: { data: unknown; error: { message: string } | null }) => {
    if (result.error && /does not exist|schema cache|vendor_order_number|column.*sku|ordered_qty|received_qty|leftover/i.test(result.error.message)) {
      throw new Error(
        "The salon order tables need an update in Supabase. Run supabase/salon-orders.sql in the SQL editor.",
      );
    }
    return throwIfError(result, fallback);
  };
}

export async function listOrders() {
  const rows = salonError("Could not list salon orders.")(
    await client().from("hub_salon_orders").select("*").order("year").order("month"),
  ) as OrderRow[];
  return (rows ?? []).map(mapOrder);
}

export async function getOrderByYearMonth(year: number, month: number) {
  const rows = salonError("Could not load that month.")(
    await client()
      .from("hub_salon_orders")
      .select("*")
      .eq("year", year)
      .eq("month", month),
  ) as OrderRow[];
  return rows?.[0] ? mapOrder(rows[0]) : null;
}

export async function getOrderById(id: string) {
  const rows = salonError("Could not load that order.")(
    await client().from("hub_salon_orders").select("*").eq("id", id),
  ) as OrderRow[];
  return rows?.[0] ? mapOrder(rows[0]) : null;
}

export async function insertOrder(order: SalonOrder) {
  salonError("Could not create that month.")(
    await client().from("hub_salon_orders").insert({
      id: order.id,
      year: order.year,
      month: order.month,
      name: order.name,
      created_at: order.createdAt,
    }),
  );
}

export async function updateOrderName(id: string, name: string) {
  salonError("Could not rename that order.")(
    await client().from("hub_salon_orders").update({ name }).eq("id", id),
  );
}

export async function listItems(orderId: string) {
  const rows = salonError("Could not load requests.")(
    await client()
      .from("hub_salon_order_items")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at"),
  ) as ItemRow[];
  return (rows ?? []).map(mapItem);
}

export async function listAllItems() {
  const rows = salonError("Could not load requests.")(
    await client().from("hub_salon_order_items").select("*"),
  ) as ItemRow[];
  return (rows ?? []).map(mapItem);
}

export async function getItemById(id: string) {
  const rows = salonError("Could not load that request.")(
    await client().from("hub_salon_order_items").select("*").eq("id", id),
  ) as ItemRow[];
  return rows?.[0] ? mapItem(rows[0]) : null;
}

export async function insertItem(item: SalonOrderItem) {
  salonError("Could not add that request.")(
    await client().from("hub_salon_order_items").insert({
      id: item.id,
      order_id: item.orderId,
      preferred_vendor: item.preferredVendor,
      brand: item.brand,
      product: item.product,
      size: item.size,
      shade: item.shade,
      qty: item.qty,
      ordered_qty: item.orderedQty,
      received_qty: item.receivedQty,
      leftover: item.leftover,
      sku: item.sku,
      note: item.note,
      actual_vendor: item.actualVendor,
      vendor_order_number: item.vendorOrderNumber,
      status: item.status,
      requested_by_user_id: item.requestedByUserId,
      requested_by_name: item.requestedByName,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    }),
  );
}

export async function saveItem(item: SalonOrderItem) {
  salonError("Could not update that request.")(
    await client()
      .from("hub_salon_order_items")
      .update({
        order_id: item.orderId,
        preferred_vendor: item.preferredVendor,
        brand: item.brand,
        product: item.product,
        size: item.size,
        shade: item.shade,
        qty: item.qty,
        ordered_qty: item.orderedQty,
        received_qty: item.receivedQty,
        leftover: item.leftover,
        sku: item.sku,
        note: item.note,
        actual_vendor: item.actualVendor,
        vendor_order_number: item.vendorOrderNumber,
        status: item.status,
        updated_at: item.updatedAt,
      })
      .eq("id", item.id),
  );
}

export async function removeItem(id: string) {
  salonError("Could not delete that request.")(
    await client().from("hub_salon_order_items").delete().eq("id", id),
  );
}
