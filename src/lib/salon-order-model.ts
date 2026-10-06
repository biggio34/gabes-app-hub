export const ORDER_STATUSES = [
  "pending",
  "in_cart",
  "ordered",
  "partial",
  "received",
  "out_of_stock",
  "moved",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SETTABLE_STATUSES = [
  "pending",
  "in_cart",
  "ordered",
  "out_of_stock",
] as const;

export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

export const LEFTOVERS = ["", "wait", "oos", "rolled"] as const;

/** "moved" is history for a pending, cart, or ordered carry. Not a menu choice. */
export type Leftover = (typeof LEFTOVERS)[number] | "moved";

export const statusLabel: Record<OrderStatus, string> = {
  pending: "Pending",
  in_cart: "Added to cart",
  ordered: "Ordered",
  partial: "Partial",
  received: "Received",
  out_of_stock: "Out of stock",
  moved: "Moved",
};

export const leftoverLabel: Record<Exclude<Leftover, "" | "moved">, string> = {
  wait: "Wait",
  oos: "Out of stock",
  rolled: "Roll to next month",
};

export const MOVE_NOTE = "Last months out of stock";

export type SalonOrder = {
  id: string;
  year: number;
  month: number;
  name: string;
  createdAt: string;
};

export type SalonOrderItem = {
  id: string;
  orderId: string;
  preferredVendor: string;
  brand: string;
  product: string;
  size: string;
  shade: string;
  qty: number;
  orderedQty: number;
  receivedQty: number;
  leftover: Leftover;
  sku: string;
  note: string;
  actualVendor: string;
  vendorOrderNumber: string;
  status: OrderStatus;
  requestedByUserId: string;
  requestedByName: string;
  receivedByUserId: string;
  receivedByName: string;
  receivedAt: string | null;
  checkinUndo: string;
  createdAt: string;
  updatedAt: string;
};

export function emptyReceiveRecord(): Pick<
  SalonOrderItem,
  "receivedByUserId" | "receivedByName" | "receivedAt" | "checkinUndo"
> {
  return {
    receivedByUserId: "",
    receivedByName: "",
    receivedAt: null,
    checkinUndo: "",
  };
}

export type SalonSuggestions = {
  vendors: string[];
  brands: string[];
  products: string[];
  skus: string[];
};

const SALON_TZ = "America/Chicago";

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isSettableStatus(value: string): value is SettableStatus {
  return (SETTABLE_STATUSES as readonly string[]).includes(value);
}

export function isLeftover(value: string): value is Leftover {
  return (LEFTOVERS as readonly string[]).includes(value);
}

export function remainderQty(item: {
  qty: number;
  orderedQty: number;
  receivedQty: number;
}) {
  if (item.receivedQty > 0) return Math.max(0, item.qty - item.receivedQty);
  return Math.max(0, item.qty - item.orderedQty);
}

export function isUnorderedOutOfStock(item: {
  orderedQty: number;
  receivedQty: number;
  leftover: Leftover;
  status?: OrderStatus;
}) {
  if (item.orderedQty > 0 || item.receivedQty > 0) return false;
  return item.leftover === "oos" || item.status === "out_of_stock";
}

export function deriveStatus(item: {
  qty: number;
  orderedQty: number;
  receivedQty: number;
  leftover: Leftover;
  shopping?: "pending" | "in_cart";
}): OrderStatus {
  // Received is only the original ask. Rolling leftover or marking the
  // missing qty OOS must not flip this month to Received.
  if (item.receivedQty >= item.qty && item.qty > 0) return "received";
  if (item.receivedQty > 0) return "partial";
  if (item.orderedQty > 0) return "ordered";
  // Carried pending, cart, and ordered lines are history, not out of stock.
  // A real out-of-stock leftover stays "rolled" and keeps that status.
  if (item.leftover === "moved") return "moved";
  // Line-level Out of stock is only when nothing went in. Leftover OOS on
  // a missing 1 after Ordered 1 of 2 stays on this month as leftover.
  if (item.leftover === "oos" || item.leftover === "rolled") return "out_of_stock";
  if (item.shopping === "in_cart") return "in_cart";
  return "pending";
}

export function shoppingStage(status: OrderStatus): "pending" | "in_cart" {
  return status === "in_cart" ? "in_cart" : "pending";
}

export function canRevertToPending(item: {
  orderedQty: number;
  leftover: Leftover;
}) {
  return item.orderedQty > 0 && item.leftover !== "rolled" && item.leftover !== "moved";
}

export function unorderForPending(item: { leftover: Leftover }): {
  orderedQty: number;
  receivedQty: number;
  leftover: Leftover;
} {
  if (item.leftover === "rolled" || item.leftover === "moved") {
    throw new Error(
      "Leftover already rolled to next month, so this line can't go back to Pending.",
    );
  }
  return { orderedQty: 0, receivedQty: 0, leftover: "" };
}

export function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: SALON_TZ,
  }).format(new Date(Date.UTC(year, month - 1, 15)));
}

