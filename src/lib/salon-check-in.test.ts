import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deliveryGroupTitle,
  formatReceivedStamp,
  groupDeliveries,
  isAwaitingDelivery,
  planCheckIn,
} from "./salon-check-in.ts";

describe("isAwaitingDelivery", () => {
  it("includes ordered lines that are not fully checked in", () => {
    assert.equal(isAwaitingDelivery({ orderedQty: 3, receivedQty: 0 }), true);
    assert.equal(isAwaitingDelivery({ orderedQty: 3, receivedQty: 2 }), true);
    assert.equal(isAwaitingDelivery({ orderedQty: 3, receivedQty: 3 }), false);
    assert.equal(isAwaitingDelivery({ orderedQty: 0, receivedQty: 0 }), false);
  });
});

describe("groupDeliveries", () => {
  it("groups by vendor and order number, oldest first", () => {
    const groups = groupDeliveries([
      {
        id: "new",
        vendor: "Cosmo Prof",
        vendorOrderNumber: "609579103",
        year: 2026,
        month: 10,
        createdAt: "2026-10-02T00:00:00.000Z",
      },
      {
        id: "blank",
        vendor: "Cosmo Prof",
        vendorOrderNumber: "",
        year: 2026,
        month: 9,
        createdAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "old",
        vendor: "Cosmo Prof",
        vendorOrderNumber: "609579103",
        year: 2026,
        month: 9,
        createdAt: "2026-09-02T00:00:00.000Z",
      },
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].vendorOrderNumber, "");
    assert.equal(deliveryGroupTitle(groups[0].vendor, groups[0].vendorOrderNumber, 1), "Cosmo Prof, 1 item");
    assert.equal(groups[1].items.map((item) => item.id).join(","), "old,new");
    assert.equal(
      deliveryGroupTitle("Cosmo Prof", "609579103", 9),
      "Cosmo Prof #609579103, 9 items",
    );
  });
});

describe("planCheckIn", () => {
  const ordered = { qty: 4, orderedQty: 4, receivedQty: 0, leftover: "" as const };

  it("prefills a full box without rolling", () => {
    assert.deepEqual(planCheckIn(ordered, 4, "roll"), {
      action: "receive",
      receivedQty: 4,
      rollRemainder: false,
      extraRollQty: 0,
      setWait: false,
    });
  });

  it("rolls a short delivery with the existing remainder", () => {
    assert.deepEqual(planCheckIn(ordered, 2, "roll"), {
      action: "receive",
      receivedQty: 2,
      rollRemainder: true,
      extraRollQty: 0,
      setWait: false,
    });
  });

  it("waits instead of rolling when the vendor will ship the rest", () => {
    assert.equal(planCheckIn(ordered, 2, "wait").action, "receive");
    const plan = planCheckIn(ordered, 2, "wait");
    assert.equal(plan.action === "receive" && plan.setWait, true);
    assert.equal(plan.action === "receive" && plan.rollRemainder, false);
  });

  it("adds only the new shortfall when purchasing already rolled the gap", () => {
    const plan = planCheckIn(
      { qty: 5, orderedQty: 3, receivedQty: 0, leftover: "rolled" },
      1,
      "roll",
    );
    assert.deepEqual(plan, {
      action: "receive",
      receivedQty: 1,
      rollRemainder: false,
      extraRollQty: 2,
      setWait: false,
    });
  });

  it("skips a line left at zero", () => {
    assert.deepEqual(planCheckIn(ordered, 0, "roll"), { action: "skip" });
  });
});

describe("formatReceivedStamp", () => {
  it("uses the Chicago calendar date", () => {
    assert.equal(
      formatReceivedStamp("Brooke", "2026-10-06T15:00:00.000Z"),
      "Received by Brooke, 10/6",
    );
  });
});
