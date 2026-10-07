/*
 * media-kind.test.js - Which drive a dropped disk image belongs in
 */

import { describe, it, expect } from "vitest";
import { mediaKind, dropUnit, isDisk35, FLOPPY_SIZE } from "../../../src/js/disk-manager/media-kind.js";

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

describe("3.5-inch disks", () => {
  const header = (tag, fill) => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 4; i++) bytes[i] = tag.charCodeAt(i);
    fill?.(bytes);
    return bytes;
  };

  it("knows an 800K or 400K image by its size, whatever it is called", () => {
    expect(isDisk35(819200, null)).toBe(true);
    expect(isDisk35(409600, null)).toBe(true);
    expect(isDisk35(FLOPPY_SIZE, null)).toBe(false);
    expect(isDisk35(32 * 1024 * 1024, null)).toBe(false);
  });

  it("asks a WOZ's INFO chunk and a 2MG's header", () => {
    const woz35 = header("WOZ2", (b) => {
      b.set([73, 78, 70, 79], 12); // INFO
      b[21] = 2;
    });
    const woz525 = header("WOZ2", (b) => {
      b.set([73, 78, 70, 79], 12);
      b[21] = 1;
    });
    expect(isDisk35(300000, woz35)).toBe(true);
    expect(isDisk35(300000, woz525)).toBe(false);
    const twoimg = (length) =>
      header("2IMG", (b) => {
        b[0x0c] = 1; // ProDOS order
        new DataView(b.buffer).setUint32(0x1c, length, true);
      });
    expect(isDisk35(819264, twoimg(819200))).toBe(true);
    expect(isDisk35(32 * 1024 * 1024 + 64, twoimg(32 * 1024 * 1024))).toBe(false);
  });

  it("sends a 3.5-inch disk to a 3.5-inch drive on a machine that has one", () => {
    expect(mediaKind("System.po", 819200, { disk35: true })).toBe("disk35");
    expect(mediaKind("Install.2mg", 819264, { disk35: true, header: (() => {
      const b = new Uint8Array(32);
      b.set([50, 73, 77, 71], 0); // 2IMG
      b[0x0c] = 1;
      new DataView(b.buffer).setUint32(0x1c, 819200, true);
      return b;
    })() })).toBe("disk35");
    // And to the SmartPort on one that has not.
    expect(mediaKind("System.po", 819200)).toBe("smartport");
    // A floppy is a floppy on any machine.
    expect(mediaKind("dos.dsk", FLOPPY_SIZE, { disk35: true })).toBe("floppy");
  });
});
