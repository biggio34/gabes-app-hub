import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gameManagerAllowed } from "./areas.ts";
import { hubApps, rewriteAppHtml } from "./catalog.ts";

describe("hub apps", () => {
  it("gives Game Manager to admins and not to a Softball login", () => {
    const app = hubApps.find((item) => item.slug === "game-manager");
    assert.ok(app);
    assert.equal(app?.area, "softball");
    assert.equal(app?.file, "game-manager.html");
    assert.equal(app?.requiresFeature, "admin");
    const lineup = hubApps.findIndex((item) => item.slug === "lineup");
    const manager = hubApps.findIndex((item) => item.slug === "game-manager");
    assert.equal(manager, lineup + 1);
    assert.equal(gameManagerAllowed({ role: "owner" }), true);
    assert.equal(gameManagerAllowed({ role: "member" }), false);
  });

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

  it("rewrites the beneficiary RMD script to the shared route", () => {
    const html = rewriteAppHtml('<script src="../shared/bene-rmd.js"></script>');
    assert.match(html, /src="\/shared\/bene-rmd\.js"/);
  });

  it("rewrites the owner RMD script to the shared route", () => {
    const html = rewriteAppHtml('<script src="../shared/owner-rmd.js"></script>');
    assert.match(html, /src="\/shared\/owner-rmd\.js"/);
  });
});
