/*
 * media-kind.test.js - Which drive a dropped disk image belongs in
 */

import { describe, it, expect } from "vitest";
import { mediaKind, dropUnit, FLOPPY_SIZE } from "../../../src/js/disk-manager/media-kind.js";

describe("mediaKind", () => {
  it("sends every floppy format to a floppy drive", () => {
    for (const name of ["a.dsk", "a.do", "a.woz", "a.nib", "a.po"]) {
      expect(mediaKind(name, FLOPPY_SIZE)).toBe("floppy");
    }
  });

  it("sends hard disk formats to the SmartPort whatever their size", () => {
    expect(mediaKind("a.hdv", 32 * 1024 * 1024)).toBe("smartport");
    expect(mediaKind("a.2mg", FLOPPY_SIZE)).toBe("smartport");
  });

  it("sends a .po larger than a 5.25-inch disk to the SmartPort", () => {
    expect(mediaKind("a.po", FLOPPY_SIZE + 1)).toBe("smartport");
    expect(mediaKind("a.po", 819200)).toBe("smartport");
  });

  it("ignores case", () => {
    expect(mediaKind("GAME.DSK", FLOPPY_SIZE)).toBe("floppy");
    expect(mediaKind("SYSTEM.HDV", 1024)).toBe("smartport");
  });

  it("refuses anything that is not a disk image", () => {
    expect(mediaKind("notes.txt", 100)).toBeNull();
    expect(mediaKind("README", 100)).toBeNull();
    expect(mediaKind("dsk", 100)).toBeNull();
  });
});

describe("dropUnit", () => {
  it("takes the first empty unit", () => {
    expect(dropUnit([{ filename: null }, { filename: null }])).toBe(0);
    expect(dropUnit([{ filename: "a.dsk" }, { filename: null }])).toBe(1);
  });

  it("replaces the first unit when every unit is full", () => {
    expect(dropUnit([{ filename: "a.dsk" }, { filename: "b.dsk" }])).toBe(0);
  });
});
