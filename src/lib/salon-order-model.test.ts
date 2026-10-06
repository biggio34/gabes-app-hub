import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bulkStatusRowPlan,
  canRevertToPending,
  deriveStatus,
  sharedVendorOrderNumber,
  splitBulkRowSave,
  unorderForPending,
  withUnsavedRowFields,
  type RowDraft,
  type RowDraftItem,
} from "./salon-order-model.ts";

describe("unorderForPending", () => {
  it("clears ordered and received qty so status can become Pending", () => {
    const reverted = unorderForPending({ leftover: "" });
    assert.deepEqual(reverted, { orderedQty: 0, receivedQty: 0, leftover: "" });
    assert.equal(
      deriveStatus({
        qty: 4,
        leftover: reverted.leftover,
        orderedQty: reverted.orderedQty,
        receivedQty: reverted.receivedQty,
        shopping: "pending",
      }),
      "pending",
    );
  });

  it("clears leftover wait or out of stock on the unordered line", () => {
    assert.deepEqual(unorderForPending({ leftover: "wait" }), {
      orderedQty: 0,
      receivedQty: 0,
      leftover: "",
    });
    assert.deepEqual(unorderForPending({ leftover: "oos" }), {
      orderedQty: 0,
      receivedQty: 0,
      leftover: "",
    });
  });

  it("refuses when leftover already rolled to next month", () => {
    assert.throws(
      () => unorderForPending({ leftover: "rolled" }),
      /already rolled to next month/,
    );
  });
});

describe("deriveStatus", () => {
  it("keeps a rolled out-of-stock leftover out of stock and a partial partial", () => {
    assert.equal(
      deriveStatus({ qty: 1, orderedQty: 0, receivedQty: 0, leftover: "rolled" }),
      "out_of_stock",
    );
    assert.equal(
      deriveStatus({ qty: 4, orderedQty: 4, receivedQty: 3, leftover: "rolled" }),
      "partial",
    );
  });

  it("treats a pending, cart, or ordered carry as moved, not out of stock", () => {
    assert.equal(
      deriveStatus({ qty: 1, orderedQty: 0, receivedQty: 0, leftover: "moved" }),
      "moved",
    );
    assert.notEqual(
      deriveStatus({ qty: 2, orderedQty: 0, receivedQty: 0, leftover: "moved" }),
      "out_of_stock",
    );
  });
});

function draftItem(overrides: Partial<RowDraftItem> = {}): RowDraftItem {
  return {
    preferredVendor: "SalonCentric",
    brand: "Moroccanoil",
    product: "Treatment",
    size: "",
    shade: "",
    qty: 2,
    orderedQty: 0,
    leftover: "",
    sku: "",
    note: "",
    actualVendor: "",
    vendorOrderNumber: "",
    ...overrides,
  };
}

function rowDraft(overrides: Partial<RowDraft> = {}): RowDraft {
  return {
    preferredVendor: "SalonCentric",
    brand: "Moroccanoil",
    product: "Treatment",
    size: "",
    shade: "",
    qty: "2",
    sku: "",
    note: "",
    actualVendor: "",
    vendorOrderNumber: "",
    orderedQty: "2",
    ...overrides,
  };
}

describe("withUnsavedRowFields", () => {
  it("keeps a typed order number, sku, and vendor when status changes", () => {
    const patch = withUnsavedRowFields(
      draftItem(),
      rowDraft({
        vendorOrderNumber: "SC-88421",
        sku: "MO-1",
        actualVendor: "SalonCentric",
        orderedQty: "1",
      }),
      { status: "in_cart" },
    );
    assert.equal(patch.status, "in_cart");
    assert.equal(patch.vendorOrderNumber, "SC-88421");
    assert.equal(patch.sku, "MO-1");
    assert.equal(patch.actualVendor, "SalonCentric");
    assert.equal("orderedQty" in patch, false);
    assert.equal("qty" in patch, false);
  });

  it("does not send fields that still match the saved row", () => {
    const patch = withUnsavedRowFields(draftItem(), rowDraft(), { status: "pending" });
    assert.deepEqual(patch, { status: "pending" });
  });

  it("includes a requested qty edit, and skips it once the line is ordered", () => {
    const pending = withUnsavedRowFields(draftItem(), rowDraft({ qty: "4" }), { status: "in_cart" });
    assert.equal(pending.qty, 4);
    const ordered = withUnsavedRowFields(
      draftItem({ orderedQty: 2, qty: 2 }),
      rowDraft({ qty: "9", vendorOrderNumber: "KEEP" }),
      { status: "pending" },
    );
    assert.equal("qty" in ordered, false);
    assert.equal(ordered.vendorOrderNumber, "KEEP");
  });
});

describe("bulkStatusRowPlan", () => {
  it("saves typed text for a group status change without turning qty-going-in into an order", () => {
    const plan = bulkStatusRowPlan(
      draftItem(),
      rowDraft({ vendorOrderNumber: "SC-1", sku: "MO-1", orderedQty: "1" }),
      "in_cart",
    );
    assert.equal(plan.blocked, null);
    assert.equal(plan.save.vendorOrderNumber, "SC-1");
    assert.equal(plan.save.sku, "MO-1");
    assert.equal("orderedQty" in plan.save, false);
    assert.deepEqual(splitBulkRowSave(plan.save), {
      before: { vendorOrderNumber: "SC-1", sku: "MO-1" },
      vendor: {},
    });
  });

  it("holds a group order when leftover is still needed, and keeps a valid partial qty", () => {
    const blocked = bulkStatusRowPlan(
      draftItem({ qty: 4 }),
      rowDraft({ qty: "4", orderedQty: "3", vendorOrderNumber: "SC-9" }),
      "ordered",
    );
    assert.match(blocked.blocked ?? "", /leftover/);
    assert.deepEqual(blocked.save, {});

    const allowed = bulkStatusRowPlan(
      draftItem({ qty: 4, leftover: "wait" }),
      rowDraft({ qty: "4", orderedQty: "3", actualVendor: "CosmoProf", vendorOrderNumber: "SC-9" }),
      "ordered",
    );
    assert.equal(allowed.blocked, null);
    assert.equal(allowed.save.orderedQty, 3);
    assert.equal(allowed.save.vendorOrderNumber, "SC-9");
    assert.deepEqual(splitBulkRowSave(allowed.save).vendor, { actualVendor: "CosmoProf" });
  });

  it("leaves a blank group order number unset so row numbers are not cleared", () => {
    assert.equal(sharedVendorOrderNumber(""), undefined);
    assert.equal(sharedVendorOrderNumber("  "), undefined);
    assert.equal(sharedVendorOrderNumber(" SC-2 "), "SC-2");
  });
});

describe("canRevertToPending", () => {
  it("is true for an ordered line that has not been rolled", () => {
    assert.equal(canRevertToPending({ orderedQty: 2, leftover: "" }), true);
    assert.equal(canRevertToPending({ orderedQty: 2, leftover: "wait" }), true);
    assert.equal(canRevertToPending({ orderedQty: 0, leftover: "" }), false);
    assert.equal(canRevertToPending({ orderedQty: 2, leftover: "rolled" }), false);
  });
});
