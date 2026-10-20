import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bulkStatusRowPlan,
  canRevertToPending,
  deriveStatus,
  editDetailsPatch,
  editDetailsStatus,
  leftoverAfterStatus,
  moveToPreviousMonthLabel,
  reconcileStatusChoice,
  sharedVendorOrderNumber,
  showMoveToPreviousMonth,
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

describe("editDetailsPatch", () => {
  it("sends the status chosen in Edit details with the other fields", () => {
    const patch = editDetailsPatch(
      draftItem(),
      rowDraft({ actualVendor: "Cosmo", sku: "NEW", qty: "4" }),
      { canMarkOrdered: true, status: "in_cart" },
    );
    assert.equal(patch.status, "in_cart");
    assert.equal(patch.actualVendor, "Cosmo");
    assert.equal(patch.sku, "NEW");
    assert.equal(patch.qty, 4);
  });

  it("saves each settable status, and skips Ordered when the user cannot mark it", () => {
    for (const status of ["pending", "in_cart", "out_of_stock", "ordered"] as const) {
      assert.equal(editDetailsStatus(draftItem(), status, true), status);
    }
    assert.equal(editDetailsStatus(draftItem(), "ordered", false), undefined);
    const denied = editDetailsPatch(draftItem(), rowDraft({ sku: "X" }), {
      canMarkOrdered: false,
      status: "ordered",
    });
    assert.equal("status" in denied, false);
    assert.equal(denied.sku, "X");
    const untouched = editDetailsPatch(draftItem(), rowDraft({ sku: "X" }), {
      canMarkOrdered: true,
    });
    assert.equal("status" in untouched, false);
    assert.equal(editDetailsStatus(draftItem(), undefined, true), undefined);
  });

  it("does not send a status for a moved or rolled source, or a line that is already ordered", () => {
    assert.equal(
      editDetailsStatus(draftItem({ leftover: "moved" }), "in_cart", true),
      undefined,
    );
    assert.equal(
      editDetailsStatus(draftItem({ leftover: "rolled" }), "pending", true),
      undefined,
    );
    assert.equal(
      editDetailsStatus(draftItem({ orderedQty: 2, qty: 2 }), "pending", true),
      undefined,
    );
    const history = editDetailsPatch(
      draftItem({ leftover: "moved", status: "moved" }),
      rowDraft({ actualVendor: "Cosmo", sku: "SRC", qty: "5" }),
      { canMarkOrdered: true, status: "in_cart" },
    );
    assert.equal("status" in history, false);
    assert.equal(history.actualVendor, "Cosmo");
    assert.equal(history.qty, 5);
  });
});

describe("reconcileStatusChoice", () => {
  it("keeps a picked status while a field save reloads the same row status", () => {
    assert.equal(reconcileStatusChoice("in_cart", "pending", "pending"), "in_cart");
    assert.equal(reconcileStatusChoice("in_cart", "pending", "in_cart"), "in_cart");
  });

  it("drops the pick when the saved status changes to something else", () => {
    assert.equal(reconcileStatusChoice("in_cart", "pending", "out_of_stock"), undefined);
    assert.equal(reconcileStatusChoice(undefined, "pending", "in_cart"), undefined);
  });
});

describe("leftoverAfterStatus", () => {
  it("clears line-level out of stock when Pending or Added to cart is chosen", () => {
    assert.equal(leftoverAfterStatus("oos", "pending"), "");
    assert.equal(leftoverAfterStatus("oos", "in_cart"), "");
    assert.equal(leftoverAfterStatus("oos", "out_of_stock"), "oos");
  });

  it("leaves rolled and moved history alone", () => {
    assert.equal(leftoverAfterStatus("rolled", "in_cart"), "rolled");
    assert.equal(leftoverAfterStatus("moved", "pending"), "moved");
    assert.equal(leftoverAfterStatus("moved", "out_of_stock"), "moved");
  });
});

describe("showMoveToPreviousMonth", () => {
  const october = { year: 2026, month: 10 };

  it("shows only for a Pending row in a month after the current one", () => {
    assert.equal(
      showMoveToPreviousMonth({ status: "pending" }, { year: 2026, month: 11 }, october),
      true,
    );
    assert.equal(moveToPreviousMonthLabel(2026, 11), "Move to October 2026");
    assert.equal(moveToPreviousMonthLabel(2027, 1), "Move to December 2026");
  });

  it("hides the current month, past months, and every status that is not Pending", () => {
    assert.equal(
      showMoveToPreviousMonth({ status: "pending" }, october, october),
      false,
    );
    assert.equal(
      showMoveToPreviousMonth({ status: "pending" }, { year: 2026, month: 9 }, october),
      false,
    );
    for (const status of ["in_cart", "ordered", "partial", "received", "out_of_stock", "moved"] as const) {
      assert.equal(
        showMoveToPreviousMonth({ status }, { year: 2026, month: 11 }, october),
        false,
      );
    }
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
