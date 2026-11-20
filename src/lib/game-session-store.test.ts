import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "gm-sync-")), "hub.db")}`;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("game manager session store", () => {
  it("rejects a stale revision and keeps the newer document", async () => {
    const store = await import("./game-session-store.ts");
    const created = await store.writeGameDocument("club-mn-elks", 0, {
      revision: 1,
      active: { teamId: "team-16u", gameId: "game-eagles" },
      teams: { "team-16u": { teamName: "16U", sessions: {} } },
      appliedOpIds: ["start"],
    });
    assert.equal(created.conflict, false);
    assert.equal(created.revision, 1);
    assert.equal(created.document.active?.gameId, "game-eagles");

    const stale = await store.writeGameDocument("club-mn-elks", 0, {
      active: null,
      teams: {},
      appliedOpIds: ["wipe"],
    });
    assert.equal(stale.conflict, true);
    assert.equal(stale.revision, 1);
    assert.equal(stale.document.active?.gameId, "game-eagles");

    const next = await store.writeGameDocument("club-mn-elks", 1, {
      ...stale.document,
      appliedOpIds: ["start", "swap"],
      teams: {
        "team-16u": {
          teamName: "16U",
          sessions: {
            "game-eagles": {
              lineupGameId: "game-eagles",
              side: "home",
              status: "live",
              innings: [{ top: null, bottom: null }],
              inningIndex: 0,
              half: "top",
              defense: { P: "jo", C: null, "1B": null, "2B": null, "3B": null, SS: null, LF: null, CF: null, RF: null },
              outs: 1,
              players: [],
              gameName: "vs. Eagles",
              teamName: "Us",
              startedAt: 1,
              updatedAt: 2,
            },
          },
        },
      },
    });
    assert.equal(next.conflict, false);
    assert.equal(next.revision, 2);
    const team = next.document.teams["team-16u"] as { sessions: { "game-eagles": { outs: number; defense: { P: string } } } };
    assert.equal(team.sessions["game-eagles"].outs, 1);
    assert.equal(team.sessions["game-eagles"].defense.P, "jo");

    const read = await store.readGameDocument("club-mn-elks");
    assert.equal(read.revision, 2);
    assert.equal(read.stored, "sqlite");
    const client = createClient({ url: process.env.DATABASE_URL || "" });
    const lineup = await client.execute("SELECT COUNT(*) AS n FROM softball_state");
    assert.equal(Number(lineup.rows[0]?.n ?? 0), 0);
    client.close();
  });
});
