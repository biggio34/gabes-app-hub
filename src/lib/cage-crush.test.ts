import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAGE_CRUSH_BLOB_KEY,
  cageCrushWeek,
  chicagoWallToUtcMs,
  emptyBoard,
  isCageCrushBlobKey,
  normalizeBoard,
  airBallHitsFielder,
  flightLift,
  pitcherCanCatch,
  qualityFromT,
  smashCarry,
  smashValue,
  sprayFromTiming,
  swingWhy,
  upsertWeeklyScore,
} from "./cage-crush.ts";

describe("cage crush week", () => {
  it("ends the week on Sunday at 11:59 PM Central", () => {
    const friday = chicagoWallToUtcMs(2026, 9, 4, 17, 0, 0);
    const week = cageCrushWeek(friday);
    assert.equal(week.weekId, "2026-09-06");
    assert.equal(week.resetsAt, chicagoWallToUtcMs(2026, 9, 6, 23, 59, 0));
  });

  it("keeps Sunday 11:58 PM Central on this week and resets at 11:59", () => {
    const before = chicagoWallToUtcMs(2026, 9, 6, 23, 58, 0);
    const atReset = chicagoWallToUtcMs(2026, 9, 6, 23, 59, 0);
    const after = chicagoWallToUtcMs(2026, 9, 6, 23, 59, 30);
    assert.equal(cageCrushWeek(before).weekId, "2026-09-06");
    assert.equal(cageCrushWeek(atReset).weekId, "2026-09-13");
    assert.equal(cageCrushWeek(after).weekId, "2026-09-13");
    assert.equal(cageCrushWeek(chicagoWallToUtcMs(2026, 9, 7, 0, 1, 0)).weekId, "2026-09-13");
  });

  it("drops last week's scores when the week id changes", () => {
    const friday = chicagoWallToUtcMs(2026, 9, 4, 12, 0, 0);
    const nextMonday = chicagoWallToUtcMs(2026, 9, 7, 9, 0, 0);
    const stale = {
      weekId: "2026-09-06",
      resetsAt: cageCrushWeek(friday).resetsAt,
      entries: [{ userId: "u1", name: "Ann", score: 80, at: friday }],
    };
    const live = normalizeBoard(stale, friday);
    assert.equal(live.entries.length, 1);
    assert.equal(live.entries[0].score, 80);
    const reset = normalizeBoard(stale, nextMonday);
    assert.equal(reset.weekId, "2026-09-13");
    assert.deepEqual(reset.entries, []);
    assert.equal(emptyBoard(nextMonday).weekId, "2026-09-13");
  });

  it("keeps one best score per player and ranks the board", () => {
    const now = chicagoWallToUtcMs(2026, 9, 4, 18, 0, 0);
    const board = emptyBoard(now);
    const first = upsertWeeklyScore(board, { userId: "ann", name: "Ann", score: 40 }, now);
    const same = upsertWeeklyScore(first.board, { userId: "ann", name: "Ann", score: 30 }, now + 1);
    assert.equal(same.improved, false);
    assert.equal(same.board.entries[0].score, 40);
    const better = upsertWeeklyScore(first.board, { userId: "ann", name: "Ann", score: 55 }, now + 2);
    const other = upsertWeeklyScore(better.board, { userId: "gabe", name: "Gabe", score: 90 }, now + 3);
    assert.equal(other.board.entries[0].userId, "gabe");
    assert.equal(other.board.entries[1].score, 55);
    assert.equal(isCageCrushBlobKey(CAGE_CRUSH_BLOB_KEY), true);
  });
});

describe("swing feedback", () => {
  it("calls a take, a whiff, a weak cut, and a perfect swing", () => {
    assert.equal(swingWhy({ kind: "miss", label: "TAKE" }, "FASTBALL", 1.05), "Took the pitch");
    assert.equal(swingWhy({ kind: "miss", label: "WHIFF" }, "RISE", 0.5), "Way early on the rise");
    assert.equal(swingWhy({ kind: "miss", label: "WHIFF" }, "CHANGE", 0.94), "Late on the change");
    assert.equal(swingWhy({ kind: "out", label: "WEAK OUT" }, "DROP", 0.7), "Weak contact · a little early");
    assert.equal(swingWhy({ kind: "foul", label: "FOUL" }, "SCREW", 0.84), "Weak contact · just off");
    assert.equal(swingWhy({ kind: "homer", label: "GONE" }, "FASTBALL", 0.82), "Perfect · up the middle");
    assert.equal(swingWhy({ kind: "single", label: "SINGLE" }, "FASTBALL", 0.73), "A little early · ripped to left");
  });
});

describe("spray and pitcher", () => {
  it("sends early pulls left, late swings right, and on-time shots over the pitcher", () => {
    assert.ok(sprayFromTiming(0.73, "double") < -0.5);
    assert.ok(sprayFromTiming(0.91, "double") > 0.5);
    assert.ok(Math.abs(sprayFromTiming(0.82, "double")) < 0.1);
    assert.ok(qualityFromT(0.73) > 0.65);
    assert.ok(flightLift("single", 0.82) > flightLift("single", 0.73));
    assert.equal(pitcherCanCatch({ lift: 40 }, { kind: "single", side: 0 }), false);
    assert.equal(pitcherCanCatch({ lift: 8 }, { kind: "double", side: 0 }), false);
    assert.equal(pitcherCanCatch({ lift: 8 }, { kind: "out", side: 0 }), true);
  });
});

describe("smash factor", () => {
  it("is slow at the bottom, fast at the top, and adds carry", () => {
    assert.ok(smashValue(0) < 0.02);
    assert.ok(smashValue(1) > 0.98);
    assert.ok(smashValue(2) < 0.02);
    const upNearTop = smashValue(0.95) - smashValue(0.85);
    const upNearBottom = smashValue(0.15) - smashValue(0.05);
    assert.ok(upNearTop > upNearBottom);
    assert.ok(smashCarry(200, 1) > smashCarry(200, 0.2));
  });
});

describe("air catch", () => {
  it("is an out only when the airborne ball hits a fielder", () => {
    const fielder = { x: 100, y: 200, scale: 1 };
    assert.equal(airBallHitsFielder({ x: 100, y: 184, lift: 20, r: 6 }, fielder), true);
    assert.equal(airBallHitsFielder({ x: 100, y: 184, lift: 3, r: 6 }, fielder), false);
    assert.equal(airBallHitsFielder({ x: 200, y: 184, lift: 20, r: 6 }, fielder), false);
  });
});
