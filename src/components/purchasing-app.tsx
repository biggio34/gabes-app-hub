"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  ClipboardList,
  House,
  MessageCircle,
  Package,
  ShoppingCart,
} from "lucide-react";
import { StoreProvider, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { HomeView } from "@/components/views/home-view";
import { InventoryView } from "@/components/views/inventory-view";
import { OrderView } from "@/components/views/order-view";
import { OrdersView } from "@/components/views/orders-view";
import { BotView } from "@/components/views/bot-view";
import { SettingsDialog } from "@/components/settings-dialog";

export type AppView = "home" | "inventory" | "order" | "orders" | "bot";

const nav: { id: AppView; label: string; icon: typeof House }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "order", label: "Order", icon: ShoppingCart },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "bot", label: "Bot", icon: MessageCircle },
];

function Shell() {
  const store = useStore();
  const [view, setView] = useState<AppView>("home");
  const cartCount = store.cart.reduce((sum, line) => sum + line.qty, 0);

  const body = useMemo(() => {
    switch (view) {
      case "inventory":
        return <InventoryView />;
      case "order":
        return <OrderView />;
      case "orders":
        return <OrdersView />;
      case "bot":
        return <BotView />;
      default:
        return <HomeView onNavigate={setView} />;
    }
  }, [view]);

  if (!store.ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Opening the backbar books…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setView("home")}
            className="flex items-center gap-3 text-left"
          >
            <span className="flex size-10 items-center justify-center rounded-full border border-accent bg-secondary text-lg">
              ◯
            </span>
            <span>
              <span className="block font-heading text-lg leading-none tracking-tight">
                Luna Haus
              </span>
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Purchasing
              </span>
            </span>
          </button>
          <div className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
                  view === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
                {item.id === "order" && cartCount > 0 ? (
                  <span className="rounded-full bg-accent px-1.5 text-[11px] text-accent-foreground">
                    {cartCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
              <Bell className="size-3.5" />
              Mon 9 Central
            </span>
            <SettingsDialog />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:pb-10">
        {body}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px]",
                view === item.id ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PurchasingApp() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
