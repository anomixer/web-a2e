/*
 * save-format.test.js - Filename handling for the disk save format picker
 */

import { describe, it, expect } from "vitest";
import { nameForFormat, SAVE_FORMATS } from "../../../src/js/disk-manager/disk-operations.js";

const DOS_ORDER = 0;
const PRODOS_ORDER = 1;
const WOZ = 2;

describe("SAVE_FORMATS", () => {
  it("covers the three formats the picker offers", () => {
    expect(Object.keys(SAVE_FORMATS).sort()).toEqual(["0", "1", "2"]);
    for (const spec of Object.values(SAVE_FORMATS)) {
      expect(spec.extensions).toContain(spec.defaultExtension);
    }
  });
});

describe("nameForFormat", () => {
  it("swaps the extension to match the chosen format", () => {
    expect(nameForFormat("game.dsk", PRODOS_ORDER)).toBe("game.po");
    expect(nameForFormat("game.po", WOZ)).toBe("game.woz");
    expect(nameForFormat("game.woz", DOS_ORDER)).toBe("game.dsk");
  });

  it("leaves an extension the format already accepts alone", () => {
    // .do is DOS order just as much as .dsk is, so it should not be rewritten
    expect(nameForFormat("game.do", DOS_ORDER)).toBe("game.do");
    expect(nameForFormat("game.dsk", DOS_ORDER)).toBe("game.dsk");
    expect(nameForFormat("game.po", PRODOS_ORDER)).toBe("game.po");
  });

  it("is case-insensitive about the existing extension", () => {
    expect(nameForFormat("GAME.DSK", DOS_ORDER)).toBe("GAME.DSK");
    expect(nameForFormat("GAME.DSK", WOZ)).toBe("GAME.woz");
  });

  it("appends an extension to a name that has none", () => {
    expect(nameForFormat("disk1", DOS_ORDER)).toBe("disk1.dsk");
    expect(nameForFormat("disk1", WOZ)).toBe("disk1.woz");
  });

  it("keeps dots inside the name", () => {
    expect(nameForFormat("my.game.v2.dsk", WOZ)).toBe("my.game.v2.woz");
  });

  it("does not treat a leading dot as an extension", () => {
    expect(nameForFormat(".hidden", DOS_ORDER)).toBe(".hidden.dsk");
  });

  it("returns the name unchanged for an unknown format", () => {
    expect(nameForFormat("game.dsk", 99)).toBe("game.dsk");
  });
});
