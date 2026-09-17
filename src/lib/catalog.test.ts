import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hubApps } from "./catalog.ts";

describe("hub apps", () => {
  it("gives Scorekeeper to every Softball login", () => {
    const app = hubApps.find((item) => item.slug === "scorekeeper");
    assert.ok(app);
    assert.equal(app?.area, "softball");
    assert.equal(app?.requiresFeature, undefined);
  });

  it("keeps Wrist Coach behind its own grant", () => {
    const app = hubApps.find((item) => item.slug === "wrist-coach");
    assert.equal(app?.requiresFeature, "wrist-coach");
  });
});
