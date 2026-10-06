"use client";

import { useEffect, useState } from "react";
import { formatReceivedStamp } from "@/lib/salon-check-in";
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
  items: DeliveryLine[];
};

type CheckInPayload = {
  waitingOrders: number;
  groups: Group[];
  undoToday: { id: string; label: string; receivedAt: string }[];
  receiveMeta: boolean;
};

type Draft = { qty: number; choice: "roll" | "wait"; short: boolean };

const tap =
  "min-h-12 rounded-2xl px-4 text-base font-semibold disabled:opacity-60";

function lineTitle(item: DeliveryLine) {
  return [item.brand, item.product].filter(Boolean).join(" ");
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
          next[item.id] = current[item.id] ?? {
            qty: item.orderedQty,
            choice: "roll",
            short: false,
          };
        }
      }
      return next;
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load deliveries when check-in opens
    void load();
  }, []);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  function draftFor(item: DeliveryLine): Draft {
    return drafts[item.id] ?? { qty: item.orderedQty, choice: "roll", short: false };
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => {
      const item = payload?.groups.flatMap((group) => group.items).find((row) => row.id === id);
      const base = current[id] ?? {
        qty: item?.orderedQty ?? 1,
        choice: "roll" as const,
        short: false,
      };
      return { ...current, [id]: { ...base, ...patch } };
    });
  }

  async function checkIn(group: Group) {
    setBusyKey(group.key);
    setError("");
    try {
      const lines = group.items.map((item) => {
        const draft = draftFor(item);
        return {
          id: item.id,
          receivedQty: draft.short ? draft.qty : item.orderedQty,
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
      if (data.undoToken) setUndo({ token: data.undoToken, title: group.title });
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
    <div className={`grid gap-4 ${undo ? "pb-28" : ""}`}>
      <p className="text-sm text-slate-400">
        {payload.waitingOrders === 0
          ? "No orders waiting."
          : payload.waitingOrders === 1
            ? "1 order waiting."
            : `${payload.waitingOrders} orders waiting.`}
      </p>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {payload.groups.length === 0 ? (
        <p className="rounded-3xl border border-slate-800 bg-slate-900 px-5 py-10 text-center text-slate-400">
          Nothing is waiting on a box. Ordered lines show up here until the ordered
          quantity is checked in.
        </p>
      ) : (
        payload.groups.map((group) => (
          <section
            key={group.key}
            className="grid gap-3 rounded-3xl border border-slate-800 bg-slate-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold leading-snug">{group.title}</h2>
            </div>
            <button
              type="button"
              disabled={busyKey !== ""}
              className={`${tap} bg-rose-600 text-white hover:bg-rose-500`}
              onClick={() => void checkIn(group)}
            >
              {busyKey === group.key ? "Checking in…" : "All here"}
            </button>
            <ul className="grid gap-3">
              {group.items.map((item) => {
                const draft = draftFor(item);
                const arrived = draft.short ? draft.qty : item.orderedQty;
                const missing = item.orderedQty - arrived;
                const stamp = formatReceivedStamp(item.receivedByName, item.receivedAt);
                return (
                  <li
                    key={item.id}
                    className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-3"
                  >
                    <div>
                      <p className="text-lg font-semibold leading-snug">{lineTitle(item)}</p>
                      <p className="text-base text-slate-200">
                        {[item.shade, item.size, item.sku ? `SKU ${item.sku}` : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="text-sm text-slate-400">
                        Ordered {item.orderedQty}
                        {item.receivedQty > 0 ? ` · already in ${item.receivedQty}` : ""}
                        {" · "}
                        {monthLabel(item.year, item.month)}
                      </p>
                    </div>
                    {item.note ? (
                      <p className="rounded-2xl bg-slate-900 px-3 py-2 text-sm text-slate-300">
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
                            className="h-14 w-14 rounded-2xl bg-slate-800 text-2xl font-semibold"
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
                              of {item.orderedQty}
                            </span>
                          </p>
                          <button
                            type="button"
                            aria-label={`More of ${lineTitle(item)}`}
                            className="h-14 w-14 rounded-2xl bg-slate-800 text-2xl font-semibold"
                            onClick={() => {
                              const qty = Math.min(item.orderedQty, draft.qty + 1);
                              patchDraft(item.id, {
                                qty,
                                short: qty < item.orderedQty,
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
                                className={`${tap} bg-slate-800`}
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
                                className={`${tap} bg-slate-800`}
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
                        <p className="text-sm text-slate-300">All {item.orderedQty} in this box</p>
                        <button
                          type="button"
                          className={`${tap} bg-slate-800`}
                          onClick={() =>
                            patchDraft(item.id, {
                              short: true,
                              qty: Math.max(0, item.orderedQty - 1),
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
      {payload.undoToday.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
            Your check-ins today
          </h2>
          <ul className="grid gap-2">
            {payload.undoToday.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2"
              >
                <p className="text-sm">
                  {row.label}
                  <span className="block text-slate-400">{clock(row.receivedAt)}</span>
                </p>
                <button
                  type="button"
                  disabled={busyKey !== ""}
                  className={`${tap} bg-slate-800`}
                  onClick={() => void undoSaved(row.id)}
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {undo ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-emerald-800 bg-emerald-950 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
