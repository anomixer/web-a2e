/*
 * disk-inspector-data.js - Read the Disk Inspector's buffers from the core
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/*
 * The layouts are described in core/src/core/disk-image/disk_inspection.hpp. The
 * arrays returned here are views onto the buffer handed in, not copies: an
 * overview is 250KB and is read whole every time the disk changes.
 */

/** What a nibble is part of, as the core's inspect::Kind */
export const KIND = Object.freeze({
  NONE: 0,
  SYNC: 1,
  ADDR_PROLOGUE: 2,
  ADDR: 3,
  ADDR_EPILOGUE: 4,
  DATA_PROLOGUE: 5,
  DATA: 6,
  DATA_EPILOGUE: 7,
  OTHER: 8,
  INVALID: 9,
});

/** Set on a field whose checksum failed */
export const BAD = 0x80;
export const KIND_MASK = 0x0f;
export const NO_SECTOR = 0xff;

export const QUARTER_TRACKS = 160;

/** How a sector's data field read, as the core's inspect::DataState */
export const DATA_STATE = Object.freeze({
  NONE: 0,
  GOOD: 1,
  BAD: 2,
  UNVERIFIED: 3,
});

/**
 * A nominal cell in the core's timing unit (quarters of 125ns): eight ticks of
 * the 14.31818MHz / 7 sequencer clock, 31.29 flux ticks.
 */
export const NOMINAL_CELL_TIME = (4 * 8 * 176) / 45;

const KIND_NAMES = [
  "Unread",
  "Sync",
  "Address prologue",
  "Address field",
  "Address epilogue",
  "Data prologue",
  "Data field",
  "Data epilogue",
  "Unknown",
  "Noise",
];

/**
 * @param {number} kind - A kind byte, with or without BAD
 * @returns {string}
 */
export function kindName(kind) {
  const name = KIND_NAMES[kind & KIND_MASK] ?? "Unknown";
  return kind & BAD ? `${name} (bad checksum)` : name;
}

function tagIs(bytes, tag) {
  if (!bytes || bytes.length < 4) return false;
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== tag.charCodeAt(i)) return false;
  }
  return true;
}

function view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function flagsOf(flags) {
  return {
    present: (flags & 1) !== 0,
    flux: (flags & 2) !== 0,
    thirteenSector: (flags & 4) !== 0,
  };
}

/**
 * Parse the whole-disk overview.
 *
 * @param {Uint8Array} bytes
 * @returns {{buckets: number, tracks: Array<Object>}|null} null if the buffer
 *   is not an overview this code understands
 */
export function parseOverview(bytes) {
  if (!tagIs(bytes, "DINS") || bytes.length < 16) return null;
  const dv = view(bytes);
  if (dv.getUint16(4, true) !== 1) return null;
  const count = dv.getUint16(6, true);
  const buckets = dv.getUint16(8, true);
  const record = dv.getUint16(10, true);
  if (record !== 12 + buckets * 3 || bytes.length < 16 + count * record) {
    return null;
  }

  const tracks = [];
  for (let qt = 0; qt < count; qt++) {
    const at = 16 + qt * record;
    const flags = flagsOf(bytes[at]);
    tracks.push({
      quarterTrack: qt,
      ...flags,
      trackId: bytes[at + 1] === 0xff ? -1 : bytes[at + 1],
      sectorsFound: bytes[at + 2],
      sectorsGood: bytes[at + 3],
      addressBad: bytes[at + 4],
      dataBad: bytes[at + 5],
      bitCount: dv.getUint32(at + 8, true),
      kinds: bytes.subarray(at + 12, at + 12 + buckets),
      sectors: bytes.subarray(at + 12 + buckets, at + 12 + buckets * 2),
      times: bytes.subarray(at + 12 + buckets * 2, at + 12 + buckets * 3),
    });
  }
  return { buckets, tracks };
}

/**
 * Parse one quarter track in full.
 *
 * @param {Uint8Array} bytes
 * @returns {Object|null}
 */
