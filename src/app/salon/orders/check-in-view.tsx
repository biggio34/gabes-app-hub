"use client";

import { useEffect, useRef, useState } from "react";
import {
  deliveriesStillOpenLabel,
  displayText,
  formatReceivedStamp,
  joinDisplay,
  orderedStillComing,
  productTitle,
} from "@/lib/salon-check-in";
import { monthLabel } from "@/lib/salon-order-model";

type DeliveryLine = {
  id: string;
  year: number;
  month: number;
  vendor: string;
  vendorOrderNumber: string;
  brand: string;
  product: string;
  size: string;
  shade: string;
  sku: string;
  orderedQty: number;
  receivedQty: number;
  note: string;
  receivedByName: string;
  receivedAt: string | null;
};

type Group = {
  key: string;
  title: string;
  vendor: string;
  vendorOrderNumber: string;
  orderNumbers?: string[];
  items: DeliveryLine[];
};

type CheckInPayload = {
  waitingOrders: number;
  groups: Group[];
  undoToday: {
    key: string;
    title: string;
    receivedAt: string;
    items: { id: string; label: string; receivedAt: string }[];
  }[];
  receiveMeta: boolean;
};

type Draft = { qty: number; choice: "roll" | "wait"; short: boolean; receivedQty: number };

const UNDO_BAR_MS = 20_000;
const UNDO_BAR_TICK_MS = 1_000;

