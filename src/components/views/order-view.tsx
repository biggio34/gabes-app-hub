"use client";

import { useMemo, useState } from "react";
import { Copy, Mail, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { money, supplierLabel, unitPrice } from "@/lib/catalog";
import { buildOrderDraft, mailtoHref, orderFromCart } from "@/lib/email";
import { useStore } from "@/lib/store";
import type { SupplierId } from "@/lib/types";
import { cn } from "@/lib/utils";

export function OrderView() {
  const store = useStore();
  const [supplierId, setSupplierId] = useState<SupplierId>("beautybell");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);

  const lines = useMemo(
    () =>
      store.cart
        .map((line) => {
          const product = store.products.find((item) => item.id === line.productId);
          if (!product || product.supplierId !== supplierId) return null;
          return { line, product };
        })
        .filter((item): item is NonNullable<typeof item> => item != null),
    [store.cart, store.products, supplierId],
  );

  const draft = buildOrderDraft(
    store.products,
    store.cart,
    store.settings,
    supplierId,
  );

  const recipient =
    supplierId === "beautybell"
      ? [store.settings.supplierEmail]
      : ["customer.care@saloncentric.com"];

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl tracking-tight">This week&apos;s order</h1>
          <p className="text-sm text-muted-foreground">
            6-pack when you can. Paul still gets the Avyna and Tailor&apos;s run.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => store.stockSuggestedOrder(supplierId)}
          >
            Fill below-par
          </Button>
          <Button
            variant="ghost"
            onClick={() => store.clearCart(supplierId)}
            disabled={lines.length === 0}
          >
            Clear
          </Button>
        </div>
      </div>

      <Tabs
        value={supplierId}
        onValueChange={(value) => setSupplierId((value as SupplierId) ?? "beautybell")}
      >
        <TabsList>
          <TabsTrigger value="beautybell">Beauty Bell</TabsTrigger>
          <TabsTrigger value="saloncentric">SalonCentric</TabsTrigger>
        </TabsList>
      </Tabs>

      {lines.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Cart is empty for {supplierLabel[supplierId]}. Fill below-par SKUs or add
          from Inventory.
        </p>
      ) : (
        <ul className="grid gap-2">
          {lines.map(({ line, product }) => (
            <li
              key={product.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">
                  {product.brand} {product.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {money(unitPrice(product, line.useSixPack))} each
                  {line.useSixPack ? " · 6-pack" : ""} · line{" "}
                  {money(unitPrice(product, line.useSixPack) * line.qty)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {product.sixPackPrice != null ? (
                  <Badge variant={line.useSixPack ? "secondary" : "outline"}>
                    6-pack
                  </Badge>
                ) : null}
                <input
                  type="number"
                  min={1}
                  className="h-8 w-16 rounded-lg border border-input bg-background px-2 text-sm"
                  value={line.qty}
                  onChange={(e) =>
                    store.setCartQty(product.id, Number(e.target.value))
                  }
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove"
                  onClick={() => store.removeFromCart(product.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Email draft</CardTitle>
          <CardDescription>
            {supplierId === "beautybell"
              ? `To ${store.settings.supplierName} at ${store.settings.supplierEmail}`
              : "SalonCentric desk — paste into their portal if you prefer"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm font-medium">{draft.subject}</p>
          <pre className="whitespace-pre-wrap rounded-xl bg-muted/60 p-4 text-sm leading-relaxed">
            {draft.body}
          </pre>
          <Textarea
            placeholder="Private note on this PO (not emailed)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Estimated total {money(draft.total)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={lines.length === 0}
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    `${draft.subject}\n\n${draft.body}`,
                  );
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
              >
                <Copy />
                {copied ? "Copied" : "Copy"}
              </Button>
              <a
                className={cn(buttonVariants(), lines.length === 0 && "pointer-events-none opacity-50")}
                href={mailtoHref(recipient, draft.subject, draft.body)}
              >
                <Mail />
                Open email
              </a>
              <Button
                disabled={lines.length === 0}
                onClick={() => {
                  const order = orderFromCart(
                    store.products,
                    store.cart,
                    store.settings,
                    supplierId,
                    notes,
                  );
                  if (!order) return;
                  store.saveOrder({ ...order, status: "sent" });
                  store.clearCart(supplierId);
                  setNotes("");
                }}
              >
                Save as sent
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
