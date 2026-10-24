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

  it("defaults the player card to the 3.25 × 2 wrist size", () => {
    const book = emptyBook("user-1");
    assert.deepEqual(book.cardSize, { preset: "wrist", widthIn: 3.25, heightIn: 2 });
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
    const cardGap = 0.28;
    const cardReserve = LETTER_SHEET.calibrateIn + LETTER_SHEET.calibrateGapIn + LETTER_SHEET.markOutIn;
    const cardSide = LETTER_SHEET.markPadIn + LETTER_SHEET.markOutIn;
    const fitOpts = { reserveIn: cardReserve, sidePadIn: cardSide };
    const onFit: Record<string, { cols: number; rows: number; count: number }> = {
      wrist: { cols: 2, rows: 3, count: 6 },
      youth: { cols: 1, rows: 3, count: 3 },
      softball: { cols: 1, rows: 3, count: 3 },
      large: { cols: 1, rows: 2, count: 2 },
      play: { cols: 1, rows: 3, count: 3 },
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

  it("normalize repairs a missing book and keeps the user id", () => {
    const book = normalizeBook({ title: "  ", versions: [] }, "user-9", "Coach book");
    assert.equal(book.userId, "user-9");
    assert.equal(book.title, "Coach book");
    assert.ok(book.versions.length >= 1);
    assert.ok(book.library.length > 0);
    assert.deepEqual(book.theme, defaultTheme());
  });
});
