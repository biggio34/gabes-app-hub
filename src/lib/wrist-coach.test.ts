import assert from "node:assert/strict";
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
  DEFAULT_ROWS,
  DEFAULT_SHEET_COLS,
  DEFAULT_SHEET_ROWS,
  activeVersion,
  callCode,
  callColors,
  cellCount,
  defaultLibrary,
  defaultSheet,
  defaultTheme,
  emptyBook,
  layoutOf,
  normalizeBook,
  normalizeCardSize,
  normalizeSheet,
  normalizeTheme,
  nextVersionName,
  sheetCode,
  sheetGroups,
  signBag,
  shuffleVersion,
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
    assert.equal(book.grids, DEFAULT_GRIDS);
    assert.equal(book.rows, DEFAULT_ROWS);
    assert.equal(book.cols, DEFAULT_COLS);
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
    assert.deepEqual(book.theme, defaultTheme());
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

  it("defaults the player card to the 4 × 2 wrist size", () => {
    const book = emptyBook("user-1");
    assert.deepEqual(book.cardSize, { preset: "wrist", widthIn: 4, heightIn: 2 });
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
    assert.deepEqual(normalizeCardSize({ preset: "custom", widthIn: 4.25, heightIn: 2.5 }), {
      preset: "custom",
      widthIn: 4.25,
      heightIn: 2.5,
    });
    assert.deepEqual(normalizeCardSize({ preset: "custom", widthIn: 99, heightIn: 0 }), {
      preset: "custom",
      widthIn: 8.5,
      heightIn: 1,
    });
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
    assert.deepEqual(normalizeSheet({ cols: 10, rows: 2 }), { cols: 10, rows: 2 });
    assert.deepEqual(normalizeSheet({ cols: 99, rows: 0 }), { cols: 20, rows: 1 });
    const saved = normalizeBook(
      {
        title: "Sheet book",
        sheet: { cols: 12, rows: 2 },
        library: defaultLibrary(),
        versions: [],
      },
      "user-9",
    );
    assert.deepEqual(saved.sheet, { cols: 12, rows: 2 });
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

  it("normalize repairs a missing book and keeps the user id", () => {
    const book = normalizeBook({ title: "  ", versions: [] }, "user-9", "Coach book");
    assert.equal(book.userId, "user-9");
    assert.equal(book.title, "Coach book");
    assert.ok(book.versions.length >= 1);
    assert.ok(book.library.length > 0);
    assert.deepEqual(book.theme, defaultTheme());
  });
});
