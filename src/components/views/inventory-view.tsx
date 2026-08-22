"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoryLabel, money, stockStatus, supplierLabel } from "@/lib/catalog";
import { newProductDefaults, useStore } from "@/lib/store";
import type { Brand, Category, Product, SupplierId } from "@/lib/types";

const brands: Brand[] = ["Avyna", "Tailor's", "Redken", "Custom"];
const categories: Category[] = [
  "color",
  "care",
  "styling",
  "treatment",
  "backbar",
];
const suppliers: SupplierId[] = ["beautybell", "saloncentric", "other"];

export function InventoryView() {
  const store = useStore();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const rows = useMemo(() => {
    return store.products
      .filter((product) => {
        const hay = `${product.name} ${product.brand} ${product.sku ?? ""}`.toLowerCase();
        if (query && !hay.includes(query.toLowerCase())) return false;
        if (brand !== "all" && product.brand !== brand) return false;
        if (status !== "all" && stockStatus(product) !== status) return false;
        return true;
      })
      .sort((a, b) => {
        const rank = { out: 0, low: 1, ok: 2 };
        return (
          rank[stockStatus(a)] - rank[stockStatus(b)] ||
          a.brand.localeCompare(b.brand) ||
          a.name.localeCompare(b.name)
        );
      });
  }, [brand, query, status, store.products]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Counts stay on this computer. Edit them to match the backbar.
          </p>
        </div>
        <ProductDialog />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search shade, brand, SKU"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Select value={brand} onValueChange={(value) => setBrand(value ?? "all")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {brands.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="out">Out</SelectItem>
            <SelectItem value="low">Below par</SelectItem>
            <SelectItem value="ok">At par</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Nothing matches. Clear filters or add a custom SKU.
        </p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((product) => (
            <InventoryRow key={product.id} product={product} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InventoryRow({ product }: { product: Product }) {
  const store = useStore();
  const status = stockStatus(product);

  return (
    <li className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {product.brand} {product.name}
          </p>
          <Badge variant={status === "out" ? "destructive" : status === "low" ? "secondary" : "outline"}>
            {status === "out" ? "Out" : status === "low" ? "Low" : "OK"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {categoryLabel[product.category]} · {supplierLabel[product.supplierId]} ·{" "}
          {money(product.singlePrice)}
          {product.sixPackPrice != null
            ? ` · 6-pack ${money(product.sixPackPrice)}`
            : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Stepper
          label="On hand"
          value={product.onHand}
          onChange={(value) => store.setOnHand(product.id, value)}
        />
        <Stepper
          label="Par"
          value={product.par}
          onChange={(value) => store.setPar(product.id, value)}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            store.addToCart(
              product.id,
              product.sixPackPrice != null ? 6 : 1,
              product.sixPackPrice != null,
            )
          }
        >
          Add
        </Button>
      </div>
    </li>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border px-1.5 py-1">
      <span className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={() => onChange(value - 1)}
        aria-label={`Decrease ${label}`}
      >
        −
      </Button>
      <span className="w-6 text-center text-sm">{value}</span>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={() => onChange(value + 1)}
        aria-label={`Increase ${label}`}
      >
        +
      </Button>
    </div>
  );
}

function ProductDialog() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(newProductDefaults);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(newProductDefaults());
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <Plus />
            Add product
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a backbar SKU</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Brand">
              <Select
                value={draft.brand}
                onValueChange={(value) =>
                  setDraft({ ...draft, brand: (value as Brand) ?? "Custom" })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category">
              <Select
                value={draft.category}
                onValueChange={(value) =>
                  setDraft({ ...draft, category: (value as Category) ?? "care" })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((item) => (
                    <SelectItem key={item} value={item}>
                      {categoryLabel[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Supplier">
            <Select
              value={draft.supplierId}
              onValueChange={(value) =>
                setDraft({ ...draft, supplierId: (value as SupplierId) ?? "other" })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((item) => (
                  <SelectItem key={item} value={item}>
                    {supplierLabel[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="On hand">
              <Input
                type="number"
                value={draft.onHand}
                onChange={(e) =>
                  setDraft({ ...draft, onHand: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Par">
              <Input
                type="number"
                value={draft.par}
                onChange={(e) =>
                  setDraft({ ...draft, par: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Price">
              <Input
                type="number"
                step="0.01"
                value={draft.singlePrice}
                onChange={(e) =>
                  setDraft({ ...draft, singlePrice: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <Button
            disabled={!draft.name.trim()}
            onClick={() => {
              store.addProduct(draft);
              setOpen(false);
            }}
          >
            Save product
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
