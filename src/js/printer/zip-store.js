/*
 * zip-store.js - Minimal ZIP archive writer (store / no compression)
 *
 * PNG payloads are already DEFLATE-compressed, so storing them verbatim costs
 * nothing and keeps the printer export dependency-free. Used to bundle a
 * multi-sheet print run (one PNG per page plus a full-strip PNG) into a single
 * download.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const u16 = (v) => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]);
const u32 = (v) => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]);

// files: [{ name: string, data: Uint8Array }] → Blob (application/zip).
export function makeZipStore(files) {
  const enc   = new TextEncoder();
  const parts = [];      // streamed local headers + data
  const cd    = [];      // central directory entries
  let offset  = 0;       // running local-header offset

  // DOS date 1980-01-01, time 00:00 (fixed — Date.now() is unavailable here).
  const DOS_TIME = 0;
  const DOS_DATE = 0x21;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc  = crc32(f.data);
    const size = f.data.length;

    parts.push(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(DOS_TIME), u16(DOS_DATE),
      u32(crc), u32(size), u32(size), u16(name.length), u16(0),
      name, f.data
    );

    cd.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(size), ...u32(size),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset),
    ]), name);

    offset += 30 + name.length + size;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of cd) { parts.push(c); cdSize += c.length; }

  parts.push(new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(cdStart), ...u16(0),
  ]));

  return new Blob(parts, { type: "application/zip" });
}
