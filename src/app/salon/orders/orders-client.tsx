"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  findPendingDuplicate,
  isSettableStatus,
  itemVendor,
  leftoverLabel,
  monthLabel,
  nextYearMonth,
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
  months: SalonOrder[];
  suggestions: SalonSuggestions;
  isOwner: boolean;
};

const field =
  "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-rose-500";

const statusClass: Record<OrderStatus, string> = {
  pending: "border-amber-500/30 bg-amber-500/15 text-amber-200",
  in_cart: "border-sky-500/30 bg-sky-500/15 text-sky-200",
  ordered: "border-violet-500/30 bg-violet-500/15 text-violet-200",
  partial: "border-orange-500/30 bg-orange-500/15 text-orange-200",
  received: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200",
  out_of_stock: "border-rose-500/30 bg-rose-500/15 text-rose-200",
};

function StatusBadge({
  status,
  receivedQty,
  requestedQty,
}: {
  status: OrderStatus;
  receivedQty?: number;
  requestedQty?: number;
}) {
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

function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: SettableStatus;
  onChange: (status: SettableStatus) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className={field}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as SettableStatus)}
    >
      {SETTABLE_STATUSES.map((status) => (
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
}: {
  initialYear?: string;
  initialMonth?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [vendorFilter, setVendorFilter] = useState("all");
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

  const duplicatePending = useMemo(() => {
    if (!view || !form.product.trim()) return null;
    return findPendingDuplicate(view.items, form);
  }, [view, form]);

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

  async function moveOutOfStock() {
    if (!view) return;
    const next = nextYearMonth(view.year, view.month);
    if (
      !confirm(
        `Roll leftover from out of stock items to ${monthLabel(next.year, next.month)} as Pending? This month’s rows stay for history.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = (await readError(
        await fetch("/api/salon/orders/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "move-out-of-stock",
            year: view.year,
            month: view.month,
          }),
        }),
        "Could not move those items.",
      )) as { moved?: number; nextYear?: number; nextMonth?: number };
      setNotice(
        `Rolled leftover from ${data.moved} item${data.moved === 1 ? "" : "s"} to ${monthLabel(next.year, next.month)}. This month’s rows stayed.`,
      );
      goToMonth(data.nextYear ?? next.year, data.nextMonth ?? next.month);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move those items.");
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <div className="min-h-dvh bg-slate-950 px-6 py-10 text-slate-300">
        {error || "Loading supply orders…"}
      </div>
    );
  }

  const previous = prevYearMonth(view.year, view.month);
  const next = nextYearMonth(view.year, view.month);
  const isCurrent =
    view.year === view.today.year && view.month === view.today.month;
  const outOfStockCount = counts.out_of_stock;
  const suggestions = view.suggestions;

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-200">
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="text-sm text-slate-400 hover:text-rose-300">
              ← Hub
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Supply Orders</h1>
            <p className="text-sm text-slate-400">
              Luna Haus requests. Default is this month; anyone with access can update
              vendor and status.
            </p>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
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
              className="rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
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
          className="grid gap-3 rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-5"
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

        {outOfStockCount > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void moveOutOfStock()}
            className="rounded-2xl border border-rose-800 bg-rose-950/50 px-4 py-3 text-left text-sm hover:border-rose-600 disabled:opacity-60"
          >
            Roll leftover from {outOfStockCount} out of stock item
            {outOfStockCount === 1 ? "" : "s"} to {monthLabel(next.year, next.month)} as
            Pending. This month’s rows stay.
          </button>
        ) : null}

        <div className="grid gap-3">
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
            {ORDER_STATUSES.map((status) => (
              <FilterChip
                key={status}
                active={filter === status}
                label={`${statusLabel[status]} ${counts[status]}`}
                onClick={() => setFilter(status)}
              />
            ))}
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
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                {visibleItems.length} {vendorFilter} item
                {visibleItems.length === 1 ? "" : "s"}
                {filter === "all" ? "" : ` in ${statusLabel[filter]}`}
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-400">
                Set all to
                <select
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-rose-500"
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
                  {SETTABLE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel[status]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {bulkOrderPrompt &&
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
                  className="self-end rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
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
          <p className="rounded-3xl border border-slate-800 bg-slate-900 px-6 py-12 text-center text-slate-400">
            {view.items.length === 0
              ? "No requests this month yet. Add one above."
              : "No requests match these filters."}
          </p>
        ) : (
          grouped.map((group) => (
            <section key={group.status} className="grid gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em] text-slate-400 uppercase">
                {statusLabel[group.status]}
              </h2>
              {group.vendors.map(([vendor, items]) => (
                <div
                  key={`${group.status}-${vendor}`}
                  className="rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-5"
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
                        className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-rose-500"
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
                        {SETTABLE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {bulkOrderPrompt &&
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
                        className="self-end rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
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
                        nextMonthLabel={monthLabel(next.year, next.month)}
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
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
        active ? "bg-rose-700 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
      }`}
    >
      {label}
    </button>
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
  const choices = ["wait", "oos", "rolled"] as const;
  return (
    <div className="grid gap-1.5 sm:col-span-2">
      <p className="text-sm">
        Leftover qty {remainder}
        {leftover ? ` · ${leftoverLabel[leftover]}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (choice === "rolled") {
                if (
                  !confirm(
                    `Roll leftover qty ${remainder} to ${nextMonthLabel} as Pending? This month’s row stays for history.`,
                  )
                ) {
                  return;
                }
              }
              onChoose(choice);
            }}
            className={`rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
              leftover === choice
                ? "bg-rose-700 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
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
  nextMonthLabel,
  onEdit,
  onPatch,
  onDelete,
}: {
  item: SalonOrderItem;
  editing: boolean;
  isOwner: boolean;
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
      markOrdered();
      return;
    }
    setLocalError("");
    onPatch({ status });
  }

  function applyLeftover(leftover: Exclude<Leftover, "">) {
    const patch: Record<string, unknown> = { leftover };
    if (!hasOrdered) {
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

  const qtyLine = hasOrdered
    ? `Requested ${item.qty} · Ordered ${item.orderedQty}${
        item.receivedQty > 0 ? ` · Received ${item.receivedQty} / ${item.qty}` : ""
      }`
    : `Qty ${item.qty}`;

  return (
    <li className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {item.brand ? `${item.brand} · ` : ""}
            {item.product}
          </p>
          <p className="text-sm text-slate-400">
            {qtyLine}
            {item.size ? ` · ${item.size}` : ""}
            {item.shade ? ` · ${item.shade}` : ""}
            {item.sku ? ` · SKU ${item.sku}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Asked by {item.requestedByName}
            {item.preferredVendor ? ` · Preferred ${item.preferredVendor}` : ""}
            {item.vendorOrderNumber ? ` · Order # ${item.vendorOrderNumber}` : ""}
          </p>
          {item.note ? <p className="mt-1 text-sm text-slate-300">{item.note}</p> : null}
        </div>
        <StatusBadge
          status={item.status}
          receivedQty={item.receivedQty}
          requestedQty={item.qty}
        />
      </div>

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
            </span>
          </p>
        ) : (
          <label className="grid gap-1.5 text-sm">
            Status
            <StatusSelect
              value={isSettableStatus(item.status) ? item.status : "pending"}
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
        {hasOrdered ? null : (
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
      {hasOrdered ? null : (
        <button
          type="button"
          className="mt-3 rounded-xl bg-rose-700 px-3 py-2 text-xs font-semibold hover:bg-rose-600"
          onClick={markOrdered}
        >
          Mark as Ordered
        </button>
      )}
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
              className="rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
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
            className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
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
    </li>
  );
}
