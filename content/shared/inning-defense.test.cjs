const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const InningDefense = require("./inning-defense.js");

describe("inning defense helpers", () => {
  it("clamps inning counts to a softball range", () => {
    assert.equal(InningDefense.clampInningCount(undefined), 7);
    assert.equal(InningDefense.clampInningCount(3), 5);
    assert.equal(InningDefense.clampInningCount(9), 9);
    assert.equal(InningDefense.clampInningCount(40), 12);
  });

  it("seeds inning 1 from the starting defense and leaves later innings empty", () => {
    const seed = { P: "p1", SS: "p2" };
    const innings = InningDefense.ensureInningDefenses(null, 7, seed);
    assert.equal(innings.length, 7);
    assert.equal(innings[0].P, "p1");
    assert.equal(innings[0].SS, "p2");
    assert.equal(InningDefense.defenseHasAssignments(innings[1]), false);
    assert.equal(InningDefense.planHasLaterInnings(innings), false);
  });

  it("preserves later innings when resizing up and truncates when shrinking", () => {
    const first = InningDefense.ensureInningDefenses([{ P: "a" }, { P: "b" }], 7, null);
    first[3].C = "c";
    const grown = InningDefense.ensureInningDefenses(first, 8, null);
    assert.equal(grown.length, 8);
    assert.equal(grown[3].C, "c");
    const shrunk = InningDefense.ensureInningDefenses(grown, 5, null);
    assert.equal(shrunk.length, 5);
    assert.equal(shrunk[3].C, "c");
  });

  it("assigns, swaps, and benches players inside one inning", () => {
    const defense = InningDefense.emptyDefense();
    InningDefense.assignInDefense(defense, "ava", "SS");
    InningDefense.assignInDefense(defense, "mia", "P");
    InningDefense.assignInDefense(defense, "ava", "P");
    assert.equal(defense.P, "ava");
    assert.equal(defense.SS, "mia");
    InningDefense.assignInDefense(defense, "ava", "BENCH");
    assert.equal(defense.P, undefined);
    assert.equal(defense.SS, "mia");
  });

  it("builds batting-order table rows with a position per inning", () => {
    const players = [
      { id: "a", name: "Ava", number: "7" },
      { id: "m", name: "Mia", number: "12" },
    ];
    const innings = [
      { P: "m", SS: "a" },
      { P: "m", LF: "a" },
    ];
    const rows = InningDefense.tableRows(players, ["a", "m"], innings);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0].positions, ["SS", "LF"]);
    assert.deepEqual(rows[1].positions, ["P", "P"]);
  });

  it("copies one inning onto later innings without aliasing the maps", () => {
    const innings = InningDefense.ensureInningDefenses([{ P: "m", SS: "a" }], 7, null);
    InningDefense.copyInningToRange(innings, 0, 1, 6);
    assert.equal(innings[4].P, "m");
    innings[4].P = "other";
    assert.equal(innings[0].P, "m");
    assert.equal(InningDefense.planHasLaterInnings(innings), true);
  });

  it("renders a mini field with jersey numbers and empty position labels", () => {
    const svg = InningDefense.miniFieldSvg(
      { P: "m", SS: "a" },
      [
        { id: "a", name: "Ava", number: "7" },
        { id: "m", name: "Mia", number: "12" },
      ],
      { dpFlex: true, apCount: 1 },
    );
    assert.match(svg, /<svg /);
    assert.match(svg, />12</);
    assert.match(svg, />7</);
    assert.match(svg, />LF</);
    assert.match(svg, />DP</);
    assert.match(svg, />AP1</);
  });

  it("summarizes who is on the bench for an inning", () => {
    const players = [
      { id: "a", name: "Ava", number: "7" },
      { id: "m", name: "Mia", number: "12" },
      { id: "l", name: "Lily", number: "4" },
    ];
    const summary = InningDefense.benchSummary(["a", "m", "l"], { P: "m", SS: "a" }, players);
    assert.match(summary, /#4 Lily/);
  });
});
