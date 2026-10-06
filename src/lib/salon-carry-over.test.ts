import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOVE_NOTE,
  planCarryOver,
  showRollToNextMonth,
  summarizeOpenCarry,
  type CarryItem,
} from "./salon-order-model.ts";

function line(overrides: Partial<CarryItem> & Pick<CarryItem, "leftover">): CarryItem {
  return {
    qty: 1,
    orderedQty: 0,
    receivedQty: 0,
    status: "pending",
    brand: "Redken",
    product: "Shades EQ",
    size: "",
    shade: "06R",
    note: "",
    actualVendor: "",
    vendorOrderNumber: "",
    ...overrides,
  };
}

describe("planCarryOver", () => {
  it("skips a row that was already rolled, and a received row", () => {
    assert.deepEqual(planCarryOver(line({ leftover: "rolled" })), {
      action: "skip",
      reason: "rolled",
    });
    assert.deepEqual(
      planCarryOver(line({ leftover: "", qty: 2, orderedQty: 2, receivedQty: 2 })),
      { action: "skip", reason: "received" },
    );
  });

  it("keeps an unreceived ordered shipment ordered, and rolls only the missing partial qty", () => {
    assert.deepEqual(
      planCarryOver(line({ leftover: "", qty: 2, orderedQty: 2, receivedQty: 0 })),
      { action: "ordered", qty: 2, orderedQty: 2 },
    );
    assert.deepEqual(
      planCarryOver(line({ leftover: "", qty: 4, orderedQty: 4, receivedQty: 1 })),
      { action: "pending", qty: 3 },
    );
  });
});

describe("summarizeOpenCarry", () => {
  it("hides a rolled out-of-stock row even when next month already has the pending carry", () => {
    const september = line({
      leftover: "rolled",
      status: "out_of_stock",
    });
    const october = line({
      leftover: "",
      status: "pending",
      note: MOVE_NOTE,
    });
    const summary = summarizeOpenCarry([september], [october]);
    assert.equal(summary.total, 0);
    assert.equal(summary.out_of_stock, 0);
    assert.equal(showRollToNextMonth(september, [october]), false);
  });

  it("skips an out-of-stock row that already has a carried row, and counts one that does not", () => {
    const already = line({ leftover: "oos", status: "out_of_stock" });
    const fresh = line({
      leftover: "oos",
      status: "out_of_stock",
      shade: "07N",
    });
    const october = line({ leftover: "", status: "pending", note: `back bar · ${MOVE_NOTE}` });
    const summary = summarizeOpenCarry([already, fresh], [october]);
    assert.equal(summary.total, 1);
    assert.equal(summary.out_of_stock, 1);
    assert.equal(showRollToNextMonth(already, [october]), false);
    assert.equal(showRollToNextMonth(fresh, [october]), false);
  });

  it("counts pending, cart, ordered, and partial remainder separately", () => {
    const summary = summarizeOpenCarry(
      [
        line({ leftover: "", status: "pending", shade: "1" }),
        line({ leftover: "", status: "in_cart", shade: "2" }),
        line({
          leftover: "",
          status: "ordered",
          shade: "3",
          qty: 2,
          orderedQty: 2,
          actualVendor: "BeautyBell",
          vendorOrderNumber: "DE-1",
        }),
        line({
          leftover: "",
          status: "partial",
          shade: "4",
          qty: 3,
          orderedQty: 3,
          receivedQty: 1,
        }),
        line({ leftover: "rolled", status: "out_of_stock", shade: "06R" }),
      ],
      [],
    );
    assert.equal(summary.pending, 1);
    assert.equal(summary.in_cart, 1);
    assert.equal(summary.ordered, 1);
    assert.equal(summary.partial, 1);
    assert.equal(summary.out_of_stock, 0);
    assert.equal(summary.total, 4);
  });
});
