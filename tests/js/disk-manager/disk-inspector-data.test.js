/*
 * disk-inspector-data.test.js - Reading the Disk Inspector's buffers
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { describe, it, expect } from "vitest";
import {
  parseOverview,
  parseTrackDetail,
  summarizeDisk,
  trackLabel,
  cellDeviation,
  cellMicroseconds,
  nibbleAtCell,
  firstNibbleInView,
  kindName,
  KIND,
  BAD,
  DATA_STATE,
  NOMINAL_CELL_TIME,
} from "../../../src/js/disk-manager/disk-inspector-data.js";

// Little-endian writer for building buffers the way the core lays them out
function writer() {
  const bytes = [];
  return {
    bytes,
    u8: (v) => bytes.push(v & 0xff),
    u16: (v) => bytes.push(v & 0xff, (v >> 8) & 0xff),
    u32: (v) =>
      bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff),
    tag: (t) => [...t].forEach((c) => bytes.push(c.charCodeAt(0))),
    fill: (n, v = 0) => {
      for (let i = 0; i < n; i++) bytes.push(v);
    },
  };
}

// An overview of `count` quarter tracks where `tracks` describes some of them
function overview(buckets, tracks, count = 160) {
  const w = writer();
  w.tag("DINS");
  w.u16(1);
  w.u16(count);
  w.u16(buckets);
  w.u16(12 + buckets * 3);
  w.u32(0);
  for (let qt = 0; qt < count; qt++) {
    const t = tracks[qt];
    if (!t) {
      w.u8(0);
      w.u8(0xff);
      w.fill(10 + buckets * 3);
      continue;
    }
    w.u8(1 | (t.flux ? 2 : 0) | (t.thirteen ? 4 : 0));
    w.u8(t.id);
    w.u8(t.found ?? 0);
    w.u8(t.good ?? 0);
    w.u8(t.addrBad ?? 0);
    w.u8(t.dataBad ?? 0);
    w.u16(0);
    w.u32(t.bits ?? 50000);
    for (let b = 0; b < buckets; b++) w.u8(t.kind ?? KIND.DATA);
    for (let b = 0; b < buckets; b++) w.u8(b % 16);
    for (let b = 0; b < buckets; b++) w.u8(t.time ?? 0);
  }
  return new Uint8Array(w.bytes);
}

describe("parseOverview", () => {
  it("reads every quarter track's record", () => {
    const o = parseOverview(
      overview(8, {
        0: { id: 0, found: 16, good: 15, dataBad: 1, bits: 51024 },
        6: { id: 15, flux: true, kind: KIND.OTHER, time: 118 },
      }),
    );
    expect(o.buckets).toBe(8);
    expect(o.tracks).toHaveLength(160);

    const t0 = o.tracks[0];
    expect(t0.present).toBe(true);
    expect(t0.flux).toBe(false);
    expect(t0.sectorsFound).toBe(16);
    expect(t0.sectorsGood).toBe(15);
    expect(t0.dataBad).toBe(1);
    expect(t0.bitCount).toBe(51024);
    expect([...t0.sectors]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    const t6 = o.tracks[6];
    expect(t6.flux).toBe(true);
    expect(t6.trackId).toBe(15);
    expect(t6.kinds[3]).toBe(KIND.OTHER);
    expect(t6.times[0]).toBe(118);

    expect(o.tracks[1].present).toBe(false);
    expect(o.tracks[1].trackId).toBe(-1);
  });

  it("refuses a buffer it does not understand", () => {
    expect(parseOverview(null)).toBeNull();
    expect(parseOverview(new Uint8Array(40))).toBeNull();
    const wrongVersion = overview(8, {});
    wrongVersion[4] = 2;
    expect(parseOverview(wrongVersion)).toBeNull();
    expect(parseOverview(overview(8, {}).subarray(0, 100))).toBeNull();
  });
});

describe("parseTrackDetail", () => {
  it("splits nibbles and sectors out of the buffer", () => {
    const w = writer();
    w.tag("DTRK");
    w.u16(1);
    w.u16(3); // present, flux
    w.u32(51000);
    w.u32(2); // nibbles
    w.u16(1); // sectors
    w.u16(4); // timing buckets
    w.u8(15);
    w.fill(3);
    // Two nibbles
    w.u32(100);
    w.u8(0xd5);
    w.u8(KIND.ADDR_PROLOGUE);
    w.u8(0);
    w.u8(8);
    w.u32(108);
    w.u8(0xaa);
    w.u8(KIND.DATA | BAD);
    w.u8(0xff);
    w.u8(10);
    // One sector
    w.u8(254);
    w.u8(17);
    w.u8(5);
    w.u8(16);
    w.u8(1);
    w.u8(DATA_STATE.BAD);
    w.u16(0);
    w.u32(0);
    w.u32(1);
    for (let i = 0; i < 256; i++) w.u8(i);
    // Timing
    [118, 119, 132, 133].forEach(w.u8);

    const d = parseTrackDetail(new Uint8Array(w.bytes));
    expect(d.present).toBe(true);
    expect(d.flux).toBe(true);
    expect(d.bitCount).toBe(51000);
    expect(d.trackId).toBe(15);
    expect(d.nibbles.count).toBe(2);
    expect([...d.nibbles.start]).toEqual([100, 108]);
    expect([...d.nibbles.value]).toEqual([0xd5, 0xaa]);
    expect(d.nibbles.kind[1]).toBe(KIND.DATA | BAD);
    expect(d.nibbles.cells[1]).toBe(10);
    expect(d.sectors).toHaveLength(1);
    const s = d.sectors[0];
    expect(s.volume).toBe(254);
    expect(s.track).toBe(17);
    expect(s.sector).toBe(5);
    expect(s.addressOk).toBe(true);
    expect(s.data).toBe(DATA_STATE.BAD);
    expect(s.dataNibble).toBe(1);
    expect(s.bytes[255]).toBe(255);
    expect([...d.times]).toEqual([118, 119, 132, 133]);
  });

  it("refuses a truncated buffer", () => {
    const w = writer();
    w.tag("DTRK");
    w.u16(1);
    w.u16(1);
    w.u32(100);
    w.u32(50); // claims fifty nibbles and has none
    w.u16(0);
    w.u16(16);
    w.fill(4);
    expect(parseTrackDetail(new Uint8Array(w.bytes))).toBeNull();
  });
});

describe("summarizeDisk", () => {
  it("counts a stored track once however many quarter tracks read it", () => {
    const tracks = {};
    for (let t = 0; t < 35; t++) {
      for (const q of [0, 1, 3]) {
        tracks[t * 4 + q] = { id: t, found: 16, good: 16 };
      }
    }
    const s = summarizeDisk(parseOverview(overview(8, tracks)));
    expect(s.tracks).toBe(35);
    expect(s.sectors).toBe(560);
    expect(s.good).toBe(560);
    expect(s.bad).toBe(0);
    expect(s.format).toBe("16 sector");
  });

  it("names a protected disk for what it is", () => {
    const s = summarizeDisk(
      parseOverview(
        overview(8, {
          0: { id: 0, found: 13, good: 0, thirteen: true },
          6: { id: 1, flux: true },
          10: { id: 2, flux: true },
        }),
      ),
    );
    expect(s.tracks).toBe(3);
    expect(s.fluxTracks).toBe(2);
    expect(s.nonStandardTracks).toBe(2);
    expect(s.format).toBe("13 sector");
  });

  it("describes no disk as empty", () => {
    expect(summarizeDisk(null).format).toBe("Empty");
    expect(summarizeDisk(parseOverview(overview(8, {}))).format).toBe("Empty");
  });
});

describe("helpers", () => {
  it("writes quarter tracks as track numbers", () => {
    expect(trackLabel(0)).toBe("0");
    expect(trackLabel(69)).toBe("17.25");
    expect(trackLabel(70)).toBe("17.5");
    expect(trackLabel(71)).toBe("17.75");
  });

  it("measures a cell against the sequencer's own", () => {
    expect(NOMINAL_CELL_TIME).toBeCloseTo(125.16, 2);
    expect(cellDeviation(NOMINAL_CELL_TIME)).toBeCloseTo(0, 6);
    expect(cellDeviation(118)).toBeCloseTo(-0.057, 3);
    expect(cellMicroseconds(128)).toBe(4);
  });

  it("finds the nibble under a cell", () => {
    const nibbles = {
      count: 3,
      start: new Uint32Array([10, 20, 30]),
    };
    expect(nibbleAtCell(nibbles, 10)).toBe(0);
    expect(nibbleAtCell(nibbles, 25)).toBe(1);
    expect(nibbleAtCell(nibbles, 99)).toBe(2);
    // Before the first nibble is the tail of the last, round the track
    expect(nibbleAtCell(nibbles, 5)).toBe(2);
    expect(nibbleAtCell({ count: 0, start: new Uint32Array() }, 5)).toBe(-1);
  });

  it("starts a view at the left, not at the nibble wrapped round the end", () => {
    // A track whose first nibble starts at cell 3: cells 0-2 are the tail of
    // the last nibble, and a view from cell 0 must still begin at nibble 0
    const nibbles = { count: 3, start: new Uint32Array([3, 11, 19]) };
    expect(firstNibbleInView(nibbles, 0)).toBe(0);
    expect(firstNibbleInView(nibbles, 12)).toBe(1);
    expect(firstNibbleInView(nibbles, 40)).toBe(2);
    expect(firstNibbleInView({ count: 0, start: new Uint32Array() }, 0)).toBe(0);
  });

  it("names kinds, and says when a checksum failed", () => {
    expect(kindName(KIND.SYNC)).toBe("Sync");
    expect(kindName(KIND.DATA | BAD)).toBe("Data field (bad checksum)");
  });
});
