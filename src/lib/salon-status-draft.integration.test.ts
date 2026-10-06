// Run with `npx tsx --test src/lib/salon-status-draft.integration.test.ts`.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

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
