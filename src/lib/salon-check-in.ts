import type { Leftover, SalonOrderItem } from "./salon-order-model";

export type ShortChoice = "roll" | "wait";

/** Some of the ordered quantity has not been checked in yet. */
export function isAwaitingDelivery(item: { orderedQty: number; receivedQty: number }) {
  return item.orderedQty > 0 && item.receivedQty < item.orderedQty;
}

export type DeliverySort = {
  vendor: string;
  vendorOrderNumber: string;
  year: number;
  month: number;
  createdAt: string;
};

export function deliveryGroupKey(vendor: string, vendorOrderNumber: string) {
  return `${vendor.trim().toLowerCase()}\u0000${vendorOrderNumber.trim().toLowerCase()}`;
}

function ageKey(line: DeliverySort) {
  const month = String(line.month).padStart(2, "0");
  return `${line.year}-${month}-${line.createdAt}`;
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
      const sorted = [...items].sort((a, b) => ageKey(a).localeCompare(ageKey(b)));
      const first = sorted[0];
      return {
        key,
        vendor: first.vendor,
        vendorOrderNumber: first.vendorOrderNumber.trim(),
        items: sorted,
      };
    })
    .sort((a, b) => ageKey(a.items[0]).localeCompare(ageKey(b.items[0])));
}

export function deliveryGroupTitle(vendor: string, vendorOrderNumber: string, count: number) {
  const name = vendorOrderNumber.trim() ? `${vendor} #${vendorOrderNumber.trim()}` : vendor;
  const noun = count === 1 ? "item" : "items";
  return `${name}, ${count} ${noun}`;
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
