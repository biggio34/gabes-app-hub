// Run with `npx tsx --test src/lib/salon-check-in.integration.test.ts`.
// The default `node --test` runner cannot follow this app's extensionless imports.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "salon-checkin-")), "hub.db")}`;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("supply check-in", () => {
  it("checks in a short box, rolls the rest, and undo removes that rollover", async () => {
    const orders = await import("./salon-orders.ts");
    const item = await orders.addItem({
      year: 2026,
      month: 10,
      preferredVendor: "Cosmo Prof",
      brand: "Redken",
      product: "Shades EQ",
      shade: "6N",
      qty: 4,
      note: "Delivered 9/24 per Cosmo Prof",
      requestedByUserId: "user-lhp",
      requestedByName: "lhp",
    });
    await orders.updateItem(
      item.id,
      {
        status: "ordered",
        orderedQty: 4,
        actualVendor: "Cosmo Prof",
        vendorOrderNumber: "609579103",
      },
      { canMarkOrdered: true, id: "user-lhp", name: "lhp" },
    );
    await assert.rejects(
      () => orders.updateItem(item.id, { orderedQty: 3 }, { canMarkOrdered: false }),
      /can't mark items ordered/,
    );
    await assert.rejects(
      () =>
        orders.bulkUpdateStatus(
          { year: 2026, month: 10, vendor: "Cosmo Prof", status: "ordered" },
          { canMarkOrdered: false },
        ),
      /can't mark items ordered/,
    );

    const before = await orders.getCheckInView("user-brooke-test");
    assert.equal(before.waitingOrders, 1);
    assert.equal(before.groups[0].title, "Cosmo Prof #609579103, 1 item");
    assert.equal(before.groups[0].items[0].note, "Delivered 9/24 per Cosmo Prof");

    const checked = await orders.checkInDeliveries({
      actor: { id: "user-brooke-test", name: "Brooke (Test)" },
      lines: [{ id: item.id, receivedQty: 2, choice: "roll" }],
    });
    assert.equal(checked.checkedIn, 1);
    const month = await orders.getMonthView(2026, 10);
    const updated = month.items.find((row) => row.id === item.id);
    assert.ok(updated);
    assert.equal(updated.receivedQty, 2);
    assert.equal(updated.status, "partial");
    assert.equal(updated.leftover, "rolled");
    assert.equal(updated.receivedByName, "Brooke (Test)");
    assert.match(updated.receivedAt ?? "", /^2026|^20/);

    const next = await orders.getMonthView(2026, 11);
    assert.equal(next.items.length, 1);
    assert.equal(next.items[0].qty, 2);
    assert.equal(next.items[0].status, "pending");

    const { readCheckInUndo } = await import("./salon-check-in-token.ts");
    const snapshots = await readCheckInUndo(checked.undoToken, "user-brooke-test");
    await orders.undoCheckInSnapshots(snapshots);
    const restored = (await orders.getMonthView(2026, 10)).items.find((row) => row.id === item.id);
    assert.ok(restored);
    assert.equal(restored.receivedQty, 0);
    assert.equal(restored.leftover, "");
    assert.equal(restored.status, "ordered");
    assert.equal((await orders.getMonthView(2026, 11)).items.length, 0);

    await orders.checkInDeliveries({
      actor: { id: "user-brooke-test", name: "Brooke (Test)" },
      lines: [{ id: item.id, receivedQty: 4, choice: "roll" }],
    });
    const done = (await orders.getMonthView(2026, 10)).items.find((row) => row.id === item.id);
    assert.equal(done?.status, "received");
    assert.equal(done?.receivedQty, 4);
    assert.equal((await orders.getMonthView(2026, 11)).items.length, 0);
    assert.equal((await orders.getCheckInView("user-brooke-test")).waitingOrders, 0);

    await orders.undoSavedCheckIn(item.id, "user-brooke-test");
    const undone = (await orders.getMonthView(2026, 10)).items.find((row) => row.id === item.id);
    assert.equal(undone?.status, "ordered");
    assert.equal(undone?.receivedQty, 0);
  });

  it("keeps a short line on this order when Wait is chosen", async () => {
    const orders = await import("./salon-orders.ts");
    const item = await orders.addItem({
      year: 2026,
      month: 8,
      product: "Developer",
      qty: 3,
      preferredVendor: "SalonCentric",
      requestedByUserId: "user-lhp",
      requestedByName: "lhp",
    });
    await orders.updateItem(
      item.id,
      { status: "ordered", orderedQty: 3, actualVendor: "SalonCentric", vendorOrderNumber: "44" },
      { canMarkOrdered: true },
    );
    await orders.checkInDeliveries({
      actor: { id: "user-brooke-test", name: "Brooke (Test)" },
      lines: [{ id: item.id, receivedQty: 1, choice: "wait" }],
    });
    const saved = (await orders.getMonthView(2026, 8)).items.find((row) => row.id === item.id);
    assert.equal(saved?.status, "partial");
    assert.equal(saved?.leftover, "wait");
    assert.equal(saved?.receivedQty, 1);
    assert.equal((await orders.getMonthView(2026, 9)).items.length, 0);
  });
});
