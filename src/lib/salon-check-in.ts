import type { Leftover, SalonOrderItem } from "./salon-order-model";

export type ShortChoice = "roll" | "wait";

/** Some of the ordered quantity has not been checked in yet. */
export function isAwaitingDelivery(item: { orderedQty: number; receivedQty: number }) {
  return item.orderedQty > 0 && item.receivedQty < item.orderedQty;
}

export type DeliverySort = {
  id?: string;
  vendor: string;
  vendorOrderNumber: string;
  year: number;
  month: number;
  createdAt: string;
};

/** "-" and similar placeholders are blank, not a shade or size. */
export function displayText(value: string) {
  const text = value.trim();
  if (/^(?:|[-–—]+|n\/a|na|none|null)$/i.test(text)) return "";
  return text;
}

export function joinDisplay(parts: string[], separator = " · ") {
  return parts.map((part) => displayText(part)).filter(Boolean).join(separator);
}

export function deliveryGroupKey(vendor: string, vendorOrderNumber: string) {
  return `${vendor.trim().toLowerCase()}\u0000${vendorOrderNumber.trim().toLowerCase()}`;
}

function timeKey(line: DeliverySort) {
  const created = line.createdAt.trim();
  if (created) return created;
  return `${line.year}-${String(line.month).padStart(2, "0")}`;
}

function compareDelivery(a: DeliverySort, b: DeliverySort) {
  const byTime = timeKey(a).localeCompare(timeKey(b));
  if (byTime !== 0) return byTime;
  const byVendor = a.vendor.localeCompare(b.vendor, undefined, { sensitivity: "base" });
  if (byVendor !== 0) return byVendor;
  const byOrder = a.vendorOrderNumber.localeCompare(b.vendorOrderNumber, undefined, {
    sensitivity: "base",
  });
  if (byOrder !== 0) return byOrder;
  return (a.id ?? "").localeCompare(b.id ?? "");
}

