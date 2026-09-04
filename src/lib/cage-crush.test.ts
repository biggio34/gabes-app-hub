import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAGE_CRUSH_BLOB_KEY,
  cageCrushWeek,
  chicagoWallToUtcMs,
  emptyBoard,
  isCageCrushBlobKey,
  normalizeBoard,
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
