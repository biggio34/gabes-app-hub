import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  areaAndFeatureLinks,
  mergeUserFeatures,
  userFeaturesBlobKey,
  wristCoachAllowed,
} from "./areas.ts";
import {
  DEFAULT_COLS,
  DEFAULT_GRIDS,
  blocksAcross,
  knockoutPt,
  sidePadPt,
  DEFAULT_ROWS,
  DEFAULT_SHEET_COLS,
  DEFAULT_SHEET_ROWS,
  activeVersion,
  callCode,
  callColors,
  cardCounts,
  cellCount,
  defaultLibrary,
  defaultSheet,
  defaultTheme,
  emptyBook,
  layoutOf,
  materializeKindCounts,
  moveLibraryCall,
  normalizeBook,
  normalizeCardSize,
  maxCardInches,
  cardGridMetrics,
  CARD_SIZE_PRESETS,
  LETTER_SHEET,
  LAMINATE_BLEED_IN,
  laminateCutInches,
  letterSheetFit,
  letterBlockFits,
  normalizeSheet,
  normalizeTheme,
  nextVersionName,
  rebalanceCounts,
  sheetCode,
  sheetGroups,
  signBag,
  allocateCallCounts,
  oneHandDigits,
  columnLabel,
  rowLabel,
  signalCallCode,
  normalizeNumbering,
  copyCurrentVersion,
  defaultKindTitles,
  defaultKindThemes,
  defaultKindLayouts,
  defaultSetThemes,
  OFFENSE_BAND,
  DEFENSE_BAND,
  PREVIOUS_OFFENSE_BAND,
  PREVIOUS_DEFENSE_BAND,
  isUntouchedLegacyCard,
  isUntouchedPreviousColors,
  isPreviousDefaultSize,
  upgradeLibrary,
  migrateCalls,
  duplicateShorts,
  shortInUse,
  evenSpreadCounts,
  spreadLibrary,
  paginateCoachSheet,
  kindTheme,
  kindTitle,
  layoutFor,
  normalizeKindThemes,
  normalizeKindTitles,
  shuffleCurrentVersion,
  shuffleKeepingHistory,
  shuffleVersion,
  setVersionLocked,
  versionCells,
  playCardKind,
  wristCoachBlobKey,
} from "./wrist-coach.ts";

describe("wrist coach permission", () => {
  it("always lets the owner in", () => {
    assert.equal(wristCoachAllowed({ role: "owner", areas: [], features: [] }), true);
  });

  it("keeps the Wrist Coach flag next to areas when saving a person", () => {
    assert.deepEqual(
      areaAndFeatureLinks({
        areas: ["softball", "financial"],
        features: ["wrist-coach"],
      }),
      { areas: ["softball", "financial"], features: ["wrist-coach"] },
    );
    assert.deepEqual(
      areaAndFeatureLinks({ areas: ["softball"], features: [] }),
      { areas: ["softball"], features: [] },
    );
    assert.equal(userFeaturesBlobKey("user-bot"), "user-features:user-bot");
    assert.deepEqual(
      mergeUserFeatures(["softball"], ["wrist-coach"]),
      ["wrist-coach"],
    );
    assert.deepEqual(mergeUserFeatures(["wrist-coach"], []), ["wrist-coach"]);
    assert.deepEqual(mergeUserFeatures([], []), []);
  });

  it("requires softball plus the Wrist Coach flag for members", () => {
    assert.equal(
      wristCoachAllowed({ role: "member", areas: ["softball"], features: [] }),
      false,
    );
    assert.equal(
      wristCoachAllowed({ role: "member", areas: ["financial"], features: ["wrist-coach"] }),
      false,
    );
    assert.equal(
      wristCoachAllowed({
        role: "member",
        areas: ["softball"],
        features: ["wrist-coach"],
      }),
      true,
    );
  });
});