function stopUndoTimer(timer: { current: number | null }) {
  if (timer.current != null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
}

function tickUndoBar(
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
  // Phones often delay one long timeout toward 30s. Short ticks keep the
  // deadline that was set when the bar appeared.
  timer.current = window.setTimeout(
    () => tickUndoBar(hideAt, timer, hide),
    Math.min(UNDO_BAR_TICK_MS, remaining),
  );
}

function showUndoBar(
  hideAt: { current: number },
  timer: { current: number | null },
  hide: () => void,
  show: () => void,
) {
  stopUndoTimer(timer);
  hideAt.current = Date.now() + UNDO_BAR_MS;
  show();
  tickUndoBar(hideAt, timer, hide);
}

function freshDraft(item: DeliveryLine): Draft {
  return {
    qty: orderedStillComing(item),
    choice: "roll",
    short: false,
    receivedQty: item.receivedQty,
  };
}

const tap =
  "min-h-12 rounded-2xl px-4 text-base font-semibold disabled:opacity-60";

function lineTitle(item: DeliveryLine) {
  return productTitle(item.brand, item.product);
}

function clock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function CheckInView({ onActivity }: { onActivity: () => void }) {
  const [payload, setPayload] = useState<CheckInPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [undo, setUndo] = useState<{ token: string; title: string } | null>(null);
  const undoHideAt = useRef(0);
  const undoTimer = useRef<number | null>(null);

  async function load() {
    const response = await fetch("/api/salon/orders/check-in");
    const data = (await response.json().catch(() => ({}))) as CheckInPayload & {
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "Could not load deliveries.");
      return;
    }
    setPayload(data);
    setDrafts((current) => {
      const next: Record<string, Draft> = {};
      for (const group of data.groups) {
        for (const item of group.items) {
          const kept = current[item.id];
          next[item.id] =
            kept && kept.receivedQty === item.receivedQty ? kept : freshDraft(item);
        }
      }
      return next;
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load deliveries when check-in opens
    void load();
  }, []);

  useEffect(() => () => stopUndoTimer(undoTimer), []);

  function draftFor(item: DeliveryLine): Draft {
    const current = drafts[item.id];
    if (!current || current.receivedQty !== item.receivedQty) return freshDraft(item);
    return current;
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => {
      const item = payload?.groups.flatMap((group) => group.items).find((row) => row.id === id);
      const base = item
        ? current[id] && current[id].receivedQty === item.receivedQty
          ? current[id]
          : freshDraft(item)
        : (current[id] ?? {
            qty: 1,
            choice: "roll" as const,
            short: false,
            receivedQty: 0,
          });
      return { ...current, [id]: { ...base, ...patch } };
    });
  }

  async function checkIn(group: Group) {
    setBusyKey(group.key);
    setError("");
    try {
      const lines = group.items.map((item) => {
        const draft = draftFor(item);
        const due = orderedStillComing(item);
        const arrived = draft.short ? Math.min(draft.qty, due) : due;
        return {
          id: item.id,
          receivedQty: item.receivedQty + arrived,
          choice: draft.choice,
        };
      });
      const response = await fetch("/api/salon/orders/check-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "check-in", lines }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        undoToken?: string;
      };
      if (!response.ok) throw new Error(data.error || "Could not check in that box.");
      if (data.undoToken) {
        const token = data.undoToken;
        showUndoBar(undoHideAt, undoTimer, () => setUndo(null), () =>
          setUndo({ token, title: group.title }),
        );
      }
      await load();
      onActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check in that box.");
    } finally {
      setBusyKey("");
    }
  }

  async function undoToken() {
    if (!undo) return;
    setBusyKey("undo");
    setError("");
    const token = undo.token;
    stopUndoTimer(undoTimer);
    undoHideAt.current = 0;
    setUndo(null);
    try {
      const response = await fetch("/api/salon/orders/check-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "undo", token }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not undo that check-in.");
      await load();
      onActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo that check-in.");
    } finally {
      setBusyKey("");
    }
  }

  async function undoDelivery(key: string) {
    setBusyKey(key);
    setError("");
    try {
      const response = await fetch("/api/salon/orders/check-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "undo-delivery", key }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not undo that delivery.");
      await load();
      onActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo that delivery.");
    } finally {
      setBusyKey("");
    }
  }

  async function undoSaved(id: string) {
    setBusyKey(id);
    setError("");
    try {
      const response = await fetch("/api/salon/orders/check-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "undo-saved", id }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not undo that check-in.");
      await load();
      onActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo that check-in.");
    } finally {
      setBusyKey("");
    }
  }

  if (!payload) {
    return <p className="text-slate-400">{error || "Loading deliveries…"}</p>;
  }

  return (
    <div className={`grid gap-4 ${undo ? "pt-24" : ""}`}>
      <p className="text-sm text-slate-400">
        {`${deliveriesStillOpenLabel(payload.waitingOrders)}.`}
      </p>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {payload.groups.length === 0 ? (
        <p className="so-panel rounded-3xl border border-slate-800 bg-slate-900 px-5 py-10 text-center text-slate-400">
          Nothing is waiting on a box. Ordered lines show up here until the ordered
          quantity is checked in.
        </p>
      ) : (
        payload.groups.map((group) => (
          <section
            key={group.key}
            className="grid gap-3 so-panel rounded-3xl border border-slate-800 bg-slate-900 p-4"
          >
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold leading-snug break-words">{group.title}</h2>
              {(group.orderNumbers ?? []).length > 1 ? (
                <p className="text-xs leading-snug break-words text-slate-400">
                  {(group.orderNumbers ?? []).join(" · ")}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={busyKey !== ""}
              className={`${tap} so-checkin bg-rose-600 text-white hover:bg-rose-500`}
              onClick={() => void checkIn(group)}
            >
              {busyKey === group.key
                ? "Checking in…"
                : group.items.some((item) => draftFor(item).short)
                  ? "Save check-in"
                  : "All here"}
            </button>
            <ul className="grid gap-3">
              {group.items.map((item) => {
                const draft = draftFor(item);
                const due = orderedStillComing(item);
                const arrived = draft.short ? Math.min(draft.qty, due) : due;
                const missing = due - arrived;
                const stamp = formatReceivedStamp(item.receivedByName, item.receivedAt);
                const details = joinDisplay([
                  item.shade,
                  item.size,
                  displayText(item.sku) ? `SKU ${displayText(item.sku)}` : "",
                ]);
                return (
                  <li
                    key={item.id}
                    className="so-item so-paper grid gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-3"
                  >
                    <div>
                      <p className="text-lg font-semibold leading-snug">{lineTitle(item) || item.product}</p>
                      {details ? <p className="text-base text-slate-200">{details}</p> : null}
                      <p className="text-sm text-slate-400">
                        {item.receivedQty > 0
                          ? `${due} still coming`
                          : `Ordered ${item.orderedQty}`}
                        {" · "}
                        {monthLabel(item.year, item.month)}
                      </p>
                    </div>
                    {item.note ? (
                      <p className="so-panel rounded-2xl bg-slate-900 px-3 py-2 text-sm text-slate-300">
                        {item.note}
                      </p>
                    ) : null}
                    {stamp ? <p className="text-sm text-emerald-300">{stamp}</p> : null}
                    {draft.short ? (
                      <div className="grid gap-2">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            aria-label={`Less of ${lineTitle(item)}`}
                            className="h-14 w-14 rounded-2xl so-soft bg-slate-800 text-2xl font-semibold"
                            onClick={() =>
                              patchDraft(item.id, {
                                qty: Math.max(0, draft.qty - 1),
                                short: true,
                              })
                            }
                          >
                            −
                          </button>
                          <p className="min-w-16 text-center text-2xl font-semibold tabular-nums">
                            {draft.qty}
                            <span className="block text-xs font-normal text-slate-400">
                              of {due}
                            </span>
                          </p>
                          <button
                            type="button"
                            aria-label={`More of ${lineTitle(item)}`}
                            className="h-14 w-14 rounded-2xl so-soft bg-slate-800 text-2xl font-semibold"
                            onClick={() => {
                              const qty = Math.min(due, draft.qty + 1);
                              patchDraft(item.id, {
                                qty,
                                short: qty < due,
                              });
                            }}
                          >
                            +
                          </button>
                        </div>
                        {missing > 0 && draft.qty > 0 ? (
                          draft.choice === "wait" ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-slate-300">
                                Missing {missing} stays on this order.
                              </p>
                              <button
                                type="button"
                                className={`${tap} so-soft bg-slate-800`}
                                onClick={() => patchDraft(item.id, { choice: "roll" })}
                              >
                                Roll to next month
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-slate-300">
                                Missing {missing} rolls to next month.
                              </p>
                              <button
                                type="button"
                                className={`${tap} so-soft bg-slate-800`}
                                onClick={() => patchDraft(item.id, { choice: "wait" })}
                              >
                                Wait
                              </button>
                            </div>
                          )
                        ) : draft.qty === 0 ? (
                          <p className="text-sm text-slate-400">
                            Not in this box. It stays waiting.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        {item.receivedQty > 0 ? null : (
                          <p className="text-sm text-slate-300">All {due} in this box</p>
                        )}
                        <button
                          type="button"
                          className={`${tap} ml-auto so-soft bg-slate-800`}
                          onClick={() =>
                            patchDraft(item.id, {
                              short: true,
                              qty: Math.max(0, due - 1),
                              choice: "roll",
                            })
                          }
                        >
                          Short
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold text-slate-400">Your check-ins today</h2>
        {payload.undoToday.length > 0 ? (
          <>
            <p className="text-sm text-slate-400">
              Undo stays available for the rest of today after the bar is gone.
            </p>
            <ul className="grid gap-3">
            {payload.undoToday.map((group) => (
              <li
                key={group.key}
                className="so-panel grid gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold leading-snug">
                    {group.title}
                    <span className="block font-normal text-slate-400">{clock(group.receivedAt)}</span>
                  </p>
                  <button
                    type="button"
                    disabled={busyKey !== ""}
                    className={`${tap} shrink-0 so-soft bg-slate-800`}
                    onClick={() => void undoDelivery(group.key)}
                  >
                    Undo delivery
                  </button>
                </div>
                <ul className="grid gap-2">
                  {group.items.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3">
                      <p className="text-sm">
                        {row.label}
                        <span className="block text-slate-400">{clock(row.receivedAt)}</span>
                      </p>
                      <button
                        type="button"
                        disabled={busyKey !== ""}
                        className={`${tap} so-paper shrink-0 border border-slate-700 bg-slate-950`}
                        onClick={() => void undoSaved(row.id)}
                      >
                        Undo
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            </ul>
          </>
        ) : null}
      </section>
      {undo ? (
        <div className="fixed inset-x-0 top-0 z-40 border-b border-emerald-800 bg-emerald-950 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-lg">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
            <p className="text-sm text-emerald-100">Checked in {undo.title}</p>
            <button
              type="button"
              disabled={busyKey !== ""}
              className={`${tap} bg-white text-emerald-950`}
              onClick={() => void undoToken()}
            >
              Undo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
