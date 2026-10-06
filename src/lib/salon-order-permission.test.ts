import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { canMarkOrdered, patchSetsOrderedQty } from "./salon-order-permission.ts";

const original = process.env.SALON_CAN_MARK_ORDERED;

afterEach(() => {
  if (original === undefined) delete process.env.SALON_CAN_MARK_ORDERED;
  else process.env.SALON_CAN_MARK_ORDERED = original;
});

describe("canMarkOrdered", () => {
  it("allows the owner and the lhp login", () => {
    assert.equal(canMarkOrdered({ role: "owner", username: "gabe", id: "user-gabe" }), true);
    assert.equal(canMarkOrdered({ role: "member", username: "lhp", id: "user-lhp" }), true);
    assert.equal(canMarkOrdered({ role: "member", username: "LHP", id: "user-lhp" }), true);
    assert.equal(
      canMarkOrdered({ role: "member", username: "lhp-test", id: "user-lhp-test" }),
      true,
    );
    assert.equal(
      canMarkOrdered({ role: "member", username: "someone", id: "user-lhp-test" }),
      true,
    );
  });

  it("blocks Brooke until her username is added in the environment", () => {
    assert.equal(canMarkOrdered({ role: "member", username: "brooke", id: "user-brooke" }), false);
    assert.equal(
      canMarkOrdered({ role: "member", username: "brooke-test", id: "user-brooke-test" }),
      false,
    );
    process.env.SALON_CAN_MARK_ORDERED = "brooke";
    assert.equal(canMarkOrdered({ role: "member", username: "brooke", id: "user-brooke" }), true);
    process.env.SALON_CAN_MARK_ORDERED = "user-brooke";
    assert.equal(canMarkOrdered({ role: "member", username: "brooke", id: "user-brooke" }), true);
  });
});

describe("patchSetsOrderedQty", () => {
  it("catches ordered status and ordered qty", () => {
    assert.equal(patchSetsOrderedQty({ status: "ordered" }), true);
    assert.equal(patchSetsOrderedQty({ orderedQty: 2 }), true);
    assert.equal(patchSetsOrderedQty({ status: "pending", receivedQty: 1 }), false);
  });
});
