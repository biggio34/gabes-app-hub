"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { defaultSettings, restockQty, seedProducts } from "./catalog";
import type {
  AppState,
  Brand,
  Category,
  ChatMessage,
  Product,
  PurchaseOrder,
  Settings,
  SupplierId,
} from "./types";

const STORAGE_KEY = "luna-haus-purchasing-v1";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function welcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "bot",
    createdAt: new Date().toISOString(),
    text: "I’m the purchasing bot for Luna Haus. I took over the Grok Build chat. Ask me what’s low, to build Paul’s 6-pack order, or to draft the Monday 9 Central ping.",
  };
}

function emptyState(): AppState {
  return {
    products: seedProducts,
    cart: [],
    orders: [],
    settings: defaultSettings,
    messages: [welcomeMessage()],
    reminderArmed: true,
  };
}

function loadState(): AppState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...emptyState(),
      ...parsed,
      settings: { ...defaultSettings, ...parsed.settings },
      products: parsed.products?.length ? parsed.products : seedProducts,
      messages: parsed.messages?.length ? parsed.messages : [welcomeMessage()],
    };
  } catch {
    return emptyState();
  }
}

type Store = AppState & {
  ready: boolean;
  setOnHand: (id: string, onHand: number) => void;
  setPar: (id: string, par: number) => void;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  addProduct: (product: Omit<Product, "id">) => void;
  removeProduct: (id: string) => void;
  addToCart: (productId: string, qty: number, useSixPack: boolean) => void;
  setCartQty: (productId: string, qty: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: (supplierId?: SupplierId) => void;
  stockSuggestedOrder: (supplierId?: SupplierId) => void;
  saveOrder: (order: PurchaseOrder) => void;
  setOrderStatus: (id: string, status: PurchaseOrder["status"]) => void;
  receiveOrder: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  addMessage: (role: ChatMessage["role"], text: string) => void;
  resetCatalog: () => void;
  setReminderArmed: (armed: boolean) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // localStorage is not available during SSR; hydrate once on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client storage hydration
    setState(loadState());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  const api = useMemo<Store>(
    () => ({
      ...state,
      ready,
      setOnHand(id, onHand) {
        setState((prev) => ({
          ...prev,
          products: prev.products.map((product) =>
            product.id === id
              ? { ...product, onHand: Math.max(0, onHand) }
              : product,
          ),
        }));
      },
      setPar(id, par) {
        setState((prev) => ({
          ...prev,
          products: prev.products.map((product) =>
            product.id === id ? { ...product, par: Math.max(0, par) } : product,
          ),
        }));
      },
      updateProduct(id, patch) {
        setState((prev) => ({
          ...prev,
          products: prev.products.map((product) =>
            product.id === id ? { ...product, ...patch, id: product.id } : product,
          ),
        }));
      },
      addProduct(product) {
        setState((prev) => ({
          ...prev,
          products: [
            ...prev.products,
            {
              ...product,
              id: uid("sku"),
            },
          ],
        }));
      },
      removeProduct(id) {
        setState((prev) => ({
          ...prev,
          products: prev.products.filter((product) => product.id !== id),
          cart: prev.cart.filter((line) => line.productId !== id),
        }));
      },
      addToCart(productId, qty, useSixPack) {
        setState((prev) => {
          const existing = prev.cart.find((line) => line.productId === productId);
          if (existing) {
            return {
              ...prev,
              cart: prev.cart.map((line) =>
                line.productId === productId
                  ? {
                      ...line,
                      qty: line.qty + qty,
                      useSixPack: useSixPack || line.useSixPack,
                    }
                  : line,
              ),
            };
          }
          return {
            ...prev,
            cart: [...prev.cart, { productId, qty, useSixPack }],
          };
        });
      },
      setCartQty(productId, qty) {
        setState((prev) => ({
          ...prev,
          cart:
            qty <= 0
              ? prev.cart.filter((line) => line.productId !== productId)
              : prev.cart.map((line) =>
                  line.productId === productId ? { ...line, qty } : line,
                ),
        }));
      },
      removeFromCart(productId) {
        setState((prev) => ({
          ...prev,
          cart: prev.cart.filter((line) => line.productId !== productId),
        }));
      },
      clearCart(supplierId) {
        setState((prev) => ({
          ...prev,
          cart: supplierId
            ? prev.cart.filter((line) => {
                const product = prev.products.find((item) => item.id === line.productId);
                return product?.supplierId !== supplierId;
              })
            : [],
        }));
      },
      stockSuggestedOrder(supplierId) {
        setState((prev) => {
          const next = new Map(prev.cart.map((line) => [line.productId, line]));
          for (const product of prev.products) {
            if (supplierId && product.supplierId !== supplierId) continue;
            const qty = restockQty(product, true);
            if (qty <= 0) continue;
            next.set(product.id, {
              productId: product.id,
              qty,
              useSixPack: product.sixPackPrice != null,
            });
          }
          return { ...prev, cart: [...next.values()] };
        });
      },
      saveOrder(order) {
        setState((prev) => ({
          ...prev,
          orders: [order, ...prev.orders],
        }));
      },
      setOrderStatus(id, status) {
        setState((prev) => ({
          ...prev,
          orders: prev.orders.map((order) =>
            order.id === id ? { ...order, status } : order,
          ),
        }));
      },
      receiveOrder(id) {
        setState((prev) => {
          const order = prev.orders.find((item) => item.id === id);
          if (!order) return prev;
          const counts = new Map(
            order.lines.map((line) => [line.productId, line.qty]),
          );
          return {
            ...prev,
            orders: prev.orders.map((item) =>
              item.id === id ? { ...item, status: "received" } : item,
            ),
            products: prev.products.map((product) =>
              counts.has(product.id)
                ? {
                    ...product,
                    onHand: product.onHand + (counts.get(product.id) ?? 0),
                  }
                : product,
            ),
          };
        });
      },
      updateSettings(patch) {
        setState((prev) => ({
          ...prev,
          settings: { ...prev.settings, ...patch },
        }));
      },
      addMessage(role, text) {
        const message: ChatMessage = {
          id: uid("msg"),
          role,
          text,
          createdAt: new Date().toISOString(),
        };
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, message],
        }));
      },
      resetCatalog() {
        setState((prev) => ({
          ...prev,
          products: seedProducts,
          cart: [],
        }));
      },
      setReminderArmed(armed) {
        setState((prev) => ({ ...prev, reminderArmed: armed }));
      },
    }),
    [ready, state],
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}

export function newProductDefaults(): Omit<Product, "id"> {
  return {
    name: "",
    brand: "Custom" as Brand,
    category: "care" as Category,
    supplierId: "other",
    unit: "each",
    singlePrice: 0,
    onHand: 0,
    par: 1,
  };
}