export function groupDeliveries<T extends DeliverySort>(lines: T[]) {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const key = deliveryGroupKey(line.vendor, line.vendorOrderNumber);
    const list = groups.get(key) ?? [];
    list.push(line);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort(compareDelivery);
      const first = sorted[0];
      return {
        key,
        vendor: first.vendor,
        vendorOrderNumber: first.vendorOrderNumber.trim(),
        items: sorted,
      };
    })
    .sort((a, b) => compareDelivery(a.items[0], b.items[0]) || a.key.localeCompare(b.key));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripRepeatedVendor(value: string, vendor: string) {
  let text = value.trim();
  if (!text) return "";
  const firstWord = vendor.trim().split(/\s+/)[0] ?? "";
  const tokens = [vendor.trim(), firstWord]
    .filter((token, index, all) => token.length >= 3 && all.indexOf(token) === index)
    .sort((a, b) => b.length - a.length);
  for (let guard = 0; guard < 4; guard += 1) {
    const before = text;
    text = text.replace(/^#+\s*/, "").trim();
    for (const token of tokens) {
      const re = new RegExp(`^${escapeRegExp(token)}(?=$|[\\s#:,-])`, "i");
      if (!re.test(text)) continue;
      text = text.replace(re, "").replace(/^[\s#:,-]+/, "").trim();
      if (!text) return "";
    }
    if (text === before) break;
  }
  return text.replace(/^#+\s*/, "").trim();
}

/** Split a pasted order-number field into the ids worth showing. */
export function deliveryOrderIds(vendor: string, vendorOrderNumber: string) {
  const stripped = stripRepeatedVendor(vendorOrderNumber, vendor);
  if (!stripped) return [];
  return stripped.split(/\s*(?:,|;|\n|\|)\s*/).flatMap((chunk) => {
    const amazon = chunk.match(/\d{3}-\d{7}-\d{7}/g);
    if (amazon && amazon.length > 1) return amazon;
    const cleaned = stripRepeatedVendor(chunk, vendor);
    return cleaned ? [cleaned] : [];
  });
}

export function deliveryGroupTitle(vendor: string, vendorOrderNumber: string, count: number) {
  const ids = deliveryOrderIds(vendor, vendorOrderNumber);
  const name = vendor.trim() || "No vendor";
  const noun = count === 1 ? "item" : "items";
  if (ids.length === 0) return `${name}, ${count} ${noun}`;
  const idLabel = ids.length === 1 ? ids[0] : `${ids[0]} +${ids.length - 1} more`;
  return `${name} #${idLabel}, ${count} ${noun}`;
}

export type CheckInPlan =
  | { action: "skip" }
  | {
      action: "receive";
      receivedQty: number;
      rollRemainder: boolean;
      extraRollQty: number;
      setWait: boolean;
    };

export function planCheckIn(
  item: { qty: number; orderedQty: number; receivedQty: number; leftover: Leftover },
  receivedQty: number,
  choice: ShortChoice,
): CheckInPlan {
  if (!Number.isInteger(receivedQty) || receivedQty < 0) {
    throw new Error("Received qty must be a whole number of 0 or more.");
  }
  if (item.orderedQty < 1) {
    throw new Error("Received qty is only for after a line is ordered.");
  }
  const capped = Math.min(receivedQty, item.orderedQty);
  if (capped < 1 || capped === item.receivedQty) return { action: "skip" };
  const short = capped < item.orderedQty;
  if (!short) {
    return {
      action: "receive",
      receivedQty: capped,
      rollRemainder: false,
      extraRollQty: 0,
      setWait: false,
    };
  }
  if (choice === "wait") {
    return {
      action: "receive",
      receivedQty: capped,
      rollRemainder: false,
      extraRollQty: 0,
      setWait: item.leftover !== "rolled",
    };
  }
  if (item.leftover === "rolled") {
    return {
      action: "receive",
      receivedQty: capped,
      rollRemainder: false,
      extraRollQty: item.orderedQty - capped,
      setWait: false,
    };
  }
  return {
    action: "receive",
    receivedQty: capped,
    rollRemainder: Math.max(0, item.qty - capped) > 0,
    extraRollQty: 0,
    setWait: false,
  };
}

export type RolledItemSnapshot = {
  id: string;
  orderId: string;
  preferredVendor: string;
  brand: string;
  product: string;
  size: string;
  shade: string;
  qty: number;
  sku: string;
  note: string;
  requestedByUserId: string;
  requestedByName: string;
  createdAt: string;
};

export type CheckInUndoSnapshot = {
  id: string;
  prevReceivedQty: number;
  prevLeftover: Leftover;
  prevReceivedByUserId: string;
  prevReceivedByName: string;
  prevReceivedAt: string | null;
  prevCheckinUndo: string;
  createdItemId: string | null;
  addedToItemId: string | null;
  addedPrevQty: number | null;
  restoredRoll: RolledItemSnapshot | null;
  restoredAdded: { itemId: string; qty: number } | null;
};

export function snapshotFromItem(item: SalonOrderItem): RolledItemSnapshot {
  return {
    id: item.id,
    orderId: item.orderId,
    preferredVendor: item.preferredVendor,
    brand: item.brand,
    product: item.product,
    size: item.size,
    shade: item.shade,
    qty: item.qty,
    sku: item.sku,
    note: item.note,
    requestedByUserId: item.requestedByUserId,
    requestedByName: item.requestedByName,
    createdAt: item.createdAt,
  };
}

export function parseCheckInUndo(raw: string): CheckInUndoSnapshot | null {
  if (!raw.trim()) return null;
  try {
    const value = JSON.parse(raw) as CheckInUndoSnapshot;
    if (!value || typeof value.id !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

export function chicagoDateKey(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatReceivedStamp(name: string, iso: string | null) {
  if (!name.trim() || !iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "numeric",
    day: "numeric",
  }).format(date);
  return `Received by ${name.trim()}, ${day}`;
}

export function isSameChicagoDay(iso: string | null, now = new Date()) {
  if (!iso) return false;
  const day = chicagoDateKey(iso);
  return day !== "" && day === chicagoDateKey(now);
}
