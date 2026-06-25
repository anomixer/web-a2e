/*
 * printer-window.js - Printer output window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { BaseWindow } from "../windows/base-window.js";
import { DEFAULT_DPI } from "./printer-units.js";
import { PRINTER_MODELS, RIBBONS } from "./printer-manager.js";
import { makeZipStore } from "./zip-store.js";
import {
  buildScreenDumpImageWriter, buildScreenDumpAppleDMP, buildScreenDumpEpson,
  buildScreenDumpColor, SCREEN_W, SCREEN_H,
} from "./screen-dump.js";
import { printViaIframe, printPagesViaIframe } from "./print-utils.js";
import { savePage } from "./printer-page-store.js";
import { clampWidthInch, GRID_INCH, computeLayout } from "./printer-paper-geometry.js";

// 1 display pixel per dot (canvas scrolls horizontally if wider than paper area)
const DOT_PX     = 1;
// Fallback display raster (canvas px per inch), used only before a printer is
// active. The active printer owns this via canvasPxPerInch() / paperProfile()
// (this._ppi); all paper geometry is solved by computeLayout() off that profile.
const DEFAULT_PX_PER_INCH = 120;
const RULER_TOP_H = 22;          // top ruler height, px — internal raster == CSS display
                                 // height so ticks/labels draw with no vertical squish
const RULER_LEFT_W = 21;        // left ruler width, px — internal raster == CSS display
// The dot grid is anisotropic: the horizontal canvas raster (_ppi, default 120)
// across vs V_RASTER (72, the 9-pin row pitch) down. Painting 1:1 makes an
// 8×11" page look square. The live vertical stretch (_ppi / V_RASTER, via
// get _vstretch) scales every vertical coordinate to the true 8:11 page aspect —
// physically honest, since 9-pin rows (1/72") really do sit wider apart than
// columns (1/_ppi"). At the default _ppi=120 this stays the historic 120/72.
const V_RASTER    = 72;           // vertical canvas raster, px/in down (9-pin pitch)
const DRAFT_H_DPI = 120;          // default glyph H density when a printer omits it
const DRAFT_V_DPI = 72;           // default glyph V density
const DEFAULT_VSTRETCH = DEFAULT_PX_PER_INCH / V_RASTER; // module fallback (= 5/3)
const DOT_H_PX   = 2;            // painted height of one stretched wire dot
const PAGE_H_PX  = Math.round(792 * DEFAULT_VSTRETCH); // 1320 — 66 lines @ 11", default form
// Dot STRIKE shape. A 9-pin head stamps a FIXED-diameter ink dot (the pin tip)
// wherever a wire fires. The dot size is physical — it does NOT scale with the
// glyph's grid density. Density only changes how far apart dots sit: draft
// spaces them out, NLQ packs more in (overlapping into smoother strokes), but
// every dot is the same pin-sized disc. So we paint a round disc of one fixed
// canvas diameter, centred on each grid cell, regardless of the cell footprint.
// (Square strike — hard footprint rects — is kept for the graphics/screen-dump
// path, which butts dots into solid fills.)
//
// Runtime-tunable so the strike can be dialled live (printerStrike agent tool)
// without a reload; defaults seed from localStorage and persist there.
//   round   — round pin dot vs square footprint
//   diaPx   — pin dot DIAMETER in canvas px (fixed across all densities)
//   buildup — overstrike darkening: a dot struck again on the SAME spot deepens
//             toward saturation (real ribbon/paper). The 1st strike is unchanged,
//             so normal single-pass output is byte-identical to buildup off.
//   maxBuild— strike count at which ink is fully saturated (no further darkening)
//   bleedPx — extra disc radius added per overstrike (capillary spread; sub-pixel)
const STRIKE_DEFAULTS = { round: true, diaPx: 1.9, buildup: true, maxBuild: 3, bleedPx: 0.12 };
function _loadStrike() {
  try {
    const raw = localStorage.getItem("a2e-printer-strike");
    if (raw) return { ...STRIKE_DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...STRIKE_DEFAULTS };
}
const STRIKE = _loadStrike();
export function setPrinterStrike(patch = {}) {
  if (typeof patch.round === "boolean")   STRIKE.round   = patch.round;
  if (typeof patch.buildup === "boolean") STRIKE.buildup = patch.buildup;
  if (Number.isFinite(patch.diaPx))    STRIKE.diaPx    = Math.max(0.5, Math.min(6, patch.diaPx));
  if (Number.isFinite(patch.maxBuild)) STRIKE.maxBuild = Math.max(1, Math.min(4, Math.round(patch.maxBuild)));
  if (Number.isFinite(patch.bleedPx))  STRIKE.bleedPx  = Math.max(0, Math.min(0.5, patch.bleedPx));
  try { localStorage.setItem("a2e-printer-strike", JSON.stringify(STRIKE)); } catch (e) {}
  return { ...STRIKE };
}
export function getPrinterStrike() { return { ...STRIKE }; }

// Display SUPERSAMPLING. The dot raster is only ~120 px/inch, so at 1:1 a pin
// dot spans ~1–2 device px — too few pixels to hold both a solid black core and
// a clean round edge, so canvas anti-aliases the whole disc to grey (no ink
// core). Fix the way real high-DPI rendering does: paint the PAPER canvas into a
// backing store SS× denser, then show it CSS-downscaled. Dots are drawn at
// SS×-resolution (the arc now has a genuine solid core) and the browser area-
// downsamples to the display — solid centre, soft edge, dots separated like a
// real print. ONLY the paper canvas is supersampled; rulers/perf/head stay at
// display density. All draw code is unchanged: the paper context is pre-scaled
// by SS (_sizePaperBacking), so every coordinate stays in the original 120-dpi
// "logical" space. Layout/scale/export math must read the cached logical dims
// (_logW/_logH), never canvas.width/height (which are the ×SS backing).
const SS_DEFAULT = 3;
function _loadSS() {
  try {
    const v = parseFloat(localStorage.getItem("a2e-printer-ss"));
    if (Number.isFinite(v) && v >= 1 && v <= 4) return Math.round(v);
  } catch (e) {}
  return SS_DEFAULT;
}
let PRINTER_SS = _loadSS();
let _ssRebuild = null;   // set by the live PrinterWindow so a dial rebuilds its canvas
export function getPrinterSS() { return PRINTER_SS; }
export function setPrinterSS(ss) {
  if (Number.isFinite(ss)) PRINTER_SS = Math.max(1, Math.min(4, Math.round(ss)));
  try { localStorage.setItem("a2e-printer-ss", String(PRINTER_SS)); } catch (e) {}
  _ssRebuild?.();   // resize the backing store + repaint at the new factor
  return PRINTER_SS;
}
// Conservative cross-browser canvas limits. Chrome/Firefox allow ~32767 px per
// side; Safari is bound instead by total AREA (~16.78M px²) and silently BLANKS
// the whole canvas once either is exceeded. We clamp by both — per-dimension and
// by area / current width — so a long multi-page print stops growing cleanly
// instead of zeroing the backing store. The page store retains earlier sheets.
const CANVAS_MAX_H    = 32000;
const CANVAS_MAX_AREA = 16000000;
// Six common continuous-stationery sizes from the Apple II era.
// w/h are paper BODY inches (tractor strips already removed).
const PAPER_PRESETS = [
  { label: 'Standard', w: 8.50, h: 11.00 },
  { label: 'Legal',    w: 8.50, h: 14.00 },
  { label: 'Narrow',   w: 4.00, h: 11.00 },
  { label: 'Half',     w: 5.50, h:  8.50 },
  { label: 'Index',    w: 3.50, h:  5.00 },
  { label: 'Card',     w: 3.50, h:  2.00 },
];
// The canvas is a fixed 120-dpi-across / 72-dpi-down raster. Internal dots map
// onto it by dividing by (printer.dpi / 120) across and (printer.dpi / 72) down,
// so the mapping tracks whatever internal scale the active printer uses (default
// 480 → ÷4 / ÷6.667). Sourced live per printer via this._hdotInternal /
// this._vdotInternal (a model may override its dpi for finer densities).
const PAPER_BG   = "#ffffff";
// Four ribbon bands plus the three overprint secondaries (ESC K 4-6). Orange,
// green and purple are what the real ribbon makes by laying two bands on the
// same dot.
const DOT_COLORS = {
  black:   '#1a1a1a',
  yellow:  '#b8860b',   // dense gold — yellow on white is the faintest band even so
  magenta: '#d0006a',   // vivid purplish-red band (Table 8-6), not pure red
  cyan:    '#0078c0',   // vivid greenish-blue band, not pure blue
  orange:  '#e0600f',   // yellow + magenta
  green:   '#008a2e',   // yellow + cyan
  purple:  '#8a1ca8',   // magenta + cyan
};

// Ribbon bands as a bitmask. A single strike paints its colour at full strength
// (readable); when the head overstrikes a dot with a different band, the ink
// mixes subtractively — yellow+cyan = green, magenta+cyan = purple, etc. —
// exactly as the real four-band ribbon does on a LF-back-and-reprint. We model
// that by accumulating the bands struck at each dot. Re-striking the SAME band
// instead deepens the dot toward saturation (see inkColor / STRIKE.buildup) —
// never by stacking translucency.
const BAND = { Y: 1, M: 2, C: 4, K: 8 };

// Which band(s) each selectable colour lays down. The direct secondaries
// (ESC K 4-6) deposit both constituent bands, so a further overstrike keeps
// mixing correctly.
const COLOR_BANDS = {
  black:   BAND.K,
  yellow:  BAND.Y,
  magenta: BAND.M,
  cyan:    BAND.C,
  orange:  BAND.Y | BAND.M,
  green:   BAND.Y | BAND.C,
  purple:  BAND.M | BAND.C,
};

// Resolve an accumulated band mask to a paint colour. Any black band → black;
// two chromatic bands → the secondary; all three → muddy near-black, as real
// overstruck ink goes.
function mixInk(mask) {
  if (mask & BAND.K) return DOT_COLORS.black;
  switch (mask & (BAND.Y | BAND.M | BAND.C)) {
    case BAND.Y:                   return DOT_COLORS.yellow;
    case BAND.M:                   return DOT_COLORS.magenta;
    case BAND.C:                   return DOT_COLORS.cyan;
    case BAND.Y | BAND.M:          return DOT_COLORS.orange;
    case BAND.Y | BAND.C:          return DOT_COLORS.green;
    case BAND.M | BAND.C:          return DOT_COLORS.purple;
    case BAND.Y | BAND.M | BAND.C: return '#3a2a14'; // all three → dark brown
    default:                       return DOT_COLORS.black;
  }
}

// Overstrike darkening. A pin striking the same spot again forces more ink into
// the paper — most of the gain comes on the 2nd strike, saturated by ~3 (the
// curve behind double-strike / emphasized bold and any program that overprints).
// We deepen the RESOLVED ink toward a floor, NOT by stacking translucency:
// black saturates to pure #000; a colour deepens ~40% but keeps its hue. count<=1
// (or buildup off) returns the exact single-strike colour → normal output unchanged.
function _hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function _rgbToHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
// Single-strike chromatic brightness multiplier. Vividness now comes from the
// saturated palette + fatter colour dot (COLOR_DOT_FATTEN), so this stays 1.0
// (no source darkening) — kept as a tunable knob. Overstrike buildup still
// deepens colour from this base. Black is always left at 1.0.
const COLOR_BASE_DARKEN = 1.0;
// Colour ink lays a wider footprint than the thin black strokes (real colour
// ribbons over-ink a touch), so chromatic round dots get a ~20% fatter disc to
// read clearly on white. Text only — the square screen-dump path ignores it.
const COLOR_DOT_FATTEN = 1.2;
// Chromatic vibrance: push each channel away from the dot's luma to saturate it
// without shifting hue. 1.0 = raw palette; 1.25 = ~25% more vivid. Black is never
// touched (luma boost on a grey is a no-op anyway, but we skip it explicitly).
const COLOR_VIVID = 1.25;
function inkColor(mask, count) {
  const base    = mixInk(mask);
  const isBlack = !!(mask & BAND.K);
  let mul = isBlack ? 1 : COLOR_BASE_DARKEN;            // single-strike richness
  if (STRIKE.buildup && count > 1) {
    const t     = Math.min(1, (count - 1) / Math.max(1, STRIKE.maxBuild - 1)); // 0..1 over strikes 1..maxBuild
    const floor = isBlack ? 0.0 : 0.6;                 // black → pure #000; colour → deeper, hue kept
    mul *= 1 - t * (1 - floor);
  }
  if (isBlack && mul === 1) return base;               // black fast path, byte-identical
  let [r, g, b] = _hexToRgb(base);
  if (!isBlack && COLOR_VIVID !== 1) {                 // vibrance around luma, hue preserved
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    r = y + (r - y) * COLOR_VIVID;
    g = y + (g - y) * COLOR_VIVID;
    b = y + (b - y) * COLOR_VIVID;
  }
  return _rgbToHex(r * mul, g * mul, b * mul);
}

// Whether a model renders dot-matrix to the canvas (rulers, sprocket strips,
// draggable paper geometry) is now a printer capability — printer.usesPaperCanvas()
// — not a hardcoded id list, so a new model needs no edit here.

export class PrinterWindow extends BaseWindow {
  constructor(printerManager) {
    super({
      id: "printer-output",
      title: "Printer",
      minWidth: 150,   // collapsed toolbar (power + PNG + PDF) bottoms out ~132px
      minHeight: 300,
      defaultWidth: 580,
      defaultHeight: 480,
    });

    this.printerManager = printerManager;
    this.text           = "";
    this.online         = true;
    this.elements       = null;
    this._canvasMode    = false;
    this._fitMode       = this._loadFitMode(); // true = scale to width
    this._panelPinned   = this._loadPin();     // operator panel docked in-flow
    this._jobId         = null;                // page-store job id (this sheet run)
    this._persistTimer  = null;                // debounce for auto-capture
    this._cachedSoftState = 1;                 // bit 0 = TEXT mode; default = text (safe: no auto-invert)

    // Last sheet before the tab unloads is best-effort flushed; the debounced
    // capture has usually already written it ~1.2s after the final byte.
    window.addEventListener("pagehide", () => this._flushAndEndJob());
    // Let a live supersample dial (setPrinterSS) rebuild this window's canvas at
    // the new factor without a reload. Reprint after — _initCanvas wipes content.
    _ssRebuild = () => { if (this._canvasMode && this.elements) this._initCanvas(); };
  }

  // Internal dot scale of the active printer, and the internal→canvas divisors
  // derived from it. The canvas is an isotropic raster at the announced _ppi
  // across and V_RASTER down; a model may override its dpi for finer densities,
  // so these track it live.
  get _dpi()          { return this.printerManager?.getActivePrinter?.()?.dpi || DEFAULT_DPI; }
  get _hdotInternal() { return this._dpi / this._ppi; }
  get _vdotInternal() { return this._dpi / V_RASTER; }
  // Live vertical stretch — canvas px per V_RASTER unit so the page keeps its
  // true 8:11 aspect at any announced _ppi (default 120 → 5/3, identical before).
  get _vstretch()     { return this._ppi / V_RASTER; }

  // Active display raster (canvas px per inch), printer-owned. Single conversion
  // factor for all inch↔px work in the ruler and the width-drag.
  get _ppi() { return this.printerManager?.getActivePrinter?.()?.canvasPxPerInch?.() ?? DEFAULT_PX_PER_INCH; }

  // Paper-canvas supersample factor (see SS knob above). Backing store is this×
  // the logical raster; the paper context is pre-scaled by it so draw code is
  // unchanged. Rulers/perf/head stay logical.
  get _ss() { return PRINTER_SS; }

  // Size the PAPER canvas backing store at SS× the logical dimensions, hold the
  // CSS box at the logical size (so 1:1 still shows true platen px while the dots
  // render denser), and pre-scale the context by SS so all draw code keeps using
  // 120-dpi logical coordinates. Caches the logical dims every layout/scale/export
  // site reads — those MUST use _logW/_logH, not canvas.width/height (the backing).
  // Assigning canvas.width/height resets the context, so the transform is (re)set
  // here on every resize. Returns the ready-to-draw context.
  _sizePaperBacking(logW, logH) {
    const cv = this.elements.canvas;
    const ss = this._ss;
    this._logW = logW;
    this._logH = logH;
    cv.width  = Math.round(logW * ss);
    cv.height = Math.round(logH * ss);
    // Hold the on-screen size at the logical box. Fit mode stretches to the wrap
    // (handled in _applyFit); 1:1 pins to logical px so the backing downsamples.
    if (this._fitMode) { cv.style.width = "100%"; cv.style.height = "auto"; }
    else               { cv.style.width = logW + "px"; cv.style.height = logH + "px"; }
    const ctx = this.elements.ctx;
    ctx.setTransform(ss, 0, 0, ss, 0, 0);
    return ctx;
  }

  // ---- Platen layout (horizontal page geometry) ----
  // All geometry is solved by the pure computeLayout() in printer-paper-geometry.js
  // off the active printer's paperProfile() and its current PaperGeometry width /
  // length. The window holds NO layout math — it just caches the result and draws:
  //   paperLPx / paperRPx — the PAPER (body) edges = ruler 0 .. ruler max (sizer)
  //   sheetLPx / sheetRPx — full sheet incl. the render-only ½"/side tractor strips
  //   zoneOriginPx        — print column 0 (fixed carriage span; clips ink only)
  //   tractorPx           — one tractor-strip width
  //   widthPx / heightPx  — canvas extent
  // Cached: rebuilt only when paper width/length or active model changes.
  _recomputePlaten() {
    const p = this.printerManager?.getActivePrinter?.();
    const profile = p?.paperProfile?.();
    const geo = p?.paperGeo;
    this._platenGeo = computeLayout(profile, geo?.widthInch, geo?.lengthInch);
    return this._platenGeo;
  }

  // The cached platen layout, computed on first use and after each rebuild.
  get _platen() { return this._platenGeo || this._recomputePlaten(); }

  _loadFitMode() {
    try { return localStorage.getItem("a2e-printer-fit") !== "false"; }
    catch (e) { return true; }
  }

  _loadPin() {
    try { return localStorage.getItem("a2e-printer-panel-pinned") === "true"; }
    catch (e) { return false; }
  }

  renderContent() {
    const modelOptions = PRINTER_MODELS.map((m) =>
      `<option value="${m.id}">${m.name}</option>`
    ).join("");
    const ribbonOptions = RIBBONS.map((r) =>
      `<option value="${r.id}">${r.name}</option>`
    ).join("");

    return `
      <div class="pr-root">
        <div class="pr-toolbar">
          <button id="pr-power" class="pr-toggle pr-toggle-on" title="Printer mains power. Off ignores incoming bytes and parks the head; printed paper is kept.">&#9211;</button>
          <div class="pr-sep"></div>
          <select id="pr-model" class="pr-select" title="Printer model">
            ${modelOptions}
          </select>
          <select id="pr-ribbon" class="pr-select" title="Ribbon cartridge">
            ${ribbonOptions}
          </select>
          <select id="pr-page" class="pr-select" title="Paper size — sets paper body width and form length"></select>
          <div class="pr-spacer"></div>
          <button id="pr-download-png" class="pr-btn" title="Export as PNG image">PNG</button>
          <button id="pr-download-pdf" class="pr-btn" title="Print / save as PDF">PDF</button>
        </div>
        <div class="pr-stage">
          <div class="pr-frame" id="pr-frame">
            <!-- L-frame chrome: corner + rulers live OUTSIDE the paper; the paper
                 scrolls under them in .pr-feed-bg. Rulers are scroll-locked via _syncRulers. -->
            <div class="pr-corner"></div>
            <div class="pr-ruler-top-vp"><canvas id="pr-ruler-top" class="pr-ruler-top"></canvas></div>
            <div class="pr-ruler-left-vp"><canvas id="pr-ruler-left" class="pr-ruler-left"></canvas></div>
            <div class="pr-feed-bg" id="pr-feed-bg">
              <div class="pr-sheet">
                <!-- The canvas IS the full sheet (incl. tracks). The sprocket
                     tear-strips are absolute overlays positioned WITHIN the sheet's
                     own ½" edges (_sizeStrips), so they scale with the paper and
                     never widen it — the holes are the sheet's margins, not extra
                     stock bolted on. The print-head bug rides the left track. -->
                <div class="pr-paper" id="pr-paper">
                  <pre id="pr-output" class="pr-output"></pre>
                  <div class="pr-canvas-wrap" id="pr-canvas-wrap">
                    <canvas id="pr-canvas" class="pr-canvas"></canvas>
                    <canvas id="pr-perf"  class="pr-perf"></canvas>
                    <canvas id="pr-head"  class="pr-head"></canvas>
                    <div class="pr-strip pr-strip-left" id="pr-strip-left">
                      <div class="pr-headmark" id="pr-headmark" title="Print head — drag to move the paper (snaps to line spacing)"></div>
                    </div>
                    <div class="pr-strip pr-strip-right" id="pr-strip-right" title="Right tractor — drag left/right to set paper width"></div>
                    <!-- Live width-drag guide: a dashed edge line + readout chip shown
                         only while the right tractor is dragged. Preview only — the
                         sheet re-lays to the new width on release (_initWidthDrag). -->
                    <div class="pr-width-guide" id="pr-width-guide"><span class="pr-width-chip" id="pr-width-chip"></span></div>
                    <!-- Green paper-edge lines: the paper (body) between the tractor
                         strips (= ruler 0 … ruler max). The right line is the
                         paper-sizer drag handle. UI overlay only (not drawn on canvas —
                         exports stay clean); _sizePaperEdges positions them as a % of the
                         sheet, in line with the ruler's green accents. -->
                    <div class="pr-paper-edge pr-paper-edge-left"  id="pr-paper-edge-left"></div>
                    <div class="pr-paper-edge pr-paper-edge-right" id="pr-paper-edge-right"></div>
                    <!-- Form-bottom drag handle: sits at y=pageHeightPx, ns-resize. -->
                    <div class="pr-length-handle" id="pr-length-handle" title="Form bottom — drag up/down to set page length"></div>
                    <div class="pr-length-guide" id="pr-length-guide"><span class="pr-length-chip" id="pr-length-chip"></span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="pr-panel" id="pr-panel">
            <div class="pr-panel-tab" title="Operator panel">&#9776;</div>
            <div class="pr-panel-body">
              <button id="pr-fit" class="pr-pbtn" title="Toggle fit-to-width / actual size">Fit</button>
              <button id="pr-rulers" class="pr-pbtn" title="Show / hide the inch rulers">Rulers</button>
              <!-- Print-speed knob hidden for now: playback compresses correctly, but live
                   output is throttled upstream (CPU/ProDOS emission rate), so the button
                   has no visible effect yet. Wiring kept intact; re-show once the upstream
                   pacing is understood. -->
              <button id="pr-speed" class="pr-pbtn" hidden title="Print speed — cycle 1× / 2× / 4× / 8× faster paper feed. Output is identical; only the on-screen playback rate changes.">1&times;</button>
              <div class="pr-pdiv"></div>
              <button id="pr-set-tof" class="pr-pbtn" title="Reseat the head at the top of the first page">TOP</button>
              <button id="pr-form-feed" class="pr-pbtn" title="Form feed to next page top">FF</button>
              <button id="pr-lf-up" class="pr-pbtn" title="Line feed up (reverse one line)">LF&#9650;</button>
              <button id="pr-lf-down" class="pr-pbtn" title="Line feed down (advance one line)">LF&#9660;</button>
              <div class="pr-pdiv"></div>
              <div id="pr-settings" class="pr-settings"></div>
              <div class="pr-pdiv"></div>
              <button id="pr-dump" class="pr-pbtn" title="Print the current //e screen as graphics (ESC G bit-image dump)">Dump Screen</button>
              <button id="pr-clear" class="pr-pbtn pr-pbtn-dim" title="Clear output">Clear</button>
            </div>
          </div>
        </div>
      </div>
      ${this._renderStyles()}
    `;
  }

  _renderStyles() {
    return `<style>
      .pr-root      { display: flex; flex-direction: column; height: 100%; min-width: 0; }
      .pr-toolbar   { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--input-bg-dark); border-bottom: 1px solid var(--border-default); flex-shrink: 0; flex-wrap: nowrap; overflow: hidden; min-width: 132px; }
      .pr-select    { padding: 2px 4px; font-size: 11px; border: 1px solid var(--border-default); border-radius: 3px; background: var(--badge-dim-bg); color: var(--text-secondary); font-family: "Monaco", "Menlo", monospace; cursor: pointer; }
      .pr-btn       { padding: 2px 8px; font-size: 11px; border: 1px solid var(--border-default); border-radius: 3px; background: var(--badge-dim-bg); color: var(--text-secondary); cursor: pointer; font-family: "Monaco", "Menlo", monospace; flex-shrink: 0; }
      .pr-btn:hover, .pr-select:hover { background: var(--input-bg-hover); color: var(--text-primary); }
      .pr-btn-dim   { color: var(--text-muted); }
      .pr-btn-fit-on { background: var(--accent-green-bg-stronger); color: var(--accent-green); border-color: var(--accent-green); }
      .pr-sep       { width: 1px; height: 16px; background: var(--border-default); margin: 0 2px; }
      .pr-spacer    { flex: 1; }
      .pr-label     { font-size: 11px; color: var(--text-muted); font-family: "Monaco", "Menlo", monospace; }
      .pr-toggle    { padding: 2px 8px; font-size: 11px; border: 1px solid var(--border-default); border-radius: 3px; cursor: pointer; font-family: "Monaco", "Menlo", monospace; flex-shrink: 0; }
      .pr-toggle-on  { background: var(--accent-green-bg-stronger); color: var(--accent-green); border-color: var(--accent-green); }
      .pr-toggle-off { background: var(--badge-dim-bg); color: var(--text-muted); }
      .pr-feed-bg.pr-no-interface { filter: grayscale(1) brightness(0.65); }

      /* Operator settings panel: app-standard toggle-switch / settings-select,
         stacked for the narrow side panel. */
      .pr-settings   { display: flex; flex-direction: column; gap: 7px; padding: 2px; }
      .pr-set-toggle { font-size: 11px; gap: 6px; color: var(--text-secondary); }
      .pr-set-row    { display: flex; flex-direction: column; gap: 2px; cursor: default; }
      .pr-set-label  { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
      .pr-set-select { width: 100%; font-size: 11px; }

      /* Stage holds the scrolling paper plus the slide-out operator panel. */
      .pr-stage   { flex: 1; position: relative; display: flex; min-height: 0; min-width: 0; overflow: hidden; }

      /* Figma-style L-frame: corner + top/left rulers are fixed chrome; the paper
         scrolls under them in .pr-feed-bg. Ruler tracks collapse to 0 when the
         active model isn't a canvas model (.pr-frame loses .pr-frame--rulers). */
      .pr-frame {
        flex: 1; min-width: 0; min-height: 0;
        display: grid;
        grid-template-columns: 0 1fr;
        grid-template-rows: 0 1fr;
      }
      .pr-frame--rulers {
        grid-template-columns: ${RULER_LEFT_W}px 1fr;
        grid-template-rows: ${RULER_TOP_H}px 1fr;
      }
      /* Ruler chrome sits on the printable BASE colour (--bg-primary) by default;
         only the top ruler's unprintable margin is repainted to the panel grey
         (--bg-panel) in _drawTopRuler. So printable = undiscoloured base, unusable
         = greyed — the single discolouration the operator should read. */
      .pr-corner {
        background: var(--bg-primary);
        border-right: 1px solid var(--border-default);
        border-bottom: 1px solid var(--border-default);
        border-top-left-radius: 5px;
      }
      .pr-ruler-top-vp  { overflow: hidden; background: var(--bg-primary); border-bottom: 1px solid var(--border-default); }
      .pr-ruler-left-vp { overflow: hidden; background: var(--bg-primary); border-right: 1px solid var(--border-default); }
      .pr-frame:not(.pr-frame--rulers) .pr-corner,
      .pr-frame:not(.pr-frame--rulers) .pr-ruler-top-vp,
      .pr-frame:not(.pr-frame--rulers) .pr-ruler-left-vp { display: none; }

      /* min-height/width:0 so this 1fr grid cell can actually scroll its tall paper
         instead of the auto-min blowing the grid past the frame. */
      /* Pinned to the 1fr cell (col 2 / row 2). Without this, hiding the ruler
         chrome (display:none) lets grid auto-placement reflow the feed into the
         collapsed 0-width/0-height first cell — the whole page vanishes. */
      .pr-feed-bg { grid-column: 2; grid-row: 2; min-width: 0; min-height: 0; overflow: auto; background: #444; padding: 0; }
      .pr-sheet   { display: flex; flex-direction: row; min-height: 100%; }

      /* Hide the scroll gutters so a non-overlay (always-on) scrollbar can't steal
         horizontal width — that gutter pushed the right tractor strip off the
         window edge so it never sat flush. Vertical feed scrolls via the head-follow
         / wheel on .pr-feed-bg; the inner .pr-paper owns only the 1:1 horizontal pan
         and never its own vertical bar (feed-bg is the sole vertical scroller). */
      .pr-feed-bg, .pr-paper { scrollbar-width: none; }
      .pr-feed-bg::-webkit-scrollbar, .pr-paper::-webkit-scrollbar { width: 0; height: 0; }

      /* Operator panel: by default parked off the right edge with a grab-tab
         poking out; hover (or focus-within) glides the button column in over the
         paper. Click the tab to PIN — the panel docks in-flow as a flex child so
         the paper shrinks to fit beside it; click again to unpin (auto-hide). */
      /* Collapsed = fully transparent; only the 18px tab column overlaps the
         paper as an invisible hover hotspot. Hover (or pin) slides the column in
         and paints the tab + body. */
      .pr-panel       { position: absolute; top: 0; right: 0; height: 100%; display: flex; flex-direction: row; align-items: stretch; transform: translateX(calc(100% - 18px)); transition: transform 0.18s ease; z-index: 5; }
      .pr-panel:hover, .pr-panel:focus-within { transform: translateX(0); }
      /* Same guard as the width handle (.pr-strip-right.pr-mute-hover): if a width
         drop leaves the pointer parked on the panel's right-edge hover trigger, the
         panel would slide out in the operator's face. Mute it FULLY (push the whole
         panel — tab included — off the right edge, not just re-park to the 18px tab)
         until the pointer leaves the zone (class removed on pointerleave). More
         specific than the :hover rule above, so it wins; never added while pinned. */
      .pr-panel.pr-mute-hover,
      .pr-panel.pr-mute-hover:hover,
      .pr-panel.pr-mute-hover:focus-within { transform: translateX(100%); }
      .pr-panel.pinned { position: relative; transform: none; }
      .pr-panel-tab   { width: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: transparent; color: transparent; border-left: 1px solid transparent; font-size: 13px; cursor: pointer; writing-mode: vertical-rl; transition: color 0.12s ease; }
      .pr-panel:hover .pr-panel-tab, .pr-panel:focus-within .pr-panel-tab, .pr-panel.pinned .pr-panel-tab { background: var(--bg-panel); border-left-color: var(--border-default); color: var(--text-muted); }
      .pr-panel:hover .pr-panel-tab:hover { color: var(--text-primary); }
      .pr-panel.pinned .pr-panel-tab { color: var(--accent-green); }
      .pr-panel-body  { width: 108px; display: flex; flex-direction: column; gap: 4px; padding: 8px 6px; background: var(--bg-panel); border-left: 1px solid var(--border-default); box-shadow: -4px 0 10px rgba(0,0,0,0.28); overflow-y: auto; }
      .pr-panel.pinned .pr-panel-body { box-shadow: none; }
      .pr-pbtn        { padding: 5px 6px; font-size: 11px; border: 1px solid var(--border-default); border-radius: 3px; background: var(--badge-dim-bg); color: var(--text-secondary); cursor: pointer; font-family: "Monaco", "Menlo", monospace; text-align: center; white-space: nowrap; }
      .pr-pbtn:hover  { background: var(--input-bg-hover); color: var(--text-primary); }
      .pr-pbtn-on     { background: var(--accent-green-bg-stronger); color: var(--accent-green); border-color: var(--accent-green); }
      .pr-pbtn-dim    { color: var(--text-muted); }
      .pr-pbtn.pr-holding { background: var(--accent-orange-bg-stronger, var(--input-bg-hover)); color: var(--accent-orange, var(--text-primary)); border-color: var(--accent-orange, var(--border-default)); transition: background 0.45s linear; }
      .pr-pdiv        { height: 1px; background: var(--border-default); margin: 2px 0; }

      /* Sprocket tear-strips: absolute overlays sitting on the sheet's own ½" edges
         (left/width set by _sizeStrips as a % of the canvas, so they scale with the
         paper and never widen it). The punched-hole texture (background gradient +
         size + position) is set INLINE by _styleSprocketHoles, sized off the strip's
         display width so the holes stay proportional (½" pitch, ⌀4 mm) at any zoom —
         a fixed-px gradient here looked right fit-scaled but too small at 1:1.
         pointer-events:none so they don't block scrolling; the head bug re-enables
         its own. */
      .pr-strip {
        position: absolute;
        top: 0;
        bottom: 0;
        background-color: #cdcdcd;
        pointer-events: none;
        z-index: 2;
      }
      .pr-strip-left  { left: 0; }
      /* Right tractor doubles as the paper-WIDTH grab handle (the left strip is the
         fixed datum + head bug). pointer-events re-enabled so it can catch the drag;
         ew-resize cursor + a hover ring advertise it. */
      .pr-strip-right { right: 0; pointer-events: auto; cursor: ew-resize; }
      /* Fatten the hit zone INWARD with a transparent rail so the operator can grab at
         the width line (the strip's inner edge) instead of chasing the ½" holed track.
         A ::before is painted by — and routes pointer events to — the strip itself, so
         pointerdown still fires on .pr-strip-right; the visible holes stay put. */
      .pr-strip-right::before {
        content: ""; position: absolute; top: 0; bottom: 0; right: 100%;
        width: 14px; cursor: ew-resize;
      }
      .pr-strip-right:hover    { box-shadow: inset 0 0 0 1px var(--accent-green, #61bb46); }
      .pr-strip-right.pr-wdrag { box-shadow: inset 0 0 0 1px var(--accent-green, #61bb46); }
      /* After a width drop the pointer is often still parked over the strip; mute the
         hover ring until it actually leaves the zone, so finishing a drag near the
         right edge doesn't immediately re-light the handle the operator just released. */
      .pr-strip-right.pr-mute-hover:hover { box-shadow: none; }

      /* Width-drag preview: a dashed line at the candidate sheet right-edge with a
         readout chip. Display-px positioned by _initWidthDrag; hidden when idle. */
      .pr-width-guide {
        position: absolute; top: 0; bottom: 0; width: 0;
        border-left: 2px dashed var(--accent-green, #61bb46);
        pointer-events: none; z-index: 4; display: none;
      }
      .pr-width-chip {
        position: absolute; top: 4px; left: 4px;
        font: 10px "Monaco", "Menlo", monospace;
        background: var(--bg-panel, #1c2128); color: var(--text-secondary, #bbb);
        border: 1px solid var(--accent-green, #61bb46); border-radius: 3px;
        padding: 1px 4px; white-space: nowrap;
      }
      /* Device paper min/max reached: the line hard-stops (amber) so the operator
         sees the clamp bite while the cursor keeps moving past it. */
      .pr-width-guide.pr-width-limit { border-left-color: var(--accent-orange, #f5821f); }
      .pr-width-guide.pr-width-limit .pr-width-chip {
        color: var(--accent-orange, #f5821f); border-color: var(--accent-orange, #f5821f);
      }

      /* Length-drag preview: a horizontal line at candidate form bottom + readout. */
      .pr-length-guide {
        position: absolute; left: 0; right: 0; height: 0;
        border-top: 2px dashed var(--accent-green, #61bb46);
        pointer-events: none; z-index: 4; display: none;
      }
      .pr-length-chip {
        position: absolute; left: 4px; top: 4px;
        font: 10px "Monaco", "Menlo", monospace;
        background: var(--bg-panel, #1c2128); color: var(--text-secondary, #bbb);
        border: 1px solid var(--accent-green, #61bb46); border-radius: 3px;
        padding: 1px 4px; white-space: nowrap;
      }
      .pr-length-guide.pr-length-limit { border-top-color: var(--accent-orange, #f5821f); }
      .pr-length-guide.pr-length-limit .pr-length-chip {
        color: var(--accent-orange, #f5821f); border-color: var(--accent-orange, #f5821f);
      }
      /* Form-bottom drag handle: horizontal bar, ns-resize. Positioned by _sizeLengthHandle. */
      .pr-length-handle {
        position: absolute; left: 0; right: 0; height: 10px;
        cursor: ns-resize; pointer-events: auto; z-index: 4;
        transform: translateY(-5px);
      }
      .pr-length-handle::after {
        content: ''; display: block; height: 2px; margin: 4px 0;
        background: var(--accent-green, #61bb46); opacity: 0; transition: opacity 0.12s;
      }
      .pr-length-handle:hover::after,
      .pr-length-handle.pr-ldrag::after { opacity: 1; }
      /* Paper size preset buttons in the operator panel. */
      .pr-paper-presets { display: flex; flex-direction: column; gap: 3px; }
      .pr-preset-btn {
        padding: 3px 4px; font-size: 10px; border: 1px solid var(--border-default);
        border-radius: 3px; background: var(--badge-dim-bg); color: var(--text-secondary);
        cursor: pointer; font-family: "Monaco", "Menlo", monospace; text-align: left;
        white-space: nowrap; overflow: hidden;
      }
      .pr-preset-btn:hover { background: var(--input-bg-hover); color: var(--text-primary); }
      .pr-preset-btn.pr-preset-active {
        background: var(--accent-green-bg-stronger); color: var(--accent-green);
        border-color: var(--accent-green);
      }
      .pr-preset-dims {
        font-size: 10px; color: var(--text-muted);
        font-family: "Monaco","Menlo",monospace; text-align: center; margin-top: 2px;
      }

      /* Paper (body) edges — green hairlines down the sheet at paper-left (= ruler
         0, inner edge of the left tractor strip) and paper-right (= ruler max). The
         right line is the paper-sizer handle the operator drags. They line up with the
         ruler's green edge accents to read as one continuous line top-to-bottom. Overlay
         only (z3: above the strips, below the live width-drag guide at z4); pointer-events
         none so the strip catches the drag. Positioned as a % by _sizePaperEdges. */
      .pr-paper-edge {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 0;
        border-left: 1px solid var(--accent-green, #61bb46);
        opacity: 0.6;
        pointer-events: none;
        z-index: 3;
      }

      /* Print-head row indicator riding the left tractor strip — a little
         impact-head carriage with pin slots and a red strike point that tracks
         the head's current paper row. Drag it to move the paper; it snaps to
         whole line-feed intervals (see _initHeadDrag). */
      .pr-headmark {
        position: absolute;
        left: 3px;
        top: 0;
        width: 14px;
        height: 11px;
        border-radius: 2px;
        background: linear-gradient(#646e7b 0%, #3a414b 55%, #232930 100%);
        border: 1px solid #14181d;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.28), 0 1px 2px rgba(0,0,0,0.5);
        transform: translateY(-6px);
        transition: top 0.08s linear, transform 0.1s ease;
        display: none;
        cursor: grab;
        user-select: none;
        -webkit-user-select: none;
        pointer-events: auto;   /* re-enable: the parent strip is pointer-events:none */
        z-index: 3;
      }
      /* vertical column of pin slots facing the paper */
      .pr-headmark::before {
        content: '';
        position: absolute;
        right: 2px; top: 2px; bottom: 2px;
        width: 2px;
        border-radius: 1px;
        background: repeating-linear-gradient(#cfd5dc 0 1px, transparent 1px 2px);
      }
      /* red strike point — the dot the pins actually hit on the paper */
      .pr-headmark::after {
        content: '';
        position: absolute;
        right: -4px; top: 50%;
        width: 0; height: 0;
        border-top: 3px solid transparent;
        border-bottom: 3px solid transparent;
        border-left: 4px solid var(--accent-red, #e03a3e);
        transform: translateY(-50%);
      }
      .pr-headmark:hover    { transform: translateY(-6px) scale(1.22); }
      .pr-headmark.dragging { cursor: grabbing; transition: transform 0.1s ease; }
      .pr-headmark.dragging:hover { transform: translateY(-6px) scale(1.28); }

      /* Horizontal scroller AND the row that lays out [strip][paper][strip].
         align-items:stretch makes the tractor strips run the full paper height;
         the canvas/output in the middle carries the flex (set per fit-mode in
         _applyFit), so the strips stay glued to the paper's left/right edges. */
      .pr-paper { flex: 1; min-width: 0; background: ${PAPER_BG}; position: relative; overflow: auto; padding: 0; display: flex; flex-direction: row; align-items: stretch; }

      .pr-paper::after {
        content: '';
        position: absolute;
        inset: 0;
        background-image: radial-gradient(circle, rgba(0,0,0,0.032) 0.8px, transparent 0.8px);
        background-size: 4px 4px;
        pointer-events: none;
      }

      .pr-output {
        flex: 1 1 0;
        min-width: 0;
        margin: 0;
        font-family: 'Courier New', Courier, monospace;
        font-size: 13px;
        line-height: 1.45;
        color: #1a1a1a;
        letter-spacing: 0.3px;
        white-space: pre-wrap;
        word-break: break-all;
        -webkit-font-smoothing: none;
        font-smooth: never;
      }

      /* Top inch ruler living in its viewport (.pr-ruler-top-vp). It rasters at
         the paper's DISPLAY width (set in _sizeTopRuler) and is positioned with a
         translateX (_syncRulers) so it tracks the paper as it scrolls/scales. The
         fixed CSS height pins it; the vp clips any horizontal overhang. */
      .pr-ruler-top {
        display: block;
        height: ${RULER_TOP_H}px;
        transform-origin: top left;
        will-change: transform;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }

      /* Left inch ruler living in its viewport (.pr-ruler-left-vp). It rasters at
         the paper's DISPLAY height (set in _sizeLeftRuler) and is positioned with
         a translateY (_syncRulers) to lock it to the paper's on-screen box in both
         fit and 1:1. The fixed CSS width pins it; the vp clips vertical overhang. */
      .pr-ruler-left {
        display: block;
        width: ${RULER_LEFT_W}px;
        transform-origin: top left;
        will-change: transform;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }

      .pr-canvas-wrap { position: relative; display: none; }
      .pr-canvas {
        display: block;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }
      .pr-perf, .pr-head {
        position: absolute;
        left: 0; top: 0;
        display: block;
        pointer-events: none;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }
    </style>`;
  }

  _cacheElements() {
    const el     = this.contentElement;
    const canvas = el.querySelector("#pr-canvas");
    const perf   = el.querySelector("#pr-perf");
    const head   = el.querySelector("#pr-head");
    this.elements = {
      toolbar:     el.querySelector(".pr-toolbar"),
      output:      el.querySelector("#pr-output"),
      paper:       el.querySelector("#pr-paper"),
      frame:       el.querySelector("#pr-frame"),
      canvasWrap:  el.querySelector("#pr-canvas-wrap"),
      rulerTop:    el.querySelector("#pr-ruler-top"),
      rulerLeft:   el.querySelector("#pr-ruler-left"),
      canvas,
      ctx:         canvas.getContext("2d"),
      perf,
      perfCtx:     perf.getContext("2d"),
      head,
      headCtx:     head.getContext("2d"),
      feedBg:      el.querySelector("#pr-feed-bg"),
      panel:       el.querySelector("#pr-panel"),
      panelTab:    el.querySelector(".pr-panel-tab"),
      model:       el.querySelector("#pr-model"),
      ribbon:      el.querySelector("#pr-ribbon"),
      page:        el.querySelector("#pr-page"),
      power:       el.querySelector("#pr-power"),
      noCard:      el.querySelector("#pr-no-card"),
      downloadPng: el.querySelector("#pr-download-png"),
      downloadPdf: el.querySelector("#pr-download-pdf"),
      dump:        el.querySelector("#pr-dump"),
      clear:       el.querySelector("#pr-clear"),
      fit:         el.querySelector("#pr-fit"),
      speed:       el.querySelector("#pr-speed"),
      lfUp:        el.querySelector("#pr-lf-up"),
      lfDown:      el.querySelector("#pr-lf-down"),
      setTof:      el.querySelector("#pr-set-tof"),
      formFeed:    el.querySelector("#pr-form-feed"),
      settings:    el.querySelector("#pr-settings"),
      headMark:    el.querySelector("#pr-headmark"),
      stripLeft:   el.querySelector("#pr-strip-left"),
      stripRight:  el.querySelector("#pr-strip-right"),
      widthGuide:  el.querySelector("#pr-width-guide"),
      widthChip:   el.querySelector("#pr-width-chip"),
      paperEdgeLeft:  el.querySelector("#pr-paper-edge-left"),
      paperEdgeRight: el.querySelector("#pr-paper-edge-right"),
      lengthHandle:   el.querySelector("#pr-length-handle"),
      lengthGuide:    el.querySelector("#pr-length-guide"),
      lengthChip:     el.querySelector("#pr-length-chip"),
      rulers:      el.querySelector("#pr-rulers"),
    };
    this._initCanvas();
    this._applyFit();
    // Lock the rulers to the paper once layout has settled (the canvas's
    // on-screen box is only measurable after the first frame).
    requestAnimationFrame(() => this._syncRulers());
  }

  // Canvas height of one page, derived from the active printer's form length
  // (page-size select / ESC H) — not a constant — so changing the form size
  // moves the perforations and resizes the sheet. Real ImageWriter II "page
  // size" is exactly this form length; paper width never changes.
  _pageHeightPx() {
    const p = this.printerManager.getActivePrinter();
    const formDots = p?.paper?.formDots || (this._dpi * (p?.paperGeo?.lengthInch ?? 11));
    return Math.max(40, Math.round(formDots / this._vdotInternal * this._vstretch));
  }

  _initCanvas() {
    this._applyPersistedPaper(this.printerManager.getActivePrinter());  // restored width sizes the platen
    this._recomputePlaten();
    const logW = this._platen.widthPx;
    // Start with the first sheet plus two blank feed pages ahead (display-only;
    // cropped from saved PNGs). _ensureCanvasHeight keeps the 2-page lead as
    // printing advances.
    const logH = this._pageHeightPx() * 3;
    const ctx  = this._sizePaperBacking(logW, logH);   // backing ×SS, ctx pre-scaled
    this._paintPaper(ctx, 0, logH);
    // Size both overlays to match main canvas at LOGICAL density (they carry thin
    // lines/markers, not dots — no supersample), then draw perforation marks on
    // the perf canvas only; they never touch the printable canvas.
    const pf = this.elements.perf;
    pf.width  = logW;
    pf.height = logH;
    this._drawPageBreaks();
    const hc = this.elements.head;
    hc.width  = logW;
    hc.height = logH;
    this.elements.headCtx.clearRect(0, 0, logW, logH);
    // Match the ruler's internal width to the platen so its 120-dpi tick math
    // lands on the same columns as the paper canvas, then paint it.
    this._sizeTopRuler();
    this._sizeLeftRuler();
    this._sizeStrips();
    this._sizePaperEdges();
    this._sizeLengthHandle();
  }

  // Park the green paper-edge hairlines down the sheet: left = paper-left (inner
  // edge of the left tractor strip = ruler 0), right = paper-right (inner edge of the
  // right strip = ruler max = paper-sizer handle). They line up with the ruler's green
  // edge accents to read as one continuous line top-to-bottom. Positioned as a PERCENT
  // of the canvas width (like the strips) so they scale with the paper at any zoom with
  // no per-frame work. Same paper edges the ruler and ink clip use (g.paperLPx/paperRPx).
  _sizePaperEdges() {
    const g = this._platen;
    const el = this.elements?.paperEdgeLeft, er = this.elements?.paperEdgeRight;
    if (!g || !g.widthPx) return;
    const pct = (px) => (px / g.widthPx * 100) + "%";
    if (el) el.style.left = pct(g.paperLPx);
    if (er) er.style.left = pct(g.paperRPx);
  }

  // Position the sprocket tear-strips on the sheet's own ½" edges — the render-only
  // tractor margins outside the paper body. They're absolute overlays inside the
  // canvas wrap, sized as a PERCENT of the canvas width so they scale with the paper
  // in both fit and 1:1 with no per-frame work. Left strip hugs the sheet's left edge
  // (= paper-left − one strip); right strip hugs paper-right (= sheet right − strip).
  _sizeStrips() {
    const g = this._platen;
    const sl = this.elements?.stripLeft, sr = this.elements?.stripRight;
    if (!g || !g.widthPx) return;
    const pct = (px) => (px / g.widthPx * 100) + "%";
    if (sl) { sl.style.display = ""; sl.style.background = ""; sl.style.left = pct(g.sheetLPx); sl.style.width = pct(g.tractorPx); }
    if (sr) { sr.style.display = ""; sr.style.background = ""; sr.style.left = pct(g.paperRPx); sr.style.width = pct(g.tractorPx); sr.style.right = "auto"; }

    this._styleSprocketHoles();
  }

  // Render the sprocket holes proportional to the strip so they scale with the
  // paper (fit ↔ 1:1, panel pin, window resize) instead of the old fixed-px CSS
  // gradient. Continuous-stationery standard (paper-sizes.md): vertical pitch ½",
  // hole ⌀4 mm ≈ 0.157" → the hole spans ~31 % of the ½" strip width, centred
  // across it. Driven off the strip's DISPLAY width (== ½" on screen, since the
  // strip is g.tractorPx scaled by the canvas display scale): pitch == that width
  // (½" down == ½" across, aspect preserved), hole radius = 0.157 × it. Retries
  // next frame until the canvas has a measurable display box.
  _styleSprocketHoles() {
    const sl = this.elements?.stripLeft, sr = this.elements?.stripRight;
    if (!sl && !sr) return;
    const g  = this._platen;
    const sc = this._rulerScale();
    if (!sc || !g?.tractorPx) { requestAnimationFrame(() => this._styleSprocketHoles()); return; }
    const W = g.tractorPx * sc.sx;           // ½" strip in display px
    const P = W;                              // vertical pitch ½" == strip width
    const R = 0.157 * W;                      // 4 mm-⌀ hole radius over the ½" strip
    const inner = Math.max(0, R - 1);
    const img = `radial-gradient(circle at center, #fbfbfb 0 ${inner}px, rgba(0,0,0,0.22) ${R}px, transparent ${R + 1}px)`;
    for (const s of [sl, sr]) {
      if (!s) continue;
      s.style.backgroundImage    = img;
      s.style.backgroundSize     = `100% ${P}px`;
      s.style.backgroundRepeat   = "repeat-y";
      s.style.backgroundPosition = "center top";
    }
  }

  // Display scale of the paper canvas: how many on-screen px per internal canvas
  // px, horizontally (sx) and vertically (sy). 1:1 mode → 1; fit mode → <1. The
  // rulers render at DISPLAY resolution (internal raster == on-screen size) and
  // multiply their tick positions by this, so labels keep their native pixel
  // height instead of being squished by CSS scaling. Null until laid out.
  _rulerScale() {
    const cv = this.elements?.canvas;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const lw = this._logW, lh = this._logH;   // CSS box tracks the LOGICAL size, not the ×SS backing
    if (!r.width || !r.height || !lw || !lh) return null;
    return { sx: r.width / lw, sy: r.height / lh, dw: r.width, dh: r.height };
  }

  // Size the top ruler's raster to the paper's DISPLAY width and redraw it. The
  // raster is display-resolution (no CSS scaling), so tick positions are scaled
  // by sx while the label font stays native height. Retries next frame if the
  // canvas hasn't been laid out yet.
  _sizeTopRuler() {
    const rt = this.elements?.rulerTop;
    if (!rt) return;
    const sc = this._rulerScale();
    if (!sc) { requestAnimationFrame(() => this._sizeTopRuler()); return; }
    rt.width  = Math.max(1, Math.round(sc.dw));
    rt.height = RULER_TOP_H;
    rt.style.width = ""; rt.style.height = "";   // raster == display, crisp
    this._drawTopRuler(sc.sx);
    this._syncRulers();                          // re-lock translate after a resize
  }

  // Resolve a CSS custom property off the live theme, falling back to a literal
  // when the var is empty (canvas can't read CSS vars directly).
  _themeColor(name, fallback) {
    const v = getComputedStyle(this.contentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  // Top inch ruler overlaying the platen. Inch zero is the paper's left edge (the
  // inner edge of the left tractor strip = paperLPx) for every model — see the zero
  // block below; the ½" holed strip is not part of the paper. Major ticks medium at
  // 1/4", minor at 1/8". The ruler measures the PAPER (body) — the sheet between the
  // two tractor strips (= the device's current paper width, strips already off). The
  // holed strips are dimmed off-scale (the Word ruler convention, inverted for a dark
  // UI), with thin green accents pinning the paper edges. The fixed carriage span is a
  // separate internal limit (it clips ink, see _clipToPaper) and is NOT drawn here.
  _drawTopRuler(sx = 1) {
    const rt  = this.elements?.rulerTop;
    if (!rt) return;
    const ctx = rt.getContext("2d");
    const g   = this._platen;
    const H   = rt.height;
    ctx.clearRect(0, 0, rt.width, H);
    const X = (px) => px * sx;   // canvas-internal x → display x

    const tickCol  = this._themeColor("--text-muted", "#888");
    const labelCol = this._themeColor("--text-secondary", "#bbb");
    const edgeCol  = this._themeColor("--accent-green", "#61bb46");

    // Ruler 0 = paper-left (inner edge of the left tractor strip); the scale spans the
    // PAPER to paper-right (ruler max), both straight off the platen geometry. The ½"
    // holed strips are NOT paper, so they sit OUTSIDE the scale — left strip left of 0,
    // right strip past paper-right — and are dimmed to the panel grey so the lit base +
    // ticks read as exactly the paper. Centered stock shifts both edges inward.
    const zeroPx = g.paperLPx;                                  // paper-left = ruler 0
    const bodyR  = g.paperRPx;                                  // paper-right = ruler max

    const marginCol = this._themeColor("--bg-panel", "#1c2128");
    ctx.fillStyle = marginCol;                                  // tracks / off-page = dimmed
    if (X(zeroPx) > 0)        ctx.fillRect(0, 0, X(zeroPx), H);
    if (X(bodyR) < rt.width)  ctx.fillRect(X(bodyR), 0, rt.width - X(bodyR), H);

    // Tick heights from the bottom edge (the ruler reads against the paper below).
    const majorH = H;
    const medH   = Math.round(H * 0.6);
    const minH   = Math.round(H * 0.35);

    ctx.strokeStyle = tickCol;
    ctx.lineWidth   = 1;
    ctx.fillStyle   = labelCol;
    ctx.font        = "10px 'Monaco','Menlo',monospace";
    ctx.textBaseline = "top";

    // Walk 1/4" steps from paper-left (k=0) across to paper-right.
    // 1/8" sub-ticks omitted — drag grid snaps at 1/4" so finer marks mislead.
    const step = this._ppi / 4;
    const kMin = 0;
    const kMax = Math.round((bodyR - zeroPx) / step);
    for (let k = kMin; k <= kMax; k++) {
      const isMajor = ((k % 4) + 4) % 4 === 0;   // every 4 quarters = 1 inch
      const isHalf  = ((k % 2) + 2) % 2 === 0;   // every 2 quarters = 1/2 inch
      const h = isMajor ? majorH : isHalf ? medH : minH;
      const xx = Math.floor(X(zeroPx + k * step)) + 0.5;   // crisp 1px line
      ctx.beginPath();
      ctx.moveTo(xx, H - h);
      ctx.lineTo(xx, H);
      ctx.stroke();
      if (isMajor) {
        ctx.fillText(String(k / 4), xx + 2, 1);
      }
    }

    // Green edge accents at the paper edges (paper-left = ruler 0, paper-right =
    // paper-sizer line); they line up with the full-height green hairlines down the
    // page (.pr-paper-edge) to read as one continuous line top-to-bottom.
    ctx.strokeStyle = edgeCol;
    ctx.lineWidth   = 1.5;
    for (const ex of [zeroPx, bodyR]) {
      const xx = Math.floor(X(ex)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(xx, 0);
      ctx.lineTo(xx, H);
      ctx.stroke();
    }
  }

  // Size the left ruler's raster to the paper's DISPLAY height (full canvas,
  // every page incl. trailing blank feed) and redraw. Display-resolution like the
  // top ruler, so tick positions scale by sy while the label font keeps its
  // native pixel height (a CSS-scaled tall raster would squish the numbers).
  _sizeLeftRuler() {
    const rl = this.elements?.rulerLeft;
    if (!rl) return;
    const sc = this._rulerScale();
    if (!sc) { requestAnimationFrame(() => this._sizeLeftRuler()); return; }
    rl.width  = RULER_LEFT_W;
    rl.height = Math.max(1, Math.round(sc.dh));
    rl.style.width = ""; rl.style.height = "";   // raster == display, crisp
    this._drawLeftRuler(sc.sy);
    this._syncRulers();                          // re-lock translate after a resize
  }

  // Translate both rulers so ruler-0 sits over the paper's top-left. Position
  // only — the raster + paint live in _sizeTopRuler/_sizeLeftRuler. Measures the
  // canvas's on-screen box vs the scroller (same rect math as _followHead), so it
  // tracks vertical scroll (feedBg) AND horizontal scroll (the inner .pr-paper),
  // plus the tractor-strip offset. Cheap enough to run on every scroll event.
  _syncRulers() {
    const fb = this.elements?.feedBg, cv = this.elements?.canvas;
    const rt = this.elements?.rulerTop, rl = this.elements?.rulerLeft;
    if (!fb || !cv) return;
    const fbR = fb.getBoundingClientRect();
    const cvR = cv.getBoundingClientRect();
    if (!cvR.width || !cvR.height) return;
    const dx = cvR.left - fbR.left;   // paper-canvas left within the scroller viewport
    const dy = cvR.top  - fbR.top;    // paper-canvas top  within the scroller viewport
    if (rt) rt.style.transform = `translateX(${dx}px)`;
    if (rl) rl.style.transform = `translateY(${dy}px)`;
  }

  // Drive both nested scrollers from one wheel gesture. The browser would
  // otherwise axis-lock a diagonal swipe to either feedBg (vertical) OR paper
  // (horizontal), never both. We deal the deltas ourselves: vertical -> feedBg,
  // horizontal -> paper, and preventDefault only when we actually consumed the
  // motion so a no-op gesture still bubbles normally. Shift+wheel maps a
  // vertical wheel onto the horizontal axis (mouse convention).
  _onWheel(e) {
    const fb = this.elements?.feedBg, pp = this.elements?.paper;
    if (!fb || !pp) return;
    // Normalise delta units: 0=pixel, 1=line (~16px), 2=page (viewport).
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? fb.clientHeight : 1;
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;
    if (e.shiftKey && dx === 0) { dx = dy; dy = 0; }
    const canV = fb.scrollHeight > fb.clientHeight;
    const canH = pp.scrollWidth  > pp.clientWidth;
    let used = false;
    if (canV && dy) { fb.scrollTop  += dy; used = true; }
    if (canH && dx) { pp.scrollLeft += dx; used = true; }
    if (used) { e.preventDefault(); this._syncRulers(); }
  }

  // Left inch ruler measuring paper rows. Numbering restarts at 0 on EVERY page,
  // so each fan-fold sheet reads 0..formInches like a fresh page; the shared
  // perforation reads as the next page's 0 (its duplicate bottom label is
  // suppressed). Inch spacing = pageH / formInches, so perforations land exactly
  // on integer-inch major ticks. Major ticks each 1" (labelled), minor at 1/2".
  // Solid accent marks echo the dashed perforations at each page boundary.
  _drawLeftRuler(sy = 1) {
    const rl = this.elements?.rulerLeft;
    if (!rl) return;
    const ctx = rl.getContext("2d");
    const W   = rl.width;
    const H   = rl.height;
    ctx.clearRect(0, 0, W, H);
    const Y = (px) => px * sy;   // canvas-internal y → display y

    const p          = this.printerManager?.getActivePrinter?.();
    const formDots   = p?.paper?.formDots || (this._dpi * (p?.paperGeo?.lengthInch ?? 11));
    const formInches = Math.max(1, formDots / this._dpi);
    const pageH      = this._pageHeightPx();    // canvas-internal px per page
    const pxPerInch  = pageH / formInches;      // perfs == integer-inch ticks
    if (!(pxPerInch > 0)) return;

    const tickCol  = this._themeColor("--text-muted", "#888");
    const labelCol = this._themeColor("--text-secondary", "#bbb");
    const edgeCol  = this._themeColor("--accent-green", "#61bb46");
    const panelBg  = this._themeColor("--bg-panel", "#1e1e1e");

    const majorLen = W;
    const halfLen  = Math.round(W * 0.65);
    const qtrLen   = Math.round(W * 0.45);

    // Draw one row tick (+ optional inch label, masked so the chip doesn't bleed).
    const drawTick = (yy, inch, len, labelIt) => {
      ctx.beginPath(); ctx.moveTo(W - len, yy); ctx.lineTo(W, yy); ctx.stroke();
      if (labelIt) {
        const s = String(inch);
        ctx.fillStyle = panelBg;
        ctx.fillRect(0, yy - 6, ctx.measureText(s).width + 4, 12);
        ctx.fillStyle = labelCol;
        ctx.fillText(s, 2, yy + 1);
      }
    };

    // Page-boundary perforation marks FIRST (solid accent, same rows as
    // _drawPageBreaks), so the per-page tick/label pass below paints over them and
    // the number chips mask the line out from under each "0" at a perforation. The
    // page model is identical for pin-feed and friction — friction stock still pages
    // and perforates; it just lacks the sprocket TRACKS (handled in _sizeStrips).
    ctx.strokeStyle = edgeCol;
    ctx.lineWidth   = 1.5;
    for (let yc = pageH; yc < this._logH; yc += pageH) {
      const yy = Math.floor(Y(yc)) + 0.5;
      if (yy > H) break;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(W, yy);
      ctx.stroke();
    }

    ctx.strokeStyle = tickCol;
    ctx.lineWidth   = 1;
    ctx.fillStyle   = labelCol;
    ctx.font        = "10px 'Monaco','Menlo',monospace";
    ctx.textBaseline = "middle";

    // Per-page numbering: restarts at 0 each page. Walk 1/4" steps; 3 tick levels:
    // inch (full, labelled) → half (65%) → quarter (45%).
    const pages = Math.ceil(this._logH / pageH);
    for (let pg = 0; pg < pages; pg++) {
      const y0 = pg * pageH;
      for (let i = 0; ; i++) {
        const yc   = y0 + i * pxPerInch / 4;    // canvas-internal y, 1/4" steps
        const inch = i / 4;
        if (inch > formInches + 1e-6) break;
        const yy = Math.floor(Y(yc)) + 0.5;     // display y, crisp 1px line
        if (yy > H) break;
        const isInch = i % 4 === 0;
        const isHalf = i % 2 === 0;
        const len = isInch ? majorLen : isHalf ? halfLen : qtrLen;
        // Label inch majors, suppress the page's bottom (== next page's 0).
        drawTick(yy, isInch ? inch : 0, len, isInch && inch < formInches - 1e-6);
      }
    }
  }

  // Unscaled paper row (12 px/line) → canvas Y. Vertical-only scale to the true
  // 8:11 page aspect; the dot grid is 120 dpi across but 72 dpi down, so 1:1
  // would draw a square page. No offset — the head's own y carries any start
  // position, so the page keeps its exact dimensions.
  _yToCanvas(base) {
    return Math.round(base * this._vstretch);
  }

  // Dashed horizontal perforation at every page boundary (fan-fold tractor
  // paper). Exact 66-line pitch. Drawn onto the canvas so it scrolls and
  // exports with the output.
  _drawPageBreaks() {
    const cv  = this.elements.perf;
    const ctx = this.elements.perfCtx;
    if (!cv || !ctx) return;
    const pageH = this._pageHeightPx();
    const g = this._platen;
    ctx.save();
    ctx.setLineDash([7, 5]);
    for (let y = pageH; y < cv.height; y += pageH) {
      const yy = Math.floor(y) + 0.5;
      ctx.strokeStyle = "rgba(0,0,0,0.32)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(cv.width, yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Paint the paper sheet across a vertical canvas band [y, y+h). The off-paper
  // platen is left transparent so the dark feed background shows through as the
  // roller; only the paper interval gets the white sheet.
  _paintPaper(ctx, y, h) {
    const g = this._platen;
    ctx.clearRect(0, y, g.widthPx, h);
    ctx.fillStyle = PAPER_BG;
    ctx.fillRect(g.sheetLPx, y, g.sheetRPx - g.sheetLPx, h);
  }

  // Gate ink to the PAPER (body, between the tractor strips), so columns the head
  // sweeps past a narrow paper's edge land on the (transparent) roller and never
  // strike the holed sprocket strips. The fixed carriage origin already bounds the
  // left/right reach; this trims the paper edges on top (the binding limit on narrow
  // stock). Canvas clip intersects the path — partial edge columns trimmed, fully-off
  // columns vanish. Only x is bounded; vertical extent spans the whole canvas. Wrap
  // the caller's paint in ctx.save()/restore() around this.
  _clipToPaper(ctx) {
    const g = this._platen;
    ctx.beginPath();
    ctx.rect(g.paperLPx, 0, Math.max(0, g.paperRPx - g.paperLPx), this._logH);
    ctx.clip();
  }

  _ensureCanvasHeight(neededPx) {
    const cv = this.elements.canvas;
    // A non-finite neededPx (a NaN/Infinity leaking out of the dot math when a
    // density or pitch comes through as 0) would compute newH = NaN and silently
    // collapse cv.height to 0 — blanking the whole sheet and every later draw.
    // Reject it: keep the canvas as-is and record the fault rather than poison it.
    if (!Number.isFinite(neededPx)) {
      this._lastRenderError = `ensureCanvasHeight: non-finite neededPx (${neededPx})`;
      return;
    }
    // Always keep two blank fan-fold pages visible past the last used page, so
    // the paper reads as continuous feed. These trailing pages are display-only
    // — _usedCanvas() crops them out of any saved PNG.
    // neededPx is a LOGICAL canvas y (draw-space), so all the page math here is
    // logical; only the backing store is ×SS (set via _sizePaperBacking below).
    const ss    = this._ss;
    const pageH = this._pageHeightPx();
    let   newH  = Math.ceil(Math.max(1, neededPx) / pageH) * pageH + 2 * pageH;
    // Browsers cap a canvas backing store (~32767 px per side; less by area on
    // some engines). The cap is on the BACKING (×SS) dimensions, so convert to a
    // logical limit: divide the per-side cap by SS and the area cap by SS² (both
    // axes scale). Past it the assignment silently no-ops or zeroes the canvas,
    // blanking the bottom of a long print. Clamp to whole pages; the page store
    // already retains the earlier sheets for export.
    const areaH = Math.floor(CANVAS_MAX_AREA / Math.max(1, this._logW * ss * ss) / pageH) * pageH;
    const maxH  = Math.max(pageH, Math.min(Math.floor(CANVAS_MAX_H / ss / pageH) * pageH, areaH));
    if (newH > maxH) {
      newH = maxH;
      if (!this._canvasCapWarned) {
        this._canvasCapWarned = true;
        this._lastRenderError = `canvas height capped at ${maxH}px (browser limit)`;
        console.warn(`[printer] canvas height hit browser cap (${maxH}px); long print truncated on screen`);
      }
    }
    this._maxNeeded = Math.max(this._maxNeeded || 0, Math.round(neededPx));
    if (newH <= this._logH) return;
    this._growCount = (this._growCount || 0) + 1;
    // Snapshot existing content only when there IS some: drawImage throws if the
    // source canvas has a 0 width or height, and that throw (window opened before
    // init sized the canvas) escaped into the scheduler pump and killed it. A
    // 0-dim canvas simply grows clean here instead of throwing. tmp is a raw copy
    // of the OLD ×SS backing bitmap.
    const oldLogH    = this._logH;
    const hadContent = cv.width > 0 && cv.height > 0;
    let tmp = null;
    if (hadContent) {
      tmp = document.createElement("canvas");
      tmp.width  = cv.width;
      tmp.height = cv.height;
      tmp.getContext("2d").drawImage(cv, 0, 0);
    }
    const ctx = this._sizePaperBacking(this._logW, newH);   // grow backing ×SS, ctx re-scaled
    this._paintPaper(ctx, 0, newH);
    // Restore prior content: tmp is the old backing bitmap; under the SS-scaled
    // context, draw it into the old LOGICAL rect so it lands 1:1 on the backing.
    if (tmp) ctx.drawImage(tmp, 0, 0, this._logW, oldLogH);
    // Grow both overlays to match at LOGICAL density (transparent, no content to
    // preserve). Size perf first so _drawPageBreaks draws onto the new dimensions.
    const pf = this.elements.perf;
    pf.width  = this._logW;
    pf.height = newH;
    this._drawPageBreaks();
    const hc = this.elements.head;
    hc.width  = this._logW;
    hc.height = newH;
    this._sizeLeftRuler();
  }

  onContentRendered() {
    this.setupContentEventListeners();
  }

  setupContentEventListeners() {
    this._cacheElements();
    const el = this.elements;

    // Reflect current model + ribbon in the selects.
    el.model.value  = this.printerManager.getActivePrinter().getId();
    el.ribbon.value = this.printerManager.getRibbon();
    this._refreshPageSizes();

    el.model.addEventListener("change", () => {
      const modelDef = PRINTER_MODELS.find((m) => m.id === el.model.value);
      if (modelDef) this.printerManager.setActivePrinter(modelDef.create());
    });

    el.ribbon.addEventListener("change", () => {
      this.printerManager.setRibbon(el.ribbon.value);
    });

    el.page.addEventListener("change", () => {
      const [w, h] = el.page.value.split(':').map(Number);
      if (!isNaN(w) && !isNaN(h)) {
        this._flushAndEndJob();
        this.setPaperWidth(w);
        this.setPaperLength(h);
      }
    });

    el.downloadPng.addEventListener("click", () => this._downloadPng());
    el.downloadPdf.addEventListener("click", () => this._downloadPdf());
    this._initDumpButton(el.dump);
    el.clear.addEventListener("click",       () => this._clear());
    el.fit.addEventListener("click",         () => this._toggleFit());
    el.rulers.addEventListener("click",      () => this._toggleRulers());
    el.speed.addEventListener("click",       () => this._cycleSpeed());
    el.lfUp.addEventListener("click",        () => this._panelFeed("up"));
    el.lfDown.addEventListener("click",      () => this._panelFeed("down"));
    el.setTof.addEventListener("click",      () => this._headToTop());
    el.formFeed.addEventListener("click",    () => this._panelFeed("ff"));
    el.power.addEventListener("click",       () => this.setPower(!this.printerManager.getPower()));
    el.panelTab.addEventListener("click",    () => this._togglePin());
    el.panel.addEventListener("mouseleave",  () => { const f = el.panel.querySelector(":focus"); if (f) f.blur(); });
    this._initHeadDrag();
    this._initWidthDrag();
    this._initLengthDrag();
    this._refreshRulersBtn();

    // Rulers are scroll-locked chrome: every scroll re-pins them to the paper's
    // on-screen box (passive — read-only, never blocks the scroll).
    // feedBg scrolls vertically; the inner .pr-paper scrolls horizontally — lock
    // the rulers to BOTH so the top ruler tracks left/right scroll too.
    el.feedBg.addEventListener("scroll", () => this._syncRulers(), { passive: true });
    el.paper.addEventListener("scroll",  () => this._syncRulers(), { passive: true });

    // Vertical scroll lives on feedBg, horizontal on the inner .pr-paper — two
    // nested scrollers, and browsers axis-LOCK a single trackpad gesture to one
    // of them, so a diagonal swipe only moves one axis. Bridge the wheel: route
    // deltaY -> feedBg, deltaX -> paper ourselves so both axes move together.
    el.feedBg.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });

    // The ruler ink is painted with theme colours (read via _themeColor), so a
    // theme flip on <html> must repaint them. Guard against double-registration.
    if (!this._themeObs) {
      this._themeObs = new MutationObserver(() => {
        if (this._canvasMode) { this._sizeTopRuler(); this._sizeLeftRuler(); }
      });
      this._themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }

    this._applyPersistedSettings(this.printerManager.getActivePrinter());
    this._renderSettings();
    this._refreshSpeed();
    this._refreshPower();
    this._applyPin();

    this.contentElement.addEventListener("keydown", (e) => e.stopPropagation());
    this.contentElement.addEventListener("keyup",   (e) => e.stopPropagation());

    const printer = this.printerManager.getActivePrinter();
    this._updateViewMode(printer);
    this._attachPrinterListeners(printer);

    this.printerManager.onPrinterChange((p) => {
      this._flushAndEndJob();   // outgoing model's sheet goes to the page store
      this._updateViewMode(p);
      if (this._canvasMode) { this._initCanvas(); this._applyFit(); }
      this._attachPrinterListeners(p);
      this._refreshPageSizes();
      this._applyPersistedSettings(p);
      this._renderSettings();
      // Re-evaluate the interface gate for the NEW active model. Availability is
      // per-bus (DMP/FX-80 over parallel, IW-I/II over SSC), so switching models
      // can flip the active model between reachable/unreachable. Without this the
      // "no device" grey overlay and disabled power button stay stuck from the
      // previous model (e.g. picking parallel DMP after serial IW-II left them on).
      this._updateInterfaceState(this.printerManager.hasInterface());
    });

    this.printerManager.onInterfaceChange((has) => this._updateInterfaceState(has));
    this._updateInterfaceState(this.printerManager.hasInterface());

    // Collapse the toolbar as the window narrows so nothing clips off-screen:
    // page select drops first, then ribbon, then model — power + exports stay.
    this._resizeObs = new ResizeObserver(() => this._fitToolbar());
    this._resizeObs.observe(this.elements.toolbar);
    this._fitToolbar();

    // Keep the head on its real print row as the paper's display scale changes
    // (panel pin/resize, fit toggle, window resize all alter canvas clientHeight).
    this._headResizeObs = new ResizeObserver(() => {
      if (!this._canvasMode) return;
      if (this._headCanvasY != null) this._updateHeadMarker(this._headCanvasY);
      this._styleSprocketHoles();   // holes are display-px sized → rescale on resize
      // Rulers raster at the canvas's DISPLAY size; when the sheet box changes
      // (window/panel resize) re-raster so the top ruler stays anchored to the
      // sheet width below it (else its 0→8 span detaches from the paper edge).
      this._sizeTopRuler();
      this._sizeLeftRuler();
    });
    this._headResizeObs.observe(this.elements.canvas);
  }

  // Hide toolbar selects in priority order until the row stops overflowing.
  // Page form-length goes first, then ribbon, then printer model. The page
  // select is only ever shown when the active model actually has form sizes.
  _fitToolbar() {
    const tb = this.elements?.toolbar;
    if (!tb) return;
    // Reset to each control's natural visibility before re-measuring.
    if (this.elements.page)   this.elements.page.style.display   = this._pageAvailable ? "" : "none";
    if (this.elements.ribbon) this.elements.ribbon.style.display = "";
    if (this.elements.model)  this.elements.model.style.display  = "";
    const order = [this.elements.page, this.elements.ribbon, this.elements.model];
    for (const elx of order) {
      if (tb.scrollWidth <= tb.clientWidth + 1) break;   // fits now → stop hiding
      if (elx && elx.style.display !== "none") elx.style.display = "none";
    }
  }

  // Populate the page-size select with universal PAPER_PRESETS (all models,
  // always visible in canvas mode). Replaces the old model-specific form-length list.
  _refreshPageSizes() {
    const el = this.elements?.page;
    if (!el) return;
    const printer = this.printerManager.getActivePrinter();
    const canvasMode = printer?.usesPaperCanvas?.() ?? true;
    this._pageAvailable = canvasMode;
    const fmt = (n) => parseFloat(n.toFixed(2)).toString();
    el.style.display = canvasMode ? "" : "none";
    el.innerHTML = PAPER_PRESETS.map(
      (p) => `<option value="${p.w}:${p.h}">${fmt(p.w)}×${fmt(p.h)} ${p.label}</option>`
    ).join('');
    el.value = `${PAPER_PRESETS[0].w}:${PAPER_PRESETS[0].h}`; // Standard default
    if (!this.printerManager.availableModelIds().has(this.printerManager.getActivePrinter().getId())) {
      el.querySelectorAll("option").forEach((o) => { o.disabled = true; });
    }
    this._fitToolbar();
    this._renderPaperPresets();
  }

  _updateViewMode(printer) {
    this._canvasMode = printer.usesPaperCanvas?.() ?? true;
    if (this.elements) {
      this.elements.output.style.display     = this._canvasMode ? "none"  : "";
      this.elements.canvasWrap.style.display = this._canvasMode ? "block" : "none";
      // Rulers are frame chrome now — show the L-frame tracks only in canvas mode
      // AND when the user hasn't hidden the rulers. Collapsing the grid tracks (vs
      // hiding each canvas) reclaims the corner+gutter space for the paper.
      this.elements.frame?.classList.toggle("pr-frame--rulers", this._canvasMode && (this._rulersOn() || !!this._rulerTransient));
      if (!this._canvasMode && this.elements.headMark) this.elements.headMark.style.display = "none";
      this._refreshRibbonOptions(printer);
      this._applyFit();
      if (this._canvasMode) this._syncRulers();
    }
  }

  // Grey out the Color Ribbon option for models that can't hold one (IW-I,
  // Epson) and reflect the manager's (possibly coerced) ribbon in the select.
  _refreshRibbonOptions(printer) {
    const sel = this.elements?.ribbon;
    if (!sel) return;
    const colorOk = printer.supportsColorRibbon?.() !== false;
    const opt = sel.querySelector('option[value="color"]');
    if (opt) {
      opt.disabled = !colorOk;
      opt.title    = colorOk ? "" : `${printer.getName()} is black-ribbon only`;
    }
    if (!this.printerManager.availableModelIds().has(printer.getId())) {
      sel.querySelectorAll("option").forEach((o) => { o.disabled = true; });
    }
    sel.value = this.printerManager.getRibbon();
  }

  // Cycle the playback speed 1× → 2× → 4× → 8× → 1×.
  _cycleSpeed() {
    const steps = [1, 2, 4, 8];
    const cur   = this.printerManager.getPrintSpeed();
    const next  = steps[(steps.indexOf(cur) + 1) % steps.length];
    this.printerManager.setPrintSpeed(next);
    this._refreshSpeed();
  }

  _refreshSpeed() {
    const el = this.elements?.speed;
    if (!el) return;
    const mult = this.printerManager.getPrintSpeed();
    el.innerHTML = `${mult}&times;`;
    // Non-default speed reads as "on" (green), like the Fit/Auto-LF toggles.
    el.className = mult > 1 ? "pr-pbtn pr-pbtn-on" : "pr-pbtn";
  }

  // Ruler visibility: persisted, defaults on. The rulers are frame chrome, so
  // hiding them collapses the L-frame grid tracks (see _updateViewMode).
  _rulersOn() {
    if (this._rulersVisible == null) {
      let v = false;
      try { const s = localStorage.getItem("a2e-printer-rulers"); if (s != null) v = s === "true"; } catch (e) {}
      this._rulersVisible = v;
    }
    return this._rulersVisible;
  }
  _toggleRulers() {
    this._clearTransientRuler();
    this._rulersVisible = !this._rulersOn();
    try { localStorage.setItem("a2e-printer-rulers", String(this._rulersVisible)); } catch (e) {}
    this._refreshRulersBtn();
    this._updateViewMode(this.printerManager.getActivePrinter());
  }

  // Show rulers transiently during a width-drag even when the user has hidden them.
  // Caller: pointerdown on the right strip. Clears any pending hide timer.
  _showTransientRulers() {
    if (this._rulersOn()) return;   // already on — nothing to do
    if (this._rulerTransientTimer) { clearTimeout(this._rulerTransientTimer); this._rulerTransientTimer = null; }
    this._rulerTransient = true;
    this._updateViewMode(this.printerManager.getActivePrinter());
    this._sizeTopRuler();
  }

  // Arm a 5-second countdown to hide the transient ruler. Called on drag end and on
  // each move tick so the clock resets while the pointer is still travelling.
  _armTransientHide() {
    if (!this._rulerTransient) return;
    if (this._rulerTransientTimer) clearTimeout(this._rulerTransientTimer);
    this._rulerTransientTimer = setTimeout(() => this._clearTransientRuler(), 5000);
  }

  _clearTransientRuler() {
    if (this._rulerTransientTimer) { clearTimeout(this._rulerTransientTimer); this._rulerTransientTimer = null; }
    if (!this._rulerTransient) return;
    this._rulerTransient = false;
    this._updateViewMode(this.printerManager.getActivePrinter());
  }
  _refreshRulersBtn() {
    const b = this.elements?.rulers;
    if (!b) return;
    b.className = this._rulersOn() ? "pr-pbtn pr-pbtn-on" : "pr-pbtn";
  }

  _toggleFit() {
    this._fitMode = !this._fitMode;
    try { localStorage.setItem("a2e-printer-fit", String(this._fitMode)); }
    catch (e) { /* non-fatal */ }
    this._applyFit();
  }

  // Fit: canvas scales to the paper width (vertical scroll only).
  // Actual: natural 1:1 pixels (scroll both axes).
  _applyFit() {
    if (!this.elements) return;
    const cv   = this.elements.canvas;
    const pf   = this.elements.perf;
    const hc   = this.elements.head;
    const wrap = this.elements.canvasWrap;
    const btn  = this.elements.fit;
    if (this._fitMode) {
      // Canvas-wrap takes the flex remainder between the two tractor strips; the
      // canvas scales to it (aspect kept via height:auto) so the sheet fits the
      // viewport width with no horizontal scroll.
      if (wrap) { wrap.style.flex = "1 1 0"; wrap.style.minWidth = "0"; wrap.style.width = ""; }
      cv.style.width  = "100%"; cv.style.height = "auto";
      if (pf) { pf.style.width = "100%"; pf.style.height = "auto"; }
      hc.style.width  = "100%"; hc.style.height = "auto";
    } else {
      // 1:1 — canvas-wrap sizes to the canvas's natural platen px; the sheet then
      // overflows and scrolls horizontally, the strips panning with it.
      if (wrap) { wrap.style.flex = "0 0 auto"; wrap.style.minWidth = ""; wrap.style.width = ""; }
      // The paper backing is ×SS; pin its CSS box to the LOGICAL size so 1:1 shows
      // true platen px (the dense backing downsamples). Overlays are already
      // logical-res, so their natural "" box matches.
      cv.style.width  = (this._logW ? this._logW + "px" : "");
      cv.style.height = (this._logH ? this._logH + "px" : "");
      if (pf) { pf.style.width = "";  pf.style.height = ""; }
      hc.style.width  = "";  hc.style.height = "";
    }
    if (btn) {
      btn.textContent = this._fitMode ? "Fit" : "1:1";
      btn.className   = this._fitMode ? "pr-pbtn pr-pbtn-on" : "pr-pbtn";
    }
    // Fit changes the canvas's display SCALE → the rulers must re-raster at the
    // new scale (not just translate). Do it next frame, once layout has settled
    // so _rulerScale() reads the updated display box.
    this._syncRulers();
    requestAnimationFrame(() => { this._sizeTopRuler(); this._sizeLeftRuler(); this._styleSprocketHoles(); this._sizePaperEdges(); this._sizeLengthHandle(); });
  }

  _attachPrinterListeners(printer) {
    printer.on("text",      (str)  => this._guard("text",     () => this._onText(str)));
    printer.on("newline",   ()     => this._guard("newline",  () => this._onNewline()));
    printer.on("linefeed",  ()     => this._guard("linefeed", () => this._onLinefeed()));
    printer.on("formfeed",  ()     => this._guard("formfeed", () => this._onFormFeed()));
    printer.on("printChar", (data) => this._guard("printChar", () => { this._renderChar(data); this._schedulePersist(); }, data));
    printer.on("printDots", (data) => this._guard("printDots", () => { this._renderDots(data); this._schedulePersist(); }, data));
  }

  // A throw in any render callback used to escape into the byte-feed pump and kill
  // ALL further rendering — the paper froze/blanked for the rest of the print and
  // never recovered. Isolate every event so one bad byte can't stop the printer;
  // the failure is recorded (surfaced in getState) instead of going silent.
  _guard(label, fn, data) {
    try {
      fn();
    } catch (e) {
      this._renderErrCount = (this._renderErrCount || 0) + 1;
      this._lastRenderError = `${label}: ${e && e.message ? e.message : e}`;
      if ((this._renderErrCount % 50) === 1) {
        console.error(`[printer] render error in ${label} (#${this._renderErrCount})`, e, data);
      }
    }
  }

  // ===== Auto-capture printed pages to the page store =====

  // A job is the run of output between clears/resets; every page of it is stored
  // under one id, stamped lazily on the first byte onto a fresh sheet.
  _ensureJobId() {
    if (this._jobId == null) this._jobId = Date.now();
    return this._jobId;
  }

  // Debounced: write the finished paper ~1.2s after printing goes quiet, so a
  // burst of dots saves once (not per byte). Canvas models only — text models
  // have no page raster to slice.
  _schedulePersist() {
    if (!this._canvasMode) return;
    this._ensureJobId();
    clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      this._snapshotPages().forEach((rec) => savePage(rec));
    }, 1200);
  }

  // Slice the used pages (perforation-free, the same raster the PDF export uses)
  // into one record per page. Pure/synchronous so a caller can snapshot before
  // the canvas is wiped; ids are `${jobId}::${index}` so a re-snapshot of a
  // still-growing job overwrites its pages in place.
  _snapshotPages() {
    if (!this._canvasMode || this._jobId == null) return [];
    const clean = this._cleanUsedCanvas();
    if (!clean) return [];
    const pageH   = this._pageHeightPx();
    const pages   = this._usedPageCount(pageH);
    const printer = this.printerManager.getActivePrinter();
    const base = {
      jobId:      this._jobId,
      model:      printer.getName(),
      modelId:    printer.getId(),
      ribbon:     this.printerManager.getRibbon(),
      pageSize:    printer.getPageSize?.() ?? null,
      formInches:  pageH / this._ppi,
      paperWidthInch: printer.paperGeo?.widthInch ?? null,
      // Where the head sits at capture — restored verbatim when the job is sent
      // back to the paper, so re-printing resumes exactly where it left off.
      headXDot:   printer._xDot | 0,
      headYDot:   printer._yDot | 0,
      savedAt:    Date.now(),
    };
    // Crop to paper body only (paperLPx → paperRPx), dropping tractor strips.
    const g      = this._platen;
    const ss     = this._ss;
    const cropX  = Math.round(g.paperLPx);
    const cropW  = Math.max(1, Math.round(g.paperRPx - g.paperLPx));
    const recs = [];
    for (let i = 0; i < pages; i++) {
      const slice  = document.createElement("canvas");
      slice.width  = cropW;       // stored at LOGICAL res (restore upsamples back)
      slice.height = pageH;
      const s = slice.getContext("2d");
      s.fillStyle = PAPER_BG;
      s.fillRect(0, 0, cropW, pageH);
      // `clean` is the ×SS backing; sample this page's body band and downscale to
      // the logical page PNG (paper-body aligned).
      s.drawImage(clean, cropX * ss, i * pageH * ss, cropW * ss, pageH * ss,
                         0, 0, cropW, pageH);
      recs.push({
        ...base,
        id:         `${this._jobId}::${i}`,
        pageIndex:  i,
        pageCount:  pages,
        width:      slice.width,
        height:     slice.height,
        pngDataUrl: slice.toDataURL("image/png"),
      });
    }
    return recs;
  }

  // Persist the current sheet immediately, then end the job so the next output
  // starts a fresh one. Called before the canvas is wiped (clear) or the tab
  // unloads, so the outgoing job's pages aren't lost.
  _flushAndEndJob() {
    clearTimeout(this._persistTimer);
    this._persistTimer = null;
    const recs = this._snapshotPages();
    this._jobId = null;
    recs.forEach((rec) => savePage(rec));
  }

  // ===== Load a stored job back onto the paper =====

  // Re-load a captured job's pages onto the live paper so it can be re-previewed
  // or extended. Restores the printer model, ribbon, form length and — crucially
  // — the print head's row/column where the job stopped, then re-adopts the job's
  // id so any further printing overwrites that same job in the store. The Print
  // Browser passes job = { jobId, pages: [record,…] } straight from the store.
  async loadJobToPaper(job) {
    if (!job?.pages?.length) return false;
    const first = job.pages[0];

    // Bank the current sheet before its pixels are overwritten.
    this._flushAndEndJob();

    // Match the printer the job was made on (model → ribbon → paper size) so the
    // page geometry and colours line up with the captured pixels.
    if (first.modelId && this.printerManager.getActivePrinter().getId() !== first.modelId)
      this.setModel(first.modelId);
    if (first.ribbon) this.setRibbon(first.ribbon);
    const printer = this.printerManager.getActivePrinter();

    // Restore paper dimensions directly from the record so the canvas is sized
    // to exactly what was printed — not the DIP/ESC-H form setting which is
    // independent of the paper actually loaded.
    if (first.paperWidthInch != null)
      printer.paperGeo.setWidthInch(first.paperWidthInch, printer.paperWidthRange());
    if (first.formInches != null)
      printer.paperGeo.setLengthInch(first.formInches, printer.paperLengthRange());
    if (printer.paper) printer.paper.formDots = 0;   // ensure _pageHeightPx uses lengthInch
    this._persistPaper(printer);
    this._renderPaperPresets();

    this.show();
    if (!this._canvasMode || !this.elements) return false;

    // Rebuild the paper: each stored page painted at its page band, plus the two
    // trailing blank feed pages so it still reads as continuous fan-fold stock.
    this._recomputePlaten();
    const pageH = this._pageHeightPx();
    const logW  = this._platen.widthPx;
    const logH  = pageH * (job.pages.length + 2);
    const ctx   = this._sizePaperBacking(logW, logH);   // backing ×SS, ctx pre-scaled
    this._paintPaper(ctx, 0, logH);
    const g = this._platen;
    for (let i = 0; i < job.pages.length; i++) {
      const img = await this._loadImage(job.pages[i].pngDataUrl);
      // PNGs are cropped to paper body — draw them back at the body position
      // (logical coords; the SS-scaled ctx upsamples the stored page to backing).
      ctx.drawImage(img, g.paperLPx, i * pageH, g.paperRPx - g.paperLPx, pageH);
    }
    const pf = this.elements.perf;
    pf.width  = logW;
    pf.height = logH;
    this._drawPageBreaks();
    const hc = this.elements.head;
    hc.width  = logW;
    hc.height = logH;
    this.elements.headCtx.clearRect(0, 0, logW, logH);
    this._sizeTopRuler();   // restored width may differ — resync + repaint the ruler
    this._sizeLeftRuler();
    this._heads = [];
    this._ink?.clear();   // captured pixels are already mixed — start band map fresh

    // Restore the head exactly where the job stopped, and re-adopt its id so more
    // output extends this same job rather than starting a new one.
    printer._yDot = first.headYDot | 0;
    printer._xDot = first.headXDot | 0;
    this._jobId   = job.jobId;

    this._applyFit();
    const cy = this._yToCanvas(Math.round((printer._yDot | 0) / this._vdotInternal) * DOT_PX);
    this._updateHeadMarker(cy);
    this._followHead(cy);
    return true;
  }

  _loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // ===== Text mode =====

  _onText(str) {
    if (this._canvasMode) return;
    this.text += str;
    if (this.elements) this.elements.output.textContent = this.text;
  }

  _onNewline() {
    if (this._canvasMode) return;
    this.text += "\n";
    if (this.elements) {
      this.elements.output.textContent = this.text;
      this.elements.feedBg.scrollTop = this.elements.feedBg.scrollHeight;
    }
  }

  _onLinefeed() {
    if (!this._canvasMode && this.elements)
      this.elements.feedBg.scrollTop = this.elements.feedBg.scrollHeight;
  }

  _onFormFeed() {
    if (this._canvasMode) return;
    this.text += "\n\f\n";
    if (this.elements) {
      this.elements.output.textContent = this.text;
      this.elements.feedBg.scrollTop = this.elements.feedBg.scrollHeight;
    }
  }

  // ===== Canvas dot-matrix rendering =====

  // Paint one ink dot, mixing with whatever has already struck this exact pixel.
  // Each dot remembers the ribbon band(s) laid down (subtractive colour mix) AND
  // how many times it was struck (overstrike darkening). A coloured second strike
  // subtracts to the real secondary; a same-band re-strike deepens toward
  // saturation. The map value packs both: low nibble = band mask, bits 4-6 =
  // strike count. At count 1 (or buildup off) the painted colour/size is identical
  // to the pre-buildup renderer, so normal single-pass output is unchanged.
  _inkDot(ctx, px, py, w, h, color, round = false) {
    if (!this._ink) this._ink = new Map();
    if (this._ink.size > 80000) this._ink.clear();   // bound memory on long runs
    const key  = px + "," + py;
    const prev = this._ink.get(key) || 0;
    const band = (!color || color === "black") ? BAND.K : (COLOR_BANDS[color] ?? BAND.K);
    const mask = (prev & 0x0F) | band;
    let count  = ((prev >> 4) & 0x07) + 1;
    if (count > STRIKE.maxBuild) count = STRIKE.maxBuild;   // saturate — no gain past the cap
    this._ink.set(key, mask | (count << 4));
    ctx.fillStyle = inkColor(mask, count);
    const rScale = (mask & BAND.K) ? 1 : COLOR_DOT_FATTEN;   // colour disc lays a wider footprint
    this._paintDot(ctx, px, py, w, h, round, count, rScale);
  }

  // Paint one dot into its w×h grid cell. Square = exact footprint (the
  // graphics/screen-dump path, which butts dots into solid fills). Round = a
  // FIXED pin-sized ink disc (STRIKE.diaPx), centred on the cell — its size is
  // the physical pin tip, independent of the cell footprint/density, so draft
  // and NLQ dots are the same size; NLQ just packs them closer.
  _paintDot(ctx, px, py, w, h, round, count = 1, rScale = 1) {
    if (!round) { ctx.fillRect(px, py, w, h); return; }
    // Overstrike spreads ink a hair into the paper fibres (capillary) — a capped
    // sub-pixel radius bump on the 2nd+ strike. count 1 keeps the exact base disc.
    // rScale fattens colour dots (1.0 for black → byte-identical to before).
    let r = STRIKE.diaPx * 0.5 * rScale;
    if (STRIKE.buildup && count > 1) r += Math.min(count - 1, 2) * STRIKE.bleedPx;
    ctx.beginPath();
    ctx.arc(px + w * 0.5, py + h * 0.5, r, 0, Math.PI * 2);
    ctx.fill();
  }

  _renderChar({ cols, xDot, yDot, dotW, dotH, rows, hDensity, vDensity, color, bold, underline, halfHeight, script, doubleWidth }) {
    if (!cols || !this.elements?.ctx) return;
    const ctx   = this.elements.ctx;
    // Shift the glyph's zone-relative column into platen space; the dot math
    // inside the zone is untouched (see the layout's zoneOriginPx).
    const cx    = this._platen.zoneOriginPx + Math.round(xDot / dotW) * DOT_PX;
    const cy    = this._yToCanvas(Math.round(yDot / dotH) * DOT_PX);
    const nRows = rows || 9;
    // Column/row canvas pitch from the glyph's dot density vs the active raster:
    // draft/corr (120/72 dpi) → _ppi/120 px per column, _vstretch per row. NLQ
    // (160/144 dpi) packs ~0.75/~0.83 of that, so its 16x18 grid lands in the same
    // cell as a 12x9 draft glyph; bumping _ppi scales both up together.
    const colStep = DOT_PX * (this._ppi / (hDensity || DRAFT_H_DPI));
    const rowStep = this._vstretch * (DRAFT_V_DPI / (vDensity || DRAFT_V_DPI));
    const glyphH = Math.round(nRows * rowStep);

    // Double-width (CTRL-N): each dot column is twice as wide and twice as far
    // apart. Half-height / super- / subscript (ESC w, ESC x/y) squeeze the glyph
    // to half its vertical extent; superscript rides the top half of the line,
    // subscript and plain half-height ride the bottom half.
    const xs     = doubleWidth ? 2 : 1;
    const half   = halfHeight || (script && script !== "none");
    const vScale = half ? 0.5 : 1;
    const yOff   = (half && script !== "super") ? Math.round(glyphH * 0.5) : 0;
    // Dot footprint follows the row pitch so NLQ's finer grid paints smaller,
    // denser dots rather than the chunky 2-px draft dot smeared over 18 rows.
    const baseHpx = Math.max(1, Math.round(rowStep));
    const dotHpx = half ? Math.max(1, Math.round(baseHpx * 0.5)) : baseHpx;
    const dotWpx = Math.max(1, Math.round(colStep * xs));
    const rowY   = r => cy + yOff + Math.round(r * rowStep * vScale);
    const cellW  = Math.round(cols.length * colStep * xs);

    this._ensureCanvasHeight(cy + glyphH + DOT_PX);

    const paint = (shift) => {
      for (let c = 0; c < cols.length; c++) {
        const colVal = cols[c];
        if (!colVal) continue;
        const px = cx + Math.round(c * xs * colStep) + shift * DOT_PX;
        for (let r = 0; r < nRows; r++) {
          if (colVal & (1 << r)) this._inkDot(ctx, px, rowY(r), dotWpx, dotHpx, color, STRIKE.round);
        }
      }
    };

    ctx.save();
    this._clipToPaper(ctx);          // ink past the paper lands on the roller, never the tractor strips
    paint(0);
    if (bold) paint(1);            // double-strike, offset one canvas-dot right

    if (underline) {
      // Real underline fires the BOTTOM pin across the cell at the horizontal dot
      // pitch — single-strike round dots that butt into a continuous line, NOT a
      // solid bar (a fillRect lays ~2-3x the ink of a dotted glyph row → reads way
      // too dark). Route through _inkDot so density, colour mixing and overstrike
      // buildup all match the glyph exactly.
      const uy   = rowY(nRows - 1);
      const step = Math.max(1, Math.round(colStep));
      for (let ux = cx; ux < cx + cellW; ux += step) {
        this._inkDot(ctx, ux, uy, dotWpx, dotHpx, color, STRIKE.round);
      }
    }
    ctx.restore();

    this._markHead(cx, cy, (cellW || 6), glyphH);
    this._updateHeadMarker(cy + glyphH / 2);
    this._followHead(cy + glyphH / 2);
  }

  _renderDots({ byte: colByte, xDot, yDot, dotW, dotH, color }) {
    if (!this.elements?.ctx) return;
    const ctx = this.elements.ctx;
    // Map the printer's internal dot grid (480/inch) onto the canvas the SAME
    // way text does: horizontally ÷(_dpi/_ppi) and vertically ÷(_dpi/V_RASTER)
    // ×_vstretch, an isotropic _ppi raster. The graphics density (dotW/dotH) only governs how
    // far the cursor steps per emitted dot — it must NOT change the canvas px
    // scale. So a 560-dot 72-dpi screen dump spans 560/72 = 7.78" and fills the
    // page width, exactly like a real ImageWriter, rather than 1px-per-dot
    // (which collapsed every density to the same too-small size). Each dot's
    // canvas footprint is its physical pitch, so neighbouring dots butt/overlap
    // into solid ink with no gaps.
    const px      = this._platen.zoneOriginPx + Math.round(xDot / this._hdotInternal) * DOT_PX;
    const py      = this._yToCanvas(yDot / this._vdotInternal);
    const rowStep = (dotH / this._vdotInternal) * this._vstretch;          // canvas px between data rows
    const dW      = Math.max(DOT_PX, Math.round((dotW / this._hdotInternal) * DOT_PX));
    const dH      = Math.max(DOT_H_PX, Math.round(rowStep) + 1);
    const glyphH  = Math.round(8 * rowStep);

    this._ensureCanvasHeight(py + glyphH + dH);

    ctx.save();
    this._clipToPaper(ctx);          // dots past the paper land on the roller, never the tractor strips
    for (let r = 0; r < 8; r++) {
      if (colByte & (1 << r)) this._inkDot(ctx, px, py + Math.round(r * rowStep), dW, dH, color);
    }
    ctx.restore();

    this._markHead(px, py, Math.max(2, dW), glyphH);
    this._updateHeadMarker(py + glyphH / 2);
    this._followHead(py + glyphH / 2);
  }

  // ===== Print-head impact cue =====

  // Flash a translucent box at each struck cell. Boxes accumulate and fade
  // independently, so a burst of impacts traces the print line as a comet tail.
  _markHead(x, y, w, h) {
    if (!this.elements?.headCtx) return;
    if (!this._heads) this._heads = [];
    this._heads.push({ x, y, w, h, t: (typeof performance !== "undefined" ? performance.now() : 0) });
    if (this._heads.length > 400) this._heads.shift(); // safety cap
    if (!this._headRAF) this._headLoop();
  }

  // Alpha curve: full for the first HOLD ms, then step down FADE_STEP each
  // FADE_EVERY ms until zero.
  _headAlpha(age) {
    const HOLD = 200, FADE_EVERY = 20, FADE_STEP = 0.10;
    if (age < HOLD) return 1;
    const steps = Math.floor((age - HOLD) / FADE_EVERY) + 1;
    return Math.max(0, 1 - FADE_STEP * steps);
  }

  _headLoop() {
    const els = this.elements;
    if (!els?.headCtx) { this._headRAF = null; return; }
    const ctx = els.headCtx;
    const hc  = els.head;
    const now = (typeof performance !== "undefined") ? performance.now() : 0;

    ctx.clearRect(0, 0, hc.width, hc.height);

    const live = [];
    for (const box of (this._heads || [])) {
      const a = this._headAlpha(now - box.t);
      if (a <= 0) continue;
      live.push(box);
      ctx.fillStyle   = `rgba(224,58,62,${0.30 * a})`;   // Apple red impact
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = `rgba(224,58,62,${0.95 * a})`;
      ctx.lineWidth   = 1;
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(1, box.w - 1), Math.max(1, box.h - 1));
    }
    this._heads = live;

    if (live.length) {
      this._headRAF = requestAnimationFrame(() => this._headLoop());
    } else {
      this._headRAF = null;
    }
  }

  // Park the left-gutter head wedge at the given canvas row. Canvas Y is in
  // unscaled paper px; the gutter renders at the canvas's displayed scale, so
  // multiply by clientHeight/height to land the wedge on the right fan-fold row
  // whether the paper is fit-to-width or shown 1:1.
  _updateHeadMarker(canvasY) {
    const m  = this.elements?.headMark;
    const cv = this.elements?.canvas;
    if (!m || !cv) return;
    if (!this._canvasMode) { m.style.display = "none"; return; }
    // Remember the row in unscaled canvas px so we can re-place the head when
    // the paper's display scale changes (panel pin/resize, fit toggle, window
    // resize) — otherwise the head drifts off the real print row.
    this._headCanvasY = canvasY;
    const scale = this._logH ? cv.clientHeight / this._logH : 1;   // display px per LOGICAL canvas px
    m.style.top = Math.round(canvasY * scale) + "px";
    m.style.display = "block";
  }

  // Make the gutter print-head bug draggable. The head can only rest on whole
  // line-feed boundaries, so the drag snaps to the active printer's current
  // line spacing (6 lpi / 8 lpi / ESC T n/144"): the bug jumps row-by-row.
  _initHeadDrag() {
    const m = this.elements?.headMark;
    if (!m) return;
    // AUTO_LINES: once the pointer sits this many line-feeds past the head (only
    // possible in centred-scroll mode, where the marker is pinned to viewport
    // centre and the finger can outrun it), the paper auto-feeds in that
    // direction until the finger comes back within range.
    const AUTO_LINES = 8;
    let dragging = false, startMouseY = 0, startYDot = 0, dotsPerLine = 80;
    let lastClientY = 0, autoLines = 0, autoDir = 0, autoSpeed = 0, autoRAF = null;

    // Place the head at start + (manual pointer lines + accumulated auto-feed
    // lines). autoLines is frozen while in manual range, so handing control back
    // and forth is seamless — no jump when auto-feed stops.
    const apply = () => {
      const p     = this.printerManager.getActivePrinter();
      const cv    = this.elements.canvas;
      const scale = this._logH ? cv.clientHeight / this._logH : 1;   // display px per LOGICAL canvas px
      const baseDelta = (lastClientY - startMouseY) / (scale || 1) / this._vstretch;
      const lines     = Math.round((baseDelta * this._vdotInternal) / dotsPerLine);
      const newYDot   = Math.max(0, startYDot + (lines + autoLines) * dotsPerLine);
      if (p) p._yDot = newYDot;
      const cy = this._yToCanvas(Math.round(newYDot / this._vdotInternal) * DOT_PX);
      this._ensureCanvasHeight(cy + Math.round(12 * this._vstretch));
      this._updateHeadMarker(cy);
      // Head is the anchor: feed the paper past it so it stays centred in the
      // viewport (clamped at the top of the first page), exactly as printing does.
      this._followHead(cy);
    };

    // Distance of the pointer from the head marker on screen, in line-feeds →
    // sets the auto-feed direction (0 = in manual range) and a gentle speed ramp.
    const evalZone = () => {
      const cv    = this.elements.canvas;
      const scale = this._logH ? cv.clientHeight / this._logH : 1;   // display px per LOGICAL canvas px
      const rect  = m.getBoundingClientRect();
      const pxPerLine = (dotsPerLine / this._vdotInternal) * this._vstretch * (scale || 1);
      const distLines = pxPerLine ? (lastClientY - (rect.top + rect.height / 2)) / pxPerLine : 0;
      autoDir = distLines > AUTO_LINES ? 1 : distLines < -AUTO_LINES ? -1 : 0;
      // Spring-loaded: a slow creep right at the threshold, ramping up the further
      // the finger is pulled past it (lines/frame, fractional → smooth sub-line).
      const over = Math.abs(distLines) - AUTO_LINES;
      autoSpeed  = autoDir ? Math.min(12, 0.1 + 0.25 * over) : 0;
    };

    const loop = () => {
      if (!dragging) { autoRAF = null; return; }
      evalZone();
      if (!autoDir) { autoRAF = null; return; }   // back in manual range → stop
      const prevY = this.printerManager.getActivePrinter()?._yDot ?? 0;
      autoLines += autoDir * autoSpeed;
      apply();
      // Hit a clamp (top of page) and the head didn't move → don't bank the
      // accumulation, or the finger would have to unwind it on the way back.
      if ((this.printerManager.getActivePrinter()?._yDot ?? 0) === prevY)
        autoLines -= autoDir * autoSpeed;
      autoRAF = requestAnimationFrame(loop);
    };
    const ensureAutoLoop = () => { if (autoDir && !autoRAF) autoRAF = requestAnimationFrame(loop); };

    const onMove = (e) => {
      if (!dragging) return;
      lastClientY = e.clientY;
      apply();
      evalZone();
      ensureAutoLoop();
    };

    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      if (autoRAF) { cancelAnimationFrame(autoRAF); autoRAF = null; }
      // The head rests only on whole line-feed boundaries — snap off any
      // fractional creep left by the spring auto-feed.
      const p = this.printerManager.getActivePrinter();
      if (p) {
        p._yDot = Math.max(0, Math.round((p._yDot || 0) / dotsPerLine) * dotsPerLine);
        const cy = this._yToCanvas(Math.round(p._yDot / this._vdotInternal) * DOT_PX);
        this._updateHeadMarker(cy);
        this._followHead(cy);
      }
      m.classList.remove("dragging");
      try { m.releasePointerCapture(e.pointerId); } catch (_) {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    m.addEventListener("pointerdown", (e) => {
      if (!this._canvasMode) return;
      e.preventDefault();
      e.stopPropagation();                // don't start a window-drag
      const p = this.printerManager.getActivePrinter();
      dragging    = true;
      startMouseY = lastClientY = e.clientY;
      startYDot   = p ? (p._yDot | 0) : 0;
      dotsPerLine = (p && p._lineFeedDots) ? p._lineFeedDots() : 80;
      autoLines   = 0; autoDir = 0; autoSpeed = 0;
      m.classList.add("dragging");
      try { m.setPointerCapture(e.pointerId); } catch (_) {}
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  // Make the right tractor strip a horizontal width handle. The sheet is
  // left-referenced (left strip = datum, head home), so the operator sets width by
  // pulling the RIGHT tractor out/in — exactly the physical adjustment on fan-fold
  // stock. The drag is NON-destructive: a dashed guide + readout chip preview the
  // new PRINTABLE edge (chip reads printable inches, matching the top ruler) while
  // dragging; on release the full sheet width commits via setPaperWidth
  // (one re-lay of the sheet, like reloading stock). Clamped live to the active
  // model's range for its feed mode (IW-II pin 4–10 / friction 3–10, etc.).
  // Snap-to-standard widths + width stops are task 3.3; this is the raw drag.
  _initWidthDrag() {
    const strip = this.elements?.stripRight;
    if (!strip) return;
    let dragging = false, startX = 0, startW = 0, cand = 0, range = null;
    // The right printable (body) edge and the ruler-0 origin at grab, both in canvas
    // inches — captured on pointerdown, held fixed through the gesture (the sheet
    // re-lays/recenters only on release) so the guide stays in the grab-time frame.
    let startEdgeIn = 0, originInGrab = 0;
    // Parked bounding box of the slide-out operator panel's trigger tab, captured at
    // grab BEFORE muting (mute transforms it off-screen, so its live rect is useless).
    let panelBand = null, panelExit = null;   // pending band-exit watcher from last drop
    // Edge auto-advance: the cursor can't travel past the window edge, so widening a
    // narrow sheet back toward its max would need many drags. While the pointer sits
    // in the right-edge hot-zone, a timer re-lays the sheet a ¼" wider each tick so it
    // visibly grows/scrolls to range.max in one gesture. lastX caches the last pointer
    // x so each tick can re-anchor the grab frame to the freshly laid geometry.
    let lastX = 0, edgeTimer = null;
    const EDGE_PX = 40;            // right-edge hot-zone width (display px)
    const EDGE_STEP_IN = GRID_INCH;   // grow ¼" per timer tick

    const sxNow = () => this._rulerScale()?.sx || 1;

    // The drag is DIRECT: the guide line tracks the finger (right tractor under the
    // cursor) and the chip reads the ruler inch directly beneath the line, so the
    // operator sets width straight off the scale they're looking at — drop the line
    // on "7" and the chip says 7. edgeDeltaIn is the line's canvas-inch displacement
    // from the grab point; the ruler reading is (line − ruler-0), both in grab-time
    // canvas inches. The committed PAPER width tracks 1:1 (left edge held during the
    // gesture); the sheet recenters on release (one re-lay), so the preview stays in
    // the grab-time frame. Clamped to the visible canvas so a widen past the viewport
    // still shows the chip. Snapped detent → guide SOLID + chip dotted; free → dashed.
    const showGuide = (snapped, edgeDeltaIn, atLimit = false) => {
      const guide = this.elements.widthGuide, chip = this.elements.widthChip;
      if (!guide) return;
      const edgeIn  = startEdgeIn + edgeDeltaIn;                 // line x, canvas inches
      const edgePx  = edgeIn * this._ppi * sxNow();
      const maxX    = this.elements.canvas?.clientWidth || edgePx;
      const reading = edgeIn - originInGrab;                     // ruler inches under line
      guide.style.display = "block";
      // Pin the line inside the canvas: never past the right edge (widening a narrow
      // sheet) and never into the left corner/track below 0 (clamped-to-min shrink).
      guide.style.left = Math.round(Math.max(0, Math.min(edgePx, maxX))) + "px";
      // A range boundary forces a SOLID stop line so the operator sees the device
      // limit bite even though the cursor keeps travelling past it.
      guide.style.borderLeftStyle = (snapped || atLimit) ? "solid" : "dashed";
      guide.classList.toggle("pr-width-limit", atLimit);
      if (chip) chip.textContent = `${atLimit ? "⊣ " : snapped ? "● " : ""}${reading.toFixed(2)}″`;
    };
    const hideGuide = () => { if (this.elements.widthGuide) this.elements.widthGuide.style.display = "none"; };

    // Resolve the candidate width from the cached pointer x plus any auto-advance
    // inches, snapping the RULER READING (the line's position ON the scale) to the ¼"
    // grid so the line always lands on a quarter-inch tick — independent of the
    // grab-time origin offset, which a width-domain snap would smear off the ticks.
    // Derive the committed PAPER width back from the snapped reading, then range-clamp.
    const compute = () => {
      const dIn     = (lastX - startX) / (sxNow() * this._ppi);
      const rest    = startEdgeIn - originInGrab;            // ruler reading at grab
      const reading = Math.round((rest + dIn) / GRID_INCH) * GRID_INCH;
      cand = clampWidthInch(Math.round((startW + reading - rest) * 100) / 100, range);
      const shown   = rest + (cand - startW);               // reading after the clamp
      const onInch  = Math.abs(shown - Math.round(shown)) < 1e-6;   // whole-inch detent
      // At the device's paper min/max the clamp pins cand; flag it so the guide hard-
      // stops and the cursor can't drag the width any further out (paper/pixel limit).
      const atLimit = !!range &&
        (cand <= range.min + 1e-6 || cand >= range.max - 1e-6);
      showGuide(onInch, cand - startW, atLimit);
    };
    const stopEdge = () => { if (edgeTimer) { clearInterval(edgeTimer); edgeTimer = null; } };
    // One auto-advance tick: grow the REAL sheet a ¼" and re-lay it live, so the
    // ruler + page visibly scroll toward max instead of snapping there on release.
    // setPaperWidth re-lays (same op the release already does), the sheet recenters,
    // so re-anchor the grab frame to the fresh geometry and keep the new right edge
    // scrolled into view (1:1 mode scrolls; fit mode rescales). Stop at max.
    const tickEdge = () => {
      if (!dragging || !range || cand >= range.max - 1e-6) { stopEdge(); return; }
      cand = clampWidthInch(Math.round((cand + EDGE_STEP_IN) * 100) / 100, range);
      this.setPaperWidth(cand);
      const g = this._platen;
      startW = cand;
      startX = lastX;
      startEdgeIn  = g.paperRPx / this._ppi;
      originInGrab = g.paperLPx / this._ppi;
      const pp = this.elements?.paper;
      if (pp) pp.scrollLeft = pp.scrollWidth;
      const rest   = startEdgeIn - originInGrab;
      const onInch = Math.abs(rest - Math.round(rest)) < 1e-6;
      showGuide(onInch, 0, cand >= range.max - 1e-6 || cand <= range.min + 1e-6);
      if (cand >= range.max - 1e-6) stopEdge();
    };
    const onMove = (e) => {
      if (!dragging) return;
      lastX = e.clientX;
      compute();
      // Right-edge hot-zone: while the pointer hugs the viewport's right edge and the
      // sheet isn't maxed, keep widening on a timer so a narrow→full grow takes one
      // drag instead of many (the cursor can't go past the window edge). Leaving the
      // zone or hitting max disarms it; a left/shrink drag never enters it.
      const pp = this.elements?.paper;
      const r  = pp?.getBoundingClientRect();
      const nearRight = r && e.clientX >= r.right - EDGE_PX;
      if (nearRight && range && cand < range.max - 1e-6) {
        if (!edgeTimer) edgeTimer = setInterval(tickEdge, 60);
      } else {
        stopEdge();
      }
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      stopEdge();
      hideGuide();
      strip.classList.remove("pr-wdrag");
      try { strip.releasePointerCapture(e.pointerId); } catch (_) {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // If the pointer ends the drag still over the strip, mute the hover ring until
      // it leaves — otherwise dragging the width line to the right edge instantly
      // re-triggers the handle's hover microinteraction the operator is fighting.
      if (strip.matches(":hover")) strip.classList.add("pr-mute-hover");
      // Operator panel: it was muted for the whole drag (added on pointerdown) so it
      // never popped out mid-gesture. Now decide whether to KEEP it muted. If the drop
      // landed outside the parked trigger band, un-mute now (normal hover resumes). If
      // it landed inside, keep muted and watch for the pointer to genuinely leave the
      // band — NOT via the panel's own pointerleave (muting transforms it out from
      // under the cursor, firing a spurious leave that re-arms it: the flicker).
      const panel = this.elements?.panel;
      if (panel && !panel.classList.contains("pinned")) {
        const b = panelBand;
        const inBand = b && e.clientX >= b.left && e.clientY >= b.top && e.clientY <= b.bottom;
        if (!inBand) {
          panel.classList.remove("pr-mute-hover");
        } else {
          panelExit = (ev) => {
            if (ev.clientX < b.left - 2 || ev.clientY < b.top || ev.clientY > b.bottom) {
              panel.classList.remove("pr-mute-hover");
              window.removeEventListener("pointermove", panelExit);
              panelExit = null;
            }
          };
          window.addEventListener("pointermove", panelExit);
        }
      }
      this.setPaperWidth(cand);   // commit: clamp + persist + re-lay the sheet
      this._armTransientHide();
    };

    strip.addEventListener("pointerdown", (e) => {
      if (!this._canvasMode) return;
      e.preventDefault();
      e.stopPropagation();                 // don't start a window-drag
      this._showTransientRulers();
      const printer = this.printerManager.getActivePrinter();
      const geo = printer.paperGeo;
      dragging = true;
      startX   = lastX = e.clientX;
      stopEdge();
      startW   = cand = geo.widthInch;
      range    = printer.paperWidthRange();
      const g  = this._platen;
      startEdgeIn  = g.paperRPx / this._ppi;   // paper-right (paper-sizer line) at grab
      // Ruler-0 = paper-left, matching _drawTopRuler so the chip reads the same tick
      // the line sits over. Both straight off the shared platen paper edges.
      originInGrab = g.paperLPx / this._ppi;
      // Snapshot the panel tab band (parked) and mute it for the whole drag so it can't
      // slide out while the pointer sweeps the right edge; onUp decides keep-vs-release.
      const panel = this.elements?.panel;
      panelBand = null;
      if (panelExit) { window.removeEventListener("pointermove", panelExit); panelExit = null; }
      if (panel && !panel.classList.contains("pinned")) {
        panelBand = panel.getBoundingClientRect();
        panel.classList.add("pr-mute-hover");
      }
      strip.classList.add("pr-wdrag");
      try { strip.setPointerCapture(e.pointerId); } catch (_) {}
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      showGuide(false, 0);
    });

    // Re-arm the hover ring once the pointer actually leaves the handle after a drag.
    strip.addEventListener("pointerleave", () => strip.classList.remove("pr-mute-hover"));
  }

  // Keep the print head vertically centred in the viewport as it advances.
  // The paper sits still while the head is in the top half of the first page
  // (the top clamp at scrollTop 0); once the head crosses centre it stays
  // pinned to centre and the paper feeds continuously past it — no bottom-page
  // special case. canvasY is the head row in unscaled canvas px.
  _followHead(canvasY) {
    if (!this.elements) return;
    const feedBg = this.elements.feedBg;
    const cv     = this.elements.canvas;
    if (!feedBg || !cv) return;
    // No artificial bottom pad: the two trailing blank pages already give the
    // head room to centre, and the scroll clamps to the real paper bottom so
    // you can't scroll past the last page.
    const scale = this._logH ? cv.clientHeight / this._logH : 1;   // display px per LOGICAL canvas px
    // Head Y in feedBg's scroll-content coordinates (account for the sheet's
    // offset within the scroller and the canvas's display scale).
    const cvTop = cv.getBoundingClientRect().top
                - feedBg.getBoundingClientRect().top + feedBg.scrollTop;
    const headAbsY  = cvTop + canvasY * scale;
    const target    = headAbsY - feedBg.clientHeight / 2;
    const maxScroll = Math.max(0, feedBg.scrollHeight - feedBg.clientHeight);
    feedBg.scrollTop = Math.max(0, Math.min(maxScroll, target));
  }

  // Operator-panel paper motion: drive the printer's vertical cursor, then
  // follow it on the canvas (a manual feed paints no ink, so nothing else moves
  // the view).
  _panelFeed(kind) {
    const p = this.printerManager.getActivePrinter();
    if      (kind === "up")   p.lineFeedUp(1);
    else if (kind === "down") p.lineFeedDown(1);
    else if (kind === "ff")   p.formFeed();
    if (this._canvasMode) {
      const cy = this._yToCanvas(Math.round((p._yDot | 0) / this._vdotInternal) * DOT_PX);
      this._ensureCanvasHeight(cy + Math.round(12 * this._vstretch));
      this._updateHeadMarker(cy);
      this._followHead(cy);
    }
  }

  // TOP button: reseat the head at the very top of the first page (yDot 0) and
  // scroll the view there.
  _headToTop() {
    const p = this.printerManager.getActivePrinter();
    if (!p) return;
    p._yDot = 0;
    p._xDot = 0;
    if (this._canvasMode) {
      const cy = this._yToCanvas(0);
      this._updateHeadMarker(cy);
      this._followHead(cy);
    }
  }

  // ===== Lifecycle =====

  async update() {
    if (!this.elements) return;
    await this.printerManager.init();
  }

  // ===== Toolbar =====

  _toggleOnline() { this.setOnline(!this.online); }

  // ===== Public API (agent-controllable) =====

  // Set printer online/offline.
  setOnline(on) {
    this.online = !!on;
    if (this.elements?.online) {
      this.elements.online.className = this.online ? "pr-pbtn pr-pbtn-on" : "pr-pbtn";
    }
    return this.online;
  }

  // Clear the paper (reset glyph state + canvas/text buffer).
  clearPaper() { this._clear(); }

  // Panel feed: 'up' | 'down' (one line) or 'ff' (form feed to next page).
  feed(kind) { this._panelFeed(kind); }

  // Swap the ribbon cartridge ('bw' | 'color'). Future ink lands in the new
  // colour; ink already on the paper is unchanged.
  setRibbon(id) {
    this.printerManager.setRibbon(id);
    const r = this.printerManager.getRibbon();
    if (this.elements?.ribbon) this.elements.ribbon.value = r;
    return r;
  }

  // Automatic Line Feed is one entry in the data-driven settings panel now
  // (target: 'manager', so it stays sticky across model swaps). Kept as a public
  // method because the agent tool (printer-tools.js) drives it directly.
  setAutoLineFeed(on) {
    const state = this.printerManager.setAutoLineFeed(on);
    this._renderSettings();
    return state;
  }

  getAutoLineFeed() { return this.printerManager.getAutoLineFeed(); }

  // ===== Operator settings panel (data-driven from the model's static SETTINGS) =====

  // Resolve the get/set target for a setting: 'manager' entries (e.g. Auto-LF)
  // route through the shared PrinterManager; everything else acts on the printer.
  _settingTarget(s) {
    return s.target === "manager" ? this.printerManager : this.printerManager.getActivePrinter();
  }

  _settingGet(s)      { return s.get(this._settingTarget(s)); }
  _settingApply(s, v) { s.set(this._settingTarget(s), v); }

  _settingStoreKey(modelId, id) { return `a2e-printer-set-${modelId}-${id}`; }

  _loadSetting(modelId, s) {
    try {
      const raw = localStorage.getItem(this._settingStoreKey(modelId, s.id));
      if (raw === null) return s.default;
      return s.type === "toggle" ? raw === "true" : raw;
    } catch (e) { return s.default; }
  }

  _persistSetting(modelId, id, value) {
    try { localStorage.setItem(this._settingStoreKey(modelId, id), String(value)); }
    catch (e) { /* non-fatal */ }
  }

  // Re-apply each model-scoped setting's persisted value to a (possibly freshly
  // created) printer. Manager-scoped settings (Auto-LF) are already re-applied by
  // the manager when the printer is installed, so they're skipped here.
  _applyPersistedSettings(printer) {
    const schema = printer?.constructor?.SETTINGS ?? [];
    for (const s of schema) {
      if (s.target === "manager") continue;
      this._settingApply(s, this._loadSetting(printer.getId(), s));
    }
  }

  // ----- Paper geometry persistence (per printer id) -----
  // Width + feed mode live on printer.paperGeo, not the SETTINGS schema (width is
  // continuous and range-clamped, not a fixed enum), so they get their own store.
  // -v2: invalidates pre-2026-06-19 saves that could be stuck at the range MAX
  // (e.g. a 9" body for IW-I), which misread as the default. Old key is abandoned
  // so every model restores from its 8.5" standard-paper default cleanly.
  _paperStoreKey(modelId) { return `a2e-printer-paper-v2-${modelId}`; }

  _persistPaper(printer) {
    // Width + length come straight off the generic paper geometry; the model's
    // paperWidthRange() is the sole authority on the legal span on restore.
    const data = printer.paperGeo.toJSON();
    try { localStorage.setItem(this._paperStoreKey(printer.getId()), JSON.stringify(data)); }
    catch (e) { /* non-fatal */ }
  }

  // Restore saved width + length into the printer's paper geometry, re-clamped to
  // the model's CURRENT range (so a value the model has since narrowed is pulled
  // back in range). No-op when nothing is stored — the model default already on the
  // geo stands. Called before every platen lay-out so the restored width sizes the
  // canvas regardless of call order.
  _applyPersistedPaper(printer) {
    if (!printer) return;
    let raw = null;
    try { raw = localStorage.getItem(this._paperStoreKey(printer.getId())); } catch (e) { return; }
    if (!raw) return;
    try {
      const obj = JSON.parse(raw);
      const geo = printer.paperGeo;
      geo.load(obj, printer.paperWidthRange(), printer.paperLengthRange());
      // If a custom form length was saved, clear any model-internal formDots
      // (set by the IW-II constructor / ESC H) so _pageHeightPx uses lengthInch.
      if (obj.lengthInch != null && printer.paper) printer.paper.formDots = 0;
    } catch (e) { /* keep model default */ }
  }

  // Public: set paper (body) width in inches, clamped to the active model's range,
  // persisted per-model, and re-laid on the canvas. Entry point for the agent/API
  // and the drag UI. Returns clamped value.
  setPaperWidth(widthInch) {
    const printer = this.printerManager.getActivePrinter();
    if (!printer) return;
    const geo   = printer.paperGeo;
    const value = geo.setWidthInch(widthInch, printer.paperWidthRange());
    this._persistPaper(printer);
    if (this._canvasMode) { this._initCanvas(); this._applyFit(); }
    this._renderPaperPresets();
    return value;
  }

  // Public: set form length in inches, clamped to the active model's range,
  // persisted, and re-laid on the canvas. Entry point for the length drag and presets.
  setPaperLength(lengthInch) {
    const printer = this.printerManager.getActivePrinter();
    if (!printer) return;
    const geo   = printer.paperGeo;
    const value = geo.setLengthInch(lengthInch, printer.paperLengthRange());
    // Clear model-internal formDots (set by ESC H) so _pageHeightPx uses lengthInch.
    if (printer.paper) printer.paper.formDots = 0;
    this._persistPaper(printer);
    if (this._canvasMode) { this._initCanvas(); this._applyFit(); }
    this._renderPaperPresets();
    return value;
  }

  // Position the length drag handle at the first perforation (pageH canvas px from top).
  // Multiply by sy (display px / canvas px) to land in CSS-pixel space.
  _sizeLengthHandle() {
    const h  = this.elements?.lengthHandle;
    if (!h) return;
    const sc = this._rulerScale();
    if (!sc) { requestAnimationFrame(() => this._sizeLengthHandle()); return; }
    h.style.top = `${Math.round(this._pageHeightPx() * sc.sy)}px`;
  }

  // Vertical mirror of _initWidthDrag: drag the form-bottom handle up/down to
  // set the page length. Shows a horizontal guide + inch readout during the gesture.
  _initLengthDrag() {
    const handle = this.elements?.lengthHandle;
    if (!handle) return;
    let dragging = false, startY = 0, startL = 0, cand = 0, range = null, captureId = null;
    // 1 canvas px = 1/PX_PER_INCH inches. The canvas is isotropic at the active
    // raster, so vertical px/in == _ppi (V_RASTER × _vstretch).
    const PX_PER_INCH = this._ppi;

    const syNow = () => {
      const cv = this.elements?.canvas;
      if (!cv || !this._logH) return 1;
      return cv.getBoundingClientRect().height / this._logH;   // display px per LOGICAL canvas px
    };

    const showGuide = (atLimit) => {
      const guide = this.elements?.lengthGuide, chip = this.elements?.lengthChip;
      if (!guide) return;
      const candPx = Math.round(cand * PX_PER_INCH);
      const sc = this._rulerScale();
      guide.style.display = "block";
      guide.style.top = sc ? `${Math.round(candPx * sc.sy)}px` : `${candPx}px`;
      guide.classList.toggle("pr-length-limit", atLimit);
      if (chip) chip.textContent = `${atLimit ? "⊣ " : ""}${cand.toFixed(2)}″`;
    };
    const hideGuide = () => {
      if (this.elements?.lengthGuide) this.elements.lengthGuide.style.display = "none";
    };

    const compute = (clientY) => {
      const dIn = (clientY - startY) / (PX_PER_INCH * syNow());
      const snapped = Math.round((startL + dIn) / GRID_INCH) * GRID_INCH;
      cand = Math.round(Math.min(Math.max(snapped, range.min), range.max) * 100) / 100;
      showGuide(cand <= range.min + 1e-6 || cand >= range.max - 1e-6);
    };

    const onMove = (e) => { if (dragging) compute(e.clientY); };
    const onUp   = (e) => {
      if (!dragging) return;
      dragging = false;
      hideGuide();
      handle.classList.remove("pr-ldrag");
      try { handle.releasePointerCapture(captureId); } catch (_) {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      this.setPaperLength(cand);
      this._armTransientHide();
    };

    handle.addEventListener("pointerdown", (e) => {
      if (!this._canvasMode) return;
      e.preventDefault();
      e.stopPropagation();
      this._showTransientRulers();
      const printer = this.printerManager.getActivePrinter();
      if (!printer) return;
      dragging    = true;
      captureId   = e.pointerId;
      startY      = e.clientY;
      startL      = printer.paperGeo.lengthInch;
      cand        = startL;
      range       = printer.paperLengthRange();
      handle.classList.add("pr-ldrag");
      handle.setPointerCapture(e.pointerId);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      showGuide(false);
    });
  }

  // Sync the toolbar preset select to the current paper dims (exact match within 0.01").
  _renderPaperPresets() {
    const printer = this.printerManager.getActivePrinter();
    if (!printer) return;
    const curW  = printer.paperGeo?.widthInch  ?? 8.5;
    const curL  = printer.paperGeo?.lengthInch ?? 11;
    const match = PAPER_PRESETS.find(
      (p) => Math.abs(curW - p.w) < 0.01 && Math.abs(curL - p.h) < 0.01
    );
    const sel = this.elements?.page;
    if (!sel) return;
    sel.querySelector('[data-custom]')?.remove();
    if (match) {
      sel.value = `${match.w}:${match.h}`;
    } else {
      const fmt = (n) => parseFloat(n.toFixed(2)).toString();
      const opt = document.createElement("option");
      opt.value = `${curW}:${curL}`;
      opt.textContent = `${fmt(curW)}×${fmt(curL)}"`;
      opt.dataset.custom = '1';
      sel.insertBefore(opt, sel.firstChild);
      sel.value = opt.value;
    }
  }

  // Rebuild the settings rows for the active model using the app's standard
  // controls (toggle-switch for booleans, settings-select for enum choices).
  _renderSettings() {
    const host = this.elements?.settings;
    if (!host) return;
    const printer = this.printerManager.getActivePrinter();
    const schema  = printer?.constructor?.SETTINGS ?? [];
    host.innerHTML = schema.map((s) => this._settingRowHtml(s)).join("");
    for (const s of schema) {
      const node = host.querySelector(`[data-setting="${s.id}"]`);
      if (node) node.addEventListener("change", () => this._onSettingChange(s, node));
    }
  }

  _settingRowHtml(s) {
    const cur  = this._settingGet(s);
    const hint = this._escAttr(s.hint || "");
    if (s.type === "choice") {
      const opts = (s.options || []).map((o) =>
        `<option value="${this._escAttr(o.value)}"${o.value === cur ? " selected" : ""}>${o.label}</option>`).join("");
      return `<label class="pr-set-row" title="${hint}"><span class="pr-set-label">${s.label}</span>`
           + `<select class="settings-select pr-set-select" data-setting="${s.id}">${opts}</select></label>`;
    }
    // toggle
    return `<label class="toggle-label pr-set-toggle" title="${hint}">`
         + `<input type="checkbox" data-setting="${s.id}"${cur ? " checked" : ""}>`
         + `<span class="toggle-switch"></span><span>${s.label}</span></label>`;
  }

  _onSettingChange(s, node) {
    const value = s.type === "toggle" ? node.checked : node.value;
    this._settingApply(s, value);
    // Manager-scoped settings persist themselves; model-scoped persist per model.
    if (s.target !== "manager") {
      this._persistSetting(this.printerManager.getActivePrinter().getId(), s.id, value);
    }
  }

  _escAttr(str) { return String(str).replace(/"/g, "&quot;"); }

  _refreshPower() {
    const el = this.elements?.power;
    if (!el) return;
    el.className = this.printerManager.getPower() ? "pr-toggle pr-toggle-on" : "pr-toggle pr-toggle-off";
  }

  // Operator panel pin: pinned docks it in-flow (paper shrinks beside it);
  // unpinned auto-hides it off the right edge (hover to peek).
  _togglePin() {
    this._panelPinned = !this._panelPinned;
    try { localStorage.setItem("a2e-printer-panel-pinned", String(this._panelPinned)); }
    catch (e) { /* non-fatal */ }
    this._applyPin();
  }

  _applyPin() {
    const el = this.elements?.panel;
    if (!el) return;
    el.classList.toggle("pinned", this._panelPinned);
    if (this.elements.panelTab)
      this.elements.panelTab.title = this._panelPinned ? "Unpin operator panel (auto-hide)" : "Pin operator panel";
    // Fit mode scales the canvas to the (now narrower/wider) paper column.
    this._applyFit();
  }

  // Mains switch. Off ignores incoming bytes and forces the panel offline; on
  // brings the printer back online (paper is preserved either way).
  setPower(on) {
    const state = this.printerManager.setPower(on);
    if (!state) this.setOnline(false);
    else        this.setOnline(true);
    this._refreshPower();
    return state;
  }

  // Show/hide the "No card" warning chip and disable the power button when no
  // Parallel or SSC card is installed in any expansion slot.
  _updateInterfaceState(_has) {
    const el = this.elements;
    if (!el) return;
    const available = this.printerManager.availableModelIds();
    const activeId  = this.printerManager.getActivePrinter().getId();
    const activeOk  = available.has(activeId);
    if (el.power) el.power.disabled = !activeOk;
    if (el.model) {
      el.model.querySelectorAll("option").forEach((o) => { o.disabled = !available.has(o.value); });
    }
    [el.ribbon, el.page].forEach((sel) => {
      if (sel) sel.querySelectorAll("option").forEach((o) => { o.disabled = !activeOk; });
    });
    if (el.feedBg) el.feedBg.classList.toggle("pr-no-interface", !activeOk);
  }

  // Switch active printer model by id (e.g. 'imagewriter-ii', 'epson-fx80').
  setModel(id) {
    const def = PRINTER_MODELS.find((m) => m.id === id);
    if (!def) return false;
    this.printerManager.setActivePrinter(def.create());
    if (this.elements?.model) this.elements.model.value = id;
    return true;
  }

  // Select the page / form size by id (see ImageWriterII.PAGE_SIZES).
  setPageSize(id) {
    const ok = this.printerManager.getActivePrinter().setPageSize?.(id);
    if (ok && this.elements?.page) this.elements.page.value = id;
    if (ok && this._canvasMode) { this._initCanvas(); this._applyFit(); }
    return !!ok;
  }

  // Dump the current //e screen to the printer as an ESC G bit-image stream.
  // Reads the live RGBA framebuffer, thresholds it to 1-bit ink, and feeds a
  // faithful graphics stream through the parser — the same path a real
  // screen-dump utility drives. `fb`/`width`/`height` can be supplied for an
  // arbitrary bitmap; default to the //e screen. Returns a status object.
  // Dump Screen button: a normal click auto-picks polarity — text mode prints
  // white pixels as black ink (no invert), graphics mode inverts only when the
  // screen is mostly dark (< 5% lit pixels). A long hold (>= 500 ms) forces the
  // reverse-video polarity (invert) in either mode.
  _initDumpButton(btn) {
    if (!btn) return;
    let timer = null, fired = false;
    const LONG_MS = 500;
    const start = (e) => {
      if (e.button != null && e.button !== 0) return;
      fired = false;
      btn.classList.add("pr-holding");
      timer = setTimeout(() => {
        fired = true;
        btn.classList.remove("pr-holding");
        // Long-press overrides the auto default with reverse-video polarity in
        // either mode (text default is no-invert, graphics auto-picks by density).
        this.dumpScreen(null, SCREEN_W, SCREEN_H, { invert: true });
      }, LONG_MS);
    };
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } btn.classList.remove("pr-holding"); };
    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup", () => {
      if (timer) { clearTimeout(timer); timer = null; }
      btn.classList.remove("pr-holding");
      if (!fired) this.dumpScreen();   // short click → auto
    });
    btn.addEventListener("pointerleave", cancel);
    btn.addEventListener("pointercancel", cancel);
  }

  dumpScreen(fb = null, width = SCREEN_W, height = SCREEN_H, opts = {}) {
    const pixels = fb || window.emulator?._lastFramebuffer;
    if (!pixels) return { success: false, message: "No framebuffer available — is the emulator running?" };

    // Kick a fire-and-forget refresh of the cached soft-switch state so the NEXT
    // dump has an up-to-date video mode. The cache starts as 1 (TEXT = safe, no
    // auto-invert) and is updated after each dump without making this fn async
    // (async dumpScreen caused silent failures when the WasmProxy rejected mid-cycle).
    window.emulator?.wasmModule?._getSoftSwitchState?.()
      ?.then?.((s) => { this._cachedSoftState = s; })
      ?.catch?.(() => {});

    const printer   = this.printerManager.getActivePrinter();
    const id        = printer.getId();
    const monoOpts  = { ...opts };

    // Each printer head speaks a different bit-image protocol; pick the matching
    // mono builder by model id. The ImageWriter II additionally has a colour
    // ribbon (handled below); the DMP and Epson FX-80 are mono-only heads.
    const MONO_BUILDERS = {
      "imagewriter-ii": buildScreenDumpImageWriter,
      "imagewriter-i":  buildScreenDumpImageWriter,
      "apple-dmp":      buildScreenDumpAppleDMP,
      "epson-fx80":     buildScreenDumpEpson,
    };
    const buildMono = MONO_BUILDERS[id];
    if (!buildMono) {
      return { success: false, message: `Screen dump not supported on this printer (active: ${id})` };
    }

    // Colour ribbon → a dithered colour dump (one overprint pass per ribbon
    // band); B/W ribbon → the 1-bit threshold dump. Colour is an ImageWriter II
    // ribbon feature only — the DMP and FX-80 heads have no colour ribbon, so they
    // always take the mono path. The colour dump returns the head between passes
    // with bare CRs, so Auto-LF must be off while it feeds (otherwise each CR
    // would also advance the paper and the bands would smear).
    //
    // Dump always starts at carriage home (xDot=0). For centered models (C.Itoh)
    // this may be left of the paper body on narrow paper — tracers reflect the
    // actual head position. Ink is clipped to paper body by _clipToPaper.
    const savedLeftMargin  = printer._leftMargin;
    const savedHeadMargin  = printer.head.leftMargin;
    printer._leftMargin     = 0;
    printer.head.leftMargin = 0;
    printer._xDot           = 0;
    printer.head.x          = 0;
    const maxCols           = width;

    const colourCapable = id === "imagewriter-ii";
    const colour = colourCapable && this.printerManager.getRibbon() === "color";
    let bytes;
    if (colour) {
      // opts.invert (set by a long-hold on Dump Screen) forces the greyscale
      // polarity; omitted, the dump auto-picks by lit density.
      bytes = buildScreenDumpColor(pixels, width, height, { invert: opts.invert, maxCols });
      const prevAutoLF = printer._autoLF;
      printer._autoLF = false;
      this.printerManager.feedBytes(bytes);   // parsed synchronously
      printer._autoLF = prevAutoLF;           // restore the DIP
    } else {
      if (monoOpts.invert === undefined) {
        const isGraphics = (this._cachedSoftState & 0x01) === 0; // bit 0 = TEXT mode
        // buildMono: invert=false → a lit (white) pixel strikes black ink; invert=true
        // is reverse-video (the black field inks, white knocks out). A text dump wants
        // the plain mapping — white text → black ink on white paper — so invert=false.
        // The density auto-pick is a GRAPHICS concern: a mostly-dark picture inverts so
        // the paper stays white instead of a near-solid black page.
        monoOpts.invert = isGraphics ? litDensity(pixels, width, height) < 0.05 : false;
      }
      bytes = buildMono(pixels, width, height, { ...monoOpts, maxCols });
      this.printerManager.feedBytes(bytes);
    }

    printer._leftMargin     = savedLeftMargin;
    printer.head.leftMargin = savedHeadMargin;
    return { success: true, colour, width, height, bytes: bytes.length, message: `Dumped ${width}×${height} screen to printer${colour ? " (colour)" : ""}` };
  }

  // Snapshot of printer/paper status.
  getState() {
    const p = this.printerManager.getActivePrinter();
    return {
      model:        p.getId(),
      modelName:    p.getName(),
      power:        this.printerManager.getPower(),
      online:       this.online,
      ribbon:       this.printerManager.getRibbon(),
      pageSize:     p.getPageSize?.() ?? null,
      canvasMode:   this._canvasMode,
      textLength:   this.text.length,
      paperHeightPx: this._canvasMode && this.elements ? this.elements.canvas.height : 0,
      paperWidthPx:  this._canvasMode && this.elements ? this.elements.canvas.width  : 0,
      renderErrCount: this._renderErrCount || 0,
      lastRenderError: this._lastRenderError || null,
      headYDot:    p?._yDot | 0,
      maxNeeded:   this._maxNeeded || 0,
      growCount:   this._growCount || 0,
    };
  }

  // Render the current paper to a standalone canvas (dot-matrix models use the
  // live paper canvas; text models are typeset onto a fresh one).
  _paperCanvas() {
    if (this._canvasMode && this.elements) return this.elements.canvas;
    const lines      = this.text.split("\n");
    const fontSize   = 13;
    const lineHeight = Math.round(fontSize * 1.45);
    const padding    = 20;
    const width      = 640;
    const height     = Math.max(200, lines.length * lineHeight + padding * 2);
    const canvas     = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    const ctx     = canvas.getContext("2d");
    ctx.fillStyle = PAPER_BG;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle    = "#1a1a1a";
    ctx.font         = `${fontSize}px 'Courier New', monospace`;
    ctx.textBaseline = "top";
    lines.forEach((line, i) => ctx.fillText(line, padding, padding + i * lineHeight));
    return canvas;
  }

  // Capture the paper as a PNG. Returns { imageBase64 (no data: prefix), width, height }.
  capturePaper() {
    // Headless agents capture with the tab backgrounded, where the paced rAF
    // scheduler is frozen and the canvas would be blank/stale. Force the full
    // backlog onto the paper first so the snapshot reflects every byte sent.
    this.printerManager.drainNow();
    // Canvas models: crop to used pages so the trailing blank feed pages don't
    // appear in the capture. Text models typeset their own exact-height canvas.
    const cv  = this._canvasMode ? (this._usedCanvas() || this._paperCanvas()) : this._paperCanvas();
    const url = cv.toDataURL("image/png");
    return { imageBase64: url.split(",")[1], width: cv.width, height: cv.height };
  }

  _clear() {
    this._flushAndEndJob();   // save the sheet to the page store before wiping it
    this.text = "";
    this.printerManager.getActivePrinter().reset();
    this._heads = [];
    this._ink?.clear();   // forget accumulated ribbon-band coverage
    if (this._headRAF) { cancelAnimationFrame(this._headRAF); this._headRAF = null; }
    if (this.elements) {
      this.elements.output.textContent = "";
      this._initCanvas();
      if (this.elements.headMark) this._updateHeadMarker(0);
    }
  }

  _downloadPng() {
    if (this._canvasMode) {
      const cv    = this.elements.canvas;
      const pageH = this._pageHeightPx();
      const pages = this._usedPageCount(pageH);
      // One sheet → a plain PNG. Multiple sheets (e.g. a banner) → a ZIP with
      // one PNG per page plus a full-strip PNG of everything joined.
      if (pages <= 1) {
        this._usedCanvas().toBlob((blob) => this._saveBlob(blob, "printer.png"), "image/png");
      } else {
        this._exportPagesZip(cv, pageH, pages);
      }
      return;
    }

    const lines      = this.text.split("\n");
    const fontSize   = 13;
    const lineHeight = Math.round(fontSize * 1.45);
    const padding    = 20;
    const width      = 640;
    const height     = Math.max(200, lines.length * lineHeight + padding * 2);
    const canvas     = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    const ctx     = canvas.getContext("2d");
    ctx.fillStyle = PAPER_BG;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle    = "#1a1a1a";
    ctx.font         = `${fontSize}px 'Courier New', monospace`;
    ctx.textBaseline = "top";
    lines.forEach((line, i) => ctx.fillText(line, padding, padding + i * lineHeight));
    canvas.toBlob((blob) => this._saveBlob(blob, "printer.png"), "image/png");
  }

  // How many pages the current output actually occupies, from the print head's
  // furthest vertical position (not the canvas height, which over-allocates).
  _usedPageCount(pageH) {
    const p      = this.printerManager.getActivePrinter();
    const yDot   = p?._yDot | 0;
    const bottom = this._yToCanvas(Math.round(yDot / this._vdotInternal)) + Math.round(9 * this._vstretch);
    return Math.max(1, Math.ceil(bottom / pageH));
  }

  // The paper canvas cropped to just the used pages — drops the trailing blank
  // feed pages so they never land in a saved/captured PNG.
  _usedCanvas() {
    const cv = this.elements?.canvas;
    if (!cv) return cv;
    const pageH  = this._pageHeightPx();
    // _usedPageCount/pageH are logical; the canvas is ×SS, so crop in backing px.
    const usedHb = this._usedPageCount(pageH) * pageH * this._ss;
    if (usedHb >= cv.height) return cv;
    const out = document.createElement("canvas");
    out.width  = cv.width;          // backing width
    out.height = Math.round(usedHb);
    const o = out.getContext("2d");
    o.fillStyle = PAPER_BG;
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(cv, 0, 0);          // 1:1 backing copy
    return out;
  }

  // Slice the paper into one PNG per page + a full-strip PNG, zip, and download.
  async _exportPagesZip(cv, pageH, pages) {
    const pad   = (n) => String(n).padStart(2, "0");
    const files = [];
    const ss = this._ss;   // cv is the ×SS backing; bands are sliced in backing px
    for (let i = 0; i < pages; i++) {
      const slice = document.createElement("canvas");
      slice.width  = cv.width;
      slice.height = Math.round(pageH * ss);
      const sctx = slice.getContext("2d");
      sctx.fillStyle = PAPER_BG;
      sctx.fillRect(0, 0, slice.width, slice.height);
      sctx.drawImage(cv, 0, -i * pageH * ss);   // copy this page's band
      files.push({ name: `page-${pad(i + 1)}.png`, data: await this._canvasBytes(slice) });
    }
    // Whole run joined — for printshop/banner output spanning pages. Used pages
    // only, no trailing blank feed pages.
    files.push({ name: "full.png", data: await this._canvasBytes(this._usedCanvas()) });
    this._saveBlob(makeZipStore(files), "printer-pages.zip");
  }

  // PNG bytes of a canvas as a Uint8Array (via toBlob → arrayBuffer).
  _canvasBytes(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => resolve(new Uint8Array(await blob.arrayBuffer())), "image/png");
    });
  }

  _saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  _downloadPdf() {
    if (this._canvasMode) { this._downloadPdfCanvas(); return; }
    this._printViaIframe(
      `<!DOCTYPE html>` +
      `<html><head><title>Printer Output</title>` +
      `<style>` +
      `body { margin: 0.75in; font-family: 'Courier New', monospace; font-size: 12pt; color: #1a1a1a; }` +
      `pre  { white-space: pre-wrap; word-break: break-all; }` +
      `@media print { @page { margin: 0.75in; } }` +
      `</style></head>` +
      `<body><pre>${this._escapeHtml(this.text)}</pre></body></html>`
    );
  }

  // Print HTML through a throwaway hidden iframe (shared with the Print Browser
  // window — see print-utils.js for why the iframe must be torn down).
  _printViaIframe(html) {
    printViaIframe(html);
  }

  // Dot-matrix PDF: one full-bleed page image per used page, perforation-free,
  // at the printer's true dimensions. The canvas is an isotropic _ppi raster both
  // axes (body inches × _ppi across; pageH px = formInches × _ppi down), so canvas
  // px ÷ _ppi = inches. Printing the page image full-bleed onto a page of that size
  // reproduces the printer's aspect; any upscale by the print pipeline keeps it
  // since the image and the @page share one aspect.
  _downloadPdfCanvas() {
    const pageH = this._pageHeightPx();
    const pages = this._usedPageCount(pageH);
    const clean = this._cleanUsedCanvas();      // used pages, perforations erased (×SS backing)
    if (!clean) return;
    const ss  = this._ss;
    const wIn = clean.width / (this._ppi * ss); // backing width ÷ (_ppi·SS) = body inches
    const hIn = pageH / this._ppi;              // form length in inches (logical)

    const imgs = [];
    for (let i = 0; i < pages; i++) {
      const slice = document.createElement("canvas");
      slice.width  = clean.width;               // backing width
      slice.height = Math.round(pageH * ss);    // backing band height
      const s = slice.getContext("2d");
      s.fillStyle = PAPER_BG;
      s.fillRect(0, 0, slice.width, slice.height);
      s.drawImage(clean, 0, -i * pageH * ss);   // this page's band
      imgs.push(slice.toDataURL("image/png"));
    }

    printPagesViaIframe(imgs, wIn, hIn);
  }

  // A perforation-free copy of the used pages for clean full-bleed output. The
  // page-break marks are painted onto the live canvas at each boundary; here we
  // copy and overpaint a thin paper band over every interior boundary (the page
  // break always falls in the blank inter-page gap, so no ink is lost).
  _cleanUsedCanvas() {
    // Page break marks live on the perf overlay canvas, not the main canvas —
    // main canvas is content-only, nothing to erase.
    return this._usedCanvas();
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
