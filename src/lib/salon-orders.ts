import { and, eq } from "drizzle-orm";
import { readyDb } from "./db/client";
import { salonOrderItems, salonOrders } from "./db/schema";
import { isSupabaseConfigured } from "./db/supabase";
import * as supabaseSalon from "./db/supabase-salon";
import {
  appendMoveNote,
  currentYearMonth,
  deriveStatus,
  isLeftover,
  isOrderStatus,
  isSettableStatus,
  itemVendor,
  monthLabel,
  nextYearMonth,
  remainderQty,
  shoppingStage,
  type Leftover,
  type OrderStatus,
  type SalonOrder,
  type SalonOrderItem,
  type SalonSuggestions,
} from "./salon-order-model";

export {
  appendMoveNote,
  currentYearMonth,
  deriveStatus,
  isLeftover,
  isOrderStatus,
  isSettableStatus,
  itemVendor,
  leftoverLabel,
  monthLabel,
  MOVE_NOTE,
  nextYearMonth,
  ORDER_STATUSES,
  parseYearMonth,
  prevYearMonth,
  remainderQty,
  SETTABLE_STATUSES,
  statusLabel,
} from "./salon-order-model";
export type {
  Leftover,
  OrderStatus,
  SalonOrder,
  SalonOrderItem,
  SalonSuggestions,
} from "./salon-order-model";

function orderIdFor(year: number, month: number) {
  return `order-${year}-${String(month).padStart(2, "0")}`;
}

function itemId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapSqliteOrder(row: typeof salonOrders.$inferSelect): SalonOrder {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    name: row.name,
    createdAt: row.createdAt,
  };
}

