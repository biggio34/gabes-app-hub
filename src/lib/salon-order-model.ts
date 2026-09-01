export const ORDER_STATUSES = [
  "pending",
  "in_cart",
  "ordered",
  "received",
  "out_of_stock",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const statusLabel: Record<OrderStatus, string> = {
  pending: "Pending",
  in_cart: "Added to cart",
  ordered: "Ordered",
  received: "Received",
  out_of_stock: "Out of stock",
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
  note: string;
  actualVendor: string;
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
};

const SALON_TZ = "America/Chicago";

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
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

export function itemVendor(item: Pick<SalonOrderItem, "actualVendor" | "preferredVendor">) {
  return item.actualVendor.trim() || item.preferredVendor.trim() || "No vendor";
}

export function appendMoveNote(note: string) {
  const trimmed = note.trim();
  if (!trimmed) return MOVE_NOTE;
  if (trimmed.includes(MOVE_NOTE)) return trimmed;
  return `${trimmed} · ${MOVE_NOTE}`;
}
