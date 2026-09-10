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
    assert.match(svg, /viewBox="0 0 2400 620"/);
    assert.match(svg, /preserveAspectRatio="none"/);
    assert.match(svg, /x1="1200" y1="510" x2="2400" y2="153"/);
    assert.match(svg, /x1="1200" y1="510" x2="0" y2="153"/);
    assert.match(svg, />12</);
    assert.match(svg, />7</);
    assert.match(svg, />LF</);
    assert.match(svg, />DP</);
    assert.match(svg, />AP1</);
    assert.match(svg, /data-pos="DP"[^>]*><rect x="50" y="520"/);
    assert.match(svg, /data-pos="AP1"[^>]*><rect x="50" y="440"/);
  });

  it("puts extra APs in the lower left, stacking upward", () => {
    const svg = InningDefense.miniFieldSvg({}, [], { apCount: 2 });
    assert.match(svg, /data-pos="AP1"[^>]*><rect x="50" y="520"/);
    assert.match(svg, /data-pos="AP2"[^>]*><rect x="50" y="440"/);
    assert.doesNotMatch(svg, /x="510"/);
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

  it("counts planned innings a batter is not in the field", () => {
    const innings = [
      { P: "a", SS: "m" },
      { P: "m", AP1: "a" },
      {},
    ];
    assert.equal(InningDefense.sitOutCount("a", innings), 1);
    assert.equal(InningDefense.sitOutCount("a", innings, 1), 0);
    assert.equal(InningDefense.isFieldPosition("AP1"), false);
  });

  it("keeps coach-locked positions and fills the rest from batting order", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const players = ids.map((id) => ({
      id,
      name: id,
      position: id === "a" ? "C" : "",
      position2: "",
    }));
    const defense = InningDefense.suggestInningDefense({
      battingOrder: ids,
      players,
      lockedPositions: { P: "j" },
    });
    assert.equal(defense.P, "j");
    assert.equal(defense.C, "a");
  });

  it("puts a pitcher on P when filling from primary and secondary positions", () => {
    const players = [
      { id: "1", name: "Ava", position: "SS", position2: "2B" },
      { id: "2", name: "Mia", position: "P", position2: "1B" },
      { id: "3", name: "Sophia", position: "C", position2: "" },
      { id: "4", name: "Emma", position: "OF", position2: "" },
      { id: "5", name: "Lily", position: "2B", position2: "OF" },
      { id: "6", name: "Harper", position: "3B", position2: "SS" },
      { id: "7", name: "Zoe", position: "OF", position2: "" },
      { id: "8", name: "Chloe", position: "1B", position2: "" },
      { id: "9", name: "Isla", position: "UT", position2: "" },
    ];
    const defense = InningDefense.suggestInningDefense({
      battingOrder: players.map((p) => p.id),
      players,
      usePreferredPositions: true,
    });
    assert.equal(defense.P, "2");
    assert.equal(defense.C, "3");
    assert.equal(defense.SS, "1");
    assert.ok(["LF", "CF", "RF"].includes(
      InningDefense.playerPosition(defense, "4"),
    ));
  });

  it("never assigns P or C unless that is a primary or secondary roster position", () => {
    const players = [
      { id: "1", name: "Ava", position: "SS", position2: "2B" },
      { id: "2", name: "Mia", position: "1B", position2: "OF" },
      { id: "3", name: "Sophia", position: "UT", position2: "" },
    ];
    const defense = InningDefense.suggestInningDefense({
      battingOrder: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
      players: players.concat(
        ["4", "5", "6", "7", "8", "9"].map((id) => ({ id, name: id, position: "OF" })),
      ),
    });
    assert.equal(defense.P, null);
    assert.equal(defense.C, null);
    assert.equal(InningDefense.canPlayBattery({ position: "UT" }, "P"), false);
    assert.equal(InningDefense.canPlayBattery({ position: "P", position2: "SS" }, "P"), true);
  });

  it("sits the kid who has sat the least when equal playing time is on", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const players = ids.map((id) => ({
      id,
      name: id,
      position: id === "a" ? "P" : id === "b" ? "C" : "OF",
      position2: "",
    }));
    const inning1 = InningDefense.suggestInningDefense({
      battingOrder: ids,
      players,
      equalPlayingTime: true,
    });
    assert.equal(inning1.P, "a");
    assert.equal(inning1.C, "b");
    assert.equal(InningDefense.playerPosition(inning1, "j"), "");
    const inning2 = InningDefense.suggestInningDefense({
      battingOrder: ids,
      players,
      innings: [inning1],
      inningIndex: 1,
      equalPlayingTime: true,
    });
    assert.ok(InningDefense.isFieldPosition(InningDefense.playerPosition(inning2, "j")));
    assert.equal(InningDefense.playerPosition(inning2, "i"), "");
  });

  it("assigns catcher from a secondary roster listing", () => {
    const players = [
      { id: "1", name: "Ava", position: "SS", position2: "C" },
      { id: "2", name: "Mia", position: "P", position2: "1B" },
      { id: "3", name: "Sophia", position: "2B", position2: "" },
      { id: "4", name: "Emma", position: "OF", position2: "" },
      { id: "5", name: "Lily", position: "2B", position2: "OF" },
      { id: "6", name: "Harper", position: "3B", position2: "SS" },
      { id: "7", name: "Zoe", position: "OF", position2: "" },
      { id: "8", name: "Chloe", position: "1B", position2: "" },
      { id: "9", name: "Isla", position: "UT", position2: "" },
    ];
    const defense = InningDefense.suggestInningDefense({
      battingOrder: players.map((p) => p.id),
      players,
      usePreferredPositions: false,
    });
    assert.equal(defense.P, "2");
    assert.equal(defense.C, "1");
  });

  it("assigns leftover roster batters to AP slots", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
    const players = ids.map((id) => ({
      id,
      name: id,
      position: id === "a" ? "P" : id === "b" ? "C" : "OF",
    }));
    const defense = InningDefense.suggestInningDefense({
      battingOrder: ids,
      players,
      apCount: 2,
    });
    assert.equal(defense.AP1, "j");
    assert.equal(defense.AP2, "k");
    assert.equal(InningDefense.filledFieldCount(defense), 9);
  });
});
