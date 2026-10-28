import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createContext, runInContext } from "node:vm";
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
  cellChrome,
  CARD_PAD_FRAC,
  CARD_RULE_PT,
  CARD_BLOCK_PT,
  CARD_BLOCK_STROKE,
  CARD_BAND_FRAC,
  CARD_MARK_PT,
  CARD_TYPE_RATIO,
  CARD_TEXT_RATIO,
  blockOutlineSvg,
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
  libraryForReset,
  libraryAfterRemoval,
  deleteVersion,
  headerInkFor,
  autoHeaderInk,
  readableHeaderTheme,
  HEADER_INK_DARK,
  paginateCoachSheet,
  layoutDefenseCoachSheet,
  DEFENSE_PLAY_MIN_PX,
  coachPlayLabel,
  coachPlayLines,
  coachPlayHeaderIn,
  coachSheetInnerWidth,
  COACH_CODE_CHAR_EM,
  coachSheetFrame,
  coachSheetPageFrame,
  coachPrintSheet,
  COACH_HEADER_CAP_IN,
  COACH_PRINT_HEIGHT_IN,
  buildKindCells,
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
      page.indexOf('const printId = printBtn && printBtn.getAttribute("data-ver-print")'),
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
    assert.equal(sidePadPt(13, 6), 0.325);
    assert.equal(sidePadPt(20, 6), 0.5);
    assert.equal(sidePadPt(15.6, 6), 0.39);
    assert.equal(sidePadPt(14, 6) / 14, sidePadPt(16.8, 6) / 16.8);
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
    assert.match(page, /sidePadPt\(cellWPt, layout\.grids\)/);
    assert.match(page, /knockoutPt\(fontPt\)/);
    assert.doesNotMatch(page, /const padPt = 0\.9/);
  });

  it("uses the same cell chrome on a 5×5 offense card and a 4×4 defense card", () => {
    const size = { widthIn: 3.5, heightIn: 2.25 };
    const offense = cellChrome(size, { grids: 6, cols: 5, rows: 5 }, 1.548);
    const defense = cellChrome(size, { grids: 6, cols: 4, rows: 4 }, 1.237);
    assert.ok(Math.abs(offense.padFrac - defense.padFrac) < 1e-9);
    assert.ok(Math.abs(offense.padFrac - CARD_PAD_FRAC) < 1e-9);
    assert.equal(offense.padPt, 0.35);
    assert.equal(defense.padPt, 0.42);
    assert.equal(offense.borderPt, defense.borderPt);
    assert.equal(offense.borderPt, CARD_RULE_PT);
    assert.equal(offense.textRatio, defense.textRatio);
    assert.ok(Math.abs(offense.textRatio - CARD_TEXT_RATIO) < 1e-9);
    assert.ok(Math.abs(defense.textRatio - CARD_TEXT_RATIO) < 1e-9);
    assert.ok(Math.abs(offense.fontRatio - defense.fontRatio) < 1e-9);
    assert.ok(offense.fontRatio <= CARD_TYPE_RATIO + 1e-9);
    assert.ok(defense.fontRatio <= CARD_TYPE_RATIO + 1e-9);
    assert.equal(offense.align, defense.align);
    assert.equal(offense.align, "middle");
    assert.equal(offense.headerFill, "band");
    assert.equal(defense.headerFill, "band");
    assert.equal(offense.cornerFill, "band");
    assert.equal(defense.cornerFill, "band");
    const shared = 1.17;
    const offenseShared = cellChrome(size, { grids: 6, cols: 5, rows: 5 }, shared);
    const defenseShared = cellChrome(size, { grids: 6, cols: 4, rows: 4 }, shared);
    assert.ok(Math.abs(offenseShared.textRatio - defenseShared.textRatio) < 1e-9);
    assert.ok(Math.abs(offenseShared.fontRatio - defenseShared.fontRatio) < 1e-9);
    assert.ok(Math.abs(shared * offenseShared.fontPt / offenseShared.cellWPt - shared * defenseShared.fontPt / defenseShared.cellWPt) < 1e-9);
    assert.ok(Math.abs(offense.cellWPt * 18 - size.widthIn * 72) < 1e-6);
    assert.ok(Math.abs(defense.cellWPt * 15 - size.widthIn * 72) < 1e-6);
    assert.ok(Math.abs(offense.cellHPt * 13 - size.heightIn * 72) < 1e-6);
    assert.ok(Math.abs(defense.cellHPt * 10 + (size.heightIn * 72) * CARD_BAND_FRAC - size.heightIn * 72) < 1e-6);
    assert.ok(Math.abs(offense.fontRatio - defense.fontRatio) < 1e-9);
    assert.ok(offense.fontPt * 1.548 <= offense.cellWPt - offense.padPt * 2 + 1e-6);
    assert.ok(defense.fontPt * 1.237 <= defense.cellWPt - defense.padPt * 2 + 1e-6);
    const tight = cellChrome(size, { grids: 6, cols: 5, rows: 5 }, 3);
    assert.ok(tight.fontRatio < CARD_TYPE_RATIO);
    assert.ok(tight.textRatio < CARD_TEXT_RATIO);
    assert.ok(tight.fontPt * 3 <= tight.cellWPt - tight.padPt * 2 + 1e-6);
    assert.equal(tight.borderPt, offense.borderPt);
    assert.ok(Math.abs(tight.padFrac - offense.padFrac) < 1e-9);
    assert.equal(tight.align, offense.align);
    const reference = cellChrome({ widthIn: 3.5, heightIn: 2 }, { grids: 2, cols: 5, rows: 5 }, 1.548);
    assert.equal(reference.padPt, 0.9);
    const twoBlock = cardGridMetrics({ widthIn: 3.5, heightIn: 2 }, { grids: 2, cols: 5, rows: 5 });
    assert.ok(Math.abs(twoBlock.cellH * 7 - 2) < 1e-9);
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    assert.match(page, /function cellChrome\(size, layout, labelEm\)/);
    assert.match(page, /headerFill: "band"/);
    assert.match(page, /const CARD_RULE_PT = 0\.25/);
    assert.match(page, /const CARD_MARK_PT = 0\.6/);
    assert.match(page, /const CARD_TYPE_RATIO = 0\.68/);
    assert.match(page, /const CARD_TEXT_RATIO = 0\.59/);
    assert.match(page, /fontPt = cellWPt \* CARD_TEXT_RATIO/);
    assert.match(page, /cornerFill: "band"/);
    assert.match(page, /data-header-fill="/);
    assert.match(page, /data-corner-fill="/);
    assert.match(page, /data-pad-pt="/);
    assert.match(page, /data-rule-pt="/);
    assert.match(page, /data-font-ratio="/);
    assert.match(page, /data-text-ratio="/);
    assert.match(page, /data-mark-pt="/);
    assert.match(page, /data-block-pt="/);
    assert.match(page, /data-align="/);
    assert.match(page, /const CARD_BLOCK_PT = 0\.75/);
    assert.match(page, /const CARD_BLOCK_STROKE = "#000000"/);
    assert.match(page, /const CARD_BAND_FRAC = 1 \/ 13/);
    assert.equal(CARD_BLOCK_PT, 0.75);
    assert.equal(CARD_BLOCK_STROKE, "#000000");
    assert.equal(CARD_BAND_FRAC, 1 / 13);
    assert.equal(CARD_MARK_PT, 0.6);
    assert.doesNotMatch(page, /cornerBand/);
    assert.match(page, /bandStrokeW: CARD_RULE_PT/);
    assert.match(page, /dataStrokeW: CARD_RULE_PT/);
    const cardFn = page.slice(page.indexOf("function wristCardHtml"), page.indexOf("function cardPaint"));
    assert.match(cardFn, /look\.bandFill,\s*"",\s*headerInk/);
    assert.match(cardFn, /const markPt = layout\.grids > 3 \? CARD_MARK_PT : 0/);
    assert.match(cardFn, /const sw = markPt \|\| sizePt \* 0\.07/);
    assert.match(cardFn, /data-block-outline="1"/);
    assert.match(cardFn, /n\(CARD_BLOCK_PT\)/);
    assert.match(cardFn, /CARD_BLOCK_STROKE/);
    assert.doesNotMatch(cardFn, /"#ffffff",\s*"",/);
    assert.doesNotMatch(cardFn, /bandKind !== "defense"/);
    function strokeWidths(svg: string): string[] {
      return [...svg.matchAll(/stroke-width="([^"]+)"/g)].map((match) => match[1]);
    }
    const offenseSvg = blockOutlineSvg(size, { grids: 6, cols: 5, rows: 5 });
    const defenseSvg = blockOutlineSvg(size, { grids: 6, cols: 4, rows: 4 });
    const offenseStrokes = strokeWidths(offenseSvg);
    const defenseStrokes = strokeWidths(defenseSvg);
    assert.equal(offenseStrokes.length, 6);
    assert.equal(defenseStrokes.length, 6);
    assert.deepEqual(offenseStrokes, defenseStrokes);
    assert.ok(offenseStrokes.every((width) => width === "0.75"));
    assert.equal((offenseSvg.match(/data-block-outline="1"/g) || []).length, 6);
    assert.equal((defenseSvg.match(/data-block-outline="1"/g) || []).length, 6);
    assert.equal((offenseSvg.match(/stroke="#000000"/g) || []).length, 6);
    assert.equal((defenseSvg.match(/stroke="#000000"/g) || []).length, 6);
  });

  it("renders factory and custom cards with finite SVG attributes", () => {
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    const metricsFn = page.slice(page.indexOf("function playerCardMetrics"), page.indexOf("function labelsOnCard"));
    assert.match(metricsFn, /footerIn: metrics\.footerIn/);
    assert.match(metricsFn, /contentRows: metrics\.contentRows/);
    const nameTools = page.slice(page.indexOf('id="name-tools"'), page.indexOf('id="name-key"'));
    assert.match(nameTools, /id="name-search"/);
    assert.match(nameTools, /placeholder="Code or name"/);
    assert.match(nameTools, /id="name-box"/);
    assert.match(nameTools, /aria-label="Look up a box number"/);
    assert.match(page, /id="view-coach"/);
    assert.match(page, /tools\.classList\.remove\("hidden"\)/);

    const rendered = renderWristCards(page);
    const cards = [
      { name: "offense", html: rendered.offense, widthIn: 3.5, heightIn: 2.25, fill: "#ff0000" },
      { name: "defense", html: rendered.defense, widthIn: 3.5, heightIn: 2.25, fill: "#f7bad1" },
      { name: "custom", html: rendered.custom, widthIn: 4.25, heightIn: 2.5, fill: "#ff0000" },
    ];
    for (const card of cards) {
      const bad = nonFiniteSvgAttributes(card.html);
      assert.deepEqual(bad, [], card.name + " " + bad.slice(0, 4).join(" | "));
      assert.equal(card.html.includes("NaN"), false, card.name);
      assert.equal(card.html.includes("undefined"), false, card.name);
      assert.equal(card.html.includes("Infinity"), false, card.name);
      const box = cardViewBox(card.html);
      assert.equal(box.w, Math.round(card.widthIn * 72 * 1000) / 1000);
      assert.equal(box.h, Math.round(card.heightIn * 72 * 1000) / 1000);
      const outlines = [...card.html.matchAll(/<path data-block-outline="1"[^>]*>/g)].map((match) => match[0]);
      assert.equal(outlines.length, 6, card.name);
      const tops = outlines.map((path) => {
        assert.match(path, /stroke="#000000"/);
        assert.match(path, /stroke-width="0\.75"/);
        const y = path.match(/d="M [-\d.]+ ([-\d.]+)/);
        assert.ok(y, path);
        const value = Number(y[1]);
        assert.equal(Number.isFinite(value), true, card.name);
        return value;
      });
      tops.sort((a, b) => a - b);
      assert.ok(tops[2] < 1, card.name + " top row");
      assert.ok(tops[3] > box.h * 0.4, card.name + " second row");
      assert.ok(tops[5] < box.h, card.name);
      assert.match(card.html, /stroke-width="0\.25"/);
      assert.match(card.html, new RegExp('data-header-fill="' + card.fill + '"'));
      assert.match(card.html, /data-corner-fill="band"/);
      assert.match(card.html, /data-block-pt="0\.75"/);
      assert.match(card.html, /data-rule-pt="0\.25"/);
      if (card.name !== "custom") {
        assert.match(card.html, /data-text-ratio="0\.59"/);
        const ratio = card.html.match(/data-font-ratio="([^"]+)"/);
        assert.ok(ratio, card.name);
        assert.ok(Math.abs(Number(ratio[1]) - 0.663) < 0.001, card.name + " " + ratio[1]);
      }
      assert.match(card.html, />My signs</, card.name);
      assert.doesNotMatch(card.html, />MY SIGNS</, card.name);
      assert.doesNotMatch(card.html, /data-stamp=/, card.name);
      assert.doesNotMatch(card.html, /\u00b7/, card.name);
      assert.doesNotMatch(card.html, />VA</, card.name);
      assert.doesNotMatch(card.html, />Card</, card.name);
      const footer = card.html.match(/<rect x="0" y="([^"]+)" width="[^"]+" height="([^"]+)" fill="/);
      assert.ok(footer, card.name);
      assert.equal(Number.isFinite(Number(footer[1])), true);
      assert.ok(Number(footer[2]) > 0, card.name + " footer height");
    }
    assert.equal((rendered.offense.match(/data-block-outline="1"/g) || []).length, 6);
    assert.equal((rendered.defense.match(/data-block-outline="1"/g) || []).length, 6);
    assert.match(rendered.red, />Red</);
    assert.doesNotMatch(rendered.red, />RED</);
    assert.doesNotMatch(rendered.red, /\u00b7|vA|>VA</);
    assert.doesNotMatch(rendered.blank, />Card</);
    assert.doesNotMatch(rendered.blank, />My signs</);
    assert.doesNotMatch(rendered.blank, />Red</);
    assert.doesNotMatch(rendered.blank, />Offense</);
    assert.doesNotMatch(rendered.blank, />Defense</);
    assert.doesNotMatch(rendered.blank, /\u00b7/);
  });

  it("looks up a name and a box number in both Codes and Names view", () => {
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    const tools = page.slice(page.indexOf('<div id="name-tools"'), page.indexOf('id="name-box-hit"'));
    assert.doesNotMatch(tools, /\bhidden\b/);
    const nameFn = page.slice(page.indexOf("function renderNameKey"), page.indexOf("function renderCard"));
    assert.match(nameFn, /name-search/);
    assert.match(nameFn, /name-box/);
    assert.doesNotMatch(nameFn, /if \(!showCoachOnCard\)/);
    const looked = lookupNamesInBothViews(page);
    for (const view of ["codes", "names"] as const) {
      const result = looked[view];
      assert.equal(result.steal.toolsHidden, false, view);
      assert.equal(result.steal.keyHidden, false, view);
      assert.match(result.steal.list, /No steal/, view);
      assert.match(result.steal.list, />NS</, view);
      assert.doesNotMatch(result.steal.list, /Hold/, view);
      assert.equal(result.steal.hitHidden, true, view);
      assert.equal(result.box.hitHidden, false, view);
      assert.equal(result.box.hit, "032 is Hold (HLD)", view);
      assert.equal(result.missing.hitHidden, false, view);
      assert.equal(result.missing.hit, "No box 99", view);
    }
    assert.equal(looked.codes.steal.list, looked.names.steal.list);
    assert.equal(looked.codes.box.hit, looked.names.box.hit);
    assert.equal(looked.codes.missing.hit, looked.names.missing.hit);
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
        assert.ok(Math.abs(metrics.cellH * metrics.contentRows + metrics.footerIn - size.heightIn) < 1e-9);
        assert.equal(metrics.topCount, blocksAcross(layout.grids));
        assert.equal(metrics.topCount + metrics.bottomCount, layout.grids);
      }
    }
    assert.match(page, /function cardGridMetrics\(size, layout\)/);
    assert.match(page, /const metrics = cardGridMetrics\(size, layout\)/);
    assert.match(page, /data-type-pt="/);
    assert.match(page, /const fittedPt = fontPx \* 72 \/ 96/);
    assert.match(page, /const fontPt = layout\.grids > 3 \? chrome\.fontPt : fittedPt/);
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
    assert.match(cardFn, /const fittedPt = fontPx \* 72 \/ 96/);
    assert.match(cardFn, /const fontPt = layout\.grids > 3 \? chrome\.fontPt : fittedPt/);
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
    assert.match(page, /id="name-tools"/);
    assert.match(page, /id="view-coach"/);
    assert.match(page, /title: "My signs"/);
    assert.doesNotMatch(page, /function hubName/);
    assert.doesNotMatch(page, /userName/);
    assert.doesNotMatch(page, /Saved on the server/);
    assert.match(page, /setStatus\("Saved", true\)/);
    assert.match(page, /#ff0000/);
    assert.match(page, /#f7bad1/);
    assert.match(page, /PREVIOUS_OFFENSE_BAND = "#c00000"/);
    assert.match(page, /PREVIOUS_DEFENSE_BAND = "#f87080"/);
    assert.match(page, /function cardSetName/);
    assert.match(page, /addText\(setName,/);
    assert.match(page, /version\.titles\.offense = clean;/);
    assert.doesNotMatch(page, /clean \|\| "Offense"/);
    assert.doesNotMatch(page, /clean \|\| "Defense"/);
    assert.doesNotMatch(page, /clean \|\| "Card"/);
    assert.doesNotMatch(page, /function versionStamp/);
    assert.doesNotMatch(page, /function versionToken/);
    assert.doesNotMatch(page, /function versionDate/);
    assert.doesNotMatch(page, /data-stamp=/);
    assert.doesNotMatch(page, /hPt - footerSlot/);
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

  it("reset deals the same plays as a new book", () => {
    const tally = (cells: Array<{ callId: string }>) => {
      const counts: Record<string, number> = {};
      for (const cell of cells) {
        if (!cell.callId) continue;
        counts[cell.callId] = (counts[cell.callId] || 0) + 1;
      }
      return counts;
    };
    const fresh = emptyBook("coach-1");
    const freshVersion = activeVersion(fresh);
    assert.ok(freshVersion);
    const book = emptyBook("coach-1");
    const version = activeVersion(book);
    assert.ok(version);
    const offenseTotal = cellCount(layoutFor(book, "offense"));
    const defenseTotal = cellCount(layoutFor(book, "defense"));
    book.library = spreadLibrary(book.library, "offense", offenseTotal);
    version.offenseCells = buildKindCells(book, "offense");
    version.cells = version.offenseCells;
    const polluted = new Set(version.offenseCells.map((cell) => cell.callId).filter(Boolean));
    assert.ok(polluted.size >= 28);
    book.library = libraryForReset(
      book.library,
      "offense",
      version.offenseCells.map((cell) => cell.callId),
      offenseTotal,
    );
    book.library = libraryForReset(
      book.library,
      "defense",
      version.defenseCells.map((cell) => cell.callId),
      defenseTotal,
    );
    version.offenseCells = buildKindCells(book, "offense");
    version.defenseCells = buildKindCells(book, "defense");
    const offenseIds = [...new Set(version.offenseCells.map((cell) => cell.callId))].sort();
    const freshIds = [...new Set(freshVersion.offenseCells.map((cell) => cell.callId))].sort();
    assert.deepEqual(offenseIds, freshIds);
    assert.equal(offenseIds.length, 14);
    const offenseCounts = offenseIds.map((id) => tally(version.offenseCells)[id] || 0);
    assert.equal(offenseCounts.reduce((sum, count) => sum + count, 0), offenseTotal);
    assert.ok(Math.max(...offenseCounts) - Math.min(...offenseCounts) <= 1);
    const libraryCounts = book.library.filter((call) => call.kind === "offense" && call.count > 0).map((call) => call.count);
    assert.equal(libraryCounts.reduce((sum, count) => sum + count, 0), offenseTotal);
    assert.ok(Math.max(...libraryCounts) - Math.min(...libraryCounts) <= 1);
    assert.deepEqual(tally(version.defenseCells), tally(freshVersion.defenseCells));
    for (const short of ["HA", "SWG", "SQZ", "DBL", "SLH", "BFH", "P"]) {
      const call = book.library.find((item) => item.kind === "offense" && item.short === short);
      assert.ok(call);
      assert.equal(call.count, 0);
      assert.equal(version.offenseCells.some((cell) => cell.callId === call.id), false);
    }
    assert.equal(new Set(version.offenseCells.map((cell) => cell.callId)).size < 28, true);
    book.library.push({
      id: "off-custom",
      kind: "offense",
      name: "Trick",
      short: "TRK",
      fill: "clear",
      ink: "clear",
      count: 4,
    });
    version.offenseCells[0] = { ...version.offenseCells[0], callId: "off-custom" };
    book.library = libraryForReset(
      book.library,
      "offense",
      version.offenseCells.map((cell) => cell.callId),
      offenseTotal,
    );
    const custom = book.library.find((call) => call.id === "off-custom");
    assert.ok(custom && custom.count > 0);
    assert.equal(book.library.find((call) => call.short === "HA")?.count, 0);
    const withCustom = book.library.filter((call) => call.kind === "offense" && call.count > 0).map((call) => call.count);
    assert.equal(withCustom.reduce((sum, count) => sum + count, 0), offenseTotal);
    assert.ok(Math.max(...withCustom) - Math.min(...withCustom) <= 1);
  });

  it("spreads freed boxes across the calls that remain", () => {
    const book = emptyBook("coach-1");
    const total = cellCount(layoutFor(book, "defense"));
    const defense = book.library.filter((call) => call.kind === "defense");
    const victim = defense.find((call) => call.short === "NS");
    const hld = defense.find((call) => call.short === "HLD");
    assert.ok(victim && hld);
    book.library = book.library.map((call) => {
      if (call.kind !== "defense") return call;
      if (call.id === victim.id) return { ...call, count: total - (defense.length - 1) };
      return { ...call, count: 1 };
    });
    assert.equal(book.library.find((call) => call.id === hld.id)?.count, 1);
    const next = libraryAfterRemoval(book.library, "defense", victim.id, total);
    assert.equal(next.some((call) => call.id === victim.id), false);
    const counts = next.filter((call) => call.kind === "defense" && call.count > 0).map((call) => call.count);
    assert.equal(counts.length, defense.length - 1);
    assert.equal(counts.reduce((sum, count) => sum + count, 0), total);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    const hldAfter = next.find((call) => call.id === hld.id);
    assert.ok(hldAfter);
    assert.ok(hldAfter.count < 11);
    assert.equal(next.find((call) => call.short === "HA")?.count, book.library.find((call) => call.short === "HA")?.count);
    const withExtra = libraryAfterRemoval(
      [...book.library, { id: "def-custom", kind: "defense", name: "Custom", short: "ZZ", fill: "clear", ink: "clear", count: 0 }],
      "defense",
      victim.id,
      total,
    );
    assert.equal(withExtra.find((call) => call.id === "def-custom")?.count, 0);
    assert.ok((withExtra.find((call) => call.id === hld.id)?.count || 0) < 11);
  });

  it("deletes a version, switches the active one, and refuses the last", () => {
    const book = emptyBook("coach-1");
    const first = activeVersion(book);
    assert.ok(first);
    const second = copyCurrentVersion(book, first);
    second.name = "Version B";
    book.versions = [first, second];
    book.activeVersionId = second.id;
    const removedActive = deleteVersion(book, second.id);
    assert.ok(removedActive);
    assert.deepEqual(removedActive.versions.map((version) => version.id), [first.id]);
    assert.equal(removedActive.activeVersionId, first.id);
    const kept = deleteVersion(removedActive, first.id);
    assert.equal(kept, null);
    assert.equal(removedActive.versions.length, 1);
    book.activeVersionId = first.id;
    const removedOther = deleteVersion(book, second.id);
    assert.ok(removedOther);
    assert.equal(removedOther.activeVersionId, first.id);
    assert.equal(removedOther.versions.some((version) => version.id === second.id), false);
    const saved = normalizeBook(removedOther, "coach-1");
    assert.equal(saved.versions.some((version) => version.id === second.id), false);
    assert.equal(saved.activeVersionId, first.id);
    assert.equal(saved.versions.length, 1);
    assert.ok(saved.spentVersionLetters.includes("B"));
    assert.equal(nextVersionName(saved.versions, saved.spentVersionLetters), "Version C");
    const reused = copyCurrentVersion(saved, saved.versions[0]);
    assert.equal(reused.name, "Version C");
    const gapped = normalizeBook(
      {
        title: "Gap",
        library: defaultLibrary(),
        versions: [
          { id: "ver-a", name: "Version A", createdAt: 1, offenseCells: first.offenseCells, defenseCells: first.defenseCells },
          { id: "ver-c", name: "Version C", createdAt: 2, offenseCells: first.offenseCells, defenseCells: first.defenseCells },
        ],
        activeVersionId: "ver-a",
      },
      "coach-1",
    );
    assert.ok(gapped.spentVersionLetters.includes("B"));
    assert.equal(nextVersionName(gapped.versions, gapped.spentVersionLetters), "Version D");
  });

  it("uses dark header numbers on pink and keeps a color the coach picked", () => {
    const book = emptyBook("coach-1");
    const version = activeVersion(book);
    assert.ok(version);
    assert.equal(version.themes.offense.headerInk, "#ffffff");
    assert.equal(version.themes.defense.headerInk, HEADER_INK_DARK);
    assert.equal(autoHeaderInk("#ff0000"), "#ffffff");
    assert.equal(autoHeaderInk("#f7bad1"), "#111111");
    assert.equal(headerInkFor({ band: "#f7bad1" }), "#111111");
    assert.equal(headerInkFor({ band: "#ff0000" }), "#ffffff");
    assert.equal(headerInkFor({ band: "#f7bad1", headerInk: "#123456" }), "#123456");
    assert.equal(headerInkFor({ band: "#445566" }), "#ffffff");
    const untouched = readableHeaderTheme({ band: "#f7bad1", ink: "#000000", highlight: "#ffffff" });
    assert.equal(untouched.headerInk, "#111111");
    const chosen = readableHeaderTheme({ band: "#f7bad1", ink: "#000000", highlight: "#ffffff", headerInk: "#123456" });
    assert.equal(chosen.headerInk, "#123456");
    const custom = readableHeaderTheme({ band: "#112233", ink: "#ffffff", highlight: "#ffffff" });
    assert.equal(custom.headerInk, undefined);
    const saved = normalizeBook({
      title: "Factory",
      theme: { band: "#ff0000", ink: "#ffffff", highlight: "#ffffff" },
      library: defaultLibrary(),
      kindLayouts: defaultKindLayouts(),
      cardSize: { preset: "softball", widthIn: 3.5, heightIn: 2.25 },
      rows: 5,
      cols: 5,
      grids: 6,
      versions: [{
        id: version.id,
        name: version.name,
        createdAt: version.createdAt,
        themes: {
          offense: { band: "#ff0000", ink: "#ffffff", highlight: "#ffffff" },
          defense: { band: "#f7bad1", ink: "#000000", highlight: "#ffffff" },
        },
        offenseCells: version.offenseCells,
        defenseCells: version.defenseCells,
      }],
      activeVersionId: version.id,
    }, "coach-1");
    assert.equal(activeVersion(saved)?.themes.defense.headerInk, "#111111");
    assert.equal(activeVersion(saved)?.themes.offense.headerInk, "#ffffff");
    const picked = normalizeBook({
      title: "Picked",
      theme: { band: "#112233", ink: "#ffffff", highlight: "#ffffff" },
      library: defaultLibrary(),
      kindLayouts: defaultKindLayouts(),
      rows: 5,
      cols: 5,
      grids: 6,
      versions: [{
        id: version.id,
        name: version.name,
        createdAt: version.createdAt,
        themes: {
          offense: { band: "#112233", ink: "#ffffff", highlight: "#ffffff", headerInk: "#abcdef" },
          defense: { band: "#445566", ink: "#ffffff", highlight: "#ffffff" },
        },
        offenseCells: version.offenseCells,
        defenseCells: version.defenseCells,
      }],
      activeVersionId: version.id,
    }, "coach-1");
    assert.equal(activeVersion(picked)?.themes.offense.headerInk, "#abcdef");
    assert.equal(activeVersion(picked)?.themes.defense.headerInk, undefined);
    assert.equal(headerInkFor(activeVersion(picked)?.themes.defense), "#ffffff");
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

  it("packs a coach sheet at the readable row size and lets offense continue on the next page", () => {
    const sheet = { cols: 15, rows: 1, widthIn: 3.5, heightIn: 5.5 };
    const frame = coachSheetFrame(sheet);
    assert.ok(frame.capacity >= 15);
    assert.ok(frame.capacity < 20);
    assert.ok(frame.headerIn < 0.2);
    assert.ok(frame.headerIn > 0.12);
    assert.ok(frame.codeIn > frame.headerIn);
    const defense = defaultLibrary().filter((call) => call.kind === "defense");
    const blocksFor = (count: number) => Array.from({ length: count }, (_, index) => {
      const call = defense[index] || { name: `Extra ${index + 1}`, short: `E${index + 1}` };
      return { name: call.name, short: call.short, codes: ["11", "12", "13"] };
    });
    const fifteen = paginateCoachSheet(blocksFor(15), sheet);
    assert.equal(fifteen.length, 1);
    assert.equal(fifteen[0][fifteen[0].length - 1].short, "NS");
    assert.equal(fifteen[0][fifteen[0].length - 1].name, "No steal");
    const expectedPages = (count: number) => Math.ceil(count / frame.capacity);
    for (const count of [20, 30]) {
      const pages = paginateCoachSheet(blocksFor(count), sheet);
      assert.equal(pages.length, expectedPages(count), `${count} calls`);
      assert.ok(pages.length > 1, `${count} calls`);
      assert.equal(pages[0].length, frame.capacity);
      const last = count % frame.capacity || frame.capacity;
      assert.equal(pages[pages.length - 1].length, last);
      assert.deepEqual(pages.flat().map((block) => block.short), blocksFor(count).map((block) => block.short));
      const offensePages = paginateCoachSheet(
        blocksFor(count).map((block, index) => ({ ...block, short: `O${index + 1}` })),
        sheet,
      );
      assert.equal(offensePages.length, pages.length);
    }
    const printed = coachPrintSheet(sheet);
    assert.ok(printed.heightIn >= COACH_PRINT_HEIGHT_IN);
    assert.ok(printed.heightIn > sheet.heightIn);
    const printedFifteen = paginateCoachSheet(blocksFor(15), printed);
    assert.equal(printedFifteen.length, 1);
    const filled = coachSheetPageFrame(printed, 15);
    assert.ok(filled.headerIn <= COACH_HEADER_CAP_IN);
    const used = (1 + 15) * filled.headerIn + 15 * filled.codeIn;
    assert.ok(Math.abs(used - filled.innerH) < 1e-6);
    const leftover = coachSheetPageFrame(printed, 1);
    assert.ok(leftover.headerIn <= COACH_HEADER_CAP_IN);
    assert.ok(leftover.headerIn < 0.4);
    const thirty = paginateCoachSheet(blocksFor(30), printed);
    assert.ok(thirty.length > 1);
    const partial = coachSheetFrame(sheet);
    assert.equal(partial.headerIn, frame.headerIn);
    assert.equal(partial.bannerSize, frame.bannerSize);
    assert.equal(partial.codeSize, frame.codeSize);
  });

  it("keeps every defense coach call on one page at each sheet size", () => {
    const sheet = { cols: 15, rows: 1, widthIn: 3.5, heightIn: 5.5 };
    const printed = coachPrintSheet(sheet);
    const defense = defaultLibrary().filter((call) => call.kind === "defense");
    const shortDefense = defense.map((call) => ({
      name: call.name,
      short: call.short,
      codes: ["011", "12", "30-5"],
    }));
    const shortPages = layoutDefenseCoachSheet(shortDefense, sheet);
    assert.equal(shortPages.length, 1);
    assert.equal(shortPages[0].rows.length, shortDefense.length);
    assert.equal(shortPages[0].rows.at(-1)?.short, "NS");
    assert.ok(Math.abs(shortPages[0].playSize - DEFENSE_PLAY_MIN_PX) < 1e-6);
    assertCoachSheetFits(shortDefense, sheet);
    assertCoachSheetFits(shortDefense, printed);
    const sixteen = shortDefense.concat([{ name: "Extra coverage", short: "E16", codes: ["011"] }]);
    const sixteenPages = layoutDefenseCoachSheet(sixteen, sheet);
    assert.equal(sixteenPages.length, 1);
    assert.equal(sixteenPages[0].rows.length, 16);
    assert.ok(sixteenPages[0].playSize < DEFENSE_PLAY_MIN_PX);
    assertCoachSheetFits(sixteen, sheet);
    assert.equal(paginateCoachSheet(sixteen, sheet).length, 1);
    const longName = "Steal second and third on the first pitch after the fake when the runner reads the catcher";
    const longDefense = defense.map((call) => ({ name: longName, short: call.short, codes: ["011", "30-5"] }));
    const longScreen = layoutDefenseCoachSheet(longDefense, sheet);
    const longPrint = layoutDefenseCoachSheet(longDefense, printed);
    assert.equal(longScreen.length, 1);
    assert.equal(longPrint.length, 1);
    assert.ok(longScreen[0].playSize < DEFENSE_PLAY_MIN_PX);
    assert.ok(longScreen[0].rows.every((row) => row.lines === 1));
    assert.equal(paginateCoachSheet(longDefense, sheet).length, 1);
    assertCoachSheetFits(longDefense, sheet);
    assertCoachSheetFits(longDefense, printed);
    const crowded = defense.map((call) => ({
      name: longName,
      short: call.short,
      codes: Array.from({ length: 45 }, (_, index) => String(index + 1)),
    }));
    const sizes = [
      { name: "card", widthIn: 3.5, heightIn: 5.5 },
      { name: "letter", widthIn: 8.5, heightIn: 11 },
      { name: "half", widthIn: 8.5, heightIn: 5.5 },
      { name: "index", widthIn: 5, heightIn: 8 },
      { name: "custom", widthIn: 4, heightIn: 6 },
    ];
    for (const size of sizes) {
      const sized = { cols: 15, rows: 1, widthIn: size.widthIn, heightIn: size.heightIn };
      for (const book of [shortDefense, sixteen, longDefense, crowded]) {
        const pages = layoutDefenseCoachSheet(book, sized);
        assert.equal(pages.length, 1, size.name);
        assert.equal(pages[0].rows.length, book.length, size.name);
        assert.deepEqual(pages[0].rows.map((row) => row.short), book.map((block) => block.short), size.name);
        assertCoachSheetFits(book, sized);
      }
    }
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    assert.match(page, /\[data-kind="defense"\] \.sheet-code \{[^}]*overflow: visible/);
    assert.match(page, /\.coach-sheet \.sheet-code \{[^}]*overflow: hidden/);
    assert.match(page, /function layoutDefenseCoachSheet/);
    assert.match(page, /bandKind === "defense"/);
    const fromPage = coachSheetLayoutFromPage(page, longDefense, sheet);
    assert.deepEqual(JSON.parse(JSON.stringify(fromPage.layout)), JSON.parse(JSON.stringify(longScreen)));
    const html = fromPage.html;
    assert.match(html, /data-kind="defense"/);
    for (const block of longDefense) {
      assert.ok(html.includes(`${block.name} (${block.short})`), block.short);
    }
    const playRows = [...html.matchAll(/data-lines="(\d+)" style="height:([0-9.]+)in;font-size:([0-9.]+)px/g)];
    assert.equal(playRows.length, longDefense.length);
    let seen = 0;
    for (const layoutPage of longScreen) {
      let height = layoutPage.bannerIn;
      for (const row of layoutPage.rows) {
        const painted = playRows[seen];
        assert.ok(painted);
        assert.equal(Number(painted[1]), row.lines);
        assert.ok(Math.abs(Number(painted[2]) - row.headerIn) < 1e-9);
        assert.ok(Math.abs(Number(painted[3]) - layoutPage.playSize) < 1e-9);
        height += row.headerIn + row.codeRows * layoutPage.codeIn;
        seen += 1;
      }
      assert.ok(height <= layoutPage.innerH + 1e-6);
    }
  });

  it("prints the open view from the main Print / PDF button", () => {
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    assert.match(page, /Print \/ PDF cards/);
    assert.match(page, /Print \/ PDF coach sheet/);
    assert.match(page, /function mainPrintMode/);
    assert.match(page, /printNow\(mainPrintMode\(\)\)/);
    assert.doesNotMatch(page, /printNow\("both"\)/);
    assert.match(page, /id="coach-sheet-section"/);
    assert.match(page, /id="player-card-section"/);
    const size = { preset: "card", widthIn: 3.5, heightIn: 5.5 };
    for (const kind of ["defense", "offense"] as const) {
      const sheet = mainPrintFromPage(page, "sheet", size, kind);
      assert.equal(sheet.label, "Print / PDF coach sheet", kind);
      assert.equal(sheet.mode, "key", kind);
      assert.ok(sheet.html.includes("@page { size: letter; margin: 0; }"), kind);
      assert.ok(sheet.html.includes("@page coach-sheet { size: letter; margin: 0; }"), kind);
      assert.ok(sheet.html.includes('class="print-page print-key"'), kind);
      assert.ok(sheet.html.includes("width:8.5in;height:11in"), kind);
      const box = sheet.html.match(/class="coach-print-sheet" data-placement="top-left" data-left="([0-9.]+)" data-top="([0-9.]+)" data-width="([0-9.]+)" data-height="([0-9.]+)"/);
      assert.ok(box, kind);
      assert.ok(Math.abs(Number(box[3]) - 3.5) <= 0.02, kind);
      assert.ok(Math.abs(Number(box[4]) - 5.5) <= 0.02, kind);
      assert.equal(sheet.html.includes('class="print-page print-cards"'), false, kind);
      assert.equal(sheet.html.includes("width:7.7in"), false, kind);
      const cards = mainPrintFromPage(page, "cards", size, kind);
      assert.equal(cards.label, "Print / PDF cards", kind);
      assert.equal(cards.mode, "cards", kind);
      assert.ok(cards.html.includes('class="print-page print-cards"'), kind);
      assert.equal(cards.html.includes('class="print-page print-key"'), false, kind);
      assert.equal(cards.html.includes("@page coach-sheet"), false, kind);
    }
  });

  it("prints the coach sheet at the selected size on Letter paper", () => {
    const page = readFileSync(new URL("../../content/apps/wrist-coach.html", import.meta.url), "utf8");
    assert.match(page, /@page \{ size: letter; margin: 0\.4in; \}/);
    assert.match(page, /\.print-key \{ page: coach-sheet;/);
    assert.match(page, /@page coach-sheet \{ size: letter; margin: 0; \}/);
    const sizes = [
      { preset: "card", widthIn: 3.5, heightIn: 5.5 },
      { preset: "letter", widthIn: 8.5, heightIn: 11 },
      { preset: "half", widthIn: 8.5, heightIn: 5.5 },
      { preset: "index", widthIn: 5, heightIn: 8 },
      { preset: "custom", widthIn: 4, heightIn: 6 },
    ];
    for (const size of sizes) {
      for (const kind of ["defense", "offense"] as const) {
        for (const mode of ["key", "both"] as const) {
          const html = coachPrintHtmlFromPage(page, size, kind, mode);
          assert.match(html, /@page coach-sheet \{ size: letter; margin: 0; \}/, `${kind} ${mode} ${size.preset}`);
          assert.match(html, /data-paper="letter"/, size.preset);
          assert.match(html, /width:8\.5in;height:11in/, size.preset);
          assert.match(html, /class="coach-crop"/, size.preset);
          const boxes = [...html.matchAll(/class="coach-print-sheet" data-placement="top-left" data-left="([0-9.]+)" data-top="([0-9.]+)" data-width="([0-9.]+)" data-height="([0-9.]+)"/g)];
          assert.ok(boxes.length >= 1, size.preset);
          for (const box of boxes) {
            assert.ok(Math.abs(Number(box[3]) - size.widthIn) <= 0.02, `${size.preset} width ${box[3]}`);
            assert.ok(Math.abs(Number(box[4]) - size.heightIn) <= 0.02, `${size.preset} height ${box[4]}`);
            assert.ok(Number(box[1]) + Number(box[3]) <= 8.5 + 0.02, size.preset);
            assert.ok(Number(box[2]) + Number(box[4]) <= 11 + 0.02, size.preset);
          }
          const tables = [...html.matchAll(/class="coach-sheet-page[^"]*"[^>]*style="width:([0-9.]+)in;height:([0-9.]+)in/g)];
          assert.equal(tables.length, boxes.length, size.preset);
          for (const table of tables) {
            assert.ok(Math.abs(Number(table[1]) - size.widthIn) <= 0.02, size.preset);
            assert.ok(Math.abs(Number(table[2]) - size.heightIn) <= 0.02, size.preset);
          }
          assert.equal(html.includes("width:7.7in"), false, size.preset);
          assert.doesNotMatch(html, /@page coach-sheet \{ size: \d/, size.preset);
          if (mode === "key") assert.match(html, /@page \{ size: letter; margin: 0; \}/, kind);
          if (mode === "both") {
            assert.ok(html.includes('class="print-page print-cards"'), kind);
            assert.equal(html.includes("@page { size:"), false, kind);
          }
        }
      }
    }
    const oversized = coachPrintHtmlFromPage(page, { preset: "custom", widthIn: 9, heightIn: 12 }, "defense", "key");
    const big = oversized.match(/data-width="([0-9.]+)" data-height="([0-9.]+)"/);
    assert.ok(big);
    assert.ok(Number(big[1]) <= 8.5 + 0.02);
    assert.ok(Number(big[2]) <= 11 + 0.02);
    assert.ok(Number(big[1]) < 9);
    assert.match(oversized, /@page \{ size: letter; margin: 0; \}/);
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
    assert.match(page, /function headerInkFor/);
    assert.match(page, /id="theme-header"/);
    assert.match(page, /data-header-ink/);
    assert.match(page, /function deleteVersion/);
    assert.match(page, /function libraryAfterRemoval/);
    assert.match(page, /function versionAction/);
    assert.match(page, /versionAction\(event, "del"\)/);
    assert.match(page, /closest\("\[data-ver-" \+ name \+ "\]"\)/);
    assert.doesNotMatch(page, /headerInk = "#ffffff"/);
    assert.match(page, /class="add-call/);
    assert.match(page, /class="swatch-line"/);
    assert.match(page, /name-decoy/);
    assert.match(page, /function paginateCoachSheet/);
    assert.match(page, /function coachSheetFrame/);
    assert.match(page, /function coachSheetPageFrame/);
    assert.match(page, /function coachPrintSheet/);
    assert.match(page, /function coachSheetPageRule/);
    assert.match(page, /const sheet = sheetOf\(\)/);
    assert.match(page, /coachSheetPages\(version, fitted\)/);
    assert.doesNotMatch(page, /coachSheetPages\(version, coachPrintSheet/);
    assert.match(page, /function clearUntouchedDefenseColor/);
    assert.match(page, /function versionLetter/);
    assert.match(page, /spentVersionLetters/);
    assert.match(page, /defenseFillMigrated/);
    assert.match(page, /function libraryForReset/);
    assert.match(page, /const sheetFit = \{ cols: 1, rows: 1, count: 1 \}/);
    assert.match(page, /data-header-in/);
    assert.doesNotMatch(page, /data-footer-top/);
    assert.doesNotMatch(page, /data-stamp=/);
    assert.match(page, /#111111/);
    assert.match(page, /text-shadow: none/);
    assert.match(page, /text-shadow:none/);
    assert.match(page, /function shortInUse/);
    assert.match(page, /print-color-adjust:exact/);
    assert.match(page, /-webkit-print-color-adjust:exact/);
    assert.match(page, /mark === "blue" \|\| mark === "orange"/);
    assert.doesNotMatch(page, /Math\.max\(10,/);
    const resetStart = page.indexOf('getElementById("reset-defaults")');
    const resetEnd = page.indexOf('getElementById("new-book")');
    const reset = page.slice(resetStart, resetEnd);
    assert.match(reset, /libraryForReset/);
    assert.doesNotMatch(reset, /evenSpreadCounts/);
    assert.doesNotMatch(reset, /cardSize/);
    assert.match(page, /The card size stays/);
    assert.match(reset, /header-number colors/);
    const removeStart = page.indexOf('const id = target.getAttribute("data-call-del")');
    const removeEnd = page.indexOf('getElementById("number-btns")');
    const remove = page.slice(removeStart, removeEnd);
    assert.match(remove, /libraryAfterRemoval/);
    assert.match(remove, /refillCard\(kind, "count"\)/);
    const confirmStart = page.indexOf('getElementById("delete-modal-confirm")');
    const confirmEnd = page.indexOf('getElementById("print-cards")');
    const confirm = page.slice(confirmStart, confirmEnd);
    assert.match(confirm, /deleteVersion\(book, delId\)/);
    assert.match(confirm, /scheduleSave\(\)/);
    assert.match(confirm, /versions.length < 2/);
  });

  it("clears untouched factory defense colors and keeps a color the coach picked", () => {
    const starter = (
      id: string,
      name: string,
      short: string,
      fill: "clear" | "blue" | "orange" | "green" | "red" | "black" | "white",
      ink: "clear" | "white" | "black" = "clear",
    ) => ({ id, kind: "defense" as const, name, short, fill, ink, count: 1 });
    const library = [
      starter("def-hld", "Hold", "HLD", "blue"),
      starter("def-thr", "Throw through", "THR", "orange"),
      starter("def-ns", "No steal", "NS", "green"),
      starter("def-cut", "Cut", "CUT", "red"),
      starter("def-pk", "Pickoff", "PK", "blue", "white"),
      starter("def-bnd", "Bunt cover", "BND", "orange"),
      starter("def-ifi", "Infield in", "IFI", "black"),
      starter("def-custom", "Shift", "SH", "blue"),
    ];
    const migrated = normalizeBook({ library, versions: [], defenseFillMigrated: false }, "coach-1");
    const fillOf = (id: string) => migrated.library.find((call) => call.id === id)?.fill;
    assert.equal(fillOf("def-hld"), "clear");
    assert.equal(fillOf("def-thr"), "clear");
    assert.equal(fillOf("def-ns"), "clear");
    assert.equal(fillOf("def-cut"), "red");
    assert.equal(fillOf("def-pk"), "blue");
    assert.equal(fillOf("def-bnd"), "orange");
    assert.equal(fillOf("def-ifi"), "black");
    assert.equal(fillOf("def-custom"), "blue");
    assert.equal(migrated.defenseFillMigrated, true);
    const picked = normalizeBook(
      {
        ...migrated,
        library: migrated.library.map((call) => (call.id === "def-hld" ? { ...call, fill: "blue" as const } : call)),
        versions: migrated.versions,
        defenseFillMigrated: true,
      },
      "coach-1",
    );
    assert.equal(picked.library.find((call) => call.id === "def-hld")?.fill, "blue");
    assert.equal(emptyBook("coach-1").library.find((call) => call.id === "def-hld")?.fill, "clear");
  });

  it("normalize repairs a missing book and keeps the user id", () => {
    const book = normalizeBook({ title: "  ", versions: [] }, "user-9", "Coach book");
    assert.equal(book.userId, "user-9");
    assert.equal(book.title, "Coach book");
    assert.ok(book.versions.length >= 1);
    assert.ok(book.library.length > 0);
    assert.deepEqual(book.theme, { ...defaultTheme(), headerInk: "#ffffff" });
  });
});

function stubCardElement() {
  return {
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; },
    },
    style: {},
    dataset: {},
    hidden: false,
    textContent: "",
    innerHTML: "",
    value: "",
    checked: false,
    className: "",
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return stubCardElement(); },
    querySelectorAll() { return []; },
    focus() {},
    closest() { return null; },
    appendChild() {},
  };
}

function renderWristCards(page: string) {
  const start = page.indexOf("<script>");
  const end = page.lastIndexOf("</script>");
  const boot = page.lastIndexOf("armCardFont();");
  assert.ok(start > 0 && end > start && boot > start);
  const source = page.slice(start + "<script>".length, boot) + `
    book = emptyBook();
    const version = book.versions[0];
    function paintCard(kind, size) {
      book.bandKind = kind;
      book.cardSize = size || { preset: "softball", widthIn: 3.5, heightIn: 2.25 };
      return wristCardHtml(version, false, "");
    }
    function paintNamed(kind, title) {
      book.bandKind = kind;
      book.title = title;
      version.titles = { offense: title, defense: title };
      return wristCardHtml(version, false, "");
    }
    globalThis.__rendered = {
      offense: paintCard("offense"),
      defense: paintCard("defense"),
      custom: paintCard("offense", { preset: "custom", widthIn: 4.25, heightIn: 2.5 }),
      red: paintNamed("offense", "Red"),
      blank: paintNamed("defense", "")
    };
  `;
  const hub = { userId: "test-user" };
  const sandbox: {
    __rendered?: { offense: string; defense: string; custom: string; red: string; blank: string };
    HUB_SOFTBALL: { userId: string };
    console: typeof console;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    document: object;
    window: object;
  } = {
    HUB_SOFTBALL: hub,
    console,
    setTimeout,
    clearTimeout,
    document: {
      getElementById() { return stubCardElement(); },
      querySelector() { return stubCardElement(); },
      querySelectorAll() { return []; },
      addEventListener() {},
      createElement(tag: string) {
        if (tag !== "canvas") return stubCardElement();
        const ctx = {
          font: "",
          measureText(text: string) {
            const px = Number(String(ctx.font).match(/([\d.]+)px/)?.[1] || 16);
            // SS3B is 1.548em in WristCard. A flat 0.387em per cap keeps that code inside the 0.59 cell width.
            return { width: String(text || "").length * px * 0.387 };
          },
        };
        return { getContext() { return ctx; } };
      },
    },
    window: {
      addEventListener() {},
      HUB_SOFTBALL: hub,
      confirm() { return false; },
      alert() {},
    },
  };
  runInContext(source, createContext(sandbox), { filename: "wrist-coach.html" });
  assert.ok(sandbox.__rendered);
  return sandbox.__rendered;
}

function nonFiniteSvgAttributes(markup: string): string[] {
  const bad: string[] = [];
  const svgs = markup.match(/<svg\b[\s\S]*?<\/svg>/g) || [];
  for (const svg of svgs) {
    const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(svg))) {
      if (/NaN|undefined|Infinity/.test(match[2])) bad.push(match[1] + '="' + match[2] + '"');
    }
  }
  return bad;
}

function cardViewBox(markup: string) {
  const match = markup.match(/<svg viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
  assert.ok(match, markup.slice(0, 240));
  return { w: Number(match[1]), h: Number(match[2]) };
}

function assertCoachSheetFits(
  blocks: { name: string; short: string; codes: string[] }[],
  sheet: { cols: number; rows?: number; widthIn?: number; heightIn: number },
) {
  const pages = layoutDefenseCoachSheet(blocks, sheet);
  assert.equal(pages.length, 1);
  const innerW = coachSheetInnerWidth(sheet);
  const flat = pages.flatMap((page) => page.rows);
  assert.deepEqual(flat.map((row) => row.name), blocks.map((block) => block.name));
  assert.deepEqual(flat.map((row) => row.short), blocks.map((block) => block.short));
  let cursor = 0;
  for (const block of blocks) {
    const codes: string[] = [];
    while (cursor < flat.length && flat[cursor].name === block.name && flat[cursor].short === block.short) {
      codes.push(...flat[cursor].codes);
      cursor += 1;
      if (codes.length >= block.codes.length) break;
    }
    assert.deepEqual(codes, block.codes, block.short);
  }
  assert.equal(cursor, flat.length);
  for (const page of pages) {
    let height = page.bannerIn;
    const colPx = (page.innerW / page.cols) * 96;
    for (const row of page.rows) {
      assert.equal(row.label, coachPlayLabel(row));
      assert.equal(row.lines, coachPlayLines(row.label, page.playSize, innerW));
      assert.ok(row.lines >= 1);
      const needed = coachPlayHeaderIn(row.label, { playSize: page.playSize, headerIn: page.bannerIn }, innerW);
      assert.ok(row.headerIn + 1e-9 >= needed);
      assert.ok(page.playSize <= row.headerIn * 96 + 0.05, row.label);
      height += row.headerIn + row.codeRows * page.codeIn;
      const chars = row.codes.reduce((max, code) => Math.max(max, String(code || "").length), 1);
      assert.ok(page.codeSize * chars * COACH_CODE_CHAR_EM <= colPx - 4 + 0.05, row.label);
      assert.ok(page.codeSize <= page.codeIn * 96 + 0.05, row.label);
    }
    assert.ok(height <= page.innerH + 1e-6, `page content ${height} exceeds ${page.innerH}`);
  }
}

function mainPrintFromPage(
  page: string,
  view: "sheet" | "cards",
  size: { preset: string; widthIn: number; heightIn: number },
  kind: "defense" | "offense",
) {
  const start = page.indexOf("<script>");
  const boot = page.lastIndexOf("armCardFont();");
  assert.ok(start > 0 && boot > start);
  const source = page.slice(start + "<script>".length, boot) + `
    book = emptyBook();
    book.bandKind = ${JSON.stringify(kind)};
    book.sheet = ${JSON.stringify({ cols: 15, rows: 1, ...size })};
    setPreviewView(${JSON.stringify(view)});
    printNow(mainPrintMode());
    globalThis.__print = {
      html: document.getElementById("print-root").innerHTML,
      label: document.getElementById("print-both").textContent,
      mode: printMode
    };
  `;
  const elements = new Map<string, ReturnType<typeof stubCardElement>>();
  function elementFor(id: string) {
    let el = elements.get(id);
    if (!el) {
      el = stubCardElement();
      elements.set(id, el);
    }
    return el;
  }
  const hub = { userId: "test-user" };
  const sandbox: { __print?: { html: string; label: string; mode: string }; HUB_SOFTBALL: { userId: string } } = {
    HUB_SOFTBALL: hub,
    console,
    setTimeout,
    clearTimeout,
    document: {
      getElementById(id: string) { return elementFor(id); },
      querySelector() { return elementFor("query"); },
      querySelectorAll() { return []; },
      addEventListener() {},
      createElement(tag: string) {
        if (tag !== "canvas") return elementFor(tag);
        const ctx = {
          font: "",
          measureText(text: string) {
            const px = Number(String(ctx.font).match(/([\d.]+)px/)?.[1] || 16);
            return { width: String(text || "").length * px * 0.387 };
          },
        };
        return { getContext() { return ctx; } };
      },
      fonts: { load() { return Promise.resolve(); } },
    },
    window: {
      addEventListener() {},
      HUB_SOFTBALL: hub,
      confirm() { return false; },
      alert() {},
      print() {},
    },
  };
  runInContext(source, createContext(sandbox), { filename: "wrist-coach.html" });
  assert.ok(sandbox.__print);
  return sandbox.__print;
}

function coachPrintHtmlFromPage(
  page: string,
  size: { preset: string; widthIn: number; heightIn: number },
  kind: "defense" | "offense",
  mode: "key" | "both",
) {
  const start = page.indexOf("<script>");
  const boot = page.lastIndexOf("armCardFont();");
  assert.ok(start > 0 && boot > start);
  const source = page.slice(start + "<script>".length, boot) + `
    book = emptyBook();
    book.bandKind = ${JSON.stringify(kind)};
    book.sheet = ${JSON.stringify({ cols: 15, rows: 1, ...size })};
    printMode = ${JSON.stringify(mode)};
    renderPrint();
    globalThis.__printHtml = document.getElementById("print-root").innerHTML;
  `;
  const elements = new Map<string, ReturnType<typeof stubCardElement>>();
  function elementFor(id: string) {
    let el = elements.get(id);
    if (!el) {
      el = stubCardElement();
      elements.set(id, el);
    }
    return el;
  }
  const hub = { userId: "test-user" };
  const sandbox: { __printHtml?: string; HUB_SOFTBALL: { userId: string } } = {
    HUB_SOFTBALL: hub,
    console,
    setTimeout,
    clearTimeout,
    document: {
      getElementById(id: string) { return elementFor(id); },
      querySelector() { return elementFor("query"); },
      querySelectorAll() { return []; },
      addEventListener() {},
      createElement(tag: string) {
        if (tag !== "canvas") return elementFor(tag);
        const ctx = {
          font: "",
          measureText(text: string) {
            const px = Number(String(ctx.font).match(/([\d.]+)px/)?.[1] || 16);
            return { width: String(text || "").length * px * 0.387 };
          },
        };
        return { getContext() { return ctx; } };
      },
      fonts: { load() { return Promise.resolve(); } },
    },
    window: {
      addEventListener() {},
      HUB_SOFTBALL: hub,
      confirm() { return false; },
      alert() {},
    },
  };
  runInContext(source, createContext(sandbox), { filename: "wrist-coach.html" });
  assert.ok(sandbox.__printHtml);
  return sandbox.__printHtml;
}

function coachSheetLayoutFromPage(
  page: string,
  blocks: { name: string; short: string; codes: string[] }[],
  sheet: { cols: number; rows?: number; widthIn?: number; heightIn: number },
) {
  const start = page.indexOf("<script>");
  const boot = page.lastIndexOf("armCardFont();");
  assert.ok(start > 0 && boot > start);
  const source = page.slice(start + "<script>".length, boot) + `
    const blocks = ${JSON.stringify(blocks)};
    const sheet = ${JSON.stringify(sheet)};
    const layout = layoutDefenseCoachSheet(blocks, sheet);
    globalThis.__coach = {
      layout: layout,
      html: layout.map(function (item) {
        return coachPageHtml(item, sheet, "MY SIGNS - CALLS ARE TOP + LEFT", "#ff0000");
      }).join("")
    };
  `;
  const hub = { userId: "test-user" };
  const sandbox: { __coach?: { layout: unknown; html: string }; HUB_SOFTBALL: { userId: string } } = {
    HUB_SOFTBALL: hub,
    console,
    setTimeout,
    clearTimeout,
    document: {
      getElementById() { return lookupElement(); },
      querySelector() { return lookupElement(); },
      querySelectorAll() { return []; },
      addEventListener() {},
      createElement() { return lookupElement(); },
    },
    window: {
      addEventListener() {},
      HUB_SOFTBALL: hub,
      confirm() { return false; },
      alert() {},
    },
  };
  runInContext(source, createContext(sandbox), { filename: "wrist-coach.html" });
  assert.ok(sandbox.__coach);
  return sandbox.__coach;
}

function lookupNamesInBothViews(page: string) {
  const start = page.indexOf("<script>");
  const boot = page.lastIndexOf("armCardFont();");
  assert.ok(start > 0 && boot > start);
  const elements = new Map<string, ReturnType<typeof lookupElement>>();
  function elementFor(id: string) {
    let el = elements.get(id);
    if (!el) {
      el = lookupElement();
      elements.set(id, el);
    }
    return el;
  }
  const source = page.slice(start + "<script>".length, boot) + `
    book = emptyBook();
    book.bandKind = "defense";
    book.versions[0].defenseCells = [
      { grid: 0, row: 1, col: 2, code: "032", callId: "def-hld" },
      { grid: 0, row: 0, col: 0, code: "011", callId: "def-ns" }
    ];
    function ask(search, box) {
      document.getElementById("name-search").value = search;
      document.getElementById("name-box").value = box;
      renderNameKey();
      return {
        toolsHidden: document.getElementById("name-tools").classList.contains("hidden"),
        keyHidden: document.getElementById("name-key").hidden,
        list: document.getElementById("name-key").innerHTML,
        hitHidden: document.getElementById("name-box-hit").classList.contains("hidden"),
        hit: document.getElementById("name-box-hit").textContent
      };
    }
    function runView(names) {
      showCoachOnCard = names;
      return { steal: ask("steal", ""), box: ask("", "032"), missing: ask("", "99") };
    }
    globalThis.__lookup = { codes: runView(false), names: runView(true) };
  `;
  const hub = { userId: "test-user" };
  const sandbox: { __lookup?: { codes: LookupSnap; names: LookupSnap }; HUB_SOFTBALL: { userId: string } } = {
    HUB_SOFTBALL: hub,
    console,
    setTimeout,
    clearTimeout,
    document: {
      getElementById(id: string) { return elementFor(id); },
      querySelector() { return elementFor("query"); },
      querySelectorAll() { return []; },
      addEventListener() {},
      createElement() { return elementFor("created"); },
    },
    window: {
      addEventListener() {},
      HUB_SOFTBALL: hub,
      confirm() { return false; },
      alert() {},
    },
  } as { __lookup?: { codes: LookupSnap; names: LookupSnap }; HUB_SOFTBALL: { userId: string } };
  runInContext(source, createContext(sandbox), { filename: "wrist-coach.html" });
  assert.ok(sandbox.__lookup);
  return sandbox.__lookup;
}

type LookupSnap = {
  steal: { toolsHidden: boolean; keyHidden: boolean; list: string; hitHidden: boolean; hit: string };
  box: { hitHidden: boolean; hit: string };
  missing: { hitHidden: boolean; hit: string };
};

function lookupElement() {
  const classes = new Set<string>();
  return {
    classList: {
      add(...names: string[]) { for (const name of names) classes.add(name); },
      remove(...names: string[]) { for (const name of names) classes.delete(name); },
      toggle() {},
      contains(name: string) { return classes.has(name); },
    },
    style: {},
    dataset: {},
    hidden: false,
    textContent: "",
    innerHTML: "",
    value: "",
    checked: false,
    className: "",
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return lookupElement(); },
    querySelectorAll() { return []; },
    focus() {},
    closest() { return null; },
    appendChild() {},
  };
}
