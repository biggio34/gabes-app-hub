// Run with `npx tsx --test src/lib/salon-carry-over.integration.test.ts`.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "salon-carry-")), "hub.db")}`;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const purchasing = { canMarkOrdered: true, id: "user-lhp-test", name: "LHP (Test)" };

describe("month-end carry-over", () => {
  it("rolls an ordered shipment once, keeps it ordered, and drops the old row from check-in", async () => {
    const orders = await import("./salon-orders.ts");
    const item = await orders.addItem({
      year: 2026,
      month: 3,
      preferredVendor: "BeautyBell",
      brand: "BeautyBell",
      product: "Color from Germany",
      shade: "6",
      sku: "BB-6",
      qty: 2,
      note: "Ship from Germany",
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    await orders.updateItem(
      item.id,
      {
        status: "ordered",
        orderedQty: 2,
        actualVendor: "BeautyBell",
        vendorOrderNumber: "DE-4401",
      },
      purchasing,
    );
    await orders.updateItem(
      item.id,
      { receivedQty: 1 },
      { canMarkOrdered: true, id: "user-brooke", name: "Brooke" },
    );
    await orders.updateItem(
      item.id,
      { receivedQty: 0 },
      { canMarkOrdered: true, id: "user-brooke", name: "Brooke" },
    );
    const stamped = (await orders.getMonthView(2026, 3)).items.find((row) => row.id === item.id);
    assert.equal(stamped?.receivedByName, "Brooke");
    assert.equal(stamped?.status, "ordered");

    const first = await orders.rollOpenItem(item.id);
    assert.equal(first.rolled, true);
    assert.equal(first.kind, "ordered");
    const history = (await orders.getMonthView(2026, 3)).items.find((row) => row.id === item.id);
    assert.ok(history);
    assert.equal(history.leftover, "moved");
    assert.equal(history.status, "moved");
    assert.equal(history.orderedQty, 0);
    assert.equal(history.qty, 2);
    assert.equal(history.actualVendor, "BeautyBell");
    assert.equal(history.note, "Ship from Germany");

    const next = await orders.getMonthView(2026, 4);
    assert.equal(next.items.length, 1);
    const carried = next.items[0];
    assert.equal(carried.id, first.createdItemId);
    assert.equal(carried.status, "ordered");
    assert.equal(carried.qty, 2);
    assert.equal(carried.orderedQty, 2);
    assert.equal(carried.actualVendor, "BeautyBell");
    assert.equal(carried.vendorOrderNumber, "DE-4401");
    assert.equal(carried.preferredVendor, "BeautyBell");
    assert.equal(carried.sku, "BB-6");
    assert.equal(carried.note, "Ship from Germany");
    assert.equal(carried.note.includes("out of stock"), false);
    assert.equal(carried.requestedByName, "Brooke");
    assert.equal(carried.receivedByName, "");
    assert.equal(carried.receivedQty, 0);

    const waiting = await orders.getCheckInView("user-lhp-test");
    const ids = waiting.groups.flatMap((group) => group.items.map((row) => row.id));
    assert.equal(ids.includes(carried.id), true);
    assert.equal(ids.includes(item.id), false);
    const beauty = waiting.groups.filter((group) =>
      group.items.some((row) => row.vendorOrderNumber === "DE-4401"),
    );
    assert.equal(beauty.length, 1);
    assert.equal(beauty[0].items.length, 1);

    const second = await orders.rollOpenItem(item.id);
    assert.equal(second.rolled, false);
    assert.equal((await orders.getMonthView(2026, 4)).items.length, 1);
    const still = (await orders.getCheckInView("user-lhp-test")).groups.filter((group) =>
      group.items.some((row) => row.vendorOrderNumber === "DE-4401"),
    );
    assert.equal(still.length, 1);
    assert.equal(still[0].items.length, 1);
  });

  it("rolls only the missing qty of a partial, and a purchasing gap stays on check-in", async () => {
    const orders = await import("./salon-orders.ts");
    const partial = await orders.addItem({
      year: 2026,
      month: 2,
      brand: "Redken",
      product: "Shades EQ",
      shade: "6N",
      qty: 4,
      note: "back bar",
      requestedByUserId: "user-lhp",
      requestedByName: "lhp",
    });
    await orders.updateItem(
      partial.id,
      { status: "ordered", orderedQty: 4, actualVendor: "Cosmo", vendorOrderNumber: "P-1" },
      purchasing,
    );
    await orders.updateItem(
      partial.id,
      { receivedQty: 1 },
      { canMarkOrdered: true, id: "user-brooke", name: "Brooke" },
    );
    const rolled = await orders.rollOpenItem(partial.id);
    assert.equal(rolled.kind, "pending");
    const saved = (await orders.getMonthView(2026, 2)).items.find((row) => row.id === partial.id);
    assert.equal(saved?.status, "partial");
    assert.equal(saved?.orderedQty, 4);
    assert.equal(saved?.leftover, "rolled");
    const march = (await orders.getMonthView(2026, 3)).items.find((row) => row.shade === "6N");
    assert.ok(march);
    assert.equal(march.status, "pending");
    assert.equal(march.qty, 3);
    assert.equal(march.orderedQty, 0);
    assert.equal(march.note.includes("Last months out of stock"), false);
    assert.match(march.note, /back bar/);
    const ids = (await orders.getCheckInView("user-brooke")).groups.flatMap((group) =>
      group.items.map((row) => row.id),
    );
    assert.equal(ids.includes(partial.id), false);
    assert.equal(ids.includes(march.id), false);

    const gap = await orders.addItem({
      year: 2026,
      month: 2,
      product: "Gap shade",
      qty: 2,
      requestedByUserId: "user-lhp",
      requestedByName: "lhp",
    });
    await orders.updateItem(
      gap.id,
      { status: "ordered", orderedQty: 1, actualVendor: "Cosmo", vendorOrderNumber: "GAP" },
      purchasing,
    );
    await orders.updateItem(gap.id, { leftover: "rolled" }, { canMarkOrdered: false });
    const gapSaved = (await orders.getMonthView(2026, 2)).items.find((row) => row.id === gap.id);
    assert.equal(gapSaved?.orderedQty, 1);
    assert.equal(gapSaved?.leftover, "rolled");
    const gapWaiting = (await orders.getCheckInView("user-brooke")).groups.flatMap((group) =>
      group.items.map((row) => row.id),
    );
    assert.equal(gapWaiting.includes(gap.id), true);
    const gapNext = (await orders.getMonthView(2026, 3)).items.find((row) => row.product === "Gap shade");
    assert.equal(gapNext?.status, "pending");
    assert.equal(gapNext?.qty, 1);
  });

  it("moves every open row once, undoes it, and skips received rows", async () => {
    const orders = await import("./salon-orders.ts");
    const { MOVE_NOTE } = await import("./salon-order-model.ts");
    const pending = await orders.addItem({
      year: 2026,
      month: 6,
      product: "Pending gloss",
      qty: 1,
      sku: "PG",
      note: "please",
      preferredVendor: "SalonCentric",
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    const cart = await orders.addItem({
      year: 2026,
      month: 6,
      product: "Cart oil",
      qty: 1,
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    await orders.updateItem(cart.id, { status: "in_cart" }, { canMarkOrdered: false });
    const ordered = await orders.addItem({
      year: 2026,
      month: 6,
      product: "Ordered cream",
      qty: 2,
      requestedByUserId: "user-lhp",
      requestedByName: "lhp",
    });
    await orders.updateItem(
      ordered.id,
      { status: "ordered", orderedQty: 2, actualVendor: "Germany Co", vendorOrderNumber: "G-9" },
      purchasing,
    );
    const oos = await orders.addItem({
      year: 2026,
      month: 6,
      product: "Missing powder",
      qty: 1,
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    await orders.updateItem(oos.id, { status: "out_of_stock" }, { canMarkOrdered: false });
    const received = await orders.addItem({
      year: 2026,
      month: 6,
      product: "Already here",
      qty: 1,
      requestedByUserId: "user-lhp",
      requestedByName: "lhp",
    });
    await orders.updateItem(
      received.id,
      { status: "ordered", orderedQty: 1, actualVendor: "Amazon", vendorOrderNumber: "AMZ" },
      purchasing,
    );
    await orders.updateItem(
      received.id,
      { receivedQty: 1 },
      { canMarkOrdered: true, id: "user-brooke", name: "Brooke" },
    );

    await assert.rejects(
      () => orders.moveOpenItemsToNextMonth(2026, 6, { canMarkOrdered: false, id: "user-brooke-test" }),
      /Only purchasing can move a whole month/,
    );
    assert.equal((await orders.getMonthView(2026, 7)).items.length, 0);

    const moved = await orders.moveOpenItemsToNextMonth(2026, 6, purchasing);
    assert.equal(moved.moved, 4);
    assert.ok(moved.undoToken);
    const july = await orders.getMonthView(2026, 7);
    const gloss = july.items.find((row) => row.product === "Pending gloss");
    assert.ok(gloss);
    assert.equal(gloss.status, "pending");
    assert.equal(gloss.sku, "PG");
    assert.equal(gloss.preferredVendor, "SalonCentric");
    assert.equal(gloss.requestedByName, "Brooke");
    assert.equal(gloss.note, "please");
    assert.equal(gloss.note.includes(MOVE_NOTE), false);
    assert.equal(gloss.receivedByName, "");
    assert.equal(july.items.find((row) => row.product === "Cart oil")?.status, "pending");
    assert.equal(july.items.find((row) => row.product === "Cart oil")?.note.includes(MOVE_NOTE), false);
    const cream = july.items.find((row) => row.product === "Ordered cream");
    assert.equal(cream?.status, "ordered");
    assert.equal(cream?.vendorOrderNumber, "G-9");
    assert.equal(cream?.note.includes(MOVE_NOTE), false);
    const powder = july.items.find((row) => row.product === "Missing powder");
    assert.equal(powder?.status, "pending");
    assert.match(powder?.note ?? "", new RegExp(MOVE_NOTE));
    assert.equal(july.items.some((row) => row.product === "Already here"), false);
    const june = await orders.getMonthView(2026, 6);
    const powderHistory = june.items.find((row) => row.id === oos.id);
    assert.equal(powderHistory?.status, "out_of_stock");
    assert.equal(powderHistory?.leftover, "rolled");
    const history = june.items.find((row) => row.id === ordered.id);
    assert.equal(history?.orderedQty, 0);
    assert.equal(history?.leftover, "moved");
    assert.equal(history?.status, "moved");
    const pendingHistory = june.items.find((row) => row.id === pending.id);
    assert.equal(pendingHistory?.leftover, "moved");
    assert.equal(pendingHistory?.status, "moved");

    const again = await orders.moveOpenItemsToNextMonth(2026, 6, purchasing);
    assert.equal(again.moved, 0);
    assert.equal((await orders.getMonthView(2026, 7)).items.length, july.items.length);

    await orders.undoMonthCarry(moved.undoToken, purchasing.id);
    assert.equal((await orders.getMonthView(2026, 7)).items.length, 0);
    const restored = (await orders.getMonthView(2026, 6)).items.find((row) => row.id === ordered.id);
    assert.equal(restored?.status, "ordered");
    assert.equal(restored?.orderedQty, 2);
    assert.equal(restored?.leftover, "");
    const cartRestored = (await orders.getMonthView(2026, 6)).items.find((row) => row.id === cart.id);
    assert.equal(cartRestored?.status, "in_cart");
    const waiting = (await orders.getCheckInView("user-lhp-test")).groups.flatMap((group) =>
      group.items.map((row) => row.id),
    );
    assert.equal(waiting.includes(ordered.id), true);
    assert.equal(waiting.includes(cream?.id ?? ""), false);
  });

  it("refuses undo after the carried row is received", async () => {
    const orders = await import("./salon-orders.ts");
    const item = await orders.addItem({
      year: 2026,
      month: 1,
      product: "Undo block",
      qty: 1,
      requestedByUserId: "user-lhp",
      requestedByName: "lhp",
    });
    await orders.updateItem(
      item.id,
      { status: "ordered", orderedQty: 1, actualVendor: "Vendor", vendorOrderNumber: "U-1" },
      purchasing,
    );
    const moved = await orders.moveOpenItemsToNextMonth(2026, 1, purchasing);
    const created = (await orders.getMonthView(2026, 2)).items.find((row) => row.product === "Undo block");
    assert.ok(created);
    await orders.updateItem(
      created.id,
      { receivedQty: 1 },
      { canMarkOrdered: true, id: "user-brooke", name: "Brooke" },
    );
    await assert.rejects(() => orders.undoMonthCarry(moved.undoToken, purchasing.id), /already received/);
    assert.equal(
      (await orders.getMonthView(2026, 2)).items.some((row) => row.product === "Undo block"),
      true,
    );
    await assert.rejects(
      () => orders.undoMonthCarry(moved.undoToken, "user-brooke-test"),
      /different login/,
    );
  });

  it("does not roll September Redken 06R again when leftover is already rolled", async () => {
    const orders = await import("./salon-orders.ts");
    const { summarizeOpenCarry } = await import("./salon-order-model.ts");
    const item = await orders.addItem({
      year: 2026,
      month: 9,
      brand: "Redken",
      product: "Shades EQ",
      shade: "06R",
      qty: 1,
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    await orders.updateItem(item.id, { status: "out_of_stock" }, { canMarkOrdered: false });
    await orders.updateItem(item.id, { leftover: "rolled" }, { canMarkOrdered: false });

    const october = await orders.getMonthView(2026, 10);
    const carried = october.items.filter((row) => row.shade === "06R");
    assert.equal(carried.length, 1);
    assert.equal(carried[0].status, "pending");

    const september = await orders.getMonthView(2026, 9);
    const source = september.items.find((row) => row.id === item.id);
    assert.equal(source?.leftover, "rolled");
    assert.equal(source?.status, "out_of_stock");
    const summary = summarizeOpenCarry(september.items, september.nextItems);
    assert.equal(summary.total, 0);
    assert.equal(summary.out_of_stock, 0);

    const banner = await orders.moveOutOfStockToNextMonth(2026, 9);
    assert.equal(banner.moved, 0);
    const row = await orders.rollOpenItem(item.id);
    assert.equal(row.rolled, false);
    const bulk = await orders.moveOpenItemsToNextMonth(2026, 9, purchasing);
    assert.equal(bulk.moved, 0);
    assert.equal(
      (await orders.getMonthView(2026, 10)).items.filter((entry) => entry.shade === "06R").length,
      1,
    );
  });

  it("skips an out-of-stock row that already has a carried row even if leftover was not saved", async () => {
    const orders = await import("./salon-orders.ts");
    const { MOVE_NOTE } = await import("./salon-order-model.ts");
    const { summarizeOpenCarry } = await import("./salon-order-model.ts");
    const item = await orders.addItem({
      year: 2026,
      month: 5,
      brand: "Redken",
      product: "Shades EQ",
      shade: "09G",
      qty: 1,
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    await orders.updateItem(item.id, { status: "out_of_stock" }, { canMarkOrdered: false });
    await orders.addItem({
      year: 2026,
      month: 6,
      brand: "Redken",
      product: "Shades EQ",
      shade: "09G",
      qty: 1,
      note: MOVE_NOTE,
      requestedByUserId: "user-brooke",
      requestedByName: "Brooke",
    });
    const before = await orders.getMonthView(2026, 5);
    assert.equal(summarizeOpenCarry(before.items, before.nextItems).total, 0);
    const banner = await orders.moveOutOfStockToNextMonth(2026, 5);
    assert.equal(banner.moved, 0);
    const source = (await orders.getMonthView(2026, 5)).items.find((row) => row.id === item.id);
    assert.equal(source?.leftover, "rolled");
    assert.equal(
      (await orders.getMonthView(2026, 6)).items.filter((row) => row.shade === "09G").length,
      1,
    );
  });
});
