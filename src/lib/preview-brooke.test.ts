import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { previewBrookeLoginEnabled, previewRequestHost } from "./preview-brooke-gate.ts";

const originalContext = process.env.CONTEXT;
const originalInlined = process.env.NETLIFY_CONTEXT;
const originalNodeEnv = process.env.NODE_ENV;

const PREVIEW_HOST = "deploy-preview-35--gabes-app-hub.netlify.app";
const BRANCH_HOST = "cursor-supply-check-in-3412--gabes-app-hub.netlify.app";
const PRODUCTION_HOST = "gabes-app-hub.netlify.app";

afterEach(() => {
  if (originalContext === undefined) delete process.env.CONTEXT;
  else process.env.CONTEXT = originalContext;
  if (originalInlined === undefined) delete process.env.NETLIFY_CONTEXT;
  else process.env.NETLIFY_CONTEXT = originalInlined;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function clearContext() {
  delete process.env.CONTEXT;
  delete process.env.NETLIFY_CONTEXT;
}

describe("preview Brooke login", () => {
  it("stays off when the build was production, even if runtime context says preview", () => {
    process.env.NETLIFY_CONTEXT = "production";
    process.env.CONTEXT = "deploy-preview";
    process.env.NODE_ENV = "production";
    assert.equal(previewBrookeLoginEnabled(PREVIEW_HOST), false);
  });

  it("stays on for deploy previews and branch deploys when NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.NETLIFY_CONTEXT;

    process.env.CONTEXT = "deploy-preview";
    assert.equal(previewBrookeLoginEnabled(), true);

    process.env.CONTEXT = "branch-deploy";
    assert.equal(previewBrookeLoginEnabled("localhost"), true);
  });

  it("uses the build-time inlined context when CONTEXT is missing at runtime", () => {
    delete process.env.CONTEXT;
    process.env.NODE_ENV = "production";

    process.env.NETLIFY_CONTEXT = "deploy-preview";
    assert.equal(previewBrookeLoginEnabled(), true);

    process.env.NETLIFY_CONTEXT = "branch-deploy";
    assert.equal(previewBrookeLoginEnabled(PRODUCTION_HOST), true);

    process.env.NETLIFY_CONTEXT = "production";
    assert.equal(previewBrookeLoginEnabled(PREVIEW_HOST), false);

    delete process.env.NETLIFY_CONTEXT;
    process.env.CONTEXT = "production";
    assert.equal(previewBrookeLoginEnabled(PREVIEW_HOST), false);
  });

  it("allows a preview or branch host when no context was inlined", () => {
    clearContext();
    process.env.NODE_ENV = "production";

    assert.equal(previewBrookeLoginEnabled(PREVIEW_HOST), true);
    assert.equal(previewBrookeLoginEnabled(`${BRANCH_HOST}:443`), true);
    assert.equal(previewBrookeLoginEnabled(` ${PREVIEW_HOST} `), true);
  });

  it("rejects the production host, localhost, and a spoof sitting next to production", () => {
    clearContext();
    process.env.NODE_ENV = "production";

    assert.equal(previewBrookeLoginEnabled(PRODUCTION_HOST), false);
    assert.equal(previewBrookeLoginEnabled("localhost"), false);
    assert.equal(previewBrookeLoginEnabled("127.0.0.1"), false);
    assert.equal(
      previewBrookeLoginEnabled(`${PREVIEW_HOST}, ${PRODUCTION_HOST}`),
      false,
    );
  });

  it("stays on for local development when Netlify context is unset", () => {
    clearContext();
    process.env.NODE_ENV = "development";
    assert.equal(previewBrookeLoginEnabled(), true);
    assert.equal(previewBrookeLoginEnabled("localhost:43147"), true);
  });

  it("reads the public host from forwarded headers before the internal host", () => {
    const host = previewRequestHost({
      url: "http://localhost:8888/api/auth/login",
      headers: {
        get(name: string) {
          if (name === "x-forwarded-host") return PREVIEW_HOST;
          if (name === "host") return "localhost:8888";
          return null;
        },
      },
    });
    clearContext();
    process.env.NODE_ENV = "production";
    assert.equal(previewBrookeLoginEnabled(host), true);
  });
});