export function parseTrackDetail(bytes) {
  if (!tagIs(bytes, "DTRK") || bytes.length < 24) return null;
  const dv = view(bytes);
  if (dv.getUint16(4, true) !== 1) return null;
  const flags = flagsOf(dv.getUint16(6, true));
  const bitCount = dv.getUint32(8, true);
  const nibbleCount = dv.getUint32(12, true);
  const sectorCount = dv.getUint16(16, true);
  const timingBuckets = dv.getUint16(18, true);
  const trackId = bytes[20] === 0xff ? -1 : bytes[20];

  const nibbleBase = 24;
  const sectorBase = nibbleBase + nibbleCount * 8;
  const timingBase = sectorBase + sectorCount * 272;
  if (bytes.length < timingBase + timingBuckets) return null;

  // Split the interleaved records into one array per field, which is what
  // drawing and searching want
  const start = new Uint32Array(nibbleCount);
  const value = new Uint8Array(nibbleCount);
  const kind = new Uint8Array(nibbleCount);
  const sector = new Uint8Array(nibbleCount);
  const cells = new Uint8Array(nibbleCount);
  for (let i = 0; i < nibbleCount; i++) {
    const at = nibbleBase + i * 8;
    start[i] = dv.getUint32(at, true);
    value[i] = bytes[at + 4];
    kind[i] = bytes[at + 5];
    sector[i] = bytes[at + 6];
    cells[i] = bytes[at + 7];
  }

  const sectors = [];
  for (let i = 0; i < sectorCount; i++) {
    const at = sectorBase + i * 272;
    sectors.push({
      index: i,
      volume: bytes[at],
      track: bytes[at + 1],
      sector: bytes[at + 2],
      sectorsPerTrack: bytes[at + 3],
      addressOk: bytes[at + 4] === 1,
      data: bytes[at + 5],
      addressNibble: dv.getUint32(at + 8, true),
      dataNibble: dv.getUint32(at + 12, true),
      bytes: bytes.subarray(at + 16, at + 16 + 256),
    });
  }

  return {
    ...flags,
    bitCount,
    trackId,
    nibbles: { count: nibbleCount, start, value, kind, sector, cells },
    sectors,
    times: bytes.subarray(timingBase, timingBase + timingBuckets),
  };
}

/**
 * A quarter track as a track number: 17, 17.25, 17.5, 17.75.
 *
 * @param {number} quarterTrack
 * @returns {string}
 */
export function trackLabel(quarterTrack) {
  const whole = Math.floor(quarterTrack / 4);
  const part = quarterTrack % 4;
  return part === 0 ? `${whole}` : `${whole}.${["", "25", "5", "75"][part]}`;
}

/**
 * How far a cell time is from the nominal cell, as a fraction: -0.05 is a
 * cell written 5% fast.
 *
 * @param {number} time - Quarters of 125ns
 * @returns {number}
 */
export function cellDeviation(time) {
  return time / NOMINAL_CELL_TIME - 1;
}

/**
 * Microseconds a cell took.
 *
 * @param {number} time - Quarters of 125ns
 * @returns {number}
 */
export function cellMicroseconds(time) {
  return time / 32;
}

/**
 * Describe a whole disk from its overview: what is on it and how much of it
 * reads as a standard format would.
 *
 * Quarter tracks that read one stored track are counted once, which is what a
 * person means by "how many tracks".
 *
 * @param {{tracks: Array<Object>}} overview
 */
export function summarizeDisk(overview) {
  const seen = new Set();
  const summary = {
    tracks: 0,
    sectors: 0,
    good: 0,
    bad: 0,
    fluxTracks: 0,
    nonStandardTracks: 0,
    thirteenSector: false,
    sixteenSector: false,
    format: "Empty",
  };
  if (!overview) return summary;

  for (const t of overview.tracks) {
    if (!t.present || seen.has(t.trackId)) continue;
    seen.add(t.trackId);
    summary.tracks++;
    summary.sectors += t.sectorsFound;
    summary.good += t.sectorsGood;
    summary.bad += t.addressBad + t.dataBad;
    if (t.flux) summary.fluxTracks++;
    if (t.sectorsFound === 0) summary.nonStandardTracks++;
    if (t.thirteenSector) summary.thirteenSector = true;
    else if (t.sectorsFound > 0) summary.sixteenSector = true;
  }

  if (summary.tracks === 0) {
    summary.format = "Empty";
  } else if (summary.sectors === 0) {
    summary.format = "Unknown format";
  } else if (summary.thirteenSector && summary.sixteenSector) {
    summary.format = "13 and 16 sector";
  } else if (summary.thirteenSector) {
    summary.format = "13 sector";
  } else {
    summary.format = "16 sector";
  }
  return summary;
}

/**
 * The first nibble to draw when a view of the track begins at a cell.
 *
 * Not always the nibble holding that cell: the cells before the track's first
 * nibble belong to its last one, round the end of the track, and a view
 * drawn left to right from there would stop after it.
 *
 * @param {{count: number, start: Uint32Array}} nibbles
 * @param {number} cell
 * @returns {number}
 */
export function firstNibbleInView(nibbles, cell) {
  if (!nibbles || nibbles.count === 0) return 0;
  if (cell < nibbles.start[0]) return 0;
  return Math.max(0, nibbleAtCell(nibbles, cell));
}

/**
 * The index of the nibble holding a cell, by binary search on start cells.
 *
 * @param {{count: number, start: Uint32Array}} nibbles
 * @param {number} cell
 * @returns {number} -1 if there are none
 */
export function nibbleAtCell(nibbles, cell) {
  if (!nibbles || nibbles.count === 0) return -1;
  let lo = 0;
  let hi = nibbles.count - 1;
  if (cell < nibbles.start[0]) return nibbles.count - 1; // wraps from the end
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (nibbles.start[mid] <= cell) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
