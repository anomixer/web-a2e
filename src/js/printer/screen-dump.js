/*
 * screen-dump.js - Host-side screen → ImageWriter II graphics dump
 *
 * Converts an RGBA framebuffer (the //e 560×384 HGR/DHGR/LORES/TEXT screen, or
 * any arbitrary bitmap) into a faithful ImageWriter II bit-image stream. The
 * bytes go through the very same ESC G parser path a real screen-dump utility
 * (Grappler ROM, Print Shop, etc.) drives, so the dump is exercised against the
 * exact protocol software depends on — nothing here paints pixels directly.
 *
 * Per the ImageWriter II Technical Reference Manual, Chapter 8:
 *  - ESC n         selects 72-dpi horizontal — the canonical square 72×72 grid
 *                  every Mac-Pascal graphics example in the manual uses.
 *  - ESC T 16      sets a 16/144" line feed = exactly 8 wires at 72 dpi, so each
 *                  8-dot band butts seamlessly against the next (Figure 8-5).
 *  - ESC G nnnn    4 ASCII digits = number of data bytes; one 8-dot column each.
 *  - Data byte     bit 0 = top dot, bit 7 = bottom dot (Figure 8-1). All 8 bits
 *                  are significant, so columns are emitted as raw bytes.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

const ESC = 0x1B;

// The //e renders its screen to this fixed RGBA framebuffer (see main.js
// captureScreenshot). 280×192 HGR is doubled to 560×384.
export const SCREEN_W = 560;
export const SCREEN_H = 384;

// Push an ESC G/ESC F-style 4-digit ASCII count (leading zeros). nnnn must
// always be four digits (Table 8-1); 560 → "0560".
function pushCount4(out, n) {
  const s = String(Math.max(0, Math.min(9999, n | 0))).padStart(4, "0");
  for (let i = 0; i < 4; i++) out.push(s.charCodeAt(i));
}

// A framebuffer pixel is "ink" when it is lit on the dark screen. Testing each
// channel against the threshold means coloured HGR pixels (green, purple, …)
// dump as black ink too, which is what a monochrome screen dump should do.
function isLit(fb, idx, threshold) {
  return fb[idx] >= threshold || fb[idx + 1] >= threshold || fb[idx + 2] >= threshold;
}

/**
 * Build the ImageWriter II byte stream for an RGBA framebuffer.
 *
 * @param {Uint8ClampedArray|Uint8Array|number[]} fb  RGBA pixels, row-major.
 * @param {number} width   pixels per row.
 * @param {number} height  rows.
 * @param {object} [opts]
 * @param {number} [opts.threshold=0x40]  per-channel lit threshold (0–255).
 * @returns {number[]}  byte stream ready for PrinterManager.feedBytes().
 */
export function buildScreenDump(fb, width = SCREEN_W, height = SCREEN_H, opts = {}) {
  const threshold = opts.threshold ?? 0x40;
  const out = [];

  out.push(ESC, 0x6E);              // ESC n  — 72 dpi horizontal (square grid)
  out.push(ESC, 0x54, 0x31, 0x36); // ESC T 16 — 16/144" feed, bands butt together

  // Each pass prints one 8-dot-high band; bit r of the column byte is row y+r.
  for (let y = 0; y < height; y += 8) {
    out.push(ESC, 0x47);           // ESC G
    pushCount4(out, width);
    for (let x = 0; x < width; x++) {
      let col = 0;
      for (let r = 0; r < 8; r++) {
        const yy = y + r;
        if (yy >= height) break;
        if (isLit(fb, (yy * width + x) * 4, threshold)) col |= 1 << r; // bit 0 = top
      }
      out.push(col);               // raw 8-bit column — bit 7 is significant
    }
    out.push(0x0D, 0x0A);          // CR+LF — return + one band's worth of feed
  }

  // Leave the printer in a sane text state for whatever prints next.
  out.push(ESC, 0x4E);             // ESC N — back to pica
  out.push(ESC, 0x41);             // ESC A — back to 6 lpi

  return out;
}
