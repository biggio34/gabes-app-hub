"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { money, supplierLabel } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export function OrdersView() {
  const store = useStore();

  if (store.orders.length === 0) {
    return (
      <div className="grid gap-3">
        <h1 className="font-heading text-3xl tracking-tight">Orders</h1>
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          No purchase orders yet. Build a cart and save it after you email Paul
          or place it on SalonCentric.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Mark received to add the units back onto the shelf.
        </p>
      </div>
      <ul className="grid gap-3">
        {store.orders.map((order) => {
          const total = order.lines.reduce(
            (sum, line) => sum + line.qty * line.unitPrice,
            0,
          );
          return (
            <li key={order.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{order.emailSubject}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleString()} ·{" "}
                    {supplierLabel[order.supplierId]} · {money(total)}
                  </p>
                </div>
                <Badge
                  variant={
                    order.status === "received"
                      ? "outline"
                      : order.status === "sent"
                        ? "secondary"
                        : "default"
                  }
                >
                  {order.status}
                </Badge>
              </div>
              <ul className="mt-3 grid gap-1 text-sm">
                {order.lines.map((line) => (
                  <li key={`${order.id}-${line.productId}`}>
                    {line.qty} × {line.name}
                    {line.useSixPack ? " (6-pack)" : ""}
                  </li>
                ))}
              </ul>
              {order.notes ? (
                <p className="mt-2 text-xs text-muted-foreground">{order.notes}</p>
              ) : null}
              {order.status !== "received" ? (
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => store.receiveOrder(order.id)}
                >
                  Mark received
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