export function currentYearMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SALON_TZ,
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

export function nextYearMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export function prevYearMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function parseYearMonth(yearValue: unknown, monthValue: unknown) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Pick a valid year.");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Pick a valid month.");
  }
  return { year, month };
}

export function productKey(item: {
  brand: string;
  product: string;
  size: string;
  shade: string;
}) {
  return [item.brand, item.product, item.size, item.shade]
    .map((value) => value.trim().toLowerCase())
    .join("\u0000");
}

export function findPendingDuplicate(
  items: SalonOrderItem[],
  candidate: { brand: string; product: string; size: string; shade: string },
  exceptId?: string,
) {
  if (!candidate.product.trim()) return null;
  const key = productKey(candidate);
  return (
    items.find(
      (item) =>
        item.status === "pending" &&
        item.id !== exceptId &&
        productKey(item) === key,
    ) ?? null
  );
}

export function itemVendor(item: Pick<SalonOrderItem, "actualVendor" | "preferredVendor">) {
  return item.actualVendor.trim() || item.preferredVendor.trim() || "No vendor";
}

export function appendMoveNote(note: string) {
  const trimmed = note.trim();
  if (!trimmed) return MOVE_NOTE;
  if (trimmed.includes(MOVE_NOTE)) return trimmed;
  return `${trimmed} · ${MOVE_NOTE}`;
}

export type CarryPlan =
  | { action: "skip"; reason: "rolled" | "received" | "empty" }
  | { action: "pending"; qty: number }
  | { action: "ordered"; qty: number; orderedQty: number };

export type CarryBucket = "pending" | "in_cart" | "ordered" | "out_of_stock" | "partial";

/** Fields the month banner and the server both need. No database access. */
export type CarryItem = {
  qty: number;
  orderedQty: number;
  receivedQty: number;
  leftover: Leftover;
  status?: OrderStatus;
  brand: string;
  product: string;
  size: string;
  shade: string;
  note: string;
  actualVendor: string;
  vendorOrderNumber: string;
};

export type CarrySummary = Record<CarryBucket | "total", number>;

/**
 * What a roll would open next month.
 * Already-rolled rows skip. Received rows skip. A short box rolls only the
 * missing qty as Pending. An ordered line that has not arrived keeps Ordered.
 */
export function planCarryOver(item: {
  qty: number;
  orderedQty: number;
  receivedQty: number;
  leftover: Leftover;
}): CarryPlan {
  if (item.leftover === "rolled" || item.leftover === "moved") {
    return { action: "skip", reason: "rolled" };
  }
  if (item.qty < 1) return { action: "skip", reason: "empty" };
  if (item.receivedQty >= item.qty) return { action: "skip", reason: "received" };
  if (item.receivedQty > 0) {
    const qty = item.qty - item.receivedQty;
    if (qty < 1) return { action: "skip", reason: "empty" };
    return { action: "pending", qty };
  }
  if (item.orderedQty > 0) {
    return { action: "ordered", qty: item.qty, orderedQty: item.orderedQty };
  }
  return { action: "pending", qty: item.qty };
}

