import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeLineupMaps, payloadWithLineup } from "./lineup-merge.ts";
import { isoTimestamp, missingPlayerColumn } from "./softball-write-helpers.ts";

describe("shared lineup merge", () => {
  it("keeps the newer batting order when an older save arrives later", () => {
    const stored = {
      "team-16u": {
        version: 2,
        lastUpdated: 200,
        currentGameId: "game-1",
        games: [
          {
            id: "game-1",
            name: "vs Hawks",
            battingOrder: ["ava", "mia"],
            contentUpdatedAt: 200,
            lastUpdated: 200,
          },
        ],
      },
    };
    const stale = {
      "team-16u": {
        version: 2,
        lastUpdated: 100,
        currentGameId: "game-1",
        games: [
          {
            id: "game-1",
            name: "vs Hawks",
            battingOrder: ["ava"],
            contentUpdatedAt: 100,
            lastUpdated: 150,
          },
        ],
      },
    };
    const merged = mergeLineupMaps(stored, stale) as {
      "team-16u": { games: { battingOrder: string[]; contentUpdatedAt: number }[]; currentGameId: string };
    };
    assert.deepEqual(merged["team-16u"].games[0].battingOrder, ["ava", "mia"]);
    assert.equal(merged["team-16u"].currentGameId, "game-1");
  });

  it("does not let a view-only timestamp replace a newer lineup", () => {
    const stored = {
      "team-16u": {
        lastUpdated: 50,
        games: [{ id: "game-1", battingOrder: ["mia"], contentUpdatedAt: 300, lastUpdated: 300 }],
      },
    };
    const viewOnly = {
      "team-16u": {
        lastUpdated: 400,
        games: [{ id: "game-1", battingOrder: ["ava"], contentUpdatedAt: 100, lastUpdated: 400 }],
      },
    };
    const merged = mergeLineupMaps(stored, viewOnly) as {
      "team-16u": { games: { battingOrder: string[] }[] };
    };
    assert.deepEqual(merged["team-16u"].games[0].battingOrder, ["mia"]);
  });

  it("drops a deleted game for the next viewer", () => {
    const stored = {
      "team-16u": {
        lastUpdated: 100,
        currentGameId: "game-1",
        games: [{ id: "game-1", battingOrder: ["ava"], contentUpdatedAt: 100 }],
      },
    };
    const deleted = {
      "team-16u": {
        lastUpdated: 200,
        currentGameId: "game-2",
        removedGameIds: ["game-1"],
        games: [{ id: "game-2", battingOrder: ["mia"], contentUpdatedAt: 200 }],
      },
    };
    const merged = mergeLineupMaps(stored, deleted) as {
      "team-16u": { games: { id: string }[]; currentGameId: string; removedGameIds: string[] };
    };
    assert.deepEqual(merged["team-16u"].games.map((game) => game.id), ["game-2"]);
    assert.equal(merged["team-16u"].currentGameId, "game-2");
    assert.deepEqual(merged["team-16u"].removedGameIds, ["game-1"]);
  });

  it("keeps roster players when a lineup is written into the club record", () => {
    const payload = payloadWithLineup(
      {
        players: [{ id: "ava", name: "Ava" }],
        lineups: {},
      },
      "team-16u",
      {
        version: 2,
        lastUpdated: 10,
        currentGameId: "game-1",
        games: [{ id: "game-1", battingOrder: ["ava"], contentUpdatedAt: 10 }],
      },
    );
    assert.equal((payload.players as { id: string }[])[0].id, "ava");
    const lineups = payload.lineups as { "team-16u": { games: { battingOrder: string[] }[] } };
    assert.deepEqual(lineups["team-16u"].games[0].battingOrder, ["ava"]);
  });
});

describe("softball player write helpers", () => {
  it("turns millisecond createdAt values into timestamptz strings", () => {
    const iso = "2025-09-03T21:42:00.000Z";
    const ms = Date.parse(iso);
    assert.equal(isoTimestamp(ms), iso);
    assert.equal(isoTimestamp(String(ms)), iso);
    assert.equal(isoTimestamp("2026-09-03T12:00:00.000Z"), "2026-09-03T12:00:00.000Z");
  });

  it("reads the missing column name from PostgREST and Postgres errors", () => {
    assert.equal(
      missingPlayerColumn("Could not find the 'card' column of 'hub_players' in the schema cache"),
      "card",
    );
    assert.equal(
      missingPlayerColumn('column "seasons" of relation "hub_players" does not exist'),
      "seasons",
    );
    assert.equal(missingPlayerColumn("PGRST204"), null);
  });
});
