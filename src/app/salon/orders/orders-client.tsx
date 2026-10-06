"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CheckInView } from "./check-in-view";
import { SalonLogo } from "./salon-logo";
import {
  deliveriesStillOpenLabel,
  displayText,
  formatReceivedStamp,
  joinDisplay,
  productTitle,
} from "@/lib/salon-check-in";
import {
  canRevertToPending,
  findPendingDuplicate,
  isSettableStatus,
  itemVendor,
  leftoverLabel,
  monthLabel,
  nextYearMonth,
  rollButtonLabel,
  showRollToNextMonth,
  summarizeOpenCarry,
  ORDER_STATUSES,
  prevYearMonth,
  remainderQty,
  SETTABLE_STATUSES,
  statusLabel,
  type Leftover,
  type OrderStatus,
  type SalonOrder,
  type SalonOrderItem,
  type SalonSuggestions,
  type SettableStatus,
} from "@/lib/salon-order-model";

type View = {
  year: number;
  month: number;
  today: { year: number; month: number };
  order: SalonOrder | null;
  items: SalonOrderItem[];
  nextItems?: SalonOrderItem[];
  months: SalonOrder[];
  suggestions: SalonSuggestions;
  isOwner: boolean;
  canMarkOrdered: boolean;
  deliveryWaiting: number;
};

type ListLayout = "cards" | "table";

const LAYOUT_STORAGE_KEY = "luna-haus-supply-orders-layout";

function readStoredLayout(): ListLayout {
  try {
    return window.localStorage.getItem(LAYOUT_STORAGE_KEY) === "table"
      ? "table"
      : "cards";
  } catch {
    return "cards";
  }
}

function writeStoredLayout(layout: ListLayout) {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  } catch {
    // Ignore quota / private-mode failures; the toggle still works this visit.
  }
}

const field =
  "so-paper w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-rose-500";

const CARRY_UNDO_MS = 20_000;
const CARRY_UNDO_TICK_MS = 1_000;

