import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = fs.readFileSync(path.join(root, "content/shared/elks-data.js"), "utf8");
const context = {
  console,
  Date,
  Set,
  Map,
  JSON,
  crypto: { randomUUID: () => "test-" + Math.random().toString(36).slice(2, 10) },
};
vm.createContext(context);
vm.runInContext(code, context);
const ElksData = context.ElksData;
if (!ElksData) throw new Error("ElksData did not load");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const roster = [
  { id: "p1", firstName: "Tenley", lastName: "Fransen", position: "P", position2: "OF" },
  { id: "p2", firstName: "Macie", lastName: "Backman", position: "C" },
  { id: "p3", firstName: "Emily", lastName: "Artmann", position: "LF" },
  { id: "p4", firstName: "Madison", lastName: "Burggraff", position: "CF" },
  { id: "p5", firstName: "Hailee", lastName: "Clinton", position: "SS" },
  { id: "p6", firstName: "Molly", lastName: "Johnson", position: "1B" },
  { id: "p7", firstName: "Paisyn", lastName: "Wiley", position: "UT" },
];

const block = {
  id: "seg1",
  name: "Stations",
  duration: 30,
  description: "",
};
ElksData.splitSegmentIntoStations(block);
assert(ElksData.isSplitSegment(block), "split should create lanes");
assert(block.lanes.some((lane) => lane.everyoneElse), "split should include Everyone else");
assert(block.lanes[0].slots[0].duration === 30, "original drill should stay in station 1");

block.lanes[0].name = "Pitchers and catchers";
block.lanes[0].positions = ["P", "C"];
block.lanes[0].slots = [{ id: "s1", name: "Live bullpen", duration: 30 }];

ElksData.addStationLane(block, {
  name: "Outfielders",
  positions: ["OF"],
  slots: [
    { name: "Drop steps", duration: 15 },
    { name: "Crow hops", duration: 15 },
  ],
});
ElksData.addStationLane(block, {
  name: "Infielders",
  positions: ["IF"],
  slots: [
    { name: "Fielding ground balls", duration: 15 },
    { name: "Bunt coverage", duration: 15 },
  ],
});

const names = block.lanes.map((lane) => lane.name);
assert(names.includes("Pitchers and catchers"), "pitcher lane");
assert(names.includes("Outfielders"), "outfield lane");
assert(names.includes("Infielders"), "infield lane");
assert(names[names.length - 1] === "Everyone else", "everyone else last");

let assigned = ElksData.assignPlayersToLanes(block.lanes, roster);
function idsIn(index) {
  return assigned.assigned[index].map((p) => p.id).sort().join(",");
}
assert(idsIn(0) === "p1,p2", "P and C go to pitchers/catchers; named-position pitcher beats OF secondary");
assert(idsIn(1) === "p3,p4", "LF/CF go to outfield");
assert(idsIn(2) === "p5,p6", "SS/1B go to infield");
assert(idsIn(3) === "p7", "utility lands in everyone else");

block.lanes[1].playerIds = ["p1"];
assigned = ElksData.assignPlayersToLanes(block.lanes, roster);
assert(assigned.assigned[1].some((p) => p.id === "p1"), "named player wins over matching pitcher lane");
assert(!assigned.assigned[0].some((p) => p.id === "p1"), "named player is not also in the position lane");

const cloned = ElksData.clonePracticeAsUpcoming({
  date: "2026-03-01",
  time: "17:00",
  duration: 30,
  focus: "Stations",
  location: "Elks Field",
  teamId: "team-16u-fransen",
  segments: [block],
});
assert(cloned.date !== "2026-03-01", "duplicate gets an upcoming date");
assert(cloned.segments[0].lanes.length === block.lanes.length, "duplicate keeps lanes");
assert(cloned.segments[0].id !== block.id, "duplicate gets new ids");
assert(block.date === undefined, "original block object was not given a date");
assert(cloned.segments[0].lanes[1].positions[0] === "OF", "duplicate keeps position tags");
assert(cloned.segments[0].lanes[1].slots[0].name === "Drop steps", "duplicate keeps split times");

const oldTemplate = { segments: [{ id: "old", name: "Live BP", duration: 15, description: "See it" }] };
const copiedOld = ElksData.cloneSegments(oldTemplate.segments);
assert(!ElksData.isSplitSegment(copiedOld[0]), "old one-line templates stay a single lane");
assert(copiedOld[0].name === "Live BP", "old template name round-trips");

const merged = ElksData.mergeStationsToSingle(ElksData.cloneSegment(block));
assert(!ElksData.isSplitSegment(merged), "merge removes lanes");

const kept = { id: "practice_keep", teamId: "team-16u-fransen", focus: "Defense", date: "2026-08-20" };
const orphan = { focus: "Defense", date: "2026-08-20" };
const allTeams = { id: "practice_all", teamId: "all", focus: "Scrimmage" };
const unassigned = { id: "practice_none", teamId: "unassigned", focus: "BP" };
assert(ElksData.practiceAssignedTeamId(kept) === "team-16u-fransen", "assigned practice keeps team");
assert(ElksData.practiceAssignedTeamId(orphan) === "", "missing team is unassigned");
assert(ElksData.practiceAssignedTeamId(allTeams) === "", "all is not a team");
assert(ElksData.practiceAssignedTeamId(unassigned) === "", "unassigned marker is not a team");

const dropped = ElksData.dropUnassignedPractices([kept, orphan, allTeams, unassigned]);
assert(dropped.length === 1, "only team-assigned practices remain");
assert(dropped[0].id === "practice_keep", "kept the assigned practice");

const state = ElksData.ensureDefaults({
  practices: [kept, orphan, { ...orphan }],
});
assert(state.practices.length === 1, "ensureDefaults drops unassigned duplicates");
assert(state.practices[0].id === "practice_keep", "ensureDefaults keeps the assigned plan");

const once = { focus: "Hitting", date: "2026-08-01" };
const noIdMerged = ElksData.mergeRecordListsById([once], [once, once]);
assert(noIdMerged.length === 1, "identical no-id records do not multiply");

console.log("practice lane tests passed");
