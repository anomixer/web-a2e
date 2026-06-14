/*
 * printer-window.js - Printer output window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { BaseWindow } from "../windows/base-window.js";
import { PRINTER_MODELS, RIBBONS } from "./printer-manager.js";
import { makeZipStore } from "./zip-store.js";
import { buildScreenDump, buildScreenDumpColor, SCREEN_W, SCREEN_H } from "./screen-dump.js";

// 1 display pixel per dot (canvas scrolls horizontally if wider than paper area)
const DOT_PX     = 1;
const CANVAS_W   = 960;   // 80 chars × 12 dots each = 8" printable at 120 dpi
// The dot grid is anisotropic: 120 dpi across vs 72 dpi down. Painting 1:1 makes
// an 8×11" page look square. VSTRETCH scales every vertical coordinate to the
// true 8:11 page aspect — physically honest, since 9-pin rows (1/72") really do
// sit wider apart than columns (1/120").
const VSTRETCH   = 120 / 72;     // 5/3
const DOT_H_PX   = 2;            // painted height of one stretched wire dot
const PAGE_H_PX  = Math.round(792 * VSTRETCH); // 1320 — 66 lines @ 11", default form
const VDOT_INTERNAL = 480 / 72;  // internal vertical dot pitch (matches printers' dotH)
const HDOT_INTERNAL = 480 / 120; // internal horizontal dot pitch — the canvas is a
                                 // fixed 120-dpi raster, so map internal dots to it
                                 // at 480/120 = 4 regardless of the graphics density.
const PAPER_BG   = '#ffffff';
// Four ribbon bands plus the three overprint secondaries (ESC K 4-6). Orange,
// green and purple are what the real ribbon makes by laying two bands on the
// same dot.
const DOT_COLORS = {
  black:   '#1a1a1a',
  yellow:  '#ccaa00',
  magenta: '#c0268a',   // purplish-red band (Table 8-6), not pure red
  cyan:    '#0093b0',   // greenish-blue band, not pure blue
  orange:  '#e07a1f',   // yellow + magenta
  green:   '#2e9e3f',   // yellow + cyan
  purple:  '#7a3d97',   // magenta + cyan
};

// Ribbon bands as a bitmask. A single strike paints its colour at full strength
// (readable); when the head overstrikes a dot with a different band, the ink
// mixes subtractively — yellow+cyan = green, magenta+cyan = purple, etc. —
// exactly as the real four-band ribbon does on a LF-back-and-reprint. We model
// that by accumulating the bands struck at each dot, not by making ink
// translucent.
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

// Printer models that render dot-matrix to the canvas
const CANVAS_MODELS = new Set(['imagewriter-ii', 'imagewriter-i', 'epson-fx80']);

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
  }

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
          <select id="pr-page" class="pr-select" title="Form length (8&quot; printable width is fixed)"></select>
          <div class="pr-spacer"></div>
          <button id="pr-download-png" class="pr-btn" title="Export as PNG image">PNG</button>
          <button id="pr-download-pdf" class="pr-btn" title="Print / save as PDF">PDF</button>
        </div>
        <div class="pr-stage">
          <div class="pr-feed-bg" id="pr-feed-bg">
            <div class="pr-sheet">
              <div class="pr-strip pr-strip-left">
                <div class="pr-headmark" id="pr-headmark" title="Print head — drag to move the paper (snaps to line spacing)"></div>
              </div>
              <div class="pr-paper" id="pr-paper">
                <pre id="pr-output" class="pr-output"></pre>
                <div class="pr-canvas-wrap" id="pr-canvas-wrap">
                  <canvas id="pr-canvas" class="pr-canvas"></canvas>
                  <canvas id="pr-head" class="pr-head"></canvas>
                </div>
              </div>
              <div class="pr-strip"></div>
            </div>
          </div>
          <div class="pr-panel" id="pr-panel">
            <div class="pr-panel-tab" title="Operator panel">&#9776;</div>
            <div class="pr-panel-body">
              <button id="pr-fit" class="pr-pbtn" title="Toggle fit-to-width / actual size">Fit</button>
              <div class="pr-pdiv"></div>
              <button id="pr-set-tof" class="pr-pbtn" title="Reseat the head at the top of the first page">TOP</button>
              <button id="pr-form-feed" class="pr-pbtn" title="Form feed to next page top">FF</button>
              <button id="pr-lf-up" class="pr-pbtn" title="Line feed up (reverse one line)">LF&#9650;</button>
              <button id="pr-lf-down" class="pr-pbtn" title="Line feed down (advance one line)">LF&#9660;</button>
              <div class="pr-pdiv"></div>
              <button id="pr-autolf" class="pr-pbtn" title="DIP SW2-1 — Automatic Line Feed. ON: a CR feeds paper one line (plain text / Applesoft, which sends CR only). OFF: a CR returns the head without feeding, so colour graphics overprint passes register on the same band (DazzleDraw, Print Shop colour).">Auto LF</button>
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
      .pr-select    { padding: 2px 4px; font-size: 11px; border: 1px solid var(--border-default); border-radius: 3px; background: var(--badge-dim-bg); color: var(--text-secondary); font-family: 'Monaco', 'Menlo', monospace; cursor: pointer; }
      .pr-btn       { padding: 2px 8px; font-size: 11px; border: 1px solid var(--border-default); border-radius: 3px; background: var(--badge-dim-bg); color: var(--text-secondary); cursor: pointer; font-family: 'Monaco', 'Menlo', monospace; flex-shrink: 0; }
      .pr-btn:hover, .pr-select:hover { background: var(--input-bg-hover); color: var(--text-primary); }
      .pr-btn-dim   { color: var(--text-muted); }
      .pr-btn-fit-on { background: var(--accent-green-bg-stronger); color: var(--accent-green); border-color: var(--accent-green); }
      .pr-sep       { width: 1px; height: 16px; background: var(--border-default); margin: 0 2px; }
      .pr-spacer    { flex: 1; }
      .pr-label     { font-size: 11px; color: var(--text-muted); font-family: 'Monaco', 'Menlo', monospace; }
      .pr-toggle    { padding: 2px 8px; font-size: 11px; border: 1px solid var(--border-default); border-radius: 3px; cursor: pointer; font-family: 'Monaco', 'Menlo', monospace; flex-shrink: 0; }
      .pr-toggle-on  { background: var(--accent-green-bg-stronger); color: var(--accent-green); border-color: var(--accent-green); }
      .pr-toggle-off { background: var(--badge-dim-bg); color: var(--text-muted); }

      /* Stage holds the scrolling paper plus the slide-out operator panel. */
      .pr-stage   { flex: 1; position: relative; display: flex; min-height: 0; min-width: 0; overflow: hidden; }
      .pr-feed-bg { flex: 1; min-width: 0; overflow: auto; background: #444; padding: 12px 8px; }
      .pr-sheet   { display: flex; flex-direction: row; min-height: 100%; }

      /* Operator panel: by default parked off the right edge with a grab-tab
         poking out; hover (or focus-within) glides the button column in over the
         paper. Click the tab to PIN — the panel docks in-flow as a flex child so
         the paper shrinks to fit beside it; click again to unpin (auto-hide). */
      /* Collapsed = fully transparent; only the 18px tab column overlaps the
         paper as an invisible hover hotspot. Hover (or pin) slides the column in
         and paints the tab + body. */
      .pr-panel       { position: absolute; top: 0; right: 0; height: 100%; display: flex; flex-direction: row; align-items: stretch; transform: translateX(calc(100% - 18px)); transition: transform 0.18s ease; z-index: 5; }
      .pr-panel:hover, .pr-panel:focus-within { transform: translateX(0); }
      .pr-panel.pinned { position: relative; transform: none; }
      .pr-panel-tab   { width: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: transparent; color: transparent; border-left: 1px solid transparent; font-size: 13px; cursor: pointer; writing-mode: vertical-rl; transition: color 0.12s ease; }
      .pr-panel:hover .pr-panel-tab, .pr-panel:focus-within .pr-panel-tab, .pr-panel.pinned .pr-panel-tab { background: var(--bg-panel); border-left-color: var(--border-default); color: var(--text-muted); }
      .pr-panel:hover .pr-panel-tab:hover { color: var(--text-primary); }
      .pr-panel.pinned .pr-panel-tab { color: var(--accent-green); }
      .pr-panel-body  { width: 108px; display: flex; flex-direction: column; gap: 4px; padding: 8px 6px; background: var(--bg-panel); border-left: 1px solid var(--border-default); box-shadow: -4px 0 10px rgba(0,0,0,0.28); overflow-y: auto; }
      .pr-panel.pinned .pr-panel-body { box-shadow: none; }
      .pr-pbtn        { padding: 5px 6px; font-size: 11px; border: 1px solid var(--border-default); border-radius: 3px; background: var(--badge-dim-bg); color: var(--text-secondary); cursor: pointer; font-family: 'Monaco', 'Menlo', monospace; text-align: center; white-space: nowrap; }
      .pr-pbtn:hover  { background: var(--input-bg-hover); color: var(--text-primary); }
      .pr-pbtn-on     { background: var(--accent-green-bg-stronger); color: var(--accent-green); border-color: var(--accent-green); }
      .pr-pbtn-dim    { color: var(--text-muted); }
      .pr-pbtn.pr-holding { background: var(--accent-orange-bg-stronger, var(--input-bg-hover)); color: var(--accent-orange, var(--text-primary)); border-color: var(--accent-orange, var(--border-default)); transition: background 0.45s linear; }
      .pr-pdiv        { height: 1px; background: var(--border-default); margin: 2px 0; }

      .pr-strip {
        width: 22px;
        flex-shrink: 0;
        position: relative;
        background-color: #b8b8b8;
        background-image: radial-gradient(circle at center, #ffffff 5px, transparent 5px);
        background-size: 22px 22px;
        background-repeat: repeat-y;
        background-position: center 5px;
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

      .pr-paper { flex: 1; min-width: 0; background: ${PAPER_BG}; position: relative; overflow: auto; padding: 0; }

      .pr-paper::after {
        content: '';
        position: absolute;
        inset: 0;
        background-image: radial-gradient(circle, rgba(0,0,0,0.032) 0.8px, transparent 0.8px);
        background-size: 4px 4px;
        pointer-events: none;
      }

      .pr-output {
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

      .pr-canvas-wrap { position: relative; display: none; }
      .pr-canvas {
        display: block;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }
      .pr-head {
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
    const head   = el.querySelector("#pr-head");
    this.elements = {
      toolbar:     el.querySelector(".pr-toolbar"),
      output:      el.querySelector("#pr-output"),
      paper:       el.querySelector("#pr-paper"),
      canvasWrap:  el.querySelector("#pr-canvas-wrap"),
      canvas,
      ctx:         canvas.getContext("2d"),
      head,
      headCtx:     head.getContext("2d"),
      feedBg:      el.querySelector("#pr-feed-bg"),
      panel:       el.querySelector("#pr-panel"),
      panelTab:    el.querySelector(".pr-panel-tab"),
      model:       el.querySelector("#pr-model"),
      ribbon:      el.querySelector("#pr-ribbon"),
      page:        el.querySelector("#pr-page"),
      power:       el.querySelector("#pr-power"),
      downloadPng: el.querySelector("#pr-download-png"),
      downloadPdf: el.querySelector("#pr-download-pdf"),
      dump:        el.querySelector("#pr-dump"),
      clear:       el.querySelector("#pr-clear"),
      fit:         el.querySelector("#pr-fit"),
      lfUp:        el.querySelector("#pr-lf-up"),
      lfDown:      el.querySelector("#pr-lf-down"),
      setTof:      el.querySelector("#pr-set-tof"),
      formFeed:    el.querySelector("#pr-form-feed"),
      autolf:      el.querySelector("#pr-autolf"),
      headMark:    el.querySelector("#pr-headmark"),
    };
    this._initCanvas();
    this._applyFit();
  }

  // Canvas height of one page, derived from the active printer's form length
  // (page-size select / ESC H) — not a constant — so changing the form size
  // moves the perforations and resizes the sheet. Real ImageWriter II "page
  // size" is exactly this form length; paper width never changes.
  _pageHeightPx() {
    const p = this.printerManager.getActivePrinter();
    const formDots = p?.paper?.formDots || (480 * 11);
    return Math.max(40, Math.round(formDots / VDOT_INTERNAL * VSTRETCH));
  }

  _initCanvas() {
    const cv  = this.elements.canvas;
    cv.width  = CANVAS_W;
    // Start with the first sheet plus two blank feed pages ahead (display-only;
    // cropped from saved PNGs). _ensureCanvasHeight keeps the 2-page lead as
    // printing advances.
    cv.height = this._pageHeightPx() * 3;
    const ctx = this.elements.ctx;
    ctx.fillStyle = PAPER_BG;
    ctx.fillRect(0, 0, cv.width, cv.height);
    this._drawPageBreaks();
    // Keep the transparent head-overlay aligned to the paper canvas.
    const hc = this.elements.head;
    hc.width  = cv.width;
    hc.height = cv.height;
    this.elements.headCtx.clearRect(0, 0, hc.width, hc.height);
  }

  // Unscaled paper row (12 px/line) → canvas Y. Vertical-only scale to the true
  // 8:11 page aspect; the dot grid is 120 dpi across but 72 dpi down, so 1:1
  // would draw a square page. No offset — the head's own y carries any start
  // position, so the page keeps its exact dimensions.
  _yToCanvas(base) {
    return Math.round(base * VSTRETCH);
  }

  // Dashed horizontal perforation at every page boundary (fan-fold tractor
  // paper). Exact 66-line pitch. Drawn onto the canvas so it scrolls and
  // exports with the output.
  _drawPageBreaks() {
    const cv  = this.elements.canvas;
    const ctx = this.elements.ctx;
    const pageH = this._pageHeightPx();
    ctx.save();
    ctx.setLineDash([7, 5]);
    for (let y = pageH; y < cv.height; y += pageH) {
      const yy = Math.floor(y) + 0.5;
      // faint shadow band so the fold reads even on white
      ctx.fillStyle = "rgba(0,0,0,0.04)";
      ctx.fillRect(0, y - 3, cv.width, 6);
      ctx.strokeStyle = "rgba(0,0,0,0.32)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(cv.width, yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  _ensureCanvasHeight(neededPx) {
    const cv = this.elements.canvas;
    // Always keep two blank fan-fold pages visible past the last used page, so
    // the paper reads as continuous feed. These trailing pages are display-only
    // — _usedCanvas() crops them out of any saved PNG.
    const pageH = this._pageHeightPx();
    const newH  = Math.ceil(Math.max(1, neededPx) / pageH) * pageH + 2 * pageH;
    if (newH <= cv.height) return;
    const tmp  = document.createElement("canvas");
    tmp.width  = cv.width;
    tmp.height = cv.height;
    tmp.getContext("2d").drawImage(cv, 0, 0);
    cv.height = newH;
    const ctx = this.elements.ctx;
    ctx.fillStyle = PAPER_BG;
    ctx.fillRect(0, 0, cv.width, newH);
    ctx.drawImage(tmp, 0, 0);
    this._drawPageBreaks();
    // Grow the head overlay to match (transparent, no content to preserve).
    const hc = this.elements.head;
    hc.width  = cv.width;
    hc.height = newH;
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
      this.printerManager.getActivePrinter().setPageSize?.(el.page.value);
      // Form length changed → re-lay the sheet (clears paper, like reloading
      // stock of a different size).
      if (this._canvasMode) { this._initCanvas(); this._applyFit(); }
    });

    el.downloadPng.addEventListener("click", () => this._downloadPng());
    el.downloadPdf.addEventListener("click", () => this._downloadPdf());
    this._initDumpButton(el.dump);
    el.clear.addEventListener("click",       () => this._clear());
    el.fit.addEventListener("click",         () => this._toggleFit());
    el.lfUp.addEventListener("click",        () => this._panelFeed("up"));
    el.lfDown.addEventListener("click",      () => this._panelFeed("down"));
    el.setTof.addEventListener("click",      () => this._headToTop());
    el.formFeed.addEventListener("click",    () => this._panelFeed("ff"));
    el.autolf.addEventListener("click",      () => this.setAutoLineFeed(!this.printerManager.getAutoLineFeed()));
    el.power.addEventListener("click",       () => this.setPower(!this.printerManager.getPower()));
    el.panelTab.addEventListener("click",    () => this._togglePin());
    this._initHeadDrag();

    this._refreshAutoLF();
    this._refreshPower();
    this._applyPin();

    this.contentElement.addEventListener("keydown", (e) => e.stopPropagation());
    this.contentElement.addEventListener("keyup",   (e) => e.stopPropagation());

    const printer = this.printerManager.getActivePrinter();
    this._updateViewMode(printer);
    this._attachPrinterListeners(printer);

    this.printerManager.onPrinterChange((p) => {
      this._updateViewMode(p);
      this._attachPrinterListeners(p);
      this._refreshPageSizes();
    });

    // Collapse the toolbar as the window narrows so nothing clips off-screen:
    // page select drops first, then ribbon, then model — power + exports stay.
    this._resizeObs = new ResizeObserver(() => this._fitToolbar());
    this._resizeObs.observe(this.elements.toolbar);
    this._fitToolbar();

    // Keep the head on its real print row as the paper's display scale changes
    // (panel pin/resize, fit toggle, window resize all alter canvas clientHeight).
    this._headResizeObs = new ResizeObserver(() => {
      if (this._canvasMode && this._headCanvasY != null)
        this._updateHeadMarker(this._headCanvasY);
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

  // Populate the page-size select from the active model (models without
  // selectable forms, e.g. the Epson, hide the control).
  _refreshPageSizes() {
    const el = this.elements?.page;
    if (!el) return;
    const printer = this.printerManager.getActivePrinter();
    const sizes   = printer.constructor?.PAGE_SIZES ?? [];
    this._pageAvailable = sizes.length > 0;
    if (!sizes.length) { el.style.display = "none"; return; }
    el.style.display = "";
    el.innerHTML = sizes.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
    el.value = printer.getPageSize?.() ?? sizes[0].id;
    this._fitToolbar();
  }

  _updateViewMode(printer) {
    this._canvasMode = CANVAS_MODELS.has(printer.getId());
    if (this.elements) {
      this.elements.output.style.display     = this._canvasMode ? "none"  : "";
      this.elements.canvasWrap.style.display = this._canvasMode ? "block" : "none";
      if (!this._canvasMode && this.elements.headMark) this.elements.headMark.style.display = "none";
      this._refreshRibbonOptions(printer);
      this._applyFit();
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
    sel.value = this.printerManager.getRibbon();
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
    const cv  = this.elements.canvas;
    const hc  = this.elements.head;
    const btn = this.elements.fit;
    if (this._fitMode) {
      cv.style.width  = "100%"; cv.style.height = "auto";
      hc.style.width  = "100%"; hc.style.height = "auto";
    } else {
      cv.style.width  = "";  cv.style.height = "";  // natural CANVAS_W px
      hc.style.width  = "";  hc.style.height = "";
    }
    if (btn) {
      btn.textContent = this._fitMode ? "Fit" : "1:1";
      btn.className   = this._fitMode ? "pr-pbtn pr-pbtn-on" : "pr-pbtn";
    }
  }

  _attachPrinterListeners(printer) {
    printer.on("text",      (str)  => this._onText(str));
    printer.on("newline",   ()     => this._onNewline());
    printer.on("linefeed",  ()     => this._onLinefeed());
    printer.on("formfeed",  ()     => this._onFormFeed());
    printer.on("printChar", (data) => this._renderChar(data));
    printer.on("printDots", (data) => this._renderDots(data));
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

  // Paint one ink dot, mixing with whatever bands already struck this exact
  // pixel. Black (and B/W ribbon) paints straight through with no bookkeeping;
  // a coloured dot accumulates its ribbon band(s) at the pixel and repaints the
  // resolved colour, so a second colour overstruck on the same dot subtracts to
  // the real secondary instead of just covering it.
  _inkDot(ctx, px, py, w, h, color) {
    if (!color || color === 'black') {
      ctx.fillStyle = DOT_COLORS.black;
      ctx.fillRect(px, py, w, h);
      return;
    }
    if (!this._ink) this._ink = new Map();
    if (this._ink.size > 80000) this._ink.clear();   // bound memory on long runs
    const key  = px + ',' + py;
    const mask = (this._ink.get(key) || 0) | (COLOR_BANDS[color] ?? BAND.K);
    this._ink.set(key, mask);
    ctx.fillStyle = mixInk(mask);
    ctx.fillRect(px, py, w, h);
  }

  _renderChar({ cols, xDot, yDot, dotW, dotH, color, bold, underline, halfHeight, script, doubleWidth }) {
    if (!cols || !this.elements?.ctx) return;
    const ctx   = this.elements.ctx;
    const cx    = Math.round(xDot / dotW) * DOT_PX;
    const cy    = this._yToCanvas(Math.round(yDot / dotH) * DOT_PX);
    const nRows = 9;
    const glyphH = Math.round(nRows * VSTRETCH);

    // Double-width (CTRL-N): each dot column is twice as wide and twice as far
    // apart. Half-height / super- / subscript (ESC w, ESC x/y) squeeze the glyph
    // to half its vertical extent; superscript rides the top half of the line,
    // subscript and plain half-height ride the bottom half.
    const xs     = doubleWidth ? 2 : 1;
    const half   = halfHeight || (script && script !== 'none');
    const vScale = half ? 0.5 : 1;
    const yOff   = (half && script !== 'super') ? Math.round(nRows * VSTRETCH * 0.5) : 0;
    const dotHpx = half ? Math.max(1, Math.round(DOT_H_PX * 0.5)) : DOT_H_PX;
    const rowY   = r => cy + yOff + Math.round(r * VSTRETCH * vScale);

    this._ensureCanvasHeight(cy + glyphH + DOT_PX);

    const paint = (shift) => {
      for (let c = 0; c < cols.length; c++) {
        const colVal = cols[c];
        if (!colVal) continue;
        const px = cx + (c * xs + shift) * DOT_PX;
        for (let r = 0; r < nRows; r++) {
          if (colVal & (1 << r)) this._inkDot(ctx, px, rowY(r), DOT_PX * xs, dotHpx, color);
        }
      }
    };

    paint(0);
    if (bold) paint(1);            // double-strike, offset one canvas-dot right

    if (underline) {
      // Wire 9 (row index 8) is the underline wire — full glyph cell width
      ctx.fillStyle = DOT_COLORS[color] ?? DOT_COLORS.black;
      ctx.fillRect(cx, cy + Math.round(8 * VSTRETCH), cols.length * xs * DOT_PX, DOT_H_PX);
    }

    this._markHead(cx, cy, (cols.length || 6) * xs * DOT_PX, glyphH);
    this._updateHeadMarker(cy + glyphH / 2);
    this._followHead(cy + glyphH / 2);
  }

  _renderDots({ byte: colByte, xDot, yDot, dotW, dotH, color }) {
    if (!this.elements?.ctx) return;
    const ctx = this.elements.ctx;
    // Map the printer's internal dot grid (480/inch) onto the canvas the SAME
    // way text does: horizontally ÷(480/120) and vertically ÷(480/72)×VSTRETCH,
    // a fixed 120-dpi raster. The graphics density (dotW/dotH) only governs how
    // far the cursor steps per emitted dot — it must NOT change the canvas px
    // scale. So a 560-dot 72-dpi screen dump spans 560/72 = 7.78" and fills the
    // page width, exactly like a real ImageWriter, rather than 1px-per-dot
    // (which collapsed every density to the same too-small size). Each dot's
    // canvas footprint is its physical pitch, so neighbouring dots butt/overlap
    // into solid ink with no gaps.
    const px      = Math.round(xDot / HDOT_INTERNAL) * DOT_PX;
    const py      = this._yToCanvas(yDot / VDOT_INTERNAL);
    const rowStep = (dotH / VDOT_INTERNAL) * VSTRETCH;                 // canvas px between data rows
    const dW      = Math.max(DOT_PX, Math.round((dotW / HDOT_INTERNAL) * DOT_PX));
    const dH      = Math.max(DOT_H_PX, Math.round(rowStep) + 1);
    const glyphH  = Math.round(8 * rowStep);

    this._ensureCanvasHeight(py + glyphH + dH);

    for (let r = 0; r < 8; r++) {
      if (colByte & (1 << r)) this._inkDot(ctx, px, py + Math.round(r * rowStep), dW, dH, color);
    }

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
    const scale = cv.height ? cv.clientHeight / cv.height : 1;
    m.style.top = Math.round(canvasY * scale) + "px";
    m.style.display = "block";
  }

  // Make the gutter print-head bug draggable. The head can only rest on whole
  // line-feed boundaries, so the drag snaps to the active printer's current
  // line spacing (6 lpi / 8 lpi / ESC T n/144"): the bug jumps row-by-row.
  _initHeadDrag() {
    const m = this.elements?.headMark;
    if (!m) return;
    let dragging = false, startMouseY = 0, startYDot = 0, dotsPerLine = 80;

    const onMove = (e) => {
      if (!dragging) return;
      const cv    = this.elements.canvas;
      const scale = cv.height ? cv.clientHeight / cv.height : 1;
      // displayed gutter px → canvas px → base px → internal dot units
      const baseDelta = (e.clientY - startMouseY) / (scale || 1) / VSTRETCH;
      const dotDelta  = baseDelta * VDOT_INTERNAL;
      const lines     = Math.round(dotDelta / dotsPerLine);   // snap to whole LFs
      const newYDot   = Math.max(0, startYDot + lines * dotsPerLine);
      const p = this.printerManager.getActivePrinter();
      if (p) p._yDot = newYDot;
      const cy = this._yToCanvas(Math.round(newYDot / VDOT_INTERNAL) * DOT_PX);
      this._ensureCanvasHeight(cy + Math.round(12 * VSTRETCH));
      this._updateHeadMarker(cy);
    };

    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
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
      startMouseY = e.clientY;
      startYDot   = p ? (p._yDot | 0) : 0;
      dotsPerLine = (p && p._lineFeedDots) ? p._lineFeedDots() : 80;
      m.classList.add("dragging");
      try { m.setPointerCapture(e.pointerId); } catch (_) {}
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
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
    const scale = cv.height ? cv.clientHeight / cv.height : 1;
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
      const cy = this._yToCanvas(Math.round((p._yDot | 0) / VDOT_INTERNAL) * DOT_PX);
      this._ensureCanvasHeight(cy + Math.round(12 * VSTRETCH));
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

  // DIP SW2-1 Automatic Line Feed. On: CR feeds paper (plain text). Off: CR
  // returns the head without feeding, so colour graphics overprint passes
  // register on the same band (DazzleDraw, Print Shop colour).
  setAutoLineFeed(on) {
    const state = this.printerManager.setAutoLineFeed(on);
    this._refreshAutoLF();
    return state;
  }

  getAutoLineFeed() { return this.printerManager.getAutoLineFeed(); }

  _refreshAutoLF() {
    const el = this.elements?.autolf;
    if (!el) return;
    const on = this.printerManager.getAutoLineFeed();
    el.className   = on ? "pr-pbtn pr-pbtn-on" : "pr-pbtn";
    el.textContent = on ? "Auto LF ▣" : "Auto LF □";
  }

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
  // Dump Screen button: a normal click auto-picks polarity by lit density; a
  // long hold (>= 500 ms) forces the inverted "white is black" dump.
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
    const printer = this.printerManager.getActivePrinter();
    const id = printer.getId();
    if (id !== "imagewriter-ii" && id !== "imagewriter-i") {
      return { success: false, message: `Screen dump needs an ImageWriter model (active: ${id})` };
    }
    const pixels = fb || window.emulator?._lastFramebuffer;
    if (!pixels) return { success: false, message: "No framebuffer available — is the emulator running?" };

    // Colour ribbon → a dithered colour dump (one overprint pass per ribbon
    // band); B/W ribbon → the 1-bit threshold dump. The colour dump returns the
    // head between passes with bare CRs, so Auto-LF must be off while it feeds
    // (otherwise each CR would also advance the paper and the bands would smear).
    const colour = this.printerManager.getRibbon() === "color";
    let bytes;
    if (colour) {
      // opts.invert (set by a long-hold on Dump Screen) forces the greyscale
      // polarity; omitted, the dump auto-picks by lit density.
      bytes = buildScreenDumpColor(pixels, width, height, { invert: opts.invert });
      const prevAutoLF = printer._autoLF;
      printer._autoLF = false;
      this.printerManager.feedBytes(bytes);   // parsed synchronously
      printer._autoLF = prevAutoLF;           // restore the DIP
    } else {
      bytes = buildScreenDump(pixels, width, height, opts);
      this.printerManager.feedBytes(bytes);
    }
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
    const bottom = this._yToCanvas(Math.round(yDot / VDOT_INTERNAL)) + Math.round(9 * VSTRETCH);
    return Math.max(1, Math.ceil(bottom / pageH));
  }

  // The paper canvas cropped to just the used pages — drops the trailing blank
  // feed pages so they never land in a saved/captured PNG.
  _usedCanvas() {
    const cv = this.elements?.canvas;
    if (!cv) return cv;
    const pageH = this._pageHeightPx();
    const usedH = this._usedPageCount(pageH) * pageH;
    if (usedH >= cv.height) return cv;
    const out = document.createElement("canvas");
    out.width  = cv.width;
    out.height = usedH;
    const o = out.getContext("2d");
    o.fillStyle = PAPER_BG;
    o.fillRect(0, 0, out.width, usedH);
    o.drawImage(cv, 0, 0);
    return out;
  }

  // Slice the paper into one PNG per page + a full-strip PNG, zip, and download.
  async _exportPagesZip(cv, pageH, pages) {
    const pad   = (n) => String(n).padStart(2, "0");
    const files = [];
    for (let i = 0; i < pages; i++) {
      const slice = document.createElement("canvas");
      slice.width  = cv.width;
      slice.height = pageH;
      const sctx = slice.getContext("2d");
      sctx.fillStyle = PAPER_BG;
      sctx.fillRect(0, 0, slice.width, pageH);
      sctx.drawImage(cv, 0, -i * pageH);   // copy this page's band
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

  // Print HTML through a throwaway hidden iframe instead of a popup tab (no
  // visible window, and popup blockers never fire). The iframe holds a whole
  // document — and, for the dot-matrix path, a base64 PNG per page — so it MUST
  // be torn down or it leaks. onafterprint removes it when the dialog closes;
  // a fallback timer covers browsers that never fire it, and the `done` guard
  // makes cleanup idempotent regardless of which path wins the race.
  _printViaIframe(html) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    // Off-screen but at a real rendered size: a 0x0 or visibility:hidden frame
    // prints blank in some engines. `srcdoc` (vs document.write) fires a proper
    // load event AFTER the page images decode, so the dot-matrix preview isn't
    // captured blank.
    frame.style.cssText =
      "position:fixed;left:-10000px;top:0;width:8.5in;height:11in;border:0;";
    frame.srcdoc = html;
    document.body.appendChild(frame);

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      frame.remove();            // detach node → its doc + PNG data URLs become GC-able
    };

    frame.addEventListener("load", () => {
      const fwin = frame.contentWindow;
      fwin.onafterprint = cleanup;                // primary: print dialog dismissed
      try { fwin.focus(); fwin.print(); }
      catch (_) { cleanup(); return; }            // print threw → don't leak the frame
      setTimeout(cleanup, 60000);                 // fallback if onafterprint never fires
    }, { once: true });
  }

  // Dot-matrix PDF: one full-bleed page image per used page, perforation-free,
  // at the printer's true dimensions. The canvas is a 120-dpi raster both axes
  // (960px = 8" across; pageH px = formInches × 120 down), so canvas px ÷ 120 =
  // inches. Printing the page image full-bleed onto a page of that exact size
  // reproduces the printer's aspect; any upscale by the print pipeline keeps it
  // since the image and the @page share one aspect.
  _downloadPdfCanvas() {
    const pageH = this._pageHeightPx();
    const pages = this._usedPageCount(pageH);
    const clean = this._cleanUsedCanvas();      // used pages, perforations erased
    if (!clean) return;
    const wIn = clean.width / 120;              // 960 / 120 = 8in
    const hIn = pageH / 120;                    // form length in inches

    const imgs = [];
    for (let i = 0; i < pages; i++) {
      const slice = document.createElement("canvas");
      slice.width  = clean.width;
      slice.height = pageH;
      const s = slice.getContext("2d");
      s.fillStyle = PAPER_BG;
      s.fillRect(0, 0, slice.width, pageH);
      s.drawImage(clean, 0, -i * pageH);        // this page's band
      imgs.push(slice.toDataURL("image/png"));
    }

    const body = imgs.map((src) => `<img class="page" src="${src}"/>`).join("");
    this._printViaIframe(
      `<!DOCTYPE html><html><head><title>Printer Output</title><style>` +
      `@page { size: ${wIn}in ${hIn}in; margin: 0; }` +
      `html,body { margin:0; padding:0; background:#fff; }` +
      // full bleed: image fills the whole page, one page per image
      `img.page { display:block; width:${wIn}in; height:${hIn}in; page-break-after: always; }` +
      `img.page:last-child { page-break-after: auto; }` +
      `</style></head><body>${body}</body></html>`
    );
  }

  // A perforation-free copy of the used pages for clean full-bleed output. The
  // page-break marks are painted onto the live canvas at each boundary; here we
  // copy and overpaint a thin paper band over every interior boundary (the page
  // break always falls in the blank inter-page gap, so no ink is lost).
  _cleanUsedCanvas() {
    const used = this._usedCanvas();
    if (!used) return used;
    const out = document.createElement("canvas");
    out.width  = used.width;
    out.height = used.height;
    const o = out.getContext("2d");
    o.drawImage(used, 0, 0);
    const pageH = this._pageHeightPx();
    o.fillStyle = PAPER_BG;
    for (let y = pageH; y < out.height; y += pageH) o.fillRect(0, y - 4, out.width, 8);
    return out;
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
