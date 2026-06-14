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

// ---- Period-correct ImageWriter II colour model ------------------------------
//
// The colour ribbon has four physical bands — yellow, magenta, cyan, black.
// Every other printable colour is made the way the real printer makes it: by
// OVERPRINTING two band passes on the same dot (orange = Y+M, green = Y+C,
// purple = M+C). So a colour dump is a band SEPARATION — a yellow pass, a
// magenta pass, a cyan pass and a black pass per 8-dot band — not a palette of
// pre-mixed inks. Where two passes strike the same dot the inks physically
// overlay, exactly as the renderer's band accumulation reproduces.
//
// Internal band bits (independent of the ESC K codes below).
const bY = 1, bM = 2, bC = 4, bK = 8;

// ESC K colour-select codes for each primary band pass (Table A-18).
const BAND_PASSES = [
  { bit: bY, esc: 1 }, // yellow
  { bit: bM, esc: 2 }, // magenta
  { bit: bC, esc: 3 }, // cyan
  { bit: bK, esc: 0 }, // black
];

// The six saturated colours, each given as the //e SCREEN colour it looks like
// (so we quantise the framebuffer against it) paired with the ribbon bands that
// overlay to print it. RGB values are the canonical Apple // 16-colour palette
// entries (NTSC-derived), the actual source a dump quantises. The two greyscale
// poles (black, white) are added by gamut() below, because which pole inks
// depends on the dump mode.
const COLOUR_POINTS = [
  { rgb: [208, 221, 89 ], bands: bY         }, // yellow        → yellow
  { rgb: [227, 30,  96 ], bands: bM         }, // red / magenta → magenta
  { rgb: [20,  207, 253], bands: bC         }, // medium blue   → cyan
  { rgb: [255, 106, 60 ], bands: bY | bM    }, // orange        → Y + M
  { rgb: [20,  245, 60 ], bands: bY | bC    }, // green         → Y + C
  { rgb: [255, 68,  253], bands: bM | bC    }, // violet/purple → M + C
];

// Build the 8-entry quantisation gamut. Saturated colours always print as their
// band pair; only the greyscale poles flip with the mode:
//  - WYSIWYG (invert=false): screen BLACK → black band, screen WHITE → bare
//    paper. Reproduces a dense colour screen as seen.
//  - INVERTED (invert=true): screen BLACK → bare paper, screen WHITE → black
//    band. The traditional dump for sparse/light screens (text, line art) so a
//    mostly-black field stays white paper instead of a near-solid black page.
function gamut(invert) {
  return [
    { rgb: [0,   0,   0  ], bands: invert ? 0  : bK },  // black field
    { rgb: [255, 255, 255], bands: invert ? bK : 0  },  // white
    ...COLOUR_POINTS,
  ];
}

// Fraction of pixels that carry visible content (any channel above LIT_THRESH).
// Drives the auto WYSIWYG-vs-inverted choice: a dense colour screen reproduces
// as seen, a sparse one (mostly black field) inverts so paper stays white.
const LIT_THRESH = 48;
export function litDensity(fb, width = SCREEN_W, height = SCREEN_H) {
  const n = width * height;
  let lit = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (fb[o] >= LIT_THRESH || fb[o + 1] >= LIT_THRESH || fb[o + 2] >= LIT_THRESH) lit++;
  }
  return n ? lit / n : 0;
}

// 4×4 Bayer matrix (normalised −0.5..+0.5) for ordered/pattern dithering — the
// period-authentic technique on these 8-bit machines (Print Shop, Dazzle Draw,
// 8/16 Paint all used ordered patterns, not the modern error-diffusion FS).
const BAYER4 = [
  [0,  8,  2,  10],
  [12, 4,  14, 6 ],
  [3,  11, 1,  9 ],
  [15, 7,  13, 5 ],
];
const DITHER_AMP = 60; // luminance jog applied before quantising; tune for grain

// Ordered-dither the framebuffer onto GAMUT. Returns a Uint8Array band mask per
// pixel (bY|bM|bC|bK bits); 0 = bare paper. Greys/pastels fall between gamut
// points, so the Bayer jog scatters them into period checkerboard patterns.
function ditherToBands(fb, width, height, gam) {
  const n   = width * height;
  const map = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    const brow = BAYER4[y & 3];
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const jog = (brow[x & 3] / 16 - 0.5) * DITHER_AMP * 2;
      const r = fb[p * 4] + jog, g = fb[p * 4 + 1] + jog, b = fb[p * 4 + 2] + jog;
      let best = 0, bestD = Infinity;
      for (let t = 0; t < gam.length; t++) {
        const c = gam[t].rgb;
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = t; }
      }
      map[p] = gam[best].bands;
    }
  }
  return map;
}

/**
 * Build a period-correct COLOUR ImageWriter II screen dump: a four-band ribbon
 * separation, ordered-dithered, with overlapping Y/M/C/K passes per 8-dot band
 * so secondaries form by physical ink overlay. Requires Auto-LF OFF for the
 * duration so the per-pass CR returns the head without feeding (the caller
 * arranges this); the per-band LF advances exactly one band.
 *
 * @param {Uint8ClampedArray|Uint8Array|number[]} fb  RGBA pixels, row-major.
 * @param {number} width   pixels per row.
 * @param {number} height  rows.
 * @param {object} [opts]
 * @param {boolean} [opts.invert]  Force greyscale polarity. Omit to auto-pick:
 *   sparse screens (< 5% lit) invert (paper stays white), dense screens are
 *   reproduced WYSIWYG.
 * @returns {number[]}  byte stream for PrinterManager.feedBytes().
 */
export function buildScreenDumpColor(fb, width = SCREEN_W, height = SCREEN_H, opts = {}) {
  const invert = opts.invert ?? (litDensity(fb, width, height) < 0.05);
  const map = ditherToBands(fb, width, height, gamut(invert));
  const out = [];

  out.push(ESC, 0x6E);              // ESC n  — 72 dpi horizontal (square grid)
  out.push(ESC, 0x54, 0x31, 0x36); // ESC T 16 — 16/144" feed, bands butt together

  for (let y = 0; y < height; y += 8) {
    for (const pass of BAND_PASSES) {
      // Only emit this band's pass if some dot in the band uses it.
      let used = false;
      for (let x = 0; x < width && !used; x++) {
        for (let r = 0; r < 8; r++) {
          const yy = y + r; if (yy >= height) break;
          if (map[yy * width + x] & pass.bit) { used = true; break; }
        }
      }
      if (!used) continue;

      out.push(ESC, 0x4B, 0x30 + pass.esc); // ESC K — select this band's colour
      out.push(ESC, 0x47);                  // ESC G
      pushCount4(out, width);
      for (let x = 0; x < width; x++) {
        let col = 0;
        for (let r = 0; r < 8; r++) {
          const yy = y + r; if (yy >= height) break;
          if (map[yy * width + x] & pass.bit) col |= 1 << r; // bit 0 = top
        }
        out.push(col);
      }
      out.push(0x0D);                       // CR — return so the next band overlays
    }
    out.push(0x0A);                         // LF — advance exactly one 8-dot band
  }

  out.push(ESC, 0x4B, 0x30);        // back to black
  out.push(ESC, 0x4E);              // ESC N — back to pica
  out.push(ESC, 0x41);              // ESC A — back to 6 lpi
  return out;
}
