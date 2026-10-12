// Run with `npx tsx --test src/lib/salon-status-draft.integration.test.ts`.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { editDetailsPatch, type SettableStatus } from "./salon-order-model.ts";

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "salon-status-")), "hub.db")}`;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const purchasing = { canMarkOrdered: true, id: "user-lhp-test", name: "LHP (Test)" };

describe("status save keeps typed row fields", () => {
  it("stores the order number, sku, and vendor in the same update as status", async () => {
    const orders = await import("./salon-orders.ts");
    const item = await orders.addItem({
      year: 2026,
      month: 8,
      preferredVendor: "SalonCentric",
      brand: "Moroccanoil",
      product: "Treatment",
      qty: 1,
      requestedByUserId: purchasing.id,
      requestedByName: purchasing.name,
    });
    const saved = await orders.updateItem(
      item.id,
      {
        status: "in_cart",
        vendorOrderNumber: "SC-88421",
        sku: "MO-1",
        actualVendor: "SalonCentric",
      },
      purchasing,
    );
    assert.equal(saved.status, "in_cart");
    assert.equal(saved.vendorOrderNumber, "SC-88421");
    assert.equal(saved.sku, "MO-1");
    assert.equal(saved.actualVendor, "SalonCentric");
    const again = (await orders.getMonthView(2026, 8)).items.find((row) => row.id === item.id);
    assert.equal(again?.vendorOrderNumber, "SC-88421");
    assert.equal(again?.status, "in_cart");
  });

  it("does not clear a saved order number when the group status omits one", async () => {
    const orders = await import("./salon-orders.ts");
    const item = await orders.addItem({
      year: 2026,
      month: 8,
      preferredVendor: "Pureology",
      brand: "Pureology",
      product: "Hydrate",
      qty: 2,
      requestedByUserId: purchasing.id,
      requestedByName: purchasing.name,
    });
    await orders.updateItem(
      item.id,
      { vendorOrderNumber: "ROW-1", sku: "SKU-9" },
      purchasing,
    );
    const updated = await orders.bulkUpdateStatus(
      {
        year: 2026,
        month: 8,
        vendor: "Pureology",
        status: "in_cart",
        fromStatus: "pending",
      },
      purchasing,
    );
    assert.equal(updated, 1);
    const row = (await orders.getMonthView(2026, 8)).items.find((entry) => entry.id === item.id);
    assert.equal(row?.status, "in_cart");
    assert.equal(row?.vendorOrderNumber, "ROW-1");
    assert.equal(row?.sku, "SKU-9");
  });
});

describe("Edit details saves the chosen status", { concurrency: false }, () => {
  const statuses = ["pending", "in_cart", "out_of_stock", "ordered"] as const satisfies readonly SettableStatus[];

  it("persists each settable status on a carried row and leaves the moved source as history", async () => {
    const orders = await import("./salon-orders.ts");
    for (const status of statuses) {
      await orders.addItem({
        year: 2026,
        month: 9,
        product: `Carry ${status}`,
        brand: "Redken",
        qty: 2,
        sku: "OLD",
        preferredVendor: "SalonCentric",
        requestedByUserId: "user-brooke",
        requestedByName: "Brooke",
      });
    }
    await orders.moveOpenItemsToNextMonth(2026, 9, purchasing);
    const october = await orders.getMonthView(2026, 10);
    for (const status of statuses) {
      const row = october.items.find((item) => item.product === `Carry ${status}`);
      assert.ok(row);
      assert.equal(row.status, "pending");
      const patch = editDetailsPatch(
        row,
        {
          preferredVendor: row.preferredVendor,
          brand: row.brand,
          product: row.product,
          size: row.size,
          shade: row.shade,
          qty: "3",
          sku: `SKU-${status}`,
          note: row.note,
          actualVendor: "Cosmo Prof",
          vendorOrderNumber: "",
          orderedQty: String(row.qty),
        },
        { canMarkOrdered: true, status },
      );
      assert.equal(patch.status, status);
      const saved = await orders.updateItem(row.id, patch, purchasing);
      assert.equal(saved.status, status);
      assert.equal(saved.actualVendor, "Cosmo Prof");
      assert.equal(saved.sku, `SKU-${status}`);
      assert.equal(saved.qty, 3);
      if (status === "ordered") assert.equal(saved.orderedQty, 3);
      if (status === "out_of_stock") assert.equal(saved.leftover, "oos");
    }
    const again = await orders.getMonthView(2026, 10);
    for (const status of statuses) {
      assert.equal(again.items.find((item) => item.product === `Carry ${status}`)?.status, status);
    }
  });

  it("lets Edit details move an out-of-stock carried row back to Pending and Added to cart", async () => {
    const orders = await import("./salon-orders.ts");
    const saved = (await orders.getMonthView(2026, 10)).items.find(
      (item) => item.product === "Carry out_of_stock",
    );
    assert.ok(saved);
    const pending = editDetailsPatch(
      saved,
      {
        preferredVendor: saved.preferredVendor,
        brand: saved.brand,
        product: saved.product,
        size: "",
        shade: "",
        qty: String(saved.qty),
        sku: saved.sku,
        note: saved.note,
        actualVendor: saved.actualVendor,
        vendorOrderNumber: "",
        orderedQty: "1",
      },
      { canMarkOrdered: false, status: "pending" },
    );
    const back = await orders.updateItem(saved.id, pending, { canMarkOrdered: false });
    assert.equal(back.status, "pending");
    assert.equal(back.leftover, "");
    const cart = await orders.updateItem(saved.id, { ...pending, status: "in_cart" }, {
      canMarkOrdered: false,
    });
    assert.equal(cart.status, "in_cart");
  });

  it("keeps a moved September source as history when Edit details is saved", async () => {
    const orders = await import("./salon-orders.ts");
    const september = await orders.getMonthView(2026, 9);
    const source = september.items.find((item) => item.product === "Carry in_cart");
    assert.ok(source);
    assert.equal(source.status, "moved");
    assert.equal(source.leftover, "moved");
    const patch = editDetailsPatch(
      source,
      {
        preferredVendor: source.preferredVendor,
        brand: source.brand,
        product: source.product,
        size: "",
        shade: "",
        qty: "4",
        sku: "SRC",
        note: source.note,
        actualVendor: "Other",
        vendorOrderNumber: "",
        orderedQty: "1",
      },
      { canMarkOrdered: true, status: "in_cart" },
    );
    assert.equal("status" in patch, false);
    const saved = await orders.updateItem(source.id, patch, purchasing);
    assert.equal(saved.status, "moved");
    assert.equal(saved.leftover, "moved");
    assert.equal(saved.sku, "SRC");
    const forced = await orders.updateItem(source.id, { status: "pending" }, purchasing);
    assert.equal(forced.status, "moved");
    assert.equal(forced.leftover, "moved");
  });

  it("refuses Ordered from Edit details for someone who cannot mark ordered", async () => {
    const orders = await import("./salon-orders.ts");
    const row = (await orders.getMonthView(2026, 10)).items.find(
      (item) => item.product === "Carry pending",
    );
    assert.ok(row);
    assert.equal(row.status, "pending");
    await assert.rejects(
      () =>
        orders.updateItem(
          row.id,
          { status: "ordered", actualVendor: "Nope", sku: "NO" },
          { canMarkOrdered: false },
        ),
      /can't mark items ordered/,
    );
    const unchanged = (await orders.getMonthView(2026, 10)).items.find((item) => item.id === row.id);
    assert.equal(unchanged?.status, "pending");
    assert.equal(unchanged?.sku, "SKU-pending");
  });

  it("keeps a row-dropdown status when a later field save omits it", async () => {
    const orders = await import("./salon-orders.ts");
    const row = (await orders.getMonthView(2026, 10)).items.find(
      (item) => item.product === "Carry pending",
    );
    assert.ok(row);
    const picked = await orders.updateItem(row.id, { status: "in_cart" }, { canMarkOrdered: false });
    assert.equal(picked.status, "in_cart");
    const fields = await orders.updateItem(
      row.id,
      { actualVendor: "Dropdown Vendor", sku: "DROP", qty: 2 },
      { canMarkOrdered: false },
    );
    assert.equal(fields.status, "in_cart");
    assert.equal(fields.sku, "DROP");
  });
});