describe("wrist coach book", () => {
  it("keys the sibling blob by user id", () => {
    assert.equal(wristCoachBlobKey("user-gabe"), "wrist-coach:user-gabe");
    assert.notEqual(wristCoachBlobKey("user-a"), wristCoachBlobKey("user-b"));
  });

  it("ships four call groups and keeps locations off the pitch list", () => {
    const library = defaultLibrary();
    const kinds = new Set(library.map((item) => item.kind));
    assert.deepEqual([...kinds].sort(), ["defense", "location", "offense", "pitch"]);
    assert.ok(library.some((item) => item.kind === "pitch" && item.name === "Fastball"));
    assert.equal(
      library.some((item) => item.kind === "pitch" && ["IN", "OUT", "UP", "DN"].includes(item.short)),
      false,
    );
    assert.ok(library.some((item) => item.kind === "location" && item.short === "IN"));
    assert.ok(library.some((item) => item.kind === "location" && item.short === "UA"));
    assert.ok(library.some((item) => item.kind === "offense" && item.name === "Hit away"));
    assert.ok(library.some((item) => item.kind === "offense" && item.name === "Bunt"));
    assert.ok(library.some((item) => item.kind === "offense" && item.short === "B+R"));
    assert.ok(library.filter((item) => item.kind === "offense").length >= 12);
    assert.ok(library.some((item) => item.kind === "defense" && item.name === "Hold"));
    assert.ok(library.some((item) => item.kind === "defense" && item.name === "Throw through"));
  });

  it("moves old IN/OUT/UP/DN pitches into locations and fills the new groups", () => {
    const book = normalizeBook(
      {
        title: "Old book",
        library: [
          { id: "pitch-fb", kind: "pitch", name: "Fastball", short: "FB" },
          { id: "pitch-in", kind: "pitch", name: "Inside", short: "IN" },
          { id: "play-bnt", kind: "offense", name: "Bunt", short: "BNT" },
        ],
        versions: [
          {
            id: "ver-1",
            name: "Version A",
            createdAt: 1,
            cells: [{ row: 0, col: 0, code: "11", callId: "pitch-in" }],
          },
        ],
      },
      "user-9",
    );
    assert.equal(book.library.find((item) => item.id === "pitch-in")?.kind, "location");
    assert.ok(book.library.some((item) => item.kind === "location" && item.short === "DN"));
    assert.ok(book.library.some((item) => item.kind === "offense" && item.name === "Hit away"));
    assert.ok(book.library.some((item) => item.kind === "defense" && item.name === "Infield in"));
    assert.equal(book.library.find((item) => item.id === "pitch-fb")?.kind, "pitch");
  });

  it("does not re-add deleted defense after a four-group book is saved", () => {
    const full = defaultLibrary().filter((item) => item.name !== "Hold");
    const book = normalizeBook(
      {
        title: "Current",
        library: full,
        versions: [
          {
            id: "ver-1",
            name: "Version A",
            createdAt: 1,
            cells: [{ row: 0, col: 0, code: "11", callId: "pitch-fb" }],
          },
        ],
      },
      "user-9",
    );
    assert.equal(book.library.some((item) => item.name === "Hold"), false);
    assert.ok(book.library.some((item) => item.kind === "defense"));
    assert.ok(book.library.some((item) => item.kind === "location"));
  });

  it("starts a coach with one shuffled battleship version", () => {
    const book = emptyBook("user-1", "Gabe's signs");
    assert.equal(book.userId, "user-1");
    assert.equal(book.title, "Gabe's signs");
    assert.equal(book.bandKind, "offense");
    assert.equal(DEFAULT_GRIDS, 6);
    assert.equal(book.grids, DEFAULT_GRIDS);
    assert.equal(book.rows, DEFAULT_ROWS);
    assert.equal(book.cols, DEFAULT_COLS);
    assert.deepEqual(book.kindLayouts, defaultKindLayouts());
    assert.equal(layoutFor(book, "defense").rows, 4);
    assert.equal(layoutFor(book, "defense").cols, 4);
    assert.equal(book.versions.length, 1);
    const version = activeVersion(book);
    assert.ok(version);
    assert.equal(version.cells.length, DEFAULT_GRIDS * DEFAULT_ROWS * DEFAULT_COLS);
    const codes = version.cells.map((cell) => cell.code);
    assert.equal(new Set(codes).size, codes.length);
    assert.ok(version.cells.every((cell) => cell.callId));
    assert.equal(callCode(0, 0, 0, 1, 1), "01-1");
    assert.equal(callCode(5, 4, 4, 1, 1), "55-5");
    assert.equal(sheetCode(0, 0, 0, 1, 1), "011");
    assert.equal(sheetCode(1, 1, 2, 1, 1), "132");
    assert.equal(sheetCode(5, 4, 4, 1, 1), "555");
    assert.ok(codes.includes("01-1"));
    assert.ok(codes.includes("55-5"));
    assert.ok(codes.includes("13-2"));
  });

  it("lets the coach pick wristband, text, and highlight colors", () => {
    const book = emptyBook("user-1");
    assert.deepEqual(book.theme, defaultSetThemes().offense);
    assert.deepEqual(normalizeTheme({ band: "#9f1239", ink: "#fff", highlight: "#112233" }), {
      band: "#9f1239",
      ink: "#ffffff",
      highlight: "#112233",
    });
    const saved = normalizeBook(
      {
        title: "Navy band",
        theme: { wristband: "#1e3a8a", text: "#eee", cell: "#f8fafc" },
        library: defaultLibrary(),
        versions: [],
      },
      "user-9",
    );
    assert.deepEqual(saved.theme, {
      band: "#1e3a8a",
      ink: "#eeeeee",
      highlight: "#f8fafc",
    });
  });

  it("fills cells from each sign's count", () => {
    const library = [
      { id: "play-br", kind: "offense" as const, name: "Bunt + run", short: "B+R", fill: "clear" as const, ink: "clear" as const, count: 3 },
      { id: "play-x", kind: "offense" as const, name: "X", short: "X", fill: "clear" as const, ink: "clear" as const, count: 2 },
    ];
    const bag = signBag(library, "offense", 5);
    assert.equal(bag.filter((id) => id === "play-br").length, 3);
    assert.equal(bag.filter((id) => id === "play-x").length, 2);
  });

  it("deals rare weights into one or two cells and gives the rest to heavier calls", () => {
    const counts = allocateCallCounts(
      [
        { id: "rare", weight: 1, rare: true },
        { id: "often", weight: 15 },
      ],
      20,
    );
    assert.equal(counts.rare + counts.often, 20);
    assert.ok(counts.rare === 1 || counts.rare === 2);
    assert.ok(counts.often > counts.rare);
    const capped = allocateCallCounts(
      [
        { id: "only", weight: 1, rare: true },
        { id: "also", weight: 1, rare: true },
      ],
      10,
    );
    assert.equal(capped.only, 2);
    assert.equal(capped.also, 2);
    const library = [
      { id: "play-rare", kind: "offense" as const, name: "Take", short: "T", fill: "clear" as const, ink: "clear" as const, count: 15, weight: 1 },
      { id: "play-hit", kind: "offense" as const, name: "Hit", short: "H", fill: "clear" as const, ink: "clear" as const, count: 15, weight: 0 },
      { id: "play-bunt", kind: "offense" as const, name: "Bunt", short: "B", fill: "clear" as const, ink: "clear" as const, count: 7, weight: 0 },
    ];
    const bag = signBag(library, "offense", 30);
    const rare = bag.filter((id) => id === "play-rare").length;
    const hit = bag.filter((id) => id === "play-hit").length;
    const bunt = bag.filter((id) => id === "play-bunt").length;
    assert.equal(bag.length, 30);
    assert.ok(rare === 1 || rare === 2);
    assert.ok(hit > rare);
    assert.ok(bunt > 0);
    assert.equal(hit + bunt + rare, 30);
    const exact = signBag(library, "offense", 5, "count");
    assert.equal(exact.filter((id) => id === "play-rare").length + exact.filter((id) => id === "play-hit").length + exact.filter((id) => id === "play-bunt").length, 5);
  });

  it("prints numbers in order and can limit every digit to 1-5", () => {
    assert.equal(oneHandDigits(1), "1");
    assert.equal(oneHandDigits(5), "5");
    assert.equal(oneHandDigits(6), "11");
    assert.equal(oneHandDigits(30), "55");
    assert.equal(columnLabel(0, 0, 5, "ordered", 3), "1");
    assert.equal(columnLabel(1, 0, 5, "ordered", 1), "6");
    assert.equal(columnLabel(1, 0, 5, "oneHand", 1), "11");
    assert.equal(columnLabel(0, 0, 5, "standard", 1), "01");
    assert.equal(rowLabel(0, "ordered", 4), "1");
    assert.equal(rowLabel(4, "oneHand", 1), "5");
    assert.equal(rowLabel(5, "oneHand", 1), "11");
    assert.equal(signalCallCode(1, 0, 0, 5, "ordered", 1, 1), "6-1");
    assert.equal(signalCallCode(5, 4, 4, 5, "oneHand", 1, 1), "55-5");
    for (let n = 1; n <= 150; n += 1) {
      assert.match(oneHandDigits(n), /^[1-5]+$/);
    }
    const saved = normalizeBook(
      {
        title: "One hand",
        numbering: "oneHand",
        library: [
          { id: "play-x", kind: "offense", name: "X", short: "X", count: 1, weight: 4 },
        ],
        versions: [],
      },
      "user-9",
    );
    assert.equal(saved.numbering, "oneHand");
    assert.equal(saved.library.find((item) => item.id === "play-x")?.weight, 4);
    assert.equal(normalizeNumbering("nope"), "standard");
    const book = emptyBook("user-1");
    assert.equal(book.numbering, "standard");
    const ordered = normalizeBook({ ...book, numbering: "ordered", versions: book.versions }, "user-1");
    const code = activeVersion(ordered)?.cells[0]?.code;
    assert.equal(code, "1-1");
  });

  it("shuffle creates another mapping with a new version name", () => {
    const book = emptyBook("user-1");
    const first = activeVersion(book);
    assert.ok(first);
    const second = shuffleVersion(book);
    assert.equal(second.name, nextVersionName(book.versions));
    assert.notEqual(second.id, first.id);
    const firstMap = first.cells.map((cell) => `${cell.code}:${cell.callId}`).join("|");
    const secondMap = second.cells.map((cell) => `${cell.code}:${cell.callId}`).join("|");
    assert.notEqual(firstMap, secondMap);
    assert.equal(second.cells.length, cellCount(layoutOf(book)));
  });

  it("shuffles the current version in place and skips a locked version", () => {
    const book = emptyBook("user-1");
    const first = activeVersion(book);
    assert.ok(first);
    assert.equal(first.locked, false);
    const reshuffled = shuffleCurrentVersion(book, first);
    assert.ok(reshuffled);
    assert.equal(reshuffled.id, first.id);
    assert.equal(reshuffled.name, first.name);
    assert.equal(reshuffled.locked, false);
    const locked = { ...first, locked: true };
    assert.equal(shuffleCurrentVersion(book, locked), null);
    const saved = normalizeBook(
      {
        title: "Locked book",
        library: defaultLibrary(),
        versions: [
          {
            id: first.id,
            name: first.name,
            createdAt: first.createdAt,
            locked: true,
            cells: first.cells,
          },
        ],
        activeVersionId: first.id,
      },
      "user-1",
    );
    assert.equal(activeVersion(saved)?.locked, true);
    const copied = copyCurrentVersion(book, first);
    assert.notEqual(copied.id, first.id);
    assert.equal(copied.locked, false);
    assert.deepEqual(copied.titles, first.titles);
    assert.deepEqual(
      copied.cells.map((cell) => `${cell.code}:${cell.callId}`),
      first.cells.map((cell) => `${cell.code}:${cell.callId}`),
    );
    assert.deepEqual(
      copied.defenseCells.map((cell) => `${cell.code}:${cell.callId}`),
      first.defenseCells.map((cell) => `${cell.code}:${cell.callId}`),
    );
  });

  it("keeps offense and defense cards independent on the same version", () => {
    const book = emptyBook("user-1");
    const first = activeVersion(book);
    assert.ok(first);
    assert.equal(playCardKind("defense"), "defense");
    assert.equal(first.offenseCells.length, first.cells.length);
    assert.equal(first.offenseCells.length, cellCount(layoutFor(book, "offense")));
    assert.equal(first.defenseCells.length, cellCount(layoutFor(book, "defense")));
    assert.notEqual(first.defenseCells.length, first.offenseCells.length);
    const offenseIds = new Set(first.offenseCells.map((cell) => cell.callId));
    const defenseIds = new Set(first.defenseCells.map((cell) => cell.callId));
    assert.ok([...offenseIds].every((id) => book.library.find((call) => call.id === id)?.kind === "offense"));
    assert.ok([...defenseIds].every((id) => book.library.find((call) => call.id === id)?.kind === "defense"));
    const defenseBefore = first.defenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|");
    const offenseBefore = first.offenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|");
    const shuffledOffense = shuffleCurrentVersion(book, first, "offense");
    assert.ok(shuffledOffense);
    assert.equal(
      shuffledOffense.defenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"),
      defenseBefore,
    );
    const shuffledDefense = shuffleCurrentVersion({ ...book, bandKind: "defense" }, shuffledOffense, "defense");
    assert.ok(shuffledDefense);
    assert.equal(
      shuffledDefense.offenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"),
      shuffledOffense.offenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"),
    );
    assert.notEqual(
      shuffledDefense.defenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"),
      defenseBefore,
    );
    const locked = setVersionLocked(shuffledDefense, true);
    assert.equal(locked.locked, true);
    assert.equal(shuffleCurrentVersion(book, locked, "offense"), null);
    assert.equal(shuffleCurrentVersion({ ...book, bandKind: "defense" }, locked, "defense"), null);
    const unlocked = setVersionLocked(locked, false);
    assert.equal(unlocked.locked, false);
    assert.ok(shuffleCurrentVersion(book, unlocked, "offense"));
    const saved = normalizeBook(
      {
        title: "Split cards",
        bandKind: "defense",
        library: defaultLibrary(),
        versions: [
          {
            id: first.id,
            name: first.name,
            createdAt: first.createdAt,
            locked: true,
            cells: first.offenseCells,
            titles: first.titles,
            themes: first.themes,
          },
        ],
        activeVersionId: first.id,
      },
      "user-1",
    );
    const restored = activeVersion(saved);
    assert.ok(restored);
    assert.equal(restored.locked, true);
    assert.equal(versionCells(restored, "offense").length, cellCount(layoutOf(saved)));
    assert.equal(versionCells(restored, "defense").length, cellCount(layoutOf(saved)));
    assert.ok(
      versionCells(restored, "offense").every(
        (cell) => book.library.find((call) => call.id === cell.callId)?.kind !== "defense",
      ),
    );
    assert.equal(offenseBefore.split("|").length, first.offenseCells.length);
  });

  it("keeps an older version viewable after shuffle and reprints that card", () => {
    const book = emptyBook("user-1");
    const first = activeVersion(book);
    assert.ok(first);
    const offenseBefore = first.offenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|");
    const defenseBefore = first.defenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|");
    const offenseRef = first.offenseCells;
    const next = shuffleKeepingHistory(book, first, "offense");
    assert.ok(next);
    assert.notEqual(next.id, first.id);
    assert.equal(next.name, "Version B");
    assert.equal(next.locked, false);
    assert.equal(first.offenseCells, offenseRef);
    assert.equal(first.offenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"), offenseBefore);
    assert.equal(first.defenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"), defenseBefore);
    assert.notEqual(next.offenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"), offenseBefore);
    assert.equal(next.defenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"), defenseBefore);
    book.versions = [...book.versions, next];
    book.activeVersionId = next.id;
    const saved = normalizeBook(book, "user-1");
    assert.equal(saved.versions.length, 2);
    assert.equal(activeVersion(saved)?.id, next.id);
    const older = saved.versions.find((version) => version.id === first.id);
    assert.ok(older);
    assert.equal(older.offenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"), offenseBefore);
    saved.activeVersionId = older.id;
    const reprinted = normalizeBook(saved, "user-1");
    assert.equal(activeVersion(reprinted)?.id, older.id);
    assert.equal(
      activeVersion(reprinted)?.offenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"),
      offenseBefore,
    );
    const defenseNext = shuffleKeepingHistory({ ...book, bandKind: "defense" }, first, "defense");
    assert.ok(defenseNext);
    assert.equal(defenseNext.offenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"), offenseBefore);
    assert.notEqual(defenseNext.defenseCells.map((cell) => `${cell.code}:${cell.callId}`).join("|"), defenseBefore);
    assert.equal(shuffleKeepingHistory(book, setVersionLocked(first, true), "offense"), null);
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    const shuffleFn = page.slice(page.indexOf("function shuffleCurrent()"), page.indexOf("function activeVersion()"));
    assert.match(shuffleFn, /book\.versions\.push\(version\)/);
    assert.match(shuffleFn, /book\.activeVersionId = version\.id/);
    assert.doesNotMatch(shuffleFn, /refillCard/);
    assert.match(page, /data-ver-print="/);
    assert.match(page, />Reprint</);
    const reprint = page.slice(
      page.indexOf('const printId = event.target.getAttribute("data-ver-print")'),
      page.indexOf("if (useId)"),
    );
    assert.match(reprint, /printNow\("cards", printId\)/);
    assert.doesNotMatch(reprint, /activeVersionId/);
    assert.match(page, /printNow\("cards"\)/);
    assert.match(page, /Shuffle this card keeps this version/);
    assert.doesNotMatch(page, /6×6|5×9|5×12|kid mode|kid-friendly/i);
  });

  it("keeps a block size for each set and leaves older books on one shared size", () => {
    const book = emptyBook("user-1");
    assert.deepEqual(layoutFor(book, "offense"), {
      grids: DEFAULT_GRIDS,
      rows: 5,
      cols: 5,
      signStart: 1,
      rowStart: 1,
    });
    assert.deepEqual(layoutFor(book, "defense"), {
      grids: DEFAULT_GRIDS,
      rows: 4,
      cols: 4,
      signStart: 1,
      rowStart: 1,
    });
    const legacy = normalizeBook(
      {
        title: "Saved card",
        rows: 5,
        cols: 5,
        grids: 6,
        library: defaultLibrary(),
        versions: [],
      },
      "user-1",
    );
    assert.equal(layoutFor(legacy, "offense").rows, 5);
    assert.equal(layoutFor(legacy, "defense").cols, 5);
    assert.equal(activeVersion(legacy)?.defenseCells.length, 6 * 5 * 5);
    const split = normalizeBook(
      {
        title: "Split size",
        rows: 5,
        cols: 5,
        grids: 2,
        kindLayouts: {
          offense: { rows: 5, cols: 5 },
          defense: { rows: 4, cols: 4 },
        },
        library: defaultLibrary(),
        versions: [],
      },
      "user-1",
    );
    assert.equal(activeVersion(split)?.offenseCells.length, 2 * 5 * 5);
    assert.equal(activeVersion(split)?.defenseCells.length, 2 * 4 * 4);
    assert.equal(activeVersion(split)?.offenseCells.some((cell) => cell.code === "01-1"), true);
    assert.equal(activeVersion(split)?.defenseCells.some((cell) => cell.code === "11-1"), true);
    assert.equal(activeVersion(split)?.defenseCells.some((cell) => cell.col === 4), false);
  });

  it("keeps six blocks on a new card and the reference gap on a two-block card", () => {
    assert.equal(DEFAULT_GRIDS, 6);
    assert.equal(emptyBook("user-1", "New card").grids, 6);
    assert.equal(sidePadPt(21, 2), 0.9);
    assert.equal(sidePadPt(19.5, 2), 0.9);
    assert.equal(sidePadPt(28.8, 2), 0.9);
    assert.equal(sidePadPt(13, 3), 0.9);
    assert.equal(blocksAcross(6), 3);
    assert.equal(blocksAcross(2), 2);
    assert.equal(blocksAcross(1), 1);
    assert.equal(blocksAcross(8), 4);
    assert.ok(emptyBook("user-1", "Offense").cardSize.widthIn > emptyBook("user-1", "Offense").cardSize.heightIn);
    assert.equal(sidePadPt(13, 6), 0.35);
    assert.equal(sidePadPt(20, 6), 0.9);
    assert.equal(sidePadPt(15.6, 6), 0.497);
    assert.ok(sidePadPt(13, 6) < sidePadPt(21, 2));
    assert.equal(knockoutPt(15.9), 0.4);
    assert.equal(knockoutPt(21.825), 0.4);
    assert.ok(knockoutPt(9.158) < 0.4);
    assert.ok(knockoutPt(9.158) >= 0.22);
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    assert.match(page, /function blocksAcross\(grids\)/);
    assert.match(page, /blocksAcross\(layout\.grids\)/);
    assert.match(page, /n\(hPt\) \+ '" preserveAspectRatio="xMidYMid meet"/);
    assert.doesNotMatch(page, /preserveAspectRatio="none"/);
    assert.match(page, /grids: 6/);
    assert.match(page, /function sidePadPt\(cellW, grids\)/);
    assert.match(page, /if \(!isFinite\(grids\) \|\| grids <= 3\) return 0\.9/);
    assert.match(page, /sidePadPt\(cellW, layout\.grids\)/);
    assert.match(page, /knockoutPt\(fontPt\)/);
    assert.doesNotMatch(page, /const padPt = 0\.9/);
  });

  it("gives offense and defense their own names on a version", () => {
    const book = emptyBook("user-1", "PURPLE OFFENSE");
    const first = activeVersion(book);
    assert.ok(first);
    assert.deepEqual(first.titles, defaultKindTitles("PURPLE OFFENSE"));
    assert.equal(kindTitle(first, "offense"), "PURPLE OFFENSE");
    assert.equal(kindTitle(first, "defense"), "PURPLE OFFENSE");
    first.titles = { offense: "PURPLE OFFENSE", defense: "NAVY DEFENSE" };
    assert.equal(kindTitle(first, "defense"), "NAVY DEFENSE");
    const reshuffled = shuffleCurrentVersion(book, first);
    assert.deepEqual(reshuffled?.titles, { offense: "PURPLE OFFENSE", defense: "NAVY DEFENSE" });
    const copied = copyCurrentVersion(book, first);
    assert.deepEqual(copied.titles, first.titles);
    const saved = normalizeBook(
      {
        title: "PURPLE OFFENSE",
        library: defaultLibrary(),
        versions: [
          {
            id: first.id,
            name: first.name,
            createdAt: first.createdAt,
            locked: false,
            cells: first.cells,
            titles: { offense: "PURPLE OFFENSE", defense: "NAVY DEFENSE" },
          },
        ],
        activeVersionId: first.id,
      },
      "user-1",
    );
    assert.deepEqual(activeVersion(saved)?.titles, {
      offense: "PURPLE OFFENSE",
      defense: "NAVY DEFENSE",
    });
    assert.deepEqual(normalizeKindTitles({}, "Home signs"), {
      offense: "Home signs",
      defense: "Home signs",
    });
  });

  it("keeps wristband, text, and highlight colors per type on a version", () => {
    const book = emptyBook("user-1");
    const first = activeVersion(book);
    assert.ok(first);
    assert.deepEqual(first.themes, defaultSetThemes());
    first.themes = {
      offense: { band: "#7e22ce", ink: "#ffffff", highlight: "#f8fafc" },
      defense: { band: "#1e3a8a", ink: "#fde68a", highlight: "#0f172a" },
    };
    assert.deepEqual(kindTheme(first, "offense"), first.themes.offense);
    assert.deepEqual(kindTheme(first, "defense"), first.themes.defense);
    const reshuffled = shuffleCurrentVersion(book, first);
    assert.deepEqual(reshuffled?.themes, first.themes);
    const copied = copyCurrentVersion(book, first);
    assert.deepEqual(copied.themes, first.themes);
    const saved = normalizeBook(
      {
        title: "Color split",
        theme: { band: "#7e22ce", ink: "#ffffff", highlight: "#ffffff" },
        library: defaultLibrary(),
        versions: [
          {
            id: first.id,
            name: first.name,
            createdAt: first.createdAt,
            locked: false,
            cells: first.cells,
            titles: first.titles,
            themes: first.themes,
          },
        ],
        activeVersionId: first.id,
      },
      "user-1",
    );
    assert.deepEqual(activeVersion(saved)?.themes.defense, {
      band: "#1e3a8a",
      ink: "#fde68a",
      highlight: "#0f172a",
    });
    assert.deepEqual(normalizeKindThemes({}, { band: "#111111", ink: "#222222", highlight: "#333333" }), {
      offense: { band: "#111111", ink: "#222222", highlight: "#333333" },
      defense: { band: "#111111", ink: "#222222", highlight: "#333333" },
    });
  });

  it("defaults the player card to the 3.5 × 2.25 softball size", () => {
    const book = emptyBook("user-1");
    assert.deepEqual(book.cardSize, { preset: "softball", widthIn: 3.5, heightIn: 2.25 });
    assert.deepEqual(normalizeCardSize({ preset: "softball" }), {
      preset: "softball",
      widthIn: 3.5,
      heightIn: 2.25,
    });
    assert.deepEqual(normalizeCardSize({ preset: "large" }), {
      preset: "large",
      widthIn: 5,
      heightIn: 3,
    });
    assert.deepEqual(normalizeCardSize({ preset: "youth" }), {
      preset: "youth",
      widthIn: 4.5,
      heightIn: 2.5,
    });
    assert.deepEqual(normalizeCardSize({ preset: "tripleYouth" }), {
      preset: "tripleYouth",
      widthIn: 3.5,
      heightIn: 2.75,
    });
    assert.deepEqual(normalizeCardSize({ preset: "triplePeewee" }), {
      preset: "triplePeewee",
      widthIn: 2.75,
      heightIn: 2.15,
    });
    assert.deepEqual(normalizeCardSize({ preset: "triplePanel" }), {
      preset: "triplePanel",
      widthIn: 4.75,
      heightIn: 2.25,
    });
    assert.deepEqual(normalizeCardSize({ preset: "custom", widthIn: 4.25, heightIn: 2.5 }), {
      preset: "custom",
      widthIn: 4.25,
      heightIn: 2.5,
    });
    assert.deepEqual(maxCardInches(), { widthIn: 7.42, heightIn: 8.91 });
    assert.deepEqual(normalizeCardSize({ preset: "custom", widthIn: 99, heightIn: 0 }), {
      preset: "custom",
      widthIn: 7.42,
      heightIn: 1,
    });
  });

  it("keeps equal boxes and one type size at every preset and odd custom size", () => {
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    const oddSizes = [
      { widthIn: 3.33, heightIn: 2.17 },
      { widthIn: 6.2, heightIn: 2.05 },
      { widthIn: 2.13, heightIn: 1.63 },
      { widthIn: 4.125, heightIn: 2.333 },
      { widthIn: 7.42, heightIn: 4.1 },
    ];
    assert.deepEqual(normalizeCardSize({ preset: "custom", widthIn: 4.125, heightIn: 2.333 }), {
      preset: "custom",
      widthIn: 4.13,
      heightIn: 2.33,
    });
    assert.deepEqual(normalizeCardSize({ widthIn: 6.2, heightIn: 2.05 }), {
      preset: "custom",
      widthIn: 6.2,
      heightIn: 2.05,
    });
    assert.deepEqual(normalizeCardSize({ preset: "custom", widthIn: 0.2, heightIn: 20 }), {
      preset: "custom",
      widthIn: 1,
      heightIn: 8.91,
    });
    const layouts = [
      { grids: 6, cols: 5, rows: 5 },
      { grids: 2, cols: 4, rows: 4 },
      { grids: 1, cols: 3, rows: 8 },
      { grids: 7, cols: 6, rows: 3 },
    ];
    const sizes = [...Object.values(CARD_SIZE_PRESETS), ...oddSizes.map((size) => normalizeCardSize({ preset: "custom", ...size }))];
    for (const size of sizes) {
      for (const layout of layouts) {
        const metrics = cardGridMetrics(size, layout);
        assert.ok(metrics.cellW > 0 && metrics.cellH > 0);
        assert.ok(Math.abs(metrics.cellW * metrics.colSlots - size.widthIn) < 1e-9);
        assert.ok(Math.abs(metrics.cellH * metrics.rowSlots - size.heightIn) < 1e-9);
        assert.equal(metrics.topCount, blocksAcross(layout.grids));
        assert.equal(metrics.topCount + metrics.bottomCount, layout.grids);
      }
    }
    assert.match(page, /function cardGridMetrics\(size, layout\)/);
    assert.match(page, /const metrics = cardGridMetrics\(size, layout\)/);
    assert.match(page, /data-type-pt="/);
    assert.match(page, /const fontPt = fontPx \* 72 \/ 96/);
    assert.match(page, /const CARD_MAX_W = 7\.42/);
    assert.match(page, /const CARD_MAX_H = 8\.91/);
    assert.match(page, /id="card-w"/);
    assert.match(page, /id="card-h"/);
    assert.match(page, /data-size="youth"/);
    assert.match(page, /data-size="tripleYouth"/);
    assert.match(page, /data-size="triplePeewee"/);
    assert.match(page, /data-size="triplePanel"/);
    assert.match(page, /widthIn: 4\.5/);
    assert.match(page, /heightIn: 2\.5/);
    assert.match(page, /heightIn: 2\.75/);
    assert.match(page, /widthIn: 2\.75/);
    assert.match(page, /heightIn: 2\.15/);
    assert.match(page, /widthIn: 4\.75/);
    for (const name of Object.keys(CARD_SIZE_PRESETS)) {
      assert.match(page, new RegExp(`data-size="${name}"`));
    }
  });

  it("fits a full Letter sheet of cards beside a 1 inch calibration square", () => {
    const cardGap = 0.28;
    const cardReserve = LETTER_SHEET.calibrateIn + LETTER_SHEET.calibrateGapIn + LETTER_SHEET.markOutIn;
    const cardSide = LETTER_SHEET.markPadIn + LETTER_SHEET.markOutIn;
    const expected: Record<string, { cols: number; rows: number; count: number }> = {
      band: { cols: 1, rows: 4, count: 4 },
      play: { cols: 2, rows: 4, count: 8 },
      wrist: { cols: 2, rows: 4, count: 8 },
      softball: { cols: 2, rows: 3, count: 6 },
      large: { cols: 1, rows: 2, count: 2 },
      youth: { cols: 1, rows: 3, count: 3 },
      tripleYouth: { cols: 2, rows: 3, count: 6 },
      triplePeewee: { cols: 2, rows: 3, count: 6 },
      triplePanel: { cols: 1, rows: 3, count: 3 },
    };
    for (const [name, size] of Object.entries(CARD_SIZE_PRESETS)) {
      const fit = letterSheetFit(size.widthIn, size.heightIn, cardGap, {
        reserveIn: cardReserve,
        sidePadIn: cardSide,
      });
      assert.deepEqual(fit, expected[name], name);
      assert.equal(
        letterBlockFits(size.widthIn, size.heightIn, fit.cols, fit.rows, cardGap, {
          reserveIn: cardReserve,
          sidePadIn: cardSide,
        }),
        true,
        name,
      );
    }
    const sheet = letterSheetFit(3.5, 5.5, 0.16, {
      reserveIn: LETTER_SHEET.calibrateIn + LETTER_SHEET.calibrateGapIn,
    });
    assert.deepEqual(sheet, { cols: 2, rows: 1, count: 2 });
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    assert.match(page, /Print at 100% \/ Actual size/);
    assert.match(page, /Do not choose Fit to page/);
    assert.match(page, /class="print-inch"/);
    assert.match(page, /const LETTER_MARGIN = 0\.4/);
    assert.match(page, /const CALIBRATE_IN = 1/);
  });

  it("keeps the printed card exact and moves the cut line out when laminate is on", () => {
    assert.equal(LAMINATE_BLEED_IN, 0.125);
    const samples = [
      { widthIn: 3.25, heightIn: 2 },
      { widthIn: 4.5, heightIn: 2.5 },
      { widthIn: 3.5, heightIn: 2.25 },
      { widthIn: 5, heightIn: 3 },
      { widthIn: 3.63, heightIn: 2.12 },
      { widthIn: 2.75, heightIn: 2.15 },
      { widthIn: 4.75, heightIn: 2.25 },
    ];
    for (const size of samples) {
      const off = laminateCutInches(size.widthIn, size.heightIn, false);
      assert.deepEqual(off, {
        bleedIn: 0,
        contentWidthIn: size.widthIn,
        contentHeightIn: size.heightIn,
        cutWidthIn: size.widthIn,
        cutHeightIn: size.heightIn,
      });
      const on = laminateCutInches(size.widthIn, size.heightIn, true);
      assert.equal(on.bleedIn, 0.125);
      assert.equal(on.contentWidthIn, size.widthIn);
      assert.equal(on.contentHeightIn, size.heightIn);
      assert.equal(on.cutWidthIn, Math.round((size.widthIn + 0.25) * 1000) / 1000);
      assert.equal(on.cutHeightIn, Math.round((size.heightIn + 0.25) * 1000) / 1000);
      assert.equal(on.cutWidthIn - on.contentWidthIn, 0.25);
      assert.equal(on.cutHeightIn - on.contentHeightIn, 0.25);
    }
    const cardGap = 0.03;
    const cardReserve = LETTER_SHEET.calibrateIn + LETTER_SHEET.calibrateGapIn + LETTER_SHEET.markOutIn;
    const cardSide = LETTER_SHEET.markPadIn;
    const fitOpts = { reserveIn: cardReserve, sidePadIn: cardSide };
    const onFit: Record<string, { cols: number; rows: number; count: number }> = {
      wrist: { cols: 2, rows: 3, count: 6 },
      youth: { cols: 1, rows: 3, count: 3 },
      softball: { cols: 2, rows: 3, count: 6 },
      large: { cols: 1, rows: 2, count: 2 },
      play: { cols: 2, rows: 3, count: 6 },
      triplePeewee: { cols: 2, rows: 3, count: 6 },
    };
    for (const [name, expectFit] of Object.entries(onFit)) {
      const size = CARD_SIZE_PRESETS[name as keyof typeof CARD_SIZE_PRESETS];
      const cut = laminateCutInches(size.widthIn, size.heightIn, true);
      const fit = letterSheetFit(cut.cutWidthIn, cut.cutHeightIn, cardGap, fitOpts);
      assert.deepEqual(fit, expectFit, name);
      assert.equal(letterBlockFits(cut.cutWidthIn, cut.cutHeightIn, fit.cols, fit.rows, cardGap, fitOpts), true, name);
    }
    const custom = laminateCutInches(3.63, 2.12, true);
    assert.deepEqual(custom, {
      bleedIn: 0.125,
      contentWidthIn: 3.63,
      contentHeightIn: 2.12,
      cutWidthIn: 3.88,
      cutHeightIn: 2.37,
    });
    assert.deepEqual(letterSheetFit(custom.cutWidthIn, custom.cutHeightIn, cardGap, fitOpts), {
      cols: 1,
      rows: 3,
      count: 3,
    });
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    assert.match(page, /id="laminate"/);
    assert.match(page, /const LAMINATE_BLEED_IN = 0\.125/);
    assert.match(page, /let laminateOn = false/);
    assert.match(page, /class="laminate-inset"/);
    assert.match(page, /data-laminate="/);
    assert.match(page, /data-content-w="/);
    assert.match(page, /data-cut-w="/);
    assert.match(page, /A clear 1\/8 in border sits on every side/);
    assert.match(page, /getElementById\("laminate"\)\.addEventListener\("change", function \(event\) \{\s*laminateOn = !!event\.target\.checked;\s*render\(\);\s*\}\);/);
    assert.match(page, /const cardGap = laminateOn \? 0\.03 : 0\.28/);
    assert.match(page, /const cardSide = laminateOn \? MARK_PAD : MARK_PAD \+ MARK_OUT/);
    const cardFn = page.slice(page.indexOf("function wristCardHtml"), page.indexOf("function cardPaint"));
    assert.match(cardFn, /const fontPt = fontPx \* 72 \/ 96/);
    assert.doesNotMatch(cardFn.slice(0, cardFn.indexOf("const fontPt")), /laminateOn/);
    assert.doesNotMatch(cardFn, /fontPt = [^;]*laminate/);
  });

  it("keeps the Wrist Coach editor usable on a phone", () => {
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    assert.match(page, /Card setup/);
    assert.match(page, /Name on the card/);
    assert.match(page, /Card you are editing/);
    assert.match(page, /First column/);
    assert.match(page, /First row/);
    assert.match(page, />\s*Blocks\s*</);
    assert.match(page, /Empty boxes/);
    assert.match(page, /data-library="pitch"/);
    assert.match(page, /data-library="location"/);
    assert.match(page, /let libraryKind = "offense"/);
    assert.match(page, /id="name-key"/);
    assert.match(page, /id="letter-preview"/);
    assert.match(page, /id="laminate"/);
    assert.match(page, /id="delete-modal"/);
    assert.match(page, /role="dialog"/);
    assert.match(page, /aria-modal="true"/);
    assert.match(page, /button:focus-visible/);
    assert.match(page, /\.swatch \{\s*width: 40px;/);
    assert.match(page, /Block columns/);
    assert.match(page, /Block rows/);
    assert.match(page, /aria-controls="library-panel-pitch"/);
    assert.match(page, /role="tabpanel"/);
    assert.match(page, /aria-label="Width in inches"/);
    assert.match(page, /\.count-step \{\s*width: 40px;/);
    assert.match(page, />Codes</);
    assert.match(page, />Names</);
    assert.match(page, /data-numbering="ordered"/);
    assert.match(page, /data-numbering="oneHand"/);
    assert.match(page, /data-call-weight/);
    assert.match(page, /One hand uses only the digits 1/);
    assert.doesNotMatch(page, /Copy and Create New Version/);
    assert.doesNotMatch(page, />Sign start</);
    assert.doesNotMatch(page, />Highlight</);
  });

  it("keeps cell and text colors on each call", () => {
    const book = normalizeBook(
      {
        title: "Color book",
        library: [
          {
            id: "pitch-fb",
            kind: "pitch",
            name: "Fastball",
            short: "FB",
            fill: "red",
            ink: "white",
          },
          { id: "loc-in", kind: "location", name: "Inside", short: "IN" },
        ],
        versions: [
          {
            id: "ver-1",
            name: "Version A",
            createdAt: 1,
            cells: [{ row: 0, col: 0, code: "11", callId: "pitch-fb" }],
          },
        ],
      },
      "user-9",
    );
    const fastball = book.library.find((item) => item.id === "pitch-fb");
    assert.equal(fastball?.fill, "red");
    assert.equal(fastball?.ink, "white");
    assert.deepEqual(callColors(fastball), { background: "#b91c1c", color: "#ffffff" });
    const inside = book.library.find((item) => item.id === "loc-in");
    assert.equal(inside?.fill, "clear");
    assert.equal(inside?.ink, "clear");
    assert.equal(inside?.count, 0);
  });

  it("keeps a sign count when the book is saved", () => {
    const book = normalizeBook(
      {
        title: "Counted",
        library: [
          { id: "play-br", kind: "offense", name: "Bunt + run", short: "B+R", count: 15 },
        ],
        versions: [],
      },
      "user-9",
    );
    assert.equal(book.library.find((item) => item.id === "play-br")?.count, 15);
  });

  it("groups the coach sheet by play and keeps sheet columns and rows", () => {
    const book = emptyBook("user-1", "PURPLE OFFENSE");
    assert.deepEqual(book.sheet, defaultSheet());
    assert.equal(book.sheet.cols, DEFAULT_SHEET_COLS);
    assert.equal(book.sheet.rows, DEFAULT_SHEET_ROWS);
    assert.deepEqual(normalizeSheet({ cols: 10, rows: 2 }), {
      cols: 10,
      rows: 2,
      preset: "card",
      widthIn: 3.5,
      heightIn: 5.5,
    });
    assert.deepEqual(normalizeSheet({ cols: 99, rows: 0 }), {
      cols: 20,
      rows: 1,
      preset: "card",
      widthIn: 3.5,
      heightIn: 5.5,
    });
    assert.deepEqual(normalizeSheet({ preset: "card" }), {
      cols: 15,
      rows: 1,
      preset: "card",
      widthIn: 3.5,
      heightIn: 5.5,
    });
    assert.deepEqual(normalizeSheet({ cols: 12, rows: 2, preset: "half" }), {
      cols: 12,
      rows: 2,
      preset: "half",
      widthIn: 8.5,
      heightIn: 5.5,
    });
    assert.deepEqual(normalizeSheet({ cols: 12, rows: 2, preset: "letter" }), {
      cols: 12,
      rows: 2,
      preset: "letter",
      widthIn: 8.5,
      heightIn: 11,
    });
    assert.deepEqual(normalizeSheet({ preset: "custom", widthIn: 6, heightIn: 4, cols: 10, rows: 1 }), {
      cols: 10,
      rows: 1,
      preset: "custom",
      widthIn: 6,
      heightIn: 4,
    });
    const saved = normalizeBook(
      {
        title: "Sheet book",
        sheet: { cols: 12, rows: 2 },
        library: defaultLibrary(),
        versions: [],
      },
      "user-9",
    );
    assert.deepEqual(saved.sheet, {
      cols: 12,
      rows: 2,
      preset: "card",
      widthIn: 3.5,
      heightIn: 5.5,
    });
    const version = activeVersion(book);
    assert.ok(version);
    const groups = sheetGroups(book, version);
    assert.ok(groups.length >= 1);
    const used = new Set(version.cells.map((cell) => cell.callId));
    assert.equal(groups.length, used.size);
    for (const group of groups) {
      assert.ok(group.codes.length >= 1);
      assert.ok(group.short);
      assert.ok(group.codes.every((code) => /^\d{3,}$/.test(code)));
    }
    const first = groups[0];
    assert.ok(book.library.some((call) => call.id === first.callId && call.kind === "offense"));
  });

  it("reorders plays and trades counts between two plays of the same type", () => {
    const book = emptyBook("user-1");
    const version = activeVersion(book);
    assert.ok(version);
    const counts = cardCounts(version);
    book.library = materializeKindCounts(book.library, "offense", counts);
    const offense = book.library.filter((item) => item.kind === "offense");
    assert.ok(offense.length >= 2);
    const firstId = offense[0].id;
    const secondId = offense[1].id;
    book.library = moveLibraryCall(book.library, firstId, 1);
    const moved = book.library.filter((item) => item.kind === "offense");
    assert.equal(moved[0].id, secondId);
    assert.equal(moved[1].id, firstId);
    const groups = sheetGroups({ ...book, library: book.library }, version);
    const offenseGroups = groups.filter((group) =>
      book.library.find((item) => item.id === group.callId)?.kind === "offense",
    );
    if (offenseGroups.length >= 2) {
      const firstGroup = offenseGroups.find((group) => group.callId === firstId);
      const secondGroup = offenseGroups.find((group) => group.callId === secondId);
      if (firstGroup && secondGroup) {
        assert.ok(
          offenseGroups.indexOf(secondGroup) < offenseGroups.indexOf(firstGroup),
        );
      }
    }
    const source = book.library.find((item) => item.id === firstId);
    const other = book.library.find((item) => item.id === secondId);
    assert.ok(source && other);
    const nextSource = source.count + 1;
    const traded = rebalanceCounts(book.library, firstId, secondId, nextSource);
    assert.ok(traded);
    assert.equal(traded.find((item) => item.id === firstId)?.count, source.count + 1);
    assert.equal(traded.find((item) => item.id === secondId)?.count, other.count - 1);
    assert.equal(
      rebalanceCounts(book.library, firstId, secondId, source.count + other.count + 1),
      null,
    );
  });

  it("uses the reference pink and red as defaults and migrates only an untouched purple card", () => {
    const fresh = emptyBook("coach-1");
    assert.equal(fresh.title, "My signs");
    assert.equal(fresh.theme.band, OFFENSE_BAND);
    assert.equal(fresh.theme.ink, "#ffffff");
    assert.equal(OFFENSE_BAND, "#ff0000");
    assert.equal(DEFENSE_BAND, "#f7bad1");
    assert.equal(activeVersion(fresh)?.themes.offense.band, "#ff0000");
    assert.equal(activeVersion(fresh)?.themes.offense.ink, "#ffffff");
    assert.equal(activeVersion(fresh)?.themes.defense.band, "#f7bad1");
    assert.equal(activeVersion(fresh)?.themes.defense.ink, "#000000");
    assert.equal(layoutFor(fresh, "offense").rows, 5);
    assert.equal(layoutFor(fresh, "offense").cols, 5);
    assert.equal(layoutFor(fresh, "defense").rows, 4);
    assert.equal(layoutFor(fresh, "defense").cols, 4);
    assert.equal(fresh.cardSize.preset, "softball");
    assert.equal(fresh.cardSize.widthIn, 3.5);
    assert.equal(fresh.cardSize.heightIn, 2.25);
    const offense = defaultLibrary().filter((call) => call.kind === "offense");
    for (const code of ["X", "P", "B1", "FBS", "SAS", "H+R", "SS3B"]) {
      assert.ok(offense.some((call) => call.short === code), code);
    }
    assert.equal(offense.find((call) => call.short === "X")?.decoy, true);
    assert.equal(offense.some((call) => call.short === "H&R"), false);
    assert.equal(offense.find((call) => call.short === "SS3B")?.short, "SS3B");

    const kept = upgradeLibrary([
      { id: "play-hr", kind: "offense", name: "Hit and run", short: "H&R", fill: "clear", ink: "clear", count: 4, weight: 2 },
      { id: "play-x", kind: "offense", name: "X", short: "X", fill: "clear", ink: "clear", count: 3, weight: 0 },
      { id: "custom", kind: "offense", name: "Team play", short: "ZZ", fill: "clear", ink: "clear", count: 2, weight: 0 },
      { id: "def-hld", kind: "defense", name: "Hold", short: "HLD", fill: "clear", ink: "clear", count: 1, weight: 0 },
      { id: "loc-in", kind: "location", name: "Inside", short: "IN", fill: "clear", ink: "clear", count: 0, weight: 0 },
    ]);
    assert.equal(kept.find((call) => call.id === "play-hr")?.short, "H+R");
    assert.equal(kept.find((call) => call.id === "play-hr")?.count, 4);
    assert.equal(kept.find((call) => call.id === "play-x")?.decoy, true);
    assert.equal(kept.find((call) => call.id === "play-x")?.count, 3);
    assert.equal(kept.find((call) => call.id === "custom")?.count, 2);
    assert.equal(kept.filter((call) => call.short === "H+R").length, 1);
    assert.equal(kept.find((call) => call.short === "P")?.count, 0);
    assert.equal(kept.find((call) => call.short === "SS3B")?.count, 0);

    function fill(rows: number, cols: number, callId: string) {
      const cells = [];
      for (let grid = 0; grid < 6; grid += 1) {
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            cells.push({ grid, row, col, code: `${grid}${row}${col}`, callId });
          }
        }
      }
      return cells;
    }
    const offenseCells = fill(5, 5, "play-x");
    const defenseCells = fill(5, 5, "def-hld");
    const purple = {
      title: "SOFTBALLBOT'S SIGNS",
      theme: { band: "#7e22ce", ink: "#ffffff", highlight: "#ffffff" },
      cardSize: { preset: "large", widthIn: 5, heightIn: 3 },
      rows: 5,
      cols: 5,
      grids: 6,
      kindLayouts: { offense: { rows: 5, cols: 5 }, defense: { rows: 5, cols: 5 } },
      library: defaultLibrary().map((call) =>
        call.id === "play-hr" ? { ...call, short: "H&R", count: 9 } : call,
      ).filter((call) => call.short !== "P" && call.short !== "SS3B"),
      activeVersionId: "ver-c",
      versions: [
        {
          id: "ver-b",
          name: "Version B",
          createdAt: 10,
          titles: { offense: "SOFTBALLBOT'S SIGNS", defense: "Defense" },
          themes: {
            offense: { band: "#7e22ce", ink: "#ffffff", highlight: "#ffffff" },
            defense: { band: "#7e22ce", ink: "#ffffff", highlight: "#ffffff" },
          },
          offenseCells,
          defenseCells,
        },
        { id: "ver-c", name: "Version C", createdAt: 11, offenseCells, defenseCells },
      ],
    };
    assert.equal(isUntouchedLegacyCard(purple), true);
    assert.equal(isUntouchedLegacyCard({
      theme: { band: "#c00000" },
      cardSize: { preset: "large", widthIn: 5, heightIn: 3 },
      rows: 5,
      cols: 5,
      kindLayouts: { offense: { rows: 5, cols: 5 }, defense: { rows: 5, cols: 5 } },
    }), false);
    assert.equal(isUntouchedLegacyCard({
      theme: { band: "#7e22ce" },
      cardSize: { preset: "wrist", widthIn: 3.25, heightIn: 2 },
      rows: 5,
      cols: 5,
      kindLayouts: { offense: { rows: 5, cols: 5 }, defense: { rows: 5, cols: 5 } },
    }), false);
    assert.equal(isUntouchedLegacyCard({
      theme: { band: "#7e22ce" },
      cardSize: { preset: "large", widthIn: 5, heightIn: 3 },
      kindLayouts: { offense: { rows: 5, cols: 5 }, defense: { rows: 4, cols: 4 } },
    }), false);
    const migrated = normalizeBook(purple, "softballbot", "softballbot's signs");
    assert.equal(migrated.title, "SOFTBALLBOT'S SIGNS");
    assert.equal(migrated.theme.band, "#ff0000");
    assert.equal(migrated.theme.ink, "#ffffff");
    assert.equal(migrated.cardSize.preset, "softball");
    assert.equal(migrated.cardSize.widthIn, 3.5);
    assert.equal(migrated.cardSize.heightIn, 2.25);
    assert.equal(migrated.kindLayouts.defense.rows, 4);
    assert.equal(migrated.kindLayouts.defense.cols, 4);
    assert.equal(migrated.kindLayouts.offense.rows, 5);
    assert.equal(migrated.versions.map((version) => version.name).join(","), "Version B,Version C");
    assert.equal(migrated.activeVersionId, "ver-c");
    const keptVersion = migrated.versions[0];
    assert.equal(keptVersion.titles.offense, "SOFTBALLBOT'S SIGNS");
    assert.equal(keptVersion.themes.defense.band, "#f7bad1");
    assert.equal(keptVersion.themes.defense.ink, "#000000");
    assert.equal(keptVersion.offenseCells.length, 150);
    assert.ok(keptVersion.offenseCells.every((cell) => cell.callId === "play-x"));
    assert.equal(keptVersion.defenseCells.length, 96);
    assert.equal(migrated.library.find((call) => call.id === "play-hr")?.short, "H+R");
    assert.equal(migrated.library.find((call) => call.id === "play-hr")?.count, 9);
    assert.equal(migrated.library.find((call) => call.short === "P")?.count, 0);
    assert.equal(migrated.library.find((call) => call.short === "SS3B")?.count, 0);
    assert.equal(migrated.library.find((call) => call.short === "X")?.decoy, true);

    const chosen = normalizeBook({
      title: "My navy card",
      theme: { band: "#112233", ink: "#ffffff", highlight: "#ffffff" },
      cardSize: { preset: "large", widthIn: 5, heightIn: 3 },
      rows: 5,
      cols: 5,
      grids: 6,
      kindLayouts: { offense: { rows: 5, cols: 5 }, defense: { rows: 5, cols: 5 } },
      library: defaultLibrary(),
      versions: [{
        id: "ver-a",
        name: "Version A",
        createdAt: 1,
        themes: {
          offense: { band: "#112233", ink: "#ffffff", highlight: "#ffffff" },
          defense: { band: "#445566", ink: "#ffffff", highlight: "#ffffff" },
        },
        offenseCells,
        defenseCells,
      }],
    }, "coach-1");
    assert.equal(chosen.title, "My navy card");
    assert.equal(chosen.theme.band, "#112233");
    assert.equal(chosen.cardSize.preset, "large");
    assert.equal(chosen.cardSize.widthIn, 5);
    assert.equal(chosen.kindLayouts.defense.rows, 5);
    assert.equal(activeVersion(chosen)?.themes.defense.band, "#445566");
    assert.equal(activeVersion(chosen)?.defenseCells.length, 150);

    const coded = normalizeBook({
      title: "Codes",
      library: [{ id: "play-ss3b", kind: "offense", name: "Steal second and third", short: "ss3b" }],
      versions: [],
    }, "coach-1");
    assert.equal(coded.library.find((call) => call.id === "play-ss3b")?.short, "SS3B");

    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    assert.match(page, /id="reset-defaults"/);
    assert.match(page, /id="name-search"/);
    assert.match(page, /id="name-box"/);
    assert.match(page, /title: "My signs"/);
    assert.doesNotMatch(page, /function hubName/);
    assert.doesNotMatch(page, /userName/);
    assert.doesNotMatch(page, /Saved on the server/);
    assert.match(page, /setStatus\("Saved", true\)/);
    assert.match(page, /#ff0000/);
    assert.match(page, /#f7bad1/);
    assert.match(page, /PREVIOUS_OFFENSE_BAND = "#c00000"/);
    assert.match(page, /PREVIOUS_DEFENSE_BAND = "#f87080"/);
    assert.match(page, /footerPt = 8/);
    assert.doesNotMatch(page, /addText\(bandTitle\(\)/);
    assert.match(page, /slice\(0, 5\)/);
    assert.match(page, /count: 1/);
    assert.match(page, /if \(pendingCount\) return/);
    assert.match(page, /background: #fff/);
    assert.match(page, /width: min\(100%, 8\.5in\)/);
    assert.match(page, /items-start/);
    assert.match(page, /\.version-row/);
    const route = readFileSync(new URL("../../src/app/api/softball/wrist-coach/route.ts", import.meta.url), "utf8");
    assert.doesNotMatch(route, /'s signs/);
    assert.doesNotMatch(route, /session\.name/);
    assert.doesNotMatch(route, /stored\?\.name/);
    assert.doesNotMatch(route, /password|token|email/i);
  });

  it("migrates untouched last-round colors, keeps custom colors, and leaves a custom size", () => {
    function fill(rows: number, cols: number, callId: string) {
      const cells = [];
      for (let grid = 0; grid < 6; grid += 1) {
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            cells.push({ grid, row, col, code: `${grid}${row}${col}`, callId });
          }
        }
      }
      return cells;
    }
    const previous = {
      title: "SOFTBALLBOT'S SIGNS",
      theme: { band: "#C00000", ink: "#000000", highlight: "#ffffff" },
      cardSize: { preset: "wrist", widthIn: 3.25, heightIn: 2 },
      rows: 5,
      cols: 5,
      grids: 6,
      kindLayouts: { offense: { rows: 5, cols: 5 }, defense: { rows: 4, cols: 4 } },
      library: defaultLibrary(),
      versions: [{
        id: "ver-a",
        name: "Version A",
        createdAt: 1,
        themes: {
          offense: { band: PREVIOUS_OFFENSE_BAND, ink: "#000000", highlight: "#ffffff" },
          defense: { band: PREVIOUS_DEFENSE_BAND, ink: "#000000", highlight: "#ffffff" },
        },
        offenseCells: fill(5, 5, "play-x"),
        defenseCells: fill(4, 4, "def-hld"),
      }],
    };
    assert.equal(isUntouchedPreviousColors(previous), true);
    assert.equal(isPreviousDefaultSize(previous), true);
    assert.equal(isUntouchedLegacyCard(previous), false);
    const moved = normalizeBook(previous, "softballbot");
    assert.equal(moved.title, "SOFTBALLBOT'S SIGNS");
    assert.equal(moved.theme.band, "#ff0000");
    assert.equal(moved.theme.ink, "#ffffff");
    assert.equal(activeVersion(moved)?.themes.defense.band, "#f7bad1");
    assert.equal(activeVersion(moved)?.themes.defense.ink, "#000000");
    assert.equal(moved.cardSize.preset, "softball");
    assert.equal(moved.cardSize.widthIn, 3.5);
    assert.equal(moved.cardSize.heightIn, 2.25);
    assert.equal(moved.kindLayouts.defense.rows, 4);
    assert.ok(activeVersion(moved)?.offenseCells.every((cell) => cell.callId === "play-x"));

    const sized = normalizeBook({
      ...previous,
      cardSize: { preset: "youth", widthIn: 4.5, heightIn: 2.5 },
    }, "softballbot");
    assert.equal(sized.theme.band, "#ff0000");
    assert.equal(sized.cardSize.preset, "youth");
    assert.equal(sized.cardSize.widthIn, 4.5);

    const inked = normalizeBook({
      ...previous,
      theme: { band: "#c00000", ink: "#ffffff", highlight: "#ffffff" },
    }, "softballbot");
    assert.equal(isUntouchedPreviousColors(inked), false);
    assert.equal(inked.theme.band, "#c00000");
    assert.equal(inked.cardSize.preset, "wrist");

    const custom = normalizeBook({
      ...previous,
      theme: { band: "#112233", ink: "#000000", highlight: "#ffffff" },
      versions: [{
        ...previous.versions[0],
        themes: {
          offense: { band: "#112233", ink: "#000000", highlight: "#ffffff" },
          defense: { band: "#f87080", ink: "#000000", highlight: "#ffffff" },
        },
      }],
    }, "softballbot");
    assert.equal(custom.theme.band, "#112233");
    assert.equal(custom.cardSize.preset, "wrist");
  });

  it("drops the T prefix, dedupes H+R, and keeps every code unique", () => {
    const cells = [];
    for (let grid = 0; grid < 6; grid += 1) {
      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          cells.push({ grid, row, col, code: "011", callId: "t-hr" });
        }
      }
    }
    const raw = {
      title: "Codes",
      rows: 5,
      cols: 5,
      grids: 6,
      kindLayouts: { offense: { rows: 5, cols: 5 }, defense: { rows: 4, cols: 4 } },
      library: [
        { id: "t-x", kind: "offense", name: "T X", short: "X", fill: "clear", ink: "clear", count: 5, weight: 0 },
        { id: "play-x", kind: "offense", name: "X", short: "X", fill: "clear", ink: "clear", count: 1, weight: 0 },
        { id: "t-hr", kind: "offense", name: "T Hit and run", short: "H+R", fill: "clear", ink: "clear", count: 1, weight: 0 },
        { id: "play-hr", kind: "offense", name: "Hit and run", short: "H+R", fill: "clear", ink: "clear", count: 4, weight: 0 },
        { id: "t-ss", kind: "offense", name: "T SS3B", short: "SS3B", fill: "clear", ink: "clear", count: 2, weight: 0 },
        { id: "custom", kind: "offense", name: "T Takeoff", short: "TOF", fill: "clear", ink: "clear", count: 1, weight: 0 },
      ],
      versions: [{ id: "ver-a", name: "Version A", createdAt: 1, offenseCells: cells, cells }],
    };
    const migrated = normalizeBook(raw, "coach-1");
    const offense = migrated.library.filter((call) => call.kind === "offense");
    assert.equal(offense.filter((call) => call.short === "X").length, 1);
    assert.equal(offense.find((call) => call.short === "X")?.name, "X");
    assert.equal(offense.find((call) => call.short === "X")?.count, 5);
    assert.equal(offense.filter((call) => call.short === "H+R").length, 1);
    assert.equal(offense.find((call) => call.short === "H+R")?.id, "play-hr");
    assert.equal(offense.find((call) => call.short === "H+R")?.name, "Hit and run");
    assert.equal(offense.find((call) => call.short === "H+R")?.count, 4);
    assert.equal(offense.find((call) => call.short === "SS3B")?.name, "Steal second and third");
    assert.equal(offense.find((call) => call.id === "custom")?.name, "T Takeoff");
    assert.deepEqual(duplicateShorts(offense), []);
    assert.equal(shortInUse(offense, "offense", "H+R"), true);
    assert.equal(shortInUse(offense, "offense", "ZZZ"), false);
    assert.equal(activeVersion(migrated)?.offenseCells[0].callId, "play-hr");
    const direct = migrateCalls([
      { id: "a", kind: "offense", name: "T X", short: "X", fill: "clear", ink: "clear", count: 0, weight: 0 },
      { id: "b", kind: "offense", name: "Hit and run", short: "H+R", fill: "clear", ink: "clear", count: 2, weight: 0 },
      { id: "c", kind: "offense", name: "T Hit and run", short: "H+R", fill: "clear", ink: "clear", count: 9, weight: 0 },
    ]);
    assert.equal(direct.library.filter((call) => call.short === "H+R").length, 1);
    assert.equal(direct.library.find((call) => call.short === "H+R")?.count, 9);
    assert.equal(direct.library.find((call) => call.short === "H+R")?.name, "Hit and run");
    assert.equal(direct.alias.b, direct.library.find((call) => call.short === "H+R")?.id);
    assert.equal(duplicateShorts(upgradeLibrary(defaultLibrary())).length, 0);
  });

  it("spreads reset boxes evenly and includes decoys without taking the extras first", () => {
    const calls = [
      { id: "ha", decoy: false },
      { id: "bnt", decoy: false },
      { id: "slp", decoy: false },
      { id: "stl", decoy: false },
      { id: "x", decoy: true },
    ];
    const counts = evenSpreadCounts(calls, 8);
    assert.deepEqual(counts, { ha: 2, bnt: 2, slp: 2, stl: 1, x: 1 });
    const values = Object.values(counts);
    assert.ok(Math.max(...values) - Math.min(...values) <= 1);
    const book = emptyBook("coach-1");
    const offense = book.library.filter((call) => call.kind === "offense");
    const total = cellCount(layoutFor(book, "offense"));
    const spread = evenSpreadCounts(offense, total);
    const nums = offense.map((call) => spread[call.id] || 0);
    assert.equal(nums.reduce((sum, count) => sum + count, 0), total);
    assert.ok(Math.max(...nums) - Math.min(...nums) <= 1);
    const decoyCount = spread[offense.find((call) => call.decoy)?.id || ""] || 0;
    assert.ok(decoyCount > 0);
    assert.ok(offense.filter((call) => !call.decoy).every((call) => (spread[call.id] || 0) >= decoyCount));
    const next = spreadLibrary(book.library, "offense", total);
    assert.equal(next.find((call) => call.short === "HA")?.count, spread["play-ha"]);
    assert.equal(next.filter((call) => call.kind === "defense").every((call) => call.count === book.library.find((item) => item.id === call.id)?.count), true);
  });

  it("prints every starter and the full offense list on the coach sheet", () => {
    const starters = ["X", "P", "B1", "FBS", "SAS", "H+R", "SS3B"];
    const starterBlocks = starters.map((short) => {
      const call = defaultLibrary().find((item) => item.kind === "offense" && item.short === short);
      assert.ok(call);
      return { name: call.name, short: call.short, codes: ["011", "012"] };
    });
    const starterPages = paginateCoachSheet(starterBlocks, { cols: 15, rows: 1, heightIn: 5.5 });
    assert.deepEqual(starterPages.flat().map((block) => block.short), starters);
    const offenseBlocks = defaultLibrary()
      .filter((call) => call.kind === "offense")
      .map((call) => ({ name: call.name, short: call.short, codes: ["011"] }));
    const pages = paginateCoachSheet(offenseBlocks, { cols: 15, rows: 1, heightIn: 5.5 });
    assert.ok(pages.length > 1);
    assert.deepEqual(pages.flat().map((block) => block.short), offenseBlocks.map((block) => block.short));
    const flat = pages.flat().map((block) => block.short);
    assert.ok(flat.indexOf("FBS") < flat.length - 1);
    assert.ok(flat.includes("SS3B"));
    assert.ok(flat.includes("HA"));
    const tiny = paginateCoachSheet(starterBlocks, { cols: 15, rows: 1, heightIn: 2 });
    assert.ok(tiny.length > 1);
    assert.deepEqual(tiny.flat().map((block) => block.short), starters);
  });

  it("marks decoys on the names sheet and keeps the round 16 page controls", () => {
    const book = emptyBook("coach-1");
    const version = activeVersion(book);
    assert.ok(version);
    version.offenseCells[0].callId = "play-x";
    version.cells[0].callId = "play-x";
    const group = sheetGroups(book, version).find((item) => item.short === "X");
    assert.equal(group?.decoy, true);
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    assert.match(page, /id="new-book"/);
    assert.match(page, /Start a new book titled My signs/);
    assert.match(page, /max-h-\[calc\(100dvh-2rem\)\]/);
    assert.match(page, /id="count-modal-panel"/);
    assert.match(page, /closest\("#count-modal-panel"\)/);
    assert.match(page, /headerInk = "#ffffff"/);
    assert.match(page, /class="add-call/);
    assert.match(page, /class="swatch-line"/);
    assert.match(page, /name-decoy/);
    assert.match(page, /function paginateCoachSheet/);
    assert.match(page, /function shortInUse/);
    assert.match(page, /print-color-adjust:exact/);
    assert.match(page, /-webkit-print-color-adjust:exact/);
    assert.match(page, /mark === "blue" \|\| mark === "orange"/);
    assert.doesNotMatch(page, /Math\.max\(10,/);
    const resetStart = page.indexOf('getElementById("reset-defaults")');
    const resetEnd = page.indexOf('getElementById("new-book")');
    const reset = page.slice(resetStart, resetEnd);
    assert.match(reset, /evenSpreadCounts/);
    assert.doesNotMatch(reset, /cardSize/);
    assert.match(page, /The card size stays/);
  });

  it("normalize repairs a missing book and keeps the user id", () => {
    const book = normalizeBook({ title: "  ", versions: [] }, "user-9", "Coach book");
    assert.equal(book.userId, "user-9");
    assert.equal(book.title, "Coach book");
    assert.ok(book.versions.length >= 1);
    assert.ok(book.library.length > 0);
    assert.deepEqual(book.theme, defaultTheme());
  });
});
