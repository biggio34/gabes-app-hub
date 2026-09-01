export const ORDER_STATUSES = [
  "pending",
  "in_cart",
  "ordered",
  "partial",
  "received",
  "out_of_stock",
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

export type Leftover = (typeof LEFTOVERS)[number];

export const statusLabel: Record<OrderStatus, string> = {
  pending: "Pending",
  in_cart: "Added to cart",
  ordered: "Ordered",
  partial: "Partial",
  received: "Received",
  out_of_stock: "Out of stock",
};

export const leftoverLabel: Record<Exclude<Leftover, "">, string> = {
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
  createdAt: string;
  updatedAt: string;
};

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

export function deriveStatus(item: {
  qty: number;
  orderedQty: number;
  receivedQty: number;
  leftover: Leftover;
  shopping?: "pending" | "in_cart";
}): OrderStatus {
  // Received is only the original ask. Rolling leftover to next month
  // must not flip this month to Received.
  if (item.receivedQty >= item.qty && item.qty > 0) return "received";
  if (item.receivedQty > 0) return "partial";
  if (item.orderedQty > 0) return "ordered";
  if (item.leftover === "oos" || item.leftover === "rolled") return "out_of_stock";
  if (item.shopping === "in_cart") return "in_cart";
  return "pending";
}

export function shoppingStage(status: OrderStatus): "pending" | "in_cart" {
  return status === "in_cart" ? "in_cart" : "pending";
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
