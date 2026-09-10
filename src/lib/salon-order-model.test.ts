import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRevertToPending,
  deriveStatus,
  unorderForPending,
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

describe("canRevertToPending", () => {
  it("is true for an ordered line that has not been rolled", () => {
    assert.equal(canRevertToPending({ orderedQty: 2, leftover: "" }), true);
    assert.equal(canRevertToPending({ orderedQty: 2, leftover: "wait" }), true);
    assert.equal(canRevertToPending({ orderedQty: 0, leftover: "" }), false);
    assert.equal(canRevertToPending({ orderedQty: 2, leftover: "rolled" }), false);
  });
});
