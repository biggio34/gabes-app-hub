import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoTimestamp, missingPlayerColumn } from "./softball-write-helpers.ts";

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
