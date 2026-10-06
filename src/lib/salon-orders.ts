import { and, eq } from "drizzle-orm";
import { readyDb } from "./db/client";
import { salonOrderItems, salonOrders } from "./db/schema";
import { isSupabaseConfigured } from "./db/supabase";
import * as supabaseSalon from "./db/supabase-salon";
import {
  deliveryGroupTitle,
  deliveryOrderIds,
  displayText,
  groupDeliveries,
  isAwaitingDelivery,
  isSameChicagoDay,
  parseCheckInUndo,
  planCheckIn,
  snapshotFromItem,
  type CheckInUndoSnapshot,
  type DeliverySort,
  type ShortChoice,
} from "./salon-check-in";
import { signCheckInUndo } from "./salon-check-in-token";
import { patchSetsOrderedQty } from "./salon-order-permission";
import {
  appendMoveNote,
  currentYearMonth,
  deriveStatus,
  emptyReceiveRecord,
  isLeftover,
  isOrderStatus,
  isSettableStatus,
  itemVendor,
  monthLabel,
  nextYearMonth,
  isUnorderedOutOfStock,
  remainderQty,
  shoppingStage,
  unorderForPending,
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
  isUnorderedOutOfStock,
  unorderForPending,
  canRevertToPending,
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
    receivedByUserId: row.receivedByUserId ?? "",
    receivedByName: row.receivedByName ?? "",
    receivedAt: row.receivedAt ?? null,
    checkinUndo: row.checkinUndo ?? "",
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
      receivedByUserId: item.receivedByUserId,
      receivedByName: item.receivedByName,
      receivedAt: item.receivedAt,
      checkinUndo: item.checkinUndo,
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
    deliveryWaiting: groupDeliveries(await loadWaitingLines()).length,
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

function rolledItem(source: SalonOrderItem, orderId: string, qty: number, now: string): SalonOrderItem {
  return {
    id: itemId(),
    orderId,
    preferredVendor: source.preferredVendor,
    brand: source.brand,
    product: source.product,
    size: source.size,
    shade: source.shade,
    qty,
    orderedQty: 0,
    receivedQty: 0,
    leftover: "",
    sku: source.sku,
    note: appendMoveNote(source.note),
    actualVendor: "",
    vendorOrderNumber: "",
    status: "pending",
    requestedByUserId: source.requestedByUserId,
    requestedByName: source.requestedByName,
    ...emptyReceiveRecord(),
    createdAt: now,
    updatedAt: now,
  };
}

async function rollRemainder(item: SalonOrderItem) {
  if (item.leftover === "rolled") return null;
  const remainder = remainderQty(item);
  if (remainder < 1) {
    throw new Error("There is no leftover to roll to next month.");
  }
  const created = await createRolledItem(item, remainder);
  item.leftover = "rolled";
  return created.id;
}

async function createRolledItem(item: SalonOrderItem, qty: number) {
  const order = await getOrderById(item.orderId);
  if (!order) throw new Error("Request not found.");
  const next = nextYearMonth(order.year, order.month);
  const nextOrder = await getOrCreateOrder(next.year, next.month);
  const now = new Date().toISOString();
  const rolled = rolledItem(item, nextOrder.id, qty, now);
  await persistNewItem(rolled);
  return rolled;
}

async function addToNextMonth(item: SalonOrderItem, extra: number) {
  const order = await getOrderById(item.orderId);
  if (!order) throw new Error("Request not found.");
  const next = nextYearMonth(order.year, order.month);
  const nextOrder = await getOrCreateOrder(next.year, next.month);
  const pending = (await listItems(nextOrder.id)).find(
    (candidate) =>
      candidate.status === "pending" &&
      candidate.orderedQty === 0 &&
      candidate.receivedQty === 0 &&
      candidate.brand === item.brand &&
      candidate.product === item.product &&
      candidate.size === item.size &&
      candidate.shade === item.shade,
  );
  if (pending) {
    const prevQty = pending.qty;
    pending.qty += extra;
    pending.updatedAt = new Date().toISOString();
    await persistItem(pending);
    return { itemId: pending.id, prevQty, created: null as SalonOrderItem | null };
  }
  const created = await createRolledItem(item, extra);
  return { itemId: created.id, prevQty: null as number | null, created };
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
    ...emptyReceiveRecord(),
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
  actor?: { canMarkOrdered: boolean; id?: string; name?: string },
) {
  if (actor && !actor.canMarkOrdered && patchSetsOrderedQty(patch)) {
    throw new Error("You can't mark items ordered.");
  }
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
      const reverted = unorderForPending(current);
      current.orderedQty = reverted.orderedQty;
      current.receivedQty = reverted.receivedQty;
      current.leftover = reverted.leftover;
    }
    if (patch.status === "in_cart" && current.orderedQty > 0) {
      throw new Error("Move this back to Pending before adding it to the cart.");
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
    const nextReceived = parseCount(patch.receivedQty, "Received qty", 0);
    if (nextReceived !== current.receivedQty && actor?.id && actor.name) {
      current.receivedByUserId = actor.id;
      current.receivedByName = actor.name;
      current.receivedAt = new Date().toISOString();
    }
    current.receivedQty = nextReceived;
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

export async function bulkUpdateStatus(
  input: {
    year: number;
    month: number;
    vendor: string;
    status: string;
    fromStatus?: string;
    vendorOrderNumber?: string;
  },
  actor?: { canMarkOrdered: boolean },
) {
  if (actor && !actor.canMarkOrdered && input.status === "ordered") {
    throw new Error("You can't mark items ordered.");
  }
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
    if (input.status === "pending" && item.orderedQty > 0) {
      const targetingOrdered =
        fromStatus === "ordered" || fromStatus === "partial" || fromStatus === "received";
      if (!targetingOrdered || item.leftover === "rolled") continue;
      const reverted = unorderForPending(item);
      item.orderedQty = reverted.orderedQty;
      item.receivedQty = reverted.receivedQty;
      item.leftover = reverted.leftover;
    }
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
    throw new Error(
      input.status === "pending"
        ? "Those items can't go back to Pending (leftover may already be rolled to next month)."
        : "Those items are already ordered, so they can't go back to the cart.",
    );
  }
  return updated;
}

export async function moveOutOfStockToNextMonth(year: number, month: number) {
  const order = await getOrderByYearMonth(year, month);
  if (!order) throw new Error("There is nothing out of stock this month.");
  const items = (await listItems(order.id)).filter((item) => {
    if (item.leftover === "rolled") return false;
    return isUnorderedOutOfStock(item);
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

export type DeliveryLine = DeliverySort & {
  id: string;
  brand: string;
  product: string;
  size: string;
  shade: string;
  sku: string;
  qty: number;
  orderedQty: number;
  receivedQty: number;
  note: string;
  receivedByName: string;
  receivedAt: string | null;
};

function toDeliveryLine(item: SalonOrderItem, order: SalonOrder): DeliveryLine {
  return {
    id: item.id,
    year: order.year,
    month: order.month,
    createdAt: item.createdAt,
    vendor: itemVendor(item),
    vendorOrderNumber: item.vendorOrderNumber,
    brand: item.brand,
    product: item.product,
    size: item.size,
    shade: item.shade,
    sku: item.sku,
    qty: item.qty,
    orderedQty: item.orderedQty,
    receivedQty: item.receivedQty,
    note: item.note,
    receivedByName: item.receivedByName,
    receivedAt: item.receivedAt,
  };
}

async function loadWaitingLines() {
  const orders = await listOrders();
  const lines: DeliveryLine[] = [];
  for (const order of orders) {
    for (const item of await listItems(order.id)) {
      if (!isAwaitingDelivery(item)) continue;
      lines.push(toDeliveryLine(item, order));
    }
  }
  return lines;
}

async function receiveMetaOn() {
  if (!isSupabaseConfigured()) return true;
  return supabaseSalon.receiveMetaAvailable();
}

async function loadItem(id: string) {
  const current = isSupabaseConfigured()
    ? await supabaseSalon.getItemById(id)
    : await getItemByIdSqlite(id);
  if (!current) throw new Error("Request not found.");
  return current;
}

async function loadItemOptional(id: string) {
  return isSupabaseConfigured()
    ? supabaseSalon.getItemById(id)
    : getItemByIdSqlite(id);
}

export async function countWaitingDeliveries() {
  return groupDeliveries(await loadWaitingLines()).length;
}

export async function getCheckInView(userId: string) {
  const lines = await loadWaitingLines();
  const groups = groupDeliveries(lines).map((group) => ({
    ...group,
    title: deliveryGroupTitle(group.vendor, group.vendorOrderNumber, group.items.length),
    orderNumbers: deliveryOrderIds(group.vendor, group.vendorOrderNumber),
  }));
  const receiveMeta = await receiveMetaOn();
  return {
    waitingOrders: groups.length,
    groups,
    undoToday: receiveMeta ? await listUndoToday(userId) : [],
    receiveMeta,
  };
}

async function listUndoToday(userId: string) {
  const orders = await listOrders();
  const rows: { id: string; label: string; receivedAt: string }[] = [];
  for (const order of orders) {
    for (const item of await listItems(order.id)) {
      if (item.receivedByUserId !== userId) continue;
      if (!item.receivedAt || !isSameChicagoDay(item.receivedAt)) continue;
      if (!parseCheckInUndo(item.checkinUndo)) continue;
      rows.push({
        id: item.id,
        label: [item.brand, item.product, item.shade]
          .map((part) => displayText(part))
          .filter(Boolean)
          .join(" · "),
        receivedAt: item.receivedAt,
      });
    }
  }
  return rows.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function checkInDeliveries(input: {
  actor: { id: string; name: string };
  lines: { id: string; receivedQty: unknown; choice?: string }[];
}) {
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error("Nothing to check in.");
  }
  const meta = await receiveMetaOn();
  const snapshots: CheckInUndoSnapshot[] = [];
  for (const line of input.lines) {
    if (!line?.id) throw new Error("Missing request.");
    const snapshot = await checkInOne(
      {
        id: line.id,
        receivedQty: Number(line.receivedQty),
        choice: line.choice === "wait" ? "wait" : "roll",
      },
      input.actor,
      meta,
    );
    if (snapshot) snapshots.push(snapshot);
  }
  if (snapshots.length === 0) {
    throw new Error("Nothing to check in. Leave a quantity above zero for what arrived.");
  }
  return {
    undoToken: await signCheckInUndo(input.actor.id, snapshots),
    checkedIn: snapshots.length,
    receiveMeta: meta,
  };
}

async function checkInOne(
  line: { id: string; receivedQty: number; choice: ShortChoice },
  actor: { id: string; name: string },
  meta: boolean,
) {
  let current = await loadItem(line.id);
  const preview = planCheckIn(current, line.receivedQty, line.choice);
  if (preview.action === "skip") return null;

  let restoredRoll: CheckInUndoSnapshot["restoredRoll"] = null;
  let restoredAdded: CheckInUndoSnapshot["restoredAdded"] = null;
  const previous = parseCheckInUndo(current.checkinUndo);
  if (previous && previous.id === current.id) {
    restoredRoll = await captureRoll(previous);
    if (previous.addedToItemId) {
      const bumped = await loadItemOptional(previous.addedToItemId);
      if (bumped) restoredAdded = { itemId: bumped.id, qty: bumped.qty };
    }
    const before = {
      receivedQty: current.receivedQty,
      leftover: current.leftover,
      receivedByUserId: current.receivedByUserId,
      receivedByName: current.receivedByName,
      receivedAt: current.receivedAt,
      checkinUndo: current.checkinUndo,
    };
    await applyUndoSnapshot(previous);
    current = await loadItem(line.id);
    const plan = planCheckIn(current, line.receivedQty, line.choice);
    if (plan.action === "skip") {
      const snapshot: CheckInUndoSnapshot = {
        id: current.id,
        prevReceivedQty: before.receivedQty,
        prevLeftover: before.leftover,
        prevReceivedByUserId: before.receivedByUserId,
        prevReceivedByName: before.receivedByName,
        prevReceivedAt: before.receivedAt,
        prevCheckinUndo: before.checkinUndo,
        createdItemId: null,
        addedToItemId: null,
        addedPrevQty: null,
        restoredRoll,
        restoredAdded,
      };
      if (meta) {
        current.checkinUndo = JSON.stringify(snapshot);
        current.updatedAt = new Date().toISOString();
        await persistItem(current);
      }
      return snapshot;
    }
    return finishCheckIn(current, plan, actor, meta, restoredRoll, restoredAdded, before);
  }

  return finishCheckIn(current, preview, actor, meta, null, null);
}

async function finishCheckIn(
  current: SalonOrderItem,
  plan: Extract<ReturnType<typeof planCheckIn>, { action: "receive" }>,
  actor: { id: string; name: string },
  meta: boolean,
  restoredRoll: CheckInUndoSnapshot["restoredRoll"],
  restoredAdded: CheckInUndoSnapshot["restoredAdded"],
  prior?: {
    receivedQty: number;
    leftover: Leftover;
    receivedByUserId: string;
    receivedByName: string;
    receivedAt: string | null;
    checkinUndo: string;
  },
) {
  const snapshot: CheckInUndoSnapshot = {
    id: current.id,
    prevReceivedQty: prior?.receivedQty ?? current.receivedQty,
    prevLeftover: prior?.leftover ?? current.leftover,
    prevReceivedByUserId: prior?.receivedByUserId ?? current.receivedByUserId,
    prevReceivedByName: prior?.receivedByName ?? current.receivedByName,
    prevReceivedAt: prior?.receivedAt ?? current.receivedAt,
    prevCheckinUndo: prior?.checkinUndo ?? current.checkinUndo,
    createdItemId: null,
    addedToItemId: null,
    addedPrevQty: null,
    restoredRoll,
    restoredAdded,
  };
  current.receivedQty = plan.receivedQty;
  if (plan.setWait && current.leftover !== "rolled") current.leftover = "wait";
  if (plan.rollRemainder) {
    snapshot.createdItemId = await rollRemainder(current);
  }
  if (plan.extraRollQty > 0) {
    const added = await addToNextMonth(current, plan.extraRollQty);
    if (added.created) snapshot.createdItemId = added.created.id;
    else {
      snapshot.addedToItemId = added.itemId;
      snapshot.addedPrevQty = added.prevQty;
    }
  }
  current.receivedByUserId = actor.id;
  current.receivedByName = actor.name;
  current.receivedAt = new Date().toISOString();
  if (meta) current.checkinUndo = JSON.stringify(snapshot);
  refreshStatus(current);
  current.updatedAt = new Date().toISOString();
  await persistItem(current);
  return snapshot;
}

async function captureRoll(snapshot: CheckInUndoSnapshot) {
  if (!snapshot.createdItemId) return snapshot.restoredRoll;
  const rolled = await loadItemOptional(snapshot.createdItemId);
  return rolled ? snapshotFromItem(rolled) : snapshot.restoredRoll;
}

async function deleteFreshRoll(id: string) {
  const rolled = await loadItemOptional(id);
  if (!rolled) return;
  if (rolled.orderedQty > 0 || rolled.receivedQty > 0) {
    throw new Error("The rolled leftover was already ordered, so this check-in can't be undone.");
  }
  if (isSupabaseConfigured()) await supabaseSalon.removeItem(id);
  else await removeItemSqlite(id);
}

async function reinsertRoll(snap: NonNullable<CheckInUndoSnapshot["restoredRoll"]>) {
  if (await loadItemOptional(snap.id)) return;
  const now = new Date().toISOString();
  const item: SalonOrderItem = {
    id: snap.id,
    orderId: snap.orderId,
    preferredVendor: snap.preferredVendor,
    brand: snap.brand,
    product: snap.product,
    size: snap.size,
    shade: snap.shade,
    qty: snap.qty,
    orderedQty: 0,
    receivedQty: 0,
    leftover: "",
    sku: snap.sku,
    note: snap.note,
    actualVendor: "",
    vendorOrderNumber: "",
    status: "pending",
    requestedByUserId: snap.requestedByUserId,
    requestedByName: snap.requestedByName,
    ...emptyReceiveRecord(),
    createdAt: snap.createdAt,
    updatedAt: now,
  };
  await persistNewItem(item);
}

export async function undoCheckInSnapshots(lines: CheckInUndoSnapshot[]) {
  for (const line of lines) await applyUndoSnapshot(line);
}

async function applyUndoSnapshot(line: CheckInUndoSnapshot) {
  if (line.createdItemId) await deleteFreshRoll(line.createdItemId);
  if (line.addedToItemId && line.addedPrevQty !== null) {
    const target = await loadItemOptional(line.addedToItemId);
    if (target && target.orderedQty === 0 && target.receivedQty === 0) {
      if (line.addedPrevQty < 1) await deleteFreshRoll(target.id);
      else {
        target.qty = line.addedPrevQty;
        target.updatedAt = new Date().toISOString();
        await persistItem(target);
      }
    }
  }
  if (line.restoredRoll) await reinsertRoll(line.restoredRoll);
  if (line.restoredAdded && line.restoredAdded.qty > 0) {
    const target = await loadItemOptional(line.restoredAdded.itemId);
    if (target) {
      target.qty = line.restoredAdded.qty;
      target.updatedAt = new Date().toISOString();
      await persistItem(target);
    }
  }
  const current = await loadItem(line.id);
  current.receivedQty = line.prevReceivedQty;
  current.leftover = line.prevLeftover;
  current.receivedByUserId = line.prevReceivedByUserId;
  current.receivedByName = line.prevReceivedByName;
  current.receivedAt = line.prevReceivedAt;
  current.checkinUndo = line.prevCheckinUndo;
  refreshStatus(current);
  current.updatedAt = new Date().toISOString();
  await persistItem(current);
}

export async function undoSavedCheckIn(id: string, userId: string) {
  if (!(await receiveMetaOn())) {
    throw new Error(
      "Same-day undo needs the received-by columns. Run supabase/salon-orders.sql, or use Undo right after checking in.",
    );
  }
  const current = await loadItem(id);
  if (current.receivedByUserId !== userId || !isSameChicagoDay(current.receivedAt)) {
    throw new Error("You can undo your own check-ins from today.");
  }
  const snapshot = parseCheckInUndo(current.checkinUndo);
  if (!snapshot || snapshot.id !== id) throw new Error("That check-in can't be undone.");
  await applyUndoSnapshot(snapshot);
}
