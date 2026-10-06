import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deliveryGroupTitle,
  deliveryOrderIds,
  displayText,
  formatReceivedStamp,
  groupDeliveries,
  isAwaitingDelivery,
  joinDisplay,
  orderedStillComing,
  planCheckIn,
} from "./salon-check-in.ts";

describe("isAwaitingDelivery", () => {
  it("includes ordered lines that are not fully checked in", () => {
    assert.equal(isAwaitingDelivery({ orderedQty: 3, receivedQty: 0 }), true);
    assert.equal(isAwaitingDelivery({ orderedQty: 3, receivedQty: 2 }), true);
    assert.equal(isAwaitingDelivery({ orderedQty: 3, receivedQty: 3 }), false);
    assert.equal(isAwaitingDelivery({ orderedQty: 0, receivedQty: 0 }), false);
    assert.equal(
      isAwaitingDelivery({ orderedQty: 2, receivedQty: 1, leftover: "rolled" }),
      false,
    );
    assert.equal(
      isAwaitingDelivery({ orderedQty: 2, receivedQty: 1, leftover: "oos" }),
      false,
    );
    assert.equal(
      isAwaitingDelivery({ orderedQty: 2, receivedQty: 1, leftover: "wait" }),
      true,
    );
    assert.equal(orderedStillComing({ orderedQty: 2, receivedQty: 1, leftover: "wait" }), 1);
    assert.equal(
      isAwaitingDelivery({ orderedQty: 2, receivedQty: 0, leftover: "rolled" }),
      true,
    );
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

  it("puts the oldest created line first, even when its month is later", () => {
    const groups = groupDeliveries([
      {
        id: "newer",
        vendor: "Amazon",
        vendorOrderNumber: "later",
        year: 2026,
        month: 2,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "older",
        vendor: "Amazon",
        vendorOrderNumber: "earlier",
        year: 2026,
        month: 10,
        createdAt: "2026-01-15T00:00:00.000Z",
      },
    ]);
    assert.deepEqual(
      groups.map((group) => group.vendorOrderNumber),
      ["earlier", "later"],
    );
  });

  it("breaks timestamp ties by vendor, order number, then id", () => {
    const createdAt = "2026-09-01T00:00:00.000Z";
    const groups = groupDeliveries([
      { id: "c", vendor: "B", vendorOrderNumber: "2", year: 2026, month: 9, createdAt },
      { id: "a", vendor: "A", vendorOrderNumber: "2", year: 2026, month: 9, createdAt },
      { id: "b", vendor: "A", vendorOrderNumber: "1", year: 2026, month: 9, createdAt },
    ]);
    assert.deepEqual(
      groups.map((group) => `${group.vendor}#${group.vendorOrderNumber}`),
      ["A#1", "A#2", "B#2"],
    );
  });
});

describe("delivery group titles", () => {
  it("strips only an exact vendor name or a leading hash", () => {
    assert.equal(
      deliveryGroupTitle("TEST Vendor", "TEST-CHECKIN", 3),
      "TEST Vendor #TEST-CHECKIN, 3 items",
    );
    assert.equal(
      deliveryGroupTitle("Marlo Beauty", "Marlo #1663832-0 (9/24)", 9),
      "Marlo Beauty #Marlo #1663832-0 (9/24), 9 items",
    );
    assert.equal(
      deliveryGroupTitle("Marlo Beauty", "Marlo Beauty #1663832-0 (9/24)", 1),
      "Marlo Beauty #1663832-0 (9/24), 1 item",
    );
    assert.equal(
      deliveryGroupTitle("Cosmo Prof", "609579103", 9),
      "Cosmo Prof #609579103, 9 items",
    );
    assert.equal(
      deliveryGroupTitle("Cosmo Prof", "#609579103", 1),
      "Cosmo Prof #609579103, 1 item",
    );
    assert.deepEqual(deliveryOrderIds("Cosmo Prof", "609579103"), ["609579103"]);
    assert.deepEqual(deliveryOrderIds("TEST Vendor", "TEST-CHECKIN"), ["TEST-CHECKIN"]);
  });

  it("shortens a list of order ids and keeps the full list", () => {
    const raw = [
      "111-1234567-7654321",
      "112-1234567-7654321",
      "113-1234567-7654321",
      "114-1234567-7654321",
    ].join(", ");
    assert.equal(
      deliveryGroupTitle("Amazon", raw, 4),
      "Amazon #111-1234567-7654321 +3 more, 4 items",
    );
    assert.deepEqual(deliveryOrderIds("Amazon", raw), [
      "111-1234567-7654321",
      "112-1234567-7654321",
      "113-1234567-7654321",
      "114-1234567-7654321",
    ]);
  });
});

describe("joinDisplay", () => {
  it("skips blank placeholders", () => {
    assert.equal(displayText("-"), "");
    assert.equal(displayText("—"), "");
    assert.equal(joinDisplay(["-", "28.2oz"]), "28.2oz");
    assert.equal(joinDisplay(["", "28.2oz", "SKU 12"]), "28.2oz · SKU 12");
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
