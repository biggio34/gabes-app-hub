// Run with `npx tsx --test src/lib/salon-move-previous.integration.test.ts`.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "salon-move-prev-")), "hub.db")}`;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const today = { year: 2026, month: 10 };
const purchasing = { canMarkOrdered: true, id: "user-lhp-test", name: "LHP (Test)" };

describe("move a pending row to the previous month", () => {
  it("moves the same row, keeps every field, and a second click does not walk back again", async () => {
    const orders = await import("./salon-orders.ts");
    const { summarizeOpenCarry } = await import("./salon-order-model.ts");
    const staying = await orders.addItem({
      year: 2026,
      month: 11,
      product: "Stays in November",
      qty: 1,
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    const item = await orders.addItem({
      year: 2026,
      month: 11,
      preferredVendor: "SalonCentric",
      brand: "Moroccanoil",
      product: "Treatment",
      size: "100 ml",
      shade: "—",
      sku: "MO-100",
      qty: 3,
      note: "wrong month",
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    const ordered = await orders.addItem({
      year: 2026,
      month: 11,
      product: "Already ordered",
      qty: 1,
      requestedByUserId: "user-lhp",
      requestedByName: "lhp",
    });
    await orders.updateItem(
      ordered.id,
      { status: "ordered", orderedQty: 1, actualVendor: "CosmoProf", vendorOrderNumber: "CP-11" },
      purchasing,
    );
    const first = await orders.moveItemToPreviousMonth(item.id, { year: 2026, month: 11 }, today);
    assert.equal(first.moved, true);
    assert.deepEqual({ year: first.year, month: first.month }, { year: 2026, month: 10 });

    const november = await orders.getMonthView(2026, 11);
    const october = await orders.getMonthView(2026, 10);
    assert.equal(november.items.some((row) => row.id === item.id), false);
    assert.equal(november.items.some((row) => row.id === staying.id), true);
    assert.equal(october.items.filter((row) => row.id === item.id).length, 1);
    const moved = october.items.find((row) => row.id === item.id);
    assert.ok(moved);
    assert.equal(moved.status, "pending");
    assert.equal(moved.qty, 3);
    assert.equal(moved.orderedQty, 0);
    assert.equal(moved.receivedQty, 0);
    assert.equal(moved.leftover, "");
    assert.equal(moved.note, "wrong month");
    assert.equal(moved.note.includes("Moved"), false);
    assert.equal(moved.sku, "MO-100");
    assert.equal(moved.preferredVendor, "SalonCentric");
    assert.equal(moved.brand, "Moroccanoil");
    assert.equal(moved.product, "Treatment");
    assert.equal(moved.size, "100 ml");
    assert.equal(moved.shade, "—");
    assert.equal(moved.requestedByUserId, "user-brooke");
    assert.equal(moved.requestedByName, "Brooke");
    assert.equal(moved.createdAt, item.createdAt);
    assert.equal(october.items.some((row) => row.status === "moved"), false);
    assert.equal(november.items.some((row) => row.leftover === "moved"), false);

    const waitingIds = (await orders.getCheckInView("user-brooke")).groups.flatMap((group) =>
      group.items.map((row) => row.id),
    );
    assert.equal(waitingIds.filter((id) => id === ordered.id).length, 1);
    assert.equal(waitingIds.includes(item.id), false);
    assert.equal(waitingIds.includes(staying.id), false);

    const novemberCarry = summarizeOpenCarry(
      november.items.filter((row) => row.id === item.id),
      [],
    );
    const octoberCarry = summarizeOpenCarry(
      october.items.filter((row) => row.id === item.id),
      november.items,
    );
    assert.equal(novemberCarry.total, 0);
    assert.equal(octoberCarry.pending, 1);
    assert.equal(octoberCarry.total, 1);
    assert.equal(october.items.filter((row) => row.product === "Treatment").length, 1);

    const second = await orders.moveItemToPreviousMonth(item.id, { year: 2026, month: 11 }, today);
    assert.equal(second.moved, false);
    const octoberAgain = await orders.getMonthView(2026, 10);
    assert.equal(octoberAgain.items.filter((row) => row.id === item.id).length, 1);
    assert.equal(octoberAgain.items.find((row) => row.id === item.id)?.updatedAt, moved.updatedAt);
    const september = await orders.getMonthView(2026, 9);
    assert.equal(september.items.some((row) => row.id === item.id), false);
  });

  it("rejects in cart, ordered, out of stock, and moved history", async () => {
    const orders = await import("./salon-orders.ts");
    const cart = await orders.addItem({
      year: 2026,
      month: 12,
      product: "Cart oil",
      qty: 1,
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    await orders.updateItem(cart.id, { status: "in_cart" }, { canMarkOrdered: false });
    const ordered = await orders.addItem({
      year: 2026,
      month: 12,
      product: "Ordered cream",
      qty: 2,
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    await orders.updateItem(
      ordered.id,
      { status: "ordered", orderedQty: 2, actualVendor: "SalonCentric", vendorOrderNumber: "SC-1" },
      purchasing,
    );
    const oos = await orders.addItem({
      year: 2026,
      month: 12,
      product: "Missing powder",
      qty: 1,
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    await orders.updateItem(oos.id, { status: "out_of_stock" }, { canMarkOrdered: false });
    const history = await orders.addItem({
      year: 2026,
      month: 12,
      product: "Rolled gloss",
      qty: 1,
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    await orders.rollOpenItem(history.id);

    for (const id of [cart.id, ordered.id, oos.id, history.id]) {
      await assert.rejects(
        () => orders.moveItemToPreviousMonth(id, { year: 2026, month: 12 }, today),
        /Only a Pending request/,
      );
    }

    const december = await orders.getMonthView(2026, 12);
    assert.equal(december.items.find((row) => row.id === cart.id)?.status, "in_cart");
    assert.equal(december.items.find((row) => row.id === ordered.id)?.status, "ordered");
    assert.equal(december.items.find((row) => row.id === oos.id)?.status, "out_of_stock");
    assert.equal(december.items.find((row) => row.id === history.id)?.status, "moved");
    assert.equal(december.items.find((row) => row.id === history.id)?.leftover, "moved");
    const november = await orders.getMonthView(2026, 11);
    for (const id of [cart.id, ordered.id, oos.id, history.id]) {
      assert.equal(november.items.some((row) => row.id === id), false);
    }
  });

  it("refuses the current month and a past month so nothing moves into a closed month", async () => {
    const orders = await import("./salon-orders.ts");
    const current = await orders.addItem({
      year: 2026,
      month: 10,
      product: "October pending",
      qty: 2,
      sku: "OCT",
      note: "this month",
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    const past = await orders.addItem({
      year: 2026,
      month: 9,
      product: "September pending",
      qty: 1,
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });

    await assert.rejects(
      () => orders.moveItemToPreviousMonth(current.id, { year: 2026, month: 10 }, today),
      /future month/,
    );
    await assert.rejects(
      () => orders.moveItemToPreviousMonth(past.id, { year: 2026, month: 9 }, today),
      /future month/,
    );

    const october = await orders.getMonthView(2026, 10);
    const saved = october.items.find((row) => row.id === current.id);
    assert.ok(saved);
    assert.equal(saved.status, "pending");
    assert.equal(saved.qty, 2);
    assert.equal(saved.sku, "OCT");
    assert.equal(saved.note, "this month");
    assert.equal((await orders.getMonthView(2026, 9)).items.some((row) => row.id === current.id), false);
    assert.equal(await orders.getOrderByYearMonth(2026, 8), null);
    assert.equal((await orders.getMonthView(2026, 9)).items.find((row) => row.id === past.id)?.status, "pending");
  });

  it("creates the previous month when needed and does not merge with a row already there", async () => {
    const orders = await import("./salon-orders.ts");
    const existing = await orders.addItem({
      year: 2026,
      month: 12,
      product: "Treatment",
      qty: 1,
      note: "already here",
      requestedByUserId: "user-lhp",
      requestedByName: "lhp",
    });
    const added = await orders.addItem({
      year: 2027,
      month: 1,
      product: "Treatment",
      qty: 4,
      note: "belongs in December",
      sku: "JAN",
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    const moved = await orders.moveItemToPreviousMonth(added.id, { year: 2027, month: 1 }, today);
    assert.equal(moved.moved, true);
    const december = await orders.getMonthView(2026, 12);
    const treatments = december.items.filter((row) => row.product === "Treatment");
    assert.equal(treatments.length, 2);
    assert.equal(treatments.find((row) => row.id === existing.id)?.qty, 1);
    const relocated = treatments.find((row) => row.id === added.id);
    assert.ok(relocated);
    assert.equal(relocated.qty, 4);
    assert.equal(relocated.sku, "JAN");
    assert.equal(relocated.note, "belongs in December");
    assert.equal(relocated.status, "pending");
    assert.equal((await orders.getMonthView(2027, 1)).items.some((row) => row.id === added.id), false);

    const again = await orders.moveItemToPreviousMonth(added.id, { year: 2027, month: 1 }, today);
    assert.equal(again.moved, false);
    assert.equal((await orders.getMonthView(2026, 11)).items.some((row) => row.id === added.id), false);
  });
});
