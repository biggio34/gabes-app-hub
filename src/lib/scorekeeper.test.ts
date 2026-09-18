import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyScorekeeperStore,
  isScorekeeperBlobKey,
  mergeGames,
  mergeStores,
  normalizeGame,
  normalizeStore,
  parseScore,
  scorekeeperBlobKey,
  storeIsEmpty,
} from "./scorekeeper.ts";

describe("scorekeeper store", () => {
  it("keys the sibling blob by user id", () => {
    assert.equal(scorekeeperBlobKey("user-gabe"), "scorekeeper:user-gabe");
    assert.notEqual(scorekeeperBlobKey("user-a"), scorekeeperBlobKey("user-b"));
    assert.equal(isScorekeeperBlobKey("scorekeeper:user-gabe"), true);
    assert.equal(isScorekeeperBlobKey("wrist-coach:user-gabe"), false);
  });

  it("lets a score go negative", () => {
    assert.equal(parseScore(-2), -2);
    assert.equal(parseScore("3"), 3);
    assert.equal(parseScore("nope"), 0);
    const live = normalizeGame(
      { home: "Elks", away: "Hawks", homeScore: 1, awayScore: -2, startedAt: 10 },
      false,
    );
    assert.equal(live?.awayScore, -2);
  });

  it("keeps finished games by id and newest stamp", () => {
    const older = {
      id: "g1",
      home: "Elks",
      away: "Hawks",
      homeScore: 1,
      awayScore: 0,
      startedAt: 1,
      endedAt: 2,
    };
    const newer = { ...older, homeScore: 4, endedAt: 9 };
    const other = {
      id: "g2",
      home: "Elks",
      away: "Lakeville",
      homeScore: 2,
      awayScore: 1,
      startedAt: 3,
      endedAt: 8,
    };
    const merged = mergeGames([older, other], [newer]);
    assert.equal(merged[0].id, "g1");
    assert.equal(merged[0].homeScore, 4);
    assert.equal(merged[1].id, "g2");
  });

  it("uploads leftover phone scores when the database row is empty", () => {
    const local = normalizeStore(
      {
        live: { home: "Elks", away: "Hawks", homeScore: 2, awayScore: 1, startedAt: 50 },
        games: [],
        updatedAt: 50,
      },
      "user-1",
      50,
    );
    const server = emptyScorekeeperStore("user-1", 1);
    assert.equal(storeIsEmpty(server), true);
    const merged = mergeStores(server, local, "user-1", 100);
    assert.equal(merged.live?.homeScore, 2);
    assert.equal(merged.live?.away, "Hawks");
  });

  it("keeps the database live game when both copies exist", () => {
    const server = normalizeStore(
      {
        live: { home: "Elks", away: "Hawks", homeScore: 5, awayScore: 1, startedAt: 10 },
        updatedAt: 200,
      },
      "user-1",
      200,
    );
    const local = normalizeStore(
      {
        live: { home: "Elks", away: "Hawks", homeScore: 1, awayScore: 0, startedAt: 10 },
        updatedAt: 50,
      },
      "user-1",
      50,
    );
    const merged = mergeStores(server, local, "user-1", 300);
    assert.equal(merged.live?.homeScore, 5);
  });
});
