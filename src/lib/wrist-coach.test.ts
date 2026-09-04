import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wristCoachAllowed } from "./areas.ts";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  activeVersion,
  defaultLibrary,
  emptyBook,
  normalizeBook,
  nextVersionName,
  shuffleVersion,
  wristCoachBlobKey,
} from "./wrist-coach.ts";

describe("wrist coach permission", () => {
  it("always lets the owner in", () => {
    assert.equal(wristCoachAllowed({ role: "owner", areas: [], features: [] }), true);
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

  it("ships pitches and a few offense plays", () => {
    const library = defaultLibrary();
    assert.ok(library.some((item) => item.kind === "pitch" && item.name === "Fastball"));
    assert.ok(library.some((item) => item.kind === "offense" && item.name === "Bunt"));
    assert.ok(library.filter((item) => item.kind === "offense").length >= 4);
  });

  it("starts a coach with one shuffled version", () => {
    const book = emptyBook("user-1", "Gabe's signs");
    assert.equal(book.userId, "user-1");
    assert.equal(book.title, "Gabe's signs");
    assert.equal(book.rows, DEFAULT_ROWS);
    assert.equal(book.cols, DEFAULT_COLS);
    assert.equal(book.versions.length, 1);
    const version = activeVersion(book);
    assert.ok(version);
    assert.equal(version.cells.length, DEFAULT_ROWS * DEFAULT_COLS);
    const codes = version.cells.map((cell) => cell.code);
    assert.equal(new Set(codes).size, codes.length);
    assert.ok(version.cells.every((cell) => cell.callId));
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
  });

  it("normalize repairs a missing book and keeps the user id", () => {
    const book = normalizeBook({ title: "  ", versions: [] }, "user-9", "Coach book");
    assert.equal(book.userId, "user-9");
    assert.equal(book.title, "Coach book");
    assert.ok(book.versions.length >= 1);
    assert.ok(book.library.length > 0);
  });
});
