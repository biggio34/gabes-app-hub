const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadElks() {
  const code = fs.readFileSync(path.join(__dirname, "elks-data.js"), "utf8");
  const context = {
    console,
    Date,
    Set,
    Map,
    JSON,
    Intl,
    crypto: { randomUUID: () => "test-" + Math.random().toString(36).slice(2, 10) },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  if (!context.ElksData) throw new Error("ElksData did not load");
  return context.ElksData;
}

const ElksData = loadElks();

function practice(fields) {
  return Object.assign(
    { id: fields.id, focus: fields.focus || fields.id, time: "18:00", duration: 90, teamId: "team-16u-fransen" },
    fields,
  );
}

describe("practice list window", () => {
  const today = "2026-11-24";

  it("adds calendar days across the month boundary", () => {
    assert.equal(ElksData.PRACTICE_WINDOW_DAYS, 10);
    assert.equal(ElksData.addCalendarDays(today, 10), "2026-12-04");
    assert.equal(ElksData.addCalendarDays(today, 11), "2026-12-05");
    assert.equal(ElksData.addCalendarDays(today, -1), "2026-11-23");
  });

  it("formats the local calendar day instead of the UTC date", () => {
    const evening = new Date(2026, 10, 24, 20, 30, 0);
    assert.equal(ElksData.localCalendarDate(evening), "2026-11-24");
    assert.equal(
      ElksData.localCalendarDate(evening),
      [
        evening.getFullYear(),
        String(evening.getMonth() + 1).padStart(2, "0"),
        String(evening.getDate()).padStart(2, "0"),
      ].join("-"),
    );
    if (evening.getTimezoneOffset() > 0) {
      assert.equal(evening.toISOString().slice(0, 10), "2026-11-25");
      assert.notEqual(ElksData.localCalendarDate(evening), evening.toISOString().slice(0, 10));
    }
  });

  it("keeps an evening Central practice on the local day when UTC has already flipped", () => {
    // 8:30pm America/Chicago on Nov 24, 2026 is 02:30 UTC on Nov 25 (CST, UTC-6).
    const chicagoEvening = new Date("2026-11-25T02:30:00Z");
    const chicagoToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(chicagoEvening);
    assert.equal(chicagoToday, "2026-11-24");
    assert.equal(chicagoEvening.toISOString().slice(0, 10), "2026-11-25");

    const tonight = practice({ id: "tonight", date: chicagoToday, time: "18:00" });
    assert.equal(ElksData.practiceWindowBucket(tonight, chicagoToday), "upcoming");
    assert.equal(ElksData.practiceWindowBucket(tonight, chicagoEvening.toISOString().slice(0, 10)), "past");
  });

  it("resolves 8:26 PM CST to the Central calendar day and keeps that practice upcoming", () => {
    // 2026-11-24 02:26 UTC is 8:26 PM CST on 2026-11-23. UTC has already flipped.
    const instant = new Date("2026-11-24T02:26:00Z");
    assert.equal(instant.toISOString().slice(0, 10), "2026-11-24");
    assert.equal(ElksData.PRACTICE_TIME_ZONE, "America/Chicago");
    const chicagoToday = ElksData.localCalendarDate(instant, "America/Chicago");
    assert.equal(chicagoToday, "2026-11-23");
    assert.equal(ElksData.practiceToday(instant), "2026-11-23");

    const tonight = practice({ id: "tonight", date: "2026-11-23", time: "20:26" });
    assert.equal(ElksData.practiceWindowBucket(tonight, chicagoToday), "upcoming");
    assert.equal(ElksData.practiceWindowBucket(tonight, "2026-11-24"), "past");
  });

  it("falls back to local calendar getters when the time zone cannot be applied", () => {
    const evening = new Date(2026, 10, 24, 20, 30, 0);
    const local = [
      evening.getFullYear(),
      String(evening.getMonth() + 1).padStart(2, "0"),
      String(evening.getDate()).padStart(2, "0"),
    ].join("-");
    assert.equal(ElksData.localCalendarDate(evening, "Not/AZone"), local);
  });

  it("classifies yesterday, today, day +10, day +11, and undated", () => {
    assert.equal(ElksData.practiceWindowBucket(practice({ id: "y", date: "2026-11-23" }), today), "past");
    assert.equal(ElksData.practiceWindowBucket(practice({ id: "t", date: "2026-11-24" }), today), "upcoming");
    assert.equal(ElksData.practiceWindowBucket(practice({ id: "d10", date: "2026-12-04" }), today), "upcoming");
    assert.equal(ElksData.practiceWindowBucket(practice({ id: "d11", date: "2026-12-05" }), today), "later");
    assert.equal(ElksData.practiceWindowBucket(practice({ id: "none", date: null, time: "09:00" }), today), "later");
    assert.equal(ElksData.practiceWindowBucket(practice({ id: "blank", date: "" }), today), "later");
    assert.equal(ElksData.practiceWindowBucket(practice({ id: "bad", date: "2026-02-31" }), today), "later");
  });
});

describe("practice list sort", () => {
  const today = "2026-11-24";

  it("sorts oldest to newest, uses start time as a tie-breaker, and parks undated last", () => {
    const list = [
      practice({ id: "later", date: "2027-02-02", time: "18:00", focus: "February" }),
      practice({ id: "undated", date: null, time: "09:00", focus: "TBD" }),
      practice({ id: "same-late", date: today, time: "19:00", focus: "Late" }),
      practice({ id: "same-early", date: today, time: "17:00", focus: "Early" }),
      practice({ id: "yesterday", date: "2026-11-23", time: "21:00", focus: "Old" }),
      practice({ id: "no-time", date: today, focus: "Anytime", time: "" }),
      practice({ id: "edge", date: "2026-12-04", time: "06:00", focus: "Edge" }),
      practice({ id: "day-11", date: "2026-12-05", time: "18:00", focus: "Just later" }),
    ];
    const sorted = ElksData.sortPracticesChronologically(list).map((item) => item.id);
    assert.deepEqual(sorted, [
      "yesterday",
      "same-early",
      "same-late",
      "no-time",
      "edge",
      "day-11",
      "later",
      "undated",
    ]);
    assert.deepEqual(list.map((item) => item.id)[0], "later");
  });

  it("keeps equal date and time in their original order", () => {
    const list = [
      practice({ id: "a", date: today, time: "18:00" }),
      practice({ id: "b", date: today, time: "18:00:00" }),
    ];
    assert.deepEqual(
      ElksData.sortPracticesChronologically(list).map((item) => item.id),
      ["a", "b"],
    );
  });

  it("partitions into past, next 10 days, and later without losing the source index", () => {
    const practices = [
      practice({ id: "later", date: "2027-01-15", time: "18:00" }),
      practice({ id: "today-late", date: today, time: "19:30" }),
      practice({ id: "undated", date: null, time: "08:00" }),
      practice({ id: "yesterday", date: "2026-11-23", time: "18:00" }),
      practice({ id: "today-early", date: today, time: "09:00" }),
      practice({ id: "plus10", date: "2026-12-04", time: "06:15" }),
      practice({ id: "plus11", date: "2026-12-05", time: "18:00" }),
    ];
    const entries = practices.map((item, index) => ({ practice: item, index }));
    const original = entries.map((entry) => entry.index);
    const groups = ElksData.partitionPractices(entries, today);

    const ids = (rows) => Array.from(rows, (entry) => entry.practice.id);
    const indexes = (rows) => Array.from(rows, (entry) => entry.index);
    assert.equal(groups.today, today);
    assert.equal(groups.through, "2026-12-04");
    assert.deepEqual(ids(groups.past), ["yesterday"]);
    assert.deepEqual(indexes(groups.past), [3]);
    assert.deepEqual(ids(groups.upcoming), ["today-early", "today-late", "plus10"]);
    assert.deepEqual(indexes(groups.upcoming), [4, 1, 5]);
    assert.deepEqual(ids(groups.later), ["plus11", "later", "undated"]);
    assert.deepEqual(indexes(groups.later), [6, 0, 2]);
    assert.deepEqual(entries.map((entry) => entry.index), original);
  });
});

describe("practice planner sections", () => {
  const html = fs.readFileSync(path.join(__dirname, "../apps/practice-planner.html"), "utf8");

  it("renders Crossbar-style sections and keeps card actions on the source index", () => {
    assert.match(html, /Previous practices/);
    assert.match(html, /Upcoming practices/);
    assert.match(html, /Later practices/);
    assert.match(html, /partitionPractices/);
    assert.match(html, /practiceWindowBucket/);
    assert.match(html, /localCalendarDate\(new Date\(\), 'America\/Chicago'\)/);
    assert.match(html, /duplicatePractice\(\$\{index\}, event\)/);
    assert.match(html, /renderPracticeCard\(entry\.practice, entry\.index, bucket\)/);
    assert.doesNotMatch(html, /toISOString\(\)\.slice\(0,\s*10\)/);
  });
});
