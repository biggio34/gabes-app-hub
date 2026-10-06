import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { previewBrookeLoginEnabled } from "./preview-brooke-gate.ts";

const originalContext = process.env.CONTEXT;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalContext === undefined) delete process.env.CONTEXT;
  else process.env.CONTEXT = originalContext;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe("preview Brooke login", () => {
  it("stays off in production and on for previews and local dev", () => {
    process.env.CONTEXT = "production";
    process.env.NODE_ENV = "production";
    assert.equal(previewBrookeLoginEnabled(), false);

    process.env.CONTEXT = "deploy-preview";
    assert.equal(previewBrookeLoginEnabled(), true);

    process.env.CONTEXT = "branch-deploy";
    assert.equal(previewBrookeLoginEnabled(), true);

    delete process.env.CONTEXT;
    process.env.NODE_ENV = "development";
    assert.equal(previewBrookeLoginEnabled(), true);

    process.env.NODE_ENV = "production";
    assert.equal(previewBrookeLoginEnabled(), false);
  });
});
