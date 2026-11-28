import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "gm-off-")), "hub.db")}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-present";
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_URL;

describe("game manager sync fallback", () => {
  it("stays local when the anon key is unset and does not call Supabase", async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("missing", { status: 404 });
    }) as typeof fetch;
    try {
      const store = await import("./game-session-store.ts");
      const read = await store.readGameDocument("club-mn-elks");
      assert.equal(read.sync, "off");
      assert.equal(read.live, "none");
      assert.equal(read.stored, "supabase");
      const write = await store.writeGameDocument("club-mn-elks", 0, {
        teams: { "team-16u": { teamName: "16U", sessions: {} } },
      });
      assert.equal(write.sync, "off");
      assert.equal(write.conflict, false);
      assert.equal(calls.length, 0);
    } finally {
      globalThis.fetch = original;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });
});