function sameCarryText(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * A next-month row that already came from this line.
 * Real out-of-stock carries are the rows whose note has the move line.
 * Other pending carries copy the note as it was. Ordered carries match the shipment.
 */
export function findExistingCarry<T extends CarryItem>(source: CarryItem, nextItems: T[]): T | null {
  const plan = planCarryOver(source);
  if (plan.action === "skip") return null;
  const key = productKey(source);
  if (plan.action === "ordered") {
    return (
      nextItems.find(
        (row) =>
          productKey(row) === key &&
          row.receivedQty === 0 &&
          row.qty === source.qty &&
          row.orderedQty === source.orderedQty &&
          sameCarryText(row.actualVendor, source.actualVendor) &&
          sameCarryText(row.vendorOrderNumber, source.vendorOrderNumber) &&
          row.orderedQty > 0,
      ) ?? null
    );
  }
  const outOfStockCarry = source.leftover === "oos" || source.status === "out_of_stock";
  return (
    nextItems.find((row) => {
      if (productKey(row) !== key || row.orderedQty !== 0 || row.receivedQty !== 0) return false;
      if (row.qty !== plan.qty) return false;
      if (outOfStockCarry) return row.note.includes(MOVE_NOTE);
      return row.note.trim() === source.note.trim();
    }) ?? null
  );
}

export function carryBucket(item: CarryItem): CarryBucket | null {
  const plan = planCarryOver(item);
  if (plan.action === "skip") return null;
  if (plan.action === "ordered") return "ordered";
  if (item.receivedQty > 0) return "partial";
  if (item.status === "in_cart") return "in_cart";
  if (item.status === "out_of_stock" || item.leftover === "oos") return "out_of_stock";
  return "pending";
}

export function isEligibleCarry(item: CarryItem, nextItems: CarryItem[]) {
  if (planCarryOver(item).action === "skip") return false;
  return findExistingCarry(item, nextItems) == null;
}

export function summarizeOpenCarry(items: CarryItem[], nextItems: CarryItem[]): CarrySummary {
  const counts: CarrySummary = {
    total: 0,
    pending: 0,
    in_cart: 0,
    ordered: 0,
    out_of_stock: 0,
    partial: 0,
  };
  for (const item of items) {
    if (!isEligibleCarry(item, nextItems)) continue;
    const bucket = carryBucket(item);
    if (!bucket) continue;
    counts[bucket] += 1;
    counts.total += 1;
  }
  return counts;
}

/** Per-row button. Partial and unordered out of stock keep the leftover menu. */
export function showRollToNextMonth(item: CarryItem, nextItems: CarryItem[]) {
  if (!isEligibleCarry(item, nextItems)) return false;
  const plan = planCarryOver(item);
  if (plan.action === "ordered") return true;
  if (item.orderedQty !== 0 || item.receivedQty !== 0) return false;
  if (item.status === "out_of_stock" || item.leftover === "oos") return false;
  return true;
}

export function rollButtonLabel(item: { qty: number; orderedQty: number; receivedQty: number }) {
  if (item.orderedQty > 0 && item.receivedQty === 0 && remainderQty(item) >= 1) {
    return "Roll this order to next month";
  }
  return "Roll to next month";
}

/** What the row inputs currently hold. orderedQty is "Qty going in this order". */
export type RowDraft = {
  preferredVendor: string;
  brand: string;
  product: string;
  size: string;
  shade: string;
  qty: string;
  sku: string;
  note: string;
  actualVendor: string;
  vendorOrderNumber: string;
  orderedQty: string;
};

export type RowDraftItem = {
  preferredVendor: string;
  brand: string;
  product: string;
  size: string;
  shade: string;
  qty: number;
  orderedQty: number;
  leftover: Leftover;
  sku: string;
  note: string;
  actualVendor: string;
  vendorOrderNumber: string;
};

const ROW_TEXT_FIELDS = [
  "preferredVendor",
  "brand",
  "product",
  "size",
  "shade",
  "sku",
  "note",
  "actualVendor",
  "vendorOrderNumber",
] as const;

/** Text and requested qty the user changed but has not saved yet. */
export function unsavedRowFields(item: RowDraftItem, draft: RowDraft) {
  const patch: Record<string, string | number> = {};
  for (const key of ROW_TEXT_FIELDS) {
    const next = draft[key].trim();
    if (next !== item[key].trim()) patch[key] = next;
  }
  if (item.orderedQty < 1) {
    const qty = Number(draft.qty);
    if (Number.isInteger(qty) && qty >= 1 && qty !== item.qty) patch.qty = qty;
  }
  return patch;
}

/** Immediate saves (status, leftover, receive) keep the unsaved row text. */
export function withUnsavedRowFields(
  item: RowDraftItem,
  draft: RowDraft,
  patch: Record<string, unknown>,
) {
  return { ...unsavedRowFields(item, draft), ...patch };
}

export function requestedQtyFromDraft(
  item: { qty: number; orderedQty: number },
  draft: Pick<RowDraft, "qty">,
) {
  if (item.orderedQty > 0) return item.qty;
  const qty = Number(draft.qty);
  if (Number.isInteger(qty) && qty >= 1) return qty;
  return item.qty;
}

export function goingInQty(value: string) {
  const orderedQty = Number(value);
  if (!Number.isInteger(orderedQty) || orderedQty < 1) return null;
  return orderedQty;
}

/**
 * Fields to write before a vendor-group status change.
 * A partial "qty going in" is included only when Mark as Ordered would accept it.
 * A blocked plan saves nothing, so the inputs stay as typed.
 */
export function bulkStatusRowPlan(
  item: RowDraftItem,
  draft: RowDraft | undefined,
  status: SettableStatus,
) {
  const save = draft ? unsavedRowFields(item, draft) : {};
  if (status !== "ordered" || item.orderedQty > 0 || !draft) {
    return { save, blocked: null as string | null };
  }
  const orderedQty = goingInQty(draft.orderedQty);
  const requested = requestedQtyFromDraft(item, draft);
  if (orderedQty === null || orderedQty >= requested) {
    return { save, blocked: null as string | null };
  }
  if (item.leftover !== "wait" && item.leftover !== "oos" && item.leftover !== "rolled") {
    return {
      save: {} as Record<string, string | number>,
      blocked: `Choose wait, out of stock, or roll for the leftover on ${item.product} before marking the group Ordered.`,
    };
  }
  return { save: { ...save, orderedQty }, blocked: null as string | null };
}

/** Vendor names decide which group a row is in, so they are saved after the group update. */
export function splitBulkRowSave(save: Record<string, string | number>) {
  const before: Record<string, string | number> = {};
  const vendor: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(save)) {
    if (key === "actualVendor" || key === "preferredVendor") vendor[key] = value;
    else before[key] = value;
  }
  return { before, vendor };
}

/** Blank group order # must not wipe numbers already typed on each row. */
export function sharedVendorOrderNumber(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}