function mapSqliteItem(row: typeof salonOrderItems.$inferSelect): SalonOrderItem {
  return {
    id: row.id,
    orderId: row.orderId,
    preferredVendor: row.preferredVendor,
    brand: row.brand,
    product: row.product,
    size: row.size,
    shade: row.shade,
    qty: row.qty,
    orderedQty: row.orderedQty ?? 0,
    receivedQty: row.receivedQty ?? 0,
    leftover: (row.leftover ?? "") as Leftover,
    sku: row.sku,
    note: row.note,
    actualVendor: row.actualVendor,
    vendorOrderNumber: row.vendorOrderNumber,
    status: row.status as OrderStatus,
    requestedByUserId: row.requestedByUserId,
    requestedByName: row.requestedByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

async function listOrdersSqlite() {
  const db = await readyDb();
  const rows = await db.select().from(salonOrders);
  return rows.map(mapSqliteOrder).sort((a, b) => a.year - b.year || a.month - b.month);
}

async function getOrderByYearMonthSqlite(year: number, month: number) {
  const db = await readyDb();
  const rows = await db
    .select()
    .from(salonOrders)
    .where(and(eq(salonOrders.year, year), eq(salonOrders.month, month)));
  return rows[0] ? mapSqliteOrder(rows[0]) : null;
}

async function getOrderByIdSqlite(id: string) {
  const db = await readyDb();
  const rows = await db.select().from(salonOrders).where(eq(salonOrders.id, id));
  return rows[0] ? mapSqliteOrder(rows[0]) : null;
}

async function insertOrderSqlite(order: SalonOrder) {
  const db = await readyDb();
  await db.insert(salonOrders).values({
    id: order.id,
    year: order.year,
    month: order.month,
    name: order.name,
    createdAt: order.createdAt,
  });
}

async function updateOrderNameSqlite(id: string, name: string) {
  const db = await readyDb();
  await db.update(salonOrders).set({ name }).where(eq(salonOrders.id, id));
}

async function listItemsSqlite(orderId: string) {
  const db = await readyDb();
  const rows = await db
    .select()
    .from(salonOrderItems)
    .where(eq(salonOrderItems.orderId, orderId));
  return rows
    .map(mapSqliteItem)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function listAllItemsSqlite() {
  const db = await readyDb();
  const rows = await db.select().from(salonOrderItems);
  return rows.map(mapSqliteItem);
}

async function getItemByIdSqlite(id: string) {
  const db = await readyDb();
  const rows = await db.select().from(salonOrderItems).where(eq(salonOrderItems.id, id));
  return rows[0] ? mapSqliteItem(rows[0]) : null;
}

async function insertItemSqlite(item: SalonOrderItem) {
  const db = await readyDb();
  await db.insert(salonOrderItems).values(item);
}

async function saveItemSqlite(item: SalonOrderItem) {
  const db = await readyDb();
  await db
    .update(salonOrderItems)
    .set({
      orderId: item.orderId,
      preferredVendor: item.preferredVendor,
      brand: item.brand,
      product: item.product,
      size: item.size,
      shade: item.shade,
      qty: item.qty,
      orderedQty: item.orderedQty,
      receivedQty: item.receivedQty,
      leftover: item.leftover,
      sku: item.sku,
      note: item.note,
      actualVendor: item.actualVendor,
      vendorOrderNumber: item.vendorOrderNumber,
      status: item.status,
      updatedAt: item.updatedAt,
    })
    .where(eq(salonOrderItems.id, item.id));
}

async function removeItemSqlite(id: string) {
  const db = await readyDb();
  await db.delete(salonOrderItems).where(eq(salonOrderItems.id, id));
}

export async function listOrders() {
  return isSupabaseConfigured() ? supabaseSalon.listOrders() : listOrdersSqlite();
}

export async function getOrderByYearMonth(year: number, month: number) {
  return isSupabaseConfigured()
    ? supabaseSalon.getOrderByYearMonth(year, month)
    : getOrderByYearMonthSqlite(year, month);
}

async function getOrderById(id: string) {
  return isSupabaseConfigured() ? supabaseSalon.getOrderById(id) : getOrderByIdSqlite(id);
}

export async function getOrCreateOrder(year: number, month: number, name?: string) {
  const existing = await getOrderByYearMonth(year, month);
  if (existing) {
    if (name && name.trim() && name.trim() !== existing.name) {
      await renameOrder(existing.id, name.trim());
      return { ...(await getOrderById(existing.id))!, items: await listItems(existing.id) };
    }
    return { ...existing, items: await listItems(existing.id) };
  }
  const order: SalonOrder = {
    id: orderIdFor(year, month),
    year,
    month,
    name: name?.trim() || monthLabel(year, month),
    createdAt: new Date().toISOString(),
  };
  try {
    if (isSupabaseConfigured()) await supabaseSalon.insertOrder(order);
    else await insertOrderSqlite(order);
  } catch (err) {
    const raced = await getOrderByYearMonth(year, month);
    if (!raced) throw err;
    return { ...raced, items: await listItems(raced.id) };
  }
  return { ...order, items: [] as SalonOrderItem[] };
}

export async function renameOrder(id: string, name: string) {
  const next = name.trim();
  if (!next) throw new Error("Order name is required.");
  if (isSupabaseConfigured()) await supabaseSalon.updateOrderName(id, next);
  else await updateOrderNameSqlite(id, next);
}

export async function listItems(orderId: string) {
  return isSupabaseConfigured()
    ? supabaseSalon.listItems(orderId)
    : listItemsSqlite(orderId);
}

async function listAllItems() {
  return isSupabaseConfigured()
    ? supabaseSalon.listAllItems()
    : listAllItemsSqlite();
}

export async function getSuggestions(): Promise<SalonSuggestions> {
  const items = await listAllItems();
  return {
    vendors: uniqueSorted([
      ...items.map((item) => item.preferredVendor),
      ...items.map((item) => item.actualVendor),
    ]),
    brands: uniqueSorted(items.map((item) => item.brand)),
    products: uniqueSorted(items.map((item) => item.product)),
    skus: uniqueSorted(items.map((item) => item.sku)),
  };
}

export async function getMonthView(year: number, month: number) {
  const [order, months, suggestions] = await Promise.all([
    getOrderByYearMonth(year, month),
    listOrders(),
    getSuggestions(),
  ]);
  return {
    year,
    month,
    today: currentYearMonth(),
    order,
    items: order ? await listItems(order.id) : [],
    months,
    suggestions,
  };
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseQty(value: unknown) {
  const qty = Number(value);
  if (!Number.isInteger(qty) || qty < 1) {
    throw new Error("Qty must be a whole number of 1 or more.");
  }
  return qty;
}

function parseCount(value: unknown, label: string, min = 0) {
  const qty = Number(value);
  if (!Number.isInteger(qty) || qty < min) {
    throw new Error(`${label} must be a whole number of ${min} or more.`);
  }
  return qty;
}

function refreshStatus(item: SalonOrderItem, shopping?: "pending" | "in_cart") {
  item.status = deriveStatus({
    qty: item.qty,
    orderedQty: item.orderedQty,
    receivedQty: item.receivedQty,
    leftover: item.leftover,
    shopping: shopping ?? shoppingStage(item.status),
  });
}

async function persistItem(item: SalonOrderItem) {
  if (isSupabaseConfigured()) await supabaseSalon.saveItem(item);
  else await saveItemSqlite(item);
}

async function persistNewItem(item: SalonOrderItem) {
  if (isSupabaseConfigured()) await supabaseSalon.insertItem(item);
  else await insertItemSqlite(item);
}

async function rollRemainder(item: SalonOrderItem) {
  if (item.leftover === "rolled") return;
  const remainder = remainderQty(item);
  if (remainder < 1) {
    throw new Error("There is no leftover to roll to next month.");
  }
  const order = await getOrderById(item.orderId);
  if (!order) throw new Error("Request not found.");
  const next = nextYearMonth(order.year, order.month);
  const nextOrder = await getOrCreateOrder(next.year, next.month);
  const now = new Date().toISOString();
  const rolled: SalonOrderItem = {
    id: itemId(),
    orderId: nextOrder.id,
    preferredVendor: item.preferredVendor,
    brand: item.brand,
    product: item.product,
    size: item.size,
    shade: item.shade,
    qty: remainder,
    orderedQty: 0,
    receivedQty: 0,
    leftover: "",
    sku: item.sku,
    note: appendMoveNote(item.note),
    actualVendor: "",
    vendorOrderNumber: "",
    status: "pending",
    requestedByUserId: item.requestedByUserId,
    requestedByName: item.requestedByName,
    createdAt: now,
    updatedAt: now,
  };
  await persistNewItem(rolled);
  item.leftover = "rolled";
}

export async function addItem(input: {
  year: number;
  month: number;
  preferredVendor?: string;
  brand?: string;
  product?: string;
  size?: string;
  shade?: string;
  sku?: string;
  qty?: unknown;
  note?: string;
  requestedByUserId: string;
  requestedByName: string;
}) {
  const product = cleanText(input.product);
  if (!product) throw new Error("Product is required.");
  const order = await getOrCreateOrder(input.year, input.month);
  const now = new Date().toISOString();
  const item: SalonOrderItem = {
    id: itemId(),
    orderId: order.id,
    preferredVendor: cleanText(input.preferredVendor),
    brand: cleanText(input.brand),
    product,
    size: cleanText(input.size),
    shade: cleanText(input.shade),
    qty: parseQty(input.qty ?? 1),
    orderedQty: 0,
    receivedQty: 0,
    leftover: "",
    sku: cleanText(input.sku),
    note: cleanText(input.note),
    actualVendor: "",
    vendorOrderNumber: "",
    status: "pending",
    requestedByUserId: input.requestedByUserId,
    requestedByName: input.requestedByName,
    createdAt: now,
    updatedAt: now,
  };
  if (isSupabaseConfigured()) await supabaseSalon.insertItem(item);
  else await insertItemSqlite(item);
  return item;
}

export async function updateItem(
  id: string,
  patch: {
    preferredVendor?: string;
    brand?: string;
    product?: string;
    size?: string;
    shade?: string;
    sku?: string;
    qty?: unknown;
    orderedQty?: unknown;
    receivedQty?: unknown;
    leftover?: string;
    note?: string;
    actualVendor?: string;
    vendorOrderNumber?: string;
    status?: string;
  },
) {
  const current = isSupabaseConfigured()
    ? await supabaseSalon.getItemById(id)
    : await getItemByIdSqlite(id);
  if (!current) throw new Error("Request not found.");
  if (patch.preferredVendor !== undefined) {
    current.preferredVendor = cleanText(patch.preferredVendor);
  }
  if (patch.brand !== undefined) current.brand = cleanText(patch.brand);
  if (patch.product !== undefined) {
    const product = cleanText(patch.product);
    if (!product) throw new Error("Product is required.");
    current.product = product;
  }
  if (patch.size !== undefined) current.size = cleanText(patch.size);
  if (patch.shade !== undefined) current.shade = cleanText(patch.shade);
  if (patch.sku !== undefined) current.sku = cleanText(patch.sku);
  if (patch.qty !== undefined) {
    if (current.orderedQty > 0) {
      throw new Error("Requested qty stays the original ask after it is ordered.");
    }
    current.qty = parseQty(patch.qty);
  }
  if (patch.note !== undefined) current.note = cleanText(patch.note);
  if (patch.actualVendor !== undefined) {
    current.actualVendor = cleanText(patch.actualVendor);
  }
  if (patch.vendorOrderNumber !== undefined) {
    current.vendorOrderNumber = cleanText(patch.vendorOrderNumber);
  }

  if (patch.orderedQty !== undefined) {
    const orderedQty = parseCount(patch.orderedQty, "Ordered qty", 1);
    current.orderedQty = orderedQty;
  }

  if (patch.status !== undefined) {
    if (patch.status === "partial" || patch.status === "received") {
      throw new Error("Received and Partial are set from received qty, not from the status menu.");
    }
    if (!isSettableStatus(patch.status)) throw new Error("That status is not valid.");
    if (patch.status === "pending" && current.orderedQty > 0) {
      throw new Error("Can't send this back to Pending after it was ordered.");
    }
    if (patch.status === "in_cart" && current.orderedQty > 0) {
      throw new Error("This line is already ordered.");
    }
    if (patch.status === "ordered" && current.orderedQty < 1) {
      current.orderedQty = current.qty;
    }
    if (patch.status === "out_of_stock" && current.leftover !== "rolled") {
      current.leftover = "oos";
    }
  }

  if (patch.receivedQty !== undefined) {
    if (current.orderedQty < 1) {
      throw new Error("Received qty is only for after a line is ordered.");
    }
    current.receivedQty = parseCount(patch.receivedQty, "Received qty", 0);
  }

  if (patch.leftover !== undefined) {
    if (!isLeftover(patch.leftover)) throw new Error("That leftover choice is not valid.");
    if (patch.leftover === "rolled") {
      await rollRemainder(current);
    } else if (current.leftover === "rolled") {
      throw new Error("Leftover already rolled to next month.");
    } else {
      current.leftover = patch.leftover;
    }
  }

  let shopping: "pending" | "in_cart" | undefined;
  if (patch.status === "in_cart") shopping = "in_cart";
  else if (patch.status === "pending") shopping = "pending";
  refreshStatus(current, shopping);
  current.updatedAt = new Date().toISOString();
  await persistItem(current);
  return current;
}

export async function deleteItem(id: string) {
  const current = isSupabaseConfigured()
    ? await supabaseSalon.getItemById(id)
    : await getItemByIdSqlite(id);
  if (!current) throw new Error("Request not found.");
  if (isSupabaseConfigured()) await supabaseSalon.removeItem(id);
  else await removeItemSqlite(id);
}

export async function bulkUpdateStatus(input: {
  year: number;
  month: number;
  vendor: string;
  status: string;
  fromStatus?: string;
  vendorOrderNumber?: string;
}) {
  if (!isSettableStatus(input.status)) {
    throw new Error(
      input.status === "partial" || input.status === "received"
        ? "Received and Partial are set from received qty, not from Set all."
        : "That status is not valid.",
    );
  }
  const vendor = input.vendor.trim();
  if (!vendor) throw new Error("Vendor is required.");
  const fromStatus =
    input.fromStatus && isOrderStatus(input.fromStatus) ? input.fromStatus : null;
  const order = await getOrderByYearMonth(input.year, input.month);
  if (!order) throw new Error("There is nothing to update this month.");
  const items = await listItems(order.id);
  const matched = items.filter((item) => {
    if (itemVendor(item).toLowerCase() !== vendor.toLowerCase()) return false;
    if (fromStatus && item.status !== fromStatus) return false;
    return true;
  });
  if (matched.length === 0) {
    throw new Error("No items match that vendor.");
  }
  const now = new Date().toISOString();
  let updated = 0;
  for (const item of matched) {
    if (input.status === "pending" && item.orderedQty > 0) continue;
    if (input.status === "in_cart" && item.orderedQty > 0) continue;
    if (input.status === "ordered" && item.orderedQty < 1) {
      item.orderedQty = item.qty;
    }
    if (input.status === "out_of_stock" && item.leftover !== "rolled") {
      item.leftover = "oos";
    }
    if (
      (input.status === "in_cart" || input.status === "ordered") &&
      !item.actualVendor.trim()
    ) {
      item.actualVendor = vendor === "No vendor" ? "" : vendor;
    }
    if (input.vendorOrderNumber !== undefined) {
      item.vendorOrderNumber = cleanText(input.vendorOrderNumber);
    }
    refreshStatus(
      item,
      input.status === "in_cart" || input.status === "pending" ? input.status : undefined,
    );
    item.updatedAt = now;
    await persistItem(item);
    updated += 1;
  }
  if (updated === 0) {
    throw new Error("Those items are already ordered, so they can't go back.");
  }
  return updated;
}

export async function moveOutOfStockToNextMonth(year: number, month: number) {
  const order = await getOrderByYearMonth(year, month);
  if (!order) throw new Error("There is nothing out of stock this month.");
  const items = (await listItems(order.id)).filter((item) => {
    if (item.leftover === "rolled") return false;
    return item.status === "out_of_stock" || item.leftover === "oos";
  });
  if (items.length === 0) {
    throw new Error("There is nothing out of stock this month.");
  }
  const next = nextYearMonth(year, month);
  const nextOrder = await getOrCreateOrder(next.year, next.month);
  const now = new Date().toISOString();
  let moved = 0;
  for (const item of items) {
    if (remainderQty(item) < 1) continue;
    await rollRemainder(item);
    refreshStatus(item);
    item.updatedAt = now;
    await persistItem(item);
    moved += 1;
  }
  if (moved === 0) {
    throw new Error("There is nothing out of stock this month.");
  }
  return {
    moved,
    nextYear: next.year,
    nextMonth: next.month,
    nextName: nextOrder.name,
  };
}