function stopCarryUndoTimer(timer: { current: number | null }) {
  if (timer.current != null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
}

function tickCarryUndo(
  hideAt: { current: number },
  timer: { current: number | null },
  hide: () => void,
) {
  const remaining = hideAt.current - Date.now();
  if (remaining <= 0) {
    timer.current = null;
    hide();
    return;
  }
  timer.current = window.setTimeout(
    () => tickCarryUndo(hideAt, timer, hide),
    Math.min(CARRY_UNDO_TICK_MS, remaining),
  );
}

function showCarryUndo(
  hideAt: { current: number },
  timer: { current: number | null },
  hide: () => void,
  show: () => void,
) {
  stopCarryUndoTimer(timer);
  hideAt.current = Date.now() + CARRY_UNDO_MS;
  show();
  tickCarryUndo(hideAt, timer, hide);
}

const statusClass: Record<OrderStatus, string> = {
  pending: "so-status so-status-pending",
  in_cart: "so-status so-status-in_cart",
  ordered: "so-status so-status-ordered",
  partial: "so-status so-status-partial",
  received: "so-status so-status-received",
  out_of_stock: "so-status so-status-out_of_stock",
  moved: "so-moved",
};

function StatusBadge({
  status,
  receivedQty,
  requestedQty,
  movedTo,
}: {
  status: OrderStatus;
  receivedQty?: number;
  requestedQty?: number;
  movedTo?: string;
}) {
  if (status === "moved") {
    return (
      <span className="so-moved inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold">
        Moved to {movedTo}
      </span>
    );
  }
  const count =
    (status === "partial" || status === "received") &&
    receivedQty !== undefined &&
    requestedQty !== undefined
      ? ` ${receivedQty} / ${requestedQty}`
      : "";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusClass[status]}`}
    >
      {statusLabel[status]}
      {count}
    </span>
  );
}

function orderStatuses(canMarkOrdered: boolean) {
  return canMarkOrdered
    ? SETTABLE_STATUSES
    : SETTABLE_STATUSES.filter((status) => status !== "ordered");
}

function StatusSelect({
  value,
  onChange,
  disabled,
  statuses = SETTABLE_STATUSES,
}: {
  value: SettableStatus;
  onChange: (status: SettableStatus) => void;
  disabled?: boolean;
  statuses?: readonly SettableStatus[];
}) {
  const selected = statuses.includes(value) ? value : statuses[0];
  return (
    <select
      className={field}
      value={selected}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as SettableStatus)}
    >
      {statuses.map((status) => (
        <option key={status} value={status}>
          {statusLabel[status]}
        </option>
      ))}
    </select>
  );
}

export function SupplyOrdersClient({
  initialYear,
  initialMonth,
  initialCheckIn = false,
}: {
  initialYear?: string;
  initialMonth?: string;
  initialCheckIn?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [listLayout, setListLayout] = useState<ListLayout>("cards");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [orderName, setOrderName] = useState("");
  const [form, setForm] = useState({
    preferredVendor: "",
    brand: "",
    product: "",
    size: "",
    shade: "",
    qty: "1",
    sku: "",
    note: "",
  });
  const [bulkOrderPrompt, setBulkOrderPrompt] = useState<{
    vendor: string;
    fromStatus?: OrderStatus;
  } | null>(null);
  const [bulkOrderNumber, setBulkOrderNumber] = useState("");
  const [checkInOpen, setCheckInOpen] = useState(initialCheckIn);
  const [carryConfirm, setCarryConfirm] = useState(false);
  const [carryUndo, setCarryUndo] = useState<{ token: string; label: string } | null>(null);
  const carryUndoTimer = useRef<number | null>(null);
  const carryUndoHideAt = useRef(0);

  async function load(year?: string, month?: string) {
    const params = new URLSearchParams();
    if (year) params.set("year", year);
    if (month) params.set("month", month);
    const query = params.toString();
    const response = await fetch(`/api/salon/orders${query ? `?${query}` : ""}`);
    const data = (await response.json().catch(() => ({}))) as View & { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not load supply orders.");
      return;
    }
    setView(data);
    setOrderName(data.order?.name || monthLabel(data.year, data.month));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch month on mount and when the URL month changes
    void load(initialYear, initialMonth);
  }, [initialYear, initialMonth]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the check-in query from the address bar
    setCheckInOpen(initialCheckIn);
  }, [initialCheckIn]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore Cards/Table after mount to avoid hydration mismatch
    setListLayout(readStoredLayout());
  }, []);

  function chooseLayout(next: ListLayout) {
    setListLayout(next);
    writeStoredLayout(next);
  }

  const vendorCounts = useMemo(() => {
    const items =
      filter === "all"
        ? (view?.items ?? [])
        : (view?.items ?? []).filter((item) => item.status === filter);
    const counts = new Map<string, number>();
    for (const item of items) {
      const vendor = itemVendor(item);
      counts.set(vendor, (counts.get(vendor) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [view, filter]);

  const counts = useMemo(() => {
    const source =
      vendorFilter === "all"
        ? (view?.items ?? [])
        : (view?.items ?? []).filter((item) => itemVendor(item) === vendorFilter);
    const next = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<
      OrderStatus,
      number
    >;
    for (const item of source) next[item.status] += 1;
    return next;
  }, [view, vendorFilter]);

  const visibleItems = useMemo(() => {
    let items = view?.items ?? [];
    if (filter !== "all") items = items.filter((item) => item.status === filter);
    if (vendorFilter !== "all") {
      items = items.filter((item) => itemVendor(item) === vendorFilter);
    }
    return items;
  }, [view, filter, vendorFilter]);

  const grouped = useMemo(() => {
    const byStatus = ORDER_STATUSES.map((status) => {
      const items = visibleItems.filter((item) => item.status === status);
      const vendors = new Map<string, SalonOrderItem[]>();
      for (const item of items) {
        const vendor = itemVendor(item);
        const list = vendors.get(vendor) ?? [];
        list.push(item);
        vendors.set(vendor, list);
      }
      return { status, vendors: [...vendors.entries()] };
    }).filter((group) => group.vendors.length > 0);
    return byStatus;
  }, [visibleItems]);

  const carryPreview = useMemo(
    () => summarizeOpenCarry(view?.items ?? [], view?.nextItems ?? []),
    [view],
  );

  const duplicatePending = useMemo(() => {
    if (!view || !form.product.trim()) return null;
    return findPendingDuplicate(view.items, form);
  }, [view, form]);

  function openCheckIn() {
    if (!view) return;
    setCheckInOpen(true);
    const params = new URLSearchParams();
    const onThisMonth = view.year === view.today.year && view.month === view.today.month;
    if (!onThisMonth) {
      params.set("year", String(view.year));
      params.set("month", String(view.month));
    }
    params.set("checkin", "1");
    router.push(`/salon/orders?${params}`);
  }

  function goToMonth(year: number, month: number) {
    setVendorFilter("all");
    setBulkOrderPrompt(null);
    setBulkOrderNumber("");
    const today = view?.today;
    if (today && year === today.year && month === today.month) {
      router.push("/salon/orders");
      return;
    }
    router.push(`/salon/orders?year=${year}&month=${month}`);
  }

  async function readError(response: Response, fallback: string) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(data.error || fallback);
    return data;
  }

  async function addRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!view) return;
    const duplicate = findPendingDuplicate(view.items, form);
    if (duplicate) {
      const label = [form.brand, form.product, form.size, form.shade]
        .filter(Boolean)
        .join(" · ");
      if (
        !confirm(
          `${label} is already Pending this month (qty ${duplicate.qty}). Add another anyway?`,
        )
      ) {
        return;
      }
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await readError(
        await fetch("/api/salon/orders/items", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            year: view.year,
            month: view.month,
            ...form,
            qty: Number(form.qty),
          }),
        }),
        "Could not add that request.",
      );
      setForm((current) => ({
        ...current,
        product: "",
        size: "",
        shade: "",
        qty: "1",
        sku: "",
        note: "",
      }));
      await load(String(view.year), String(view.month));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that request.");
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (!view) return;
    const next = orderName.trim() || monthLabel(view.year, view.month);
    setRenaming(false);
    if (next === (view.order?.name || monthLabel(view.year, view.month))) return;
    setError("");
    try {
      await readError(
        await fetch("/api/salon/orders", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ year: view.year, month: view.month, name: next }),
        }),
        "Could not rename this order.",
      );
      await load(String(view.year), String(view.month));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename this order.");
    }
  }

  async function patchItem(id: string, patch: Record<string, unknown>) {
    setError("");
    try {
      await readError(
        await fetch("/api/salon/orders/items", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, ...patch }),
        }),
        "Could not update that request.",
      );
      if (view) await load(String(view.year), String(view.month));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that request.");
    }
  }

  async function removeItem(id: string) {
    if (!confirm("Delete this request?")) return;
    setError("");
    try {
      await readError(
        await fetch("/api/salon/orders/items", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        }),
        "Could not delete that request.",
      );
      if (view) await load(String(view.year), String(view.month));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that request.");
    }
  }

  async function bulkStatus(
    vendor: string,
    status: SettableStatus,
    fromStatus?: OrderStatus,
    vendorOrderNumber?: string,
  ) {
    if (!view) return;
    if (
      status === "pending" &&
      fromStatus &&
      (fromStatus === "ordered" || fromStatus === "partial" || fromStatus === "received")
    ) {
      if (
        !confirm(
          `Move ${vendor} items in ${statusLabel[fromStatus]} back to Pending? Ordered and received qty will be cleared.`,
        )
      ) {
        return;
      }
    }
    setError("");
    try {
      await readError(
        await fetch("/api/salon/orders/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "bulk-status",
            year: view.year,
            month: view.month,
            vendor,
            status,
            fromStatus,
            vendorOrderNumber,
          }),
        }),
        "Could not update those items.",
      );
      setBulkOrderPrompt(null);
      setBulkOrderNumber("");
      await load(String(view.year), String(view.month));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update those items.");
    }
  }

  async function rollItem(id: string) {
    if (!view) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await readError(
        await fetch("/api/salon/orders/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "roll-item", id }),
        }),
        "Could not roll that item.",
      );
      await load(String(view.year), String(view.month));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not roll that item.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCarry() {
    if (!view) return;
    const next = nextYearMonth(view.year, view.month);
    const label = monthLabel(next.year, next.month);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = (await readError(
        await fetch("/api/salon/orders/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "move-open",
            year: view.year,
            month: view.month,
          }),
        }),
        "Could not move those items.",
      )) as { moved?: number; undoToken?: string };
      setCarryConfirm(false);
      const moved = data.moved ?? 0;
      if (moved === 0) {
        setNotice(`Nothing new to move. Open items are already on ${label}.`);
      } else if (data.undoToken) {
        const token = data.undoToken;
        showCarryUndo(carryUndoHideAt, carryUndoTimer, () => setCarryUndo(null), () =>
          setCarryUndo({
            token,
            label: `Moved ${moved} open item${moved === 1 ? "" : "s"} to ${label}`,
          }),
        );
      }
      await load(String(view.year), String(view.month));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move those items.");
    } finally {
      setBusy(false);
    }
  }

  async function undoCarry() {
    if (!view || !carryUndo) return;
    const token = carryUndo.token;
    stopCarryUndoTimer(carryUndoTimer);
    carryUndoHideAt.current = 0;
    setCarryUndo(null);
    setBusy(true);
    setError("");
    try {
      await readError(
        await fetch("/api/salon/orders/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "undo-carry", token }),
        }),
        "Could not undo that move.",
      );
      await load(String(view.year), String(view.month));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo that move.");
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <div className="so-page min-h-dvh min-w-0 px-6 py-10">
        {error || "Loading supply orders…"}
      </div>
    );
  }

  const previous = prevYearMonth(view.year, view.month);
  const next = nextYearMonth(view.year, view.month);
  const isCurrent =
    view.year === view.today.year && view.month === view.today.month;
  const suggestions = view.suggestions;
  const nextItems = view.nextItems ?? [];

  return (
    <div className={`so-page min-h-dvh min-w-0 ${carryUndo ? "pt-20" : ""}`}>
      {carryUndo ? (
        <div
          data-testid="carry-undo"
          className="fixed inset-x-0 top-0 z-40 border-b border-emerald-800 bg-emerald-950 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-lg"
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm text-emerald-100">{carryUndo.label}</p>
            <button
              type="button"
              disabled={busy}
              className="min-h-12 rounded-2xl bg-white px-4 text-base font-semibold text-emerald-950 disabled:opacity-60"
              onClick={() => void undoCarry()}
            >
              Undo
            </button>
          </div>
        </div>
      ) : null}
      <div
        className={`mx-auto grid w-full min-w-0 gap-6 px-4 py-8 sm:px-6 ${
          listLayout === "table" ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        {checkInOpen ? null : (
        <header>
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="text-sm text-slate-400 hover:text-rose-300">
              ← Hub
            </Link>
            <SalonLogo />
          </div>
          <h1 className="mt-2 text-3xl tracking-tight">Supply Orders</h1>
          <p className="text-sm text-slate-400">
            Luna Haus requests. Purchasing marks lines ordered. Anyone here can check
            in what arrives.
          </p>
        </header>
        )}

        {checkInOpen ? (
          <div className="mx-auto w-full max-w-lg">
            <div className="mb-4 flex items-center justify-between gap-3">
              <button
                type="button"
                className="text-sm text-slate-400 hover:text-rose-300"
                onClick={() => {
                  setCheckInOpen(false);
                  const onThisMonth =
                    view.year === view.today.year && view.month === view.today.month;
                  router.push(
                    onThisMonth
                      ? "/salon/orders"
                      : `/salon/orders?year=${view.year}&month=${view.month}`,
                  );
                  void load(String(view.year), String(view.month));
                }}
              >
                ← Supply orders
              </button>
              <SalonLogo />
            </div>
            <h2 className="so-title mb-4 text-2xl">Check in delivery</h2>
            <CheckInView
              onActivity={() => void load(String(view.year), String(view.month))}
            />
          </div>
        ) : null}

        {checkInOpen ? null : (
        <button
          type="button"
          className="so-checkin rounded-3xl bg-rose-700 px-5 py-4 text-left text-white hover:bg-rose-600"
          onClick={openCheckIn}
        >
          <span className="block text-lg font-semibold">Check in delivery</span>
          <span className="block text-sm text-rose-100">
            {deliveriesStillOpenLabel(view.deliveryWaiting)}
          </span>
        </button>
        )}

        {checkInOpen ? null : (
        <>

        <section className="so-panel rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="so-soft rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
              onClick={() => goToMonth(previous.year, previous.month)}
            >
              ← {monthLabel(previous.year, previous.month)}
            </button>
            {renaming ? (
              <input
                autoFocus
                className={`${field} max-w-xs text-lg font-semibold`}
                value={orderName}
                onChange={(event) => setOrderName(event.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveName();
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="rounded-xl px-2 py-1 text-left text-xl font-semibold hover:text-rose-300"
                onClick={() => setRenaming(true)}
              >
                {view.order?.name || monthLabel(view.year, view.month)}
                <span className="ml-2 text-xs font-normal text-slate-500">Edit name</span>
              </button>
            )}
            <button
              type="button"
              className="so-soft rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
              onClick={() => goToMonth(next.year, next.month)}
            >
              {monthLabel(next.year, next.month)} →
            </button>
            {view.months.length > 0 ? (
              <select
                className={`${field} max-w-[14rem]`}
                value={`${view.year}-${view.month}`}
                onChange={(event) => {
                  const [year, month] = event.target.value.split("-").map(Number);
                  goToMonth(year, month);
                }}
              >
                {view.months.some(
                  (order) => order.year === view.year && order.month === view.month,
                ) ? null : (
                  <option value={`${view.year}-${view.month}`}>
                    {monthLabel(view.year, view.month)}
                  </option>
                )}
                {view.months.map((order) => (
                  <option key={order.id} value={`${order.year}-${order.month}`}>
                    {order.name}
                  </option>
                ))}
              </select>
            ) : null}
            {isCurrent ? null : (
              <button
                type="button"
                className="rounded-xl bg-rose-800 px-3 py-2 text-sm font-medium hover:bg-rose-700"
                onClick={() => goToMonth(view.today.year, view.today.month)}
              >
                This month
              </button>
            )}
          </div>
        </section>

        <form
          onSubmit={(event) => void addRequest(event)}
          className="grid gap-3 so-panel rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-5"
        >
          <div>
            <h2 className="font-semibold">Add a request</h2>
            <p className="text-sm text-slate-400">
              Product and qty are required. Size, shade, SKU, and note are optional.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1.5 text-sm">
              Preferred vendor
              <input
                list="vendor-options"
                className={field}
                value={form.preferredVendor}
                onChange={(event) =>
                  setForm((current) => ({ ...current, preferredVendor: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              Brand
              <input
                list="brand-options"
                className={field}
                value={form.brand}
                onChange={(event) =>
                  setForm((current) => ({ ...current, brand: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              Product
              <input
                required
                list="product-options"
                className={field}
                value={form.product}
                onChange={(event) =>
                  setForm((current) => ({ ...current, product: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              Size
              <input
                className={field}
                value={form.size}
                onChange={(event) =>
                  setForm((current) => ({ ...current, size: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              Shade
              <input
                className={field}
                value={form.shade}
                onChange={(event) =>
                  setForm((current) => ({ ...current, shade: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              Qty
              <input
                required
                min={1}
                type="number"
                className={field}
                value={form.qty}
                onChange={(event) =>
                  setForm((current) => ({ ...current, qty: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              SKU / item #
              <input
                list="sku-options"
                className={field}
                value={form.sku}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sku: event.target.value }))
                }
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm">
            Note
            <input
              className={field}
              value={form.note}
              onChange={(event) =>
                setForm((current) => ({ ...current, note: event.target.value }))
              }
            />
          </label>
          {duplicatePending ? (
            <p className="rounded-2xl border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
              {[duplicatePending.brand, duplicatePending.product, duplicatePending.size, duplicatePending.shade]
                .filter(Boolean)
                .join(" · ")}{" "}
              is already Pending this month (qty {duplicatePending.qty}
              {duplicatePending.requestedByName
                ? `, asked by ${duplicatePending.requestedByName}`
                : ""}
              ). You can still add another if you need it.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-fit rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold hover:bg-rose-600 disabled:opacity-60"
          >
            {busy ? "Adding…" : "Add request"}
          </button>
          <datalist id="vendor-options">
            {suggestions.vendors.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <datalist id="brand-options">
            {suggestions.brands.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <datalist id="product-options">
            {suggestions.products.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <datalist id="sku-options">
            {(suggestions.skus ?? []).map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </form>

        {view.canMarkOrdered && carryPreview.total > 0 ? (
          <div className="rounded-2xl border border-rose-800 bg-rose-950/50 px-4 py-3 text-sm">
            {carryConfirm ? (
              <div data-testid="carry-confirm" className="grid gap-3">
                <p className="font-semibold">
                  Move {carryPreview.total} open item{carryPreview.total === 1 ? "" : "s"} to{" "}
                  {monthLabel(next.year, next.month)}?
                </p>
                <ul className="grid gap-1 text-slate-300">
                  {(
                    [
                      ["pending", "Pending"],
                      ["in_cart", "Added to cart"],
                      ["ordered", "Ordered"],
                      ["out_of_stock", "Out of stock"],
                      ["partial", "Partial, missing qty only"],
                    ] as const
                  )
                    .filter(([key]) => carryPreview[key] > 0)
                    .map(([key, label]) => (
                      <li key={key}>
                        {carryPreview[key]} {label}
                      </li>
                    ))}
                </ul>
                <p className="text-slate-400">
                  This month keeps each row as history. Ordered items that have not arrived
                  stay Ordered next month, with the same vendor and order number. Pending,
                  cart, and out of stock open as Pending. A second tap will not add them again.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="carry-confirm-move"
                    className="rounded-xl bg-rose-700 px-3 py-2 text-sm font-semibold hover:bg-rose-600 disabled:opacity-60"
                    onClick={() => void confirmCarry()}
                  >
                    {busy ? "Moving…" : "Confirm move"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="so-soft rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700 disabled:opacity-60"
                    onClick={() => setCarryConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                data-testid="move-open-items"
                onClick={() => setCarryConfirm(true)}
                className="text-left hover:text-rose-200 disabled:opacity-60"
              >
                Move {carryPreview.total} open item{carryPreview.total === 1 ? "" : "s"} to{" "}
                {monthLabel(next.year, next.month)}
              </button>
            )}
          </div>
        ) : null}

        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={filter === "all"}
                label={`All ${
                  vendorFilter === "all"
                    ? view.items.length
                    : view.items.filter((item) => itemVendor(item) === vendorFilter).length
                }`}
                onClick={() => setFilter("all")}
              />
              {ORDER_STATUSES.filter((status) => status !== "moved" || counts.moved > 0).map(
                (status) => (
                <FilterChip
                  key={status}
                  active={filter === status}
                  status={status}
                  label={`${statusLabel[status]} ${counts[status]}`}
                  onClick={() => setFilter(status)}
                />
                ),
              )}
            </div>
            <div
              className="so-soft flex rounded-full bg-slate-800 p-0.5"
              role="group"
              aria-label="List layout"
            >
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  listLayout === "cards"
                    ? "bg-rose-700 text-white"
                    : "text-slate-300 hover:bg-slate-700"
                }`}
                aria-pressed={listLayout === "cards"}
                onClick={() => chooseLayout("cards")}
              >
                Cards
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  listLayout === "table"
                    ? "bg-rose-700 text-white"
                    : "text-slate-300 hover:bg-slate-700"
                }`}
                aria-pressed={listLayout === "table"}
                onClick={() => chooseLayout("table")}
              >
                Table
              </button>
            </div>
          </div>
          <label className="grid max-w-sm gap-1.5 text-sm">
            Vendor
            <select
              className={field}
              value={vendorFilter}
              onChange={(event) => {
                setVendorFilter(event.target.value);
                setBulkOrderPrompt(null);
              }}
            >
              <option value="all">All vendors</option>
              {vendorFilter !== "all" &&
              !vendorCounts.some(([vendor]) => vendor === vendorFilter) ? (
                <option value={vendorFilter}>{vendorFilter} (0)</option>
              ) : null}
              {vendorCounts.map(([vendor, count]) => (
                <option key={vendor} value={vendor}>
                  {vendor} ({count})
                </option>
              ))}
            </select>
          </label>
        </div>

        {vendorFilter !== "all" && visibleItems.length > 0 ? (
          <div className="so-panel rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                {visibleItems.length} {vendorFilter} item
                {visibleItems.length === 1 ? "" : "s"}
                {filter === "all" ? "" : ` in ${statusLabel[filter]}`}
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-400">
                Set all to
                <select
                  className="so-paper rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-rose-500"
                  defaultValue=""
                  onChange={(event) => {
                    const value = event.target.value as SettableStatus | "";
                    event.target.value = "";
                    if (!value) return;
                    const fromStatus = filter === "all" ? undefined : filter;
                    if (value === "ordered") {
                      setBulkOrderPrompt({ vendor: vendorFilter, fromStatus });
                      setBulkOrderNumber("");
                      return;
                    }
                    void bulkStatus(vendorFilter, value, fromStatus);
                  }}
                >
                  <option value="">Choose…</option>
                  {orderStatuses(view.canMarkOrdered).map((status) => (
                    <option key={status} value={status}>
                      {statusLabel[status]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {view.canMarkOrdered && bulkOrderPrompt &&
            bulkOrderPrompt.vendor === vendorFilter &&
            bulkOrderPrompt.fromStatus === (filter === "all" ? undefined : filter) ? (
              <form
                className="mt-3 grid gap-2 rounded-2xl border border-rose-800 bg-rose-950/40 p-3 sm:grid-cols-[1fr_auto_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  void bulkStatus(
                    vendorFilter,
                    "ordered",
                    filter === "all" ? undefined : filter,
                    bulkOrderNumber,
                  );
                }}
              >
                <label className="grid gap-1 text-sm">
                  Vendor order # for these items
                  <input
                    autoFocus
                    className={field}
                    value={bulkOrderNumber}
                    placeholder="Optional"
                    onChange={(event) => setBulkOrderNumber(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="self-end rounded-xl bg-rose-700 px-3 py-2 text-sm font-semibold hover:bg-rose-600"
                >
                  Mark as Ordered
                </button>
                <button
                  type="button"
                  className="self-end so-soft rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                  onClick={() => {
                    setBulkOrderPrompt(null);
                    setBulkOrderNumber("");
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}

        {visibleItems.length === 0 ? (
          <div className="so-panel rounded-3xl border border-slate-800 bg-slate-900 px-6 py-12 text-center text-slate-400">
            <p>
              {view.items.length === 0
                ? "No requests this month yet. Add one above."
                : "No requests match these filters."}
            </p>
            {view.deliveryWaiting > 0 ? (
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-rose-300 hover:text-rose-200"
                onClick={openCheckIn}
              >
                {deliveriesStillOpenLabel(view.deliveryWaiting)}
              </button>
            ) : null}
          </div>
        ) : listLayout === "table" ? (
          <CompactItemsTable
            items={grouped.flatMap((group) =>
              group.vendors.flatMap(([, items]) => items),
            )}
            expandedId={expandedId}
            editingId={editingId}
            isOwner={view.isOwner}
            canMarkOrdered={view.canMarkOrdered}
            nextMonthLabel={monthLabel(next.year, next.month)}
            nextItems={nextItems}
            busy={busy}
            onRoll={(id) => void rollItem(id)}
            onToggle={(id) =>
              setExpandedId((current) => (current === id ? null : id))
            }
            onEdit={(id) =>
              setEditingId((current) => (current === id ? null : id))
            }
            onPatch={(id, patch) => void patchItem(id, patch)}
            onDelete={(id) => void removeItem(id)}
          />
        ) : (
          grouped.map((group) => (
            <section key={group.status} className="grid gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em] text-slate-400 uppercase">
                <span className={`so-swatch so-swatch-${group.status}`} aria-hidden="true" />
                {statusLabel[group.status]}
              </h2>
              {group.vendors.map(([vendor, items]) => (
                <div
                  key={`${group.status}-${vendor}`}
                  className="so-panel rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-5"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium">
                      {vendor}{" "}
                      <span className="text-sm font-normal text-slate-500">
                        {items.length} item{items.length === 1 ? "" : "s"}
                      </span>
                    </p>
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      Set all to
                      <select
                        className="so-paper rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-rose-500"
                        defaultValue=""
                        onChange={(event) => {
                          const value = event.target.value as SettableStatus | "";
                          event.target.value = "";
                          if (!value) return;
                          if (group.status === "in_cart" && value === "ordered") {
                            setBulkOrderPrompt({ vendor, fromStatus: group.status });
                            setBulkOrderNumber("");
                            return;
                          }
                          void bulkStatus(vendor, value, group.status);
                        }}
                      >
                        <option value="">Choose…</option>
                        {orderStatuses(view.canMarkOrdered).map((status) => (
                          <option key={status} value={status}>
                            {statusLabel[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {view.canMarkOrdered &&
                  bulkOrderPrompt &&
                  bulkOrderPrompt.vendor === vendor &&
                  bulkOrderPrompt.fromStatus === group.status ? (
                    <form
                      className="mb-3 grid gap-2 rounded-2xl border border-rose-800 bg-rose-950/40 p-3 sm:grid-cols-[1fr_auto_auto]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void bulkStatus(
                          vendor,
                          "ordered",
                          group.status,
                          bulkOrderNumber,
                        );
                      }}
                    >
                      <label className="grid gap-1 text-sm">
                        Vendor order # for these items
                        <input
                          autoFocus
                          className={field}
                          value={bulkOrderNumber}
                          placeholder="Optional"
                          onChange={(event) => setBulkOrderNumber(event.target.value)}
                        />
                      </label>
                      <button
                        type="submit"
                        className="self-end rounded-xl bg-rose-700 px-3 py-2 text-sm font-semibold hover:bg-rose-600"
                      >
                        Mark as Ordered
                      </button>
                      <button
                        type="button"
                        className="self-end so-soft rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                        onClick={() => {
                          setBulkOrderPrompt(null);
                          setBulkOrderNumber("");
                        }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : null}
                  <ul className="grid gap-3">
                    {items.map((item) => (
                      <ItemCard
                        key={`${item.id}-${item.updatedAt}`}
                        item={item}
                        editing={editingId === item.id}
                        isOwner={view.isOwner}
                        canMarkOrdered={view.canMarkOrdered}
                        nextMonthLabel={monthLabel(next.year, next.month)}
                        nextItems={nextItems}
                        busy={busy}
                        onRoll={() => void rollItem(item.id)}
                        onEdit={() =>
                          setEditingId((current) => (current === item.id ? null : item.id))
                        }
                        onPatch={(patch) => void patchItem(item.id, patch)}
                        onDelete={() => void removeItem(item.id)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))
        )}
        </>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
  status,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  status?: OrderStatus;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`so-filter ${
        status ? `so-status so-status-${status}` : "so-filter-all"
      } ${active ? "so-filter-on" : ""}`}
    >
      {label}
    </button>
  );
}

function CellText({
  value,
  emphasize,
}: {
  value: string;
  emphasize?: boolean;
}) {
  if (!displayText(value)) {
    return <span className="text-slate-600">—</span>;
  }
  return (
    <span className={emphasize ? "font-medium text-slate-100" : undefined}>{value}</span>
  );
}

function CompactItemsTable({
  items,
  expandedId,
  editingId,
  isOwner,
  canMarkOrdered,
  nextMonthLabel,
  nextItems,
  busy,
  onRoll,
  onToggle,
  onEdit,
  onPatch,
  onDelete,
}: {
  items: SalonOrderItem[];
  expandedId: string | null;
  editingId: string | null;
  isOwner: boolean;
  canMarkOrdered: boolean;
  nextMonthLabel: string;
  nextItems: SalonOrderItem[];
  busy: boolean;
  onRoll: (id: string) => void;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="so-panel min-w-0 max-w-full overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900">
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          Compact supply order list. Shade is on each row. Open a row for leftover
          and receive.
        </caption>
        <thead className="so-panel bg-slate-950/80 text-xs tracking-wide text-slate-400 uppercase">
          <tr>
            <th className="so-status-col px-2 py-2.5 font-semibold" scope="col">
              Status
            </th>
            <th className="px-2 py-2.5 font-semibold" scope="col">
              Vendor
            </th>
            <th className="px-2 py-2.5 font-semibold" scope="col">
              Brand
            </th>
            <th className="px-2 py-2.5 font-semibold" scope="col">
              Product
            </th>
            <th className="px-2 py-2.5 font-semibold" scope="col">
              Size
            </th>
            <th className="px-2 py-2.5 font-semibold" scope="col">
              Shade
            </th>
            <th className="px-2 py-2.5 font-semibold" scope="col">
              SKU
            </th>
            <th className="px-2 py-2.5 font-semibold" scope="col">
              Qty
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const open = expandedId === item.id;
            return (
              <Fragment key={`${item.id}-${item.updatedAt}`}>
                <tr
                  data-status={item.status}
                  className={`cursor-pointer border-t border-slate-800 hover:bg-slate-800/50 ${
                    open ? "bg-slate-800/40" : ""
                  }`}
                  onClick={() => onToggle(item.id)}
                >
                  <td className="so-status-col px-2 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded px-1 text-xs text-slate-400"
                        aria-expanded={open}
                        aria-label={`${open ? "Hide" : "Show"} leftover and receive for ${item.product}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggle(item.id);
                        }}
                      >
                        {open ? "▾" : "▸"}
                      </button>
                      <StatusBadge
                        status={item.status}
                        receivedQty={item.receivedQty}
                        requestedQty={item.qty}
                        movedTo={nextMonthLabel}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{itemVendor(item)}</td>
                  <td className="px-2 py-2">
                    <CellText value={item.brand} />
                  </td>
                  <td className="px-2 py-2">
                    {item.product}
                    {formatReceivedStamp(item.receivedByName, item.receivedAt) ? (
                      <span className="mt-1 block text-xs text-emerald-300">
                        {formatReceivedStamp(item.receivedByName, item.receivedAt)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <CellText value={item.size} />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <CellText value={item.shade} emphasize />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <CellText value={item.sku} />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap tabular-nums">{item.qty}</td>
                </tr>
                {open ? (
                  <tr className="so-paper border-t border-slate-800 bg-slate-950">
                    <td
                      colSpan={8}
                      className="px-3 py-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <p className="mb-2 text-xs text-slate-500">
                        Leftover and receive stay on this row. Size and shade stay
                        visible above for scanning.
                      </p>
                      {showRollToNextMonth(item, nextItems) ? (
                        <button
                          type="button"
                          disabled={busy}
                          data-testid="roll-to-next-month"
                          className="mb-3 rounded-xl bg-rose-700 px-3 py-2 text-xs font-semibold hover:bg-rose-600 disabled:opacity-60"
                          onClick={() => onRoll(item.id)}
                        >
                          {rollButtonLabel(item)}
                        </button>
                      ) : null}
                      <ItemFulfillment
                        item={item}
                        editing={editingId === item.id}
                        isOwner={isOwner}
                        canMarkOrdered={canMarkOrdered}
                        nextMonthLabel={nextMonthLabel}
                        onEdit={() => onEdit(item.id)}
                        onPatch={(patch) => onPatch(item.id, patch)}
                        onDelete={() => onDelete(item.id)}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LeftoverMenu({
  leftover,
  remainder,
  nextMonthLabel,
  disabled,
  onChoose,
}: {
  leftover: Leftover;
  remainder: number;
  nextMonthLabel: string;
  disabled?: boolean;
  onChoose: (leftover: Exclude<Leftover, "">) => void;
}) {
  if (remainder < 1) return null;
  if (leftover === "rolled") {
    return (
      <p className="text-sm text-slate-400">
        Leftover rolled to {nextMonthLabel}. This month stays as history.
      </p>
    );
  }
  if (leftover === "moved") {
    return (
      <p className="text-sm text-slate-400">
        Moved to {nextMonthLabel}. This month stays as history.
      </p>
    );
  }
  const choices = ["wait", "oos", "rolled"] as const;
  return (
    <div className="grid gap-1.5 sm:col-span-2">
      <p className="text-sm">
        Leftover qty {remainder}
        {leftover ? ` · ${leftoverLabel[leftover]}` : ""}
      </p>
      <p className="text-xs text-slate-500">
        Wait or out of stock keeps the missing qty on this month (still waiting on
        the vendor). Roll copies it to {nextMonthLabel} as Pending.
      </p>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(choice)}
            className={`rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
              leftover === choice
                ? "bg-rose-700 text-white"
                : "so-soft bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {leftoverLabel[choice]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  editing,
  isOwner,
  canMarkOrdered,
  nextMonthLabel,
  nextItems,
  busy,
  onRoll,
  onEdit,
  onPatch,
  onDelete,
}: {
  item: SalonOrderItem;
  editing: boolean;
  isOwner: boolean;
  canMarkOrdered: boolean;
  nextMonthLabel: string;
  nextItems: SalonOrderItem[];
  busy: boolean;
  onRoll: () => void;
  onEdit: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const hasOrdered = item.orderedQty > 0;
  const qtyLine = hasOrdered
    ? `Requested ${item.qty} · Ordered ${item.orderedQty}${
        item.receivedQty > 0 ? ` · Received ${item.receivedQty} / ${item.qty}` : ""
      }`
    : `Qty ${item.qty}`;

  return (
    <li
      data-status={item.status}
      className="so-item so-paper rounded-2xl border border-slate-800 bg-slate-950 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {productTitle(item.brand, item.product, " · ") || item.product}
          </p>
          <p className="text-sm text-slate-400">
            {joinDisplay([
              qtyLine,
              item.size,
              item.shade,
              displayText(item.sku) ? `SKU ${displayText(item.sku)}` : "",
            ])}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Asked by {item.requestedByName}
            {item.preferredVendor ? ` · Preferred ${item.preferredVendor}` : ""}
            {item.vendorOrderNumber ? ` · Order # ${item.vendorOrderNumber}` : ""}
          </p>
          {item.note ? <p className="mt-1 text-sm text-slate-300">{item.note}</p> : null}
          {formatReceivedStamp(item.receivedByName, item.receivedAt) ? (
            <p className="mt-1 text-sm text-emerald-300">
              {formatReceivedStamp(item.receivedByName, item.receivedAt)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge
            status={item.status}
            receivedQty={item.receivedQty}
            requestedQty={item.qty}
            movedTo={nextMonthLabel}
          />
          {showRollToNextMonth(item, nextItems) ? (
            <button
              type="button"
              disabled={busy}
              data-testid="roll-to-next-month"
              className="rounded-xl bg-rose-700 px-3 py-2 text-xs font-semibold hover:bg-rose-600 disabled:opacity-60"
              onClick={onRoll}
            >
              {rollButtonLabel(item)}
            </button>
          ) : null}
        </div>
      </div>
      <ItemFulfillment
        item={item}
        editing={editing}
        isOwner={isOwner}
        canMarkOrdered={canMarkOrdered}
        nextMonthLabel={nextMonthLabel}
        onEdit={onEdit}
        onPatch={onPatch}
        onDelete={onDelete}
      />
    </li>
  );
}

function ItemFulfillment({
  item,
  editing,
  isOwner,
  canMarkOrdered,
  nextMonthLabel,
  onEdit,
  onPatch,
  onDelete,
}: {
  item: SalonOrderItem;
  editing: boolean;
  isOwner: boolean;
  canMarkOrdered: boolean;
  nextMonthLabel: string;
  onEdit: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const hasOrdered = item.orderedQty > 0;
  const remainder = remainderQty(item);
  const [draft, setDraft] = useState({
    preferredVendor: item.preferredVendor,
    brand: item.brand,
    product: item.product,
    size: item.size,
    shade: item.shade,
    qty: String(item.qty),
    sku: item.sku,
    note: item.note,
    actualVendor: item.actualVendor,
    vendorOrderNumber: item.vendorOrderNumber,
  });
  const [orderedDraft, setOrderedDraft] = useState(
    String(item.orderedQty > 0 ? item.orderedQty : item.qty),
  );
  const [receivedDraft, setReceivedDraft] = useState(String(item.receivedQty));
  const [localError, setLocalError] = useState("");

  function saveDetails() {
    const patch: Record<string, unknown> = {
      preferredVendor: draft.preferredVendor,
      brand: draft.brand,
      product: draft.product,
      size: draft.size,
      shade: draft.shade,
      sku: draft.sku,
      note: draft.note,
      actualVendor: draft.actualVendor,
      vendorOrderNumber: draft.vendorOrderNumber,
    };
    if (!hasOrdered) patch.qty = Number(draft.qty);
    onPatch(patch);
    onEdit();
  }

  function goingInQty() {
    const orderedQty = Number(orderedDraft);
    if (!Number.isInteger(orderedQty) || orderedQty < 1) return null;
    return orderedQty;
  }

  const leftoverRemainder = hasOrdered
    ? remainder
    : (() => {
        const goingIn = goingInQty();
        if (goingIn !== null && goingIn < item.qty) return item.qty - goingIn;
        if (item.leftover) return item.qty;
        return 0;
      })();

  function markOrdered() {
    const orderedQty = goingInQty();
    if (orderedQty === null) {
      setLocalError("Ordered qty is the amount that actually went in.");
      return;
    }
    if (orderedQty < item.qty && item.leftover !== "wait" && item.leftover !== "oos" && item.leftover !== "rolled") {
      setLocalError("Choose wait, out of stock, or roll for the leftover before marking Ordered.");
      return;
    }
    setLocalError("");
    const patch: Record<string, unknown> = { status: "ordered", orderedQty };
    if (orderedQty < item.qty && (item.leftover === "wait" || item.leftover === "oos" || item.leftover === "rolled")) {
      patch.leftover = item.leftover;
    }
    onPatch(patch);
  }

  function handleStatus(status: SettableStatus) {
    if (status === "ordered") {
      if (!canMarkOrdered) return;
      markOrdered();
      return;
    }
    if (status === "out_of_stock") {
      const orderedQty = goingInQty();
      if (canMarkOrdered && orderedQty !== null && orderedQty < item.qty) {
        setLocalError("");
        onPatch({ leftover: "oos", orderedQty });
        return;
      }
    }
    setLocalError("");
    onPatch({ status });
  }

  function applyLeftover(leftover: Exclude<Leftover, "">) {
    const patch: Record<string, unknown> = { leftover };
    if (canMarkOrdered && !hasOrdered) {
      const orderedQty = goingInQty();
      if (orderedQty !== null && orderedQty < item.qty) {
        patch.orderedQty = orderedQty;
      }
    }
    setLocalError("");
    onPatch(patch);
  }

  function saveReceived() {
    const receivedQty = Number(receivedDraft);
    if (!Number.isInteger(receivedQty) || receivedQty < 0) {
      setLocalError("Received qty must be a whole number of 0 or more.");
      return;
    }
    setLocalError("");
    onPatch({ receivedQty });
  }

  return (
    <div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          Actual vendor
          <input
            list="vendor-options"
            className={field}
            value={draft.actualVendor}
            onChange={(event) =>
              setDraft((current) => ({ ...current, actualVendor: event.target.value }))
            }
            onBlur={() => {
              if (draft.actualVendor.trim() !== item.actualVendor) {
                onPatch({ actualVendor: draft.actualVendor });
              }
            }}
          />
        </label>
        {hasOrdered ? (
          <p className="grid gap-1.5 text-sm">
            Status
            <span className="text-slate-400">
              Set by ordered and received qty. Received only when a box lands.
              {canRevertToPending(item)
                ? " Use Move back to Pending if this was marked Ordered by mistake."
                : " Leftover already rolled to next month, so this line can't go back to Pending."}
            </span>
          </p>
        ) : item.status === "moved" ? (
          <p className="grid gap-1.5 text-sm">
            Status
            <span className="text-slate-400">
              Moved to {nextMonthLabel}. This month stays as history.
            </span>
          </p>
        ) : (
          <label className="grid gap-1.5 text-sm">
            Status
            <StatusSelect
              value={isSettableStatus(item.status) ? item.status : "pending"}
              statuses={orderStatuses(canMarkOrdered)}
              onChange={handleStatus}
            />
          </label>
        )}
        <label className="grid gap-1.5 text-sm">
          SKU / item #
          <input
            list="sku-options"
            className={field}
            value={draft.sku}
            onChange={(event) =>
              setDraft((current) => ({ ...current, sku: event.target.value }))
            }
            onBlur={() => {
              if (draft.sku.trim() !== item.sku) {
                onPatch({ sku: draft.sku });
              }
            }}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Vendor order #
          <input
            className={field}
            value={draft.vendorOrderNumber}
            onChange={(event) =>
              setDraft((current) => ({ ...current, vendorOrderNumber: event.target.value }))
            }
            onBlur={() => {
              if (draft.vendorOrderNumber.trim() !== item.vendorOrderNumber) {
                onPatch({ vendorOrderNumber: draft.vendorOrderNumber });
              }
            }}
          />
        </label>
        {hasOrdered || !canMarkOrdered ? null : (
          <label className="grid gap-1.5 text-sm">
            Qty going in this order
            <input
              min={1}
              type="number"
              className={field}
              value={orderedDraft}
              onChange={(event) => setOrderedDraft(event.target.value)}
            />
          </label>
        )}
        {hasOrdered ? (
          <label className="grid gap-1.5 text-sm">
            Received qty
            <input
              min={0}
              type="number"
              className={field}
              value={receivedDraft}
              onChange={(event) => setReceivedDraft(event.target.value)}
              onBlur={() => {
                if (Number(receivedDraft) !== item.receivedQty) saveReceived();
              }}
            />
          </label>
        ) : null}
        <LeftoverMenu
          leftover={item.leftover}
          remainder={leftoverRemainder}
          nextMonthLabel={nextMonthLabel}
          onChoose={applyLeftover}
        />
      </div>
      {hasOrdered ? (
        canRevertToPending(item) ? (
          <button
            type="button"
            className="mt-3 so-soft rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
            onClick={() => {
              if (
                !confirm(
                  "Move this back to Pending? Ordered and received qty will be cleared so you can order it again.",
                )
              ) {
                return;
              }
              onPatch({ status: "pending" });
            }}
          >
            Move back to Pending
          </button>
        ) : null
      ) : canMarkOrdered ? (
        <button
          type="button"
          className="mt-3 rounded-xl bg-rose-700 px-3 py-2 text-xs font-semibold hover:bg-rose-600"
          onClick={markOrdered}
        >
          Mark as Ordered
        </button>
      ) : null}
      {localError ? <p className="mt-2 text-sm text-red-400">{localError}</p> : null}

      {editing ? (
        <div className="mt-3 grid gap-3 border-t border-slate-800 pt-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            Preferred vendor
            <input
              list="vendor-options"
              className={field}
              value={draft.preferredVendor}
              onChange={(event) =>
                setDraft((current) => ({ ...current, preferredVendor: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Brand
            <input
              list="brand-options"
              className={field}
              value={draft.brand}
              onChange={(event) =>
                setDraft((current) => ({ ...current, brand: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            Product
            <input
              list="product-options"
              className={field}
              value={draft.product}
              onChange={(event) =>
                setDraft((current) => ({ ...current, product: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Size
            <input
              className={field}
              value={draft.size}
              onChange={(event) =>
                setDraft((current) => ({ ...current, size: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Shade
            <input
              className={field}
              value={draft.shade}
              onChange={(event) =>
                setDraft((current) => ({ ...current, shade: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Requested qty
            <input
              min={1}
              type="number"
              className={field}
              value={draft.qty}
              disabled={hasOrdered}
              onChange={(event) =>
                setDraft((current) => ({ ...current, qty: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Note
            <input
              className={field}
              value={draft.note}
              onChange={(event) =>
                setDraft((current) => ({ ...current, note: event.target.value }))
              }
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="button"
              className="rounded-xl bg-rose-700 px-3 py-2 text-sm font-semibold hover:bg-rose-600"
              onClick={saveDetails}
            >
              Save
            </button>
            <button
              type="button"
              className="so-soft rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
              onClick={onEdit}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="so-soft rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
            onClick={onEdit}
          >
            Edit details
          </button>
          {isOwner ? (
            <button
              type="button"
              className="rounded-xl px-3 py-2 text-xs text-slate-400 hover:text-red-400"
              onClick={onDelete}
            >
              Delete
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
