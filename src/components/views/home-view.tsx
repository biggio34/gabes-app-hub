"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Bell, PackageMinus, ShoppingCart } from "lucide-react";
import type { AppView } from "@/components/purchasing-app";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { stockStatus, supplierLabel } from "@/lib/catalog";
import { mailtoHref, reminderEmail } from "@/lib/email";
import {
  countdownLabel,
  formatChicago,
  isMondayMorningWindow,
  nextMondayNineCentral,
} from "@/lib/reminder";
import { useStore } from "@/lib/store";

export function HomeView({
  onNavigate,
}: {
  onNavigate: (view: AppView) => void;
}) {
  const store = useStore();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const next = nextMondayNineCentral(now);
  const due = isMondayMorningWindow(now);
  const low = store.products.filter((product) => stockStatus(product) !== "ok");
  const out = low.filter((product) => product.onHand <= 0);
  const openOrders = store.orders.filter((order) => order.status !== "received");
  const ping = reminderEmail(store.settings, low.length);

  return (
    <div className="grid gap-6">
      <section className="overflow-hidden rounded-3xl border border-border bg-[linear-gradient(160deg,oklch(0.93_0.03_80),oklch(0.97_0.01_85)_55%,oklch(0.9_0.04_70))] px-6 py-8 sm:px-8">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          St. Michael · backbar
        </p>
        <h1 className="mt-2 max-w-xl font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
          Monday restock, without the scramble.
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
          This is the Luna Haus purchasing book Grok Build started on your
          computer. Counts, 6-pack orders for Paul, and the 9am Central ping
          now live here.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => onNavigate("order")}>
            Build this week&apos;s order
          </Button>
          <Button variant="outline" onClick={() => onNavigate("bot")}>
            Open purchasing bot
          </Button>
        </div>
      </section>

      {due ? (
        <Card className="border-accent bg-secondary/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-4" />
              Monday 9 Central
            </CardTitle>
            <CardDescription>
              Same ping we tested: if this is on your phone, the weekly check
              is now.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <a
              className={buttonVariants()}
              href={mailtoHref(store.settings.reminderEmails, ping.subject, ping.body)}
            >
              Email the reminder
            </a>
            <Button variant="outline" onClick={() => onNavigate("order")}>
              Review restock
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          label="Below par"
          value={String(low.length)}
          hint={out.length ? `${out.length} completely out` : "Need a look this week"}
          onClick={() => onNavigate("inventory")}
        />
        <Stat
          label="Next ping"
          value={countdownLabel(next, now)}
          hint={formatChicago(next)}
          onClick={() => onNavigate("bot")}
        />
        <Stat
          label="Open orders"
          value={String(openOrders.length)}
          hint={
            store.cart.length
              ? `${store.cart.length} lines sitting in the cart`
              : "Nothing waiting in the cart"
          }
          onClick={() => onNavigate("orders")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Needs a restock</CardTitle>
              <CardDescription>
                Avyna and Tailor&apos;s go to Paul. Redken stays on SalonCentric.
              </CardDescription>
            </div>
            <PackageMinus className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {low.length === 0 ? (
              <Empty>Every SKU is at par. Enjoy the quiet week.</Empty>
            ) : (
              <ul className="grid gap-2">
                {low.slice(0, 8).map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {product.brand} {product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {product.onHand} on hand · par {product.par} ·{" "}
                        {supplierLabel[product.supplierId]}
                      </p>
                    </div>
                    <Badge variant={product.onHand <= 0 ? "destructive" : "secondary"}>
                      {product.onHand <= 0 ? "Out" : "Low"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="ghost"
              className="mt-3 px-0"
              onClick={() => onNavigate("inventory")}
            >
              Full inventory
              <ArrowRight />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paul&apos;s run</CardTitle>
            <CardDescription>
              {store.settings.supplierName} · {store.settings.supplierCompany}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              {store.settings.supplierEmail}
              <span className="text-muted-foreground"> · </span>
              {store.settings.supplierPhone}
            </p>
            <p className="text-muted-foreground">
              June 23 list: Avyna was due for a 5–15% increase. Confirm the
              current sheet before you send. 6-pack pricing is still the best
              price.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  store.stockSuggestedOrder("beautybell");
                  onNavigate("order");
                }}
              >
                <ShoppingCart />
                Fill 6-pack restock
              </Button>
              <a
                className={buttonVariants({ variant: "outline" })}
                href={mailtoHref(store.settings.reminderEmails, ping.subject, ping.body)}
              >
                Preview Monday email
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:bg-secondary/50"
    >
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-heading text-3xl tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
