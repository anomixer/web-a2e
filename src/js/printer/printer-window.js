/*
 * printer-window.js - Printer output window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { BaseWindow } from "../windows/base-window.js";
import { PRINTER_MODELS, RIBBONS } from "./printer-manager.js";

// 1 display pixel per dot (canvas scrolls horizontally if wider than paper area)
const DOT_PX     = 1;
const CANVAS_W   = 960;   // 80 chars × 12 dots each = 8" printable at 120 dpi
// The dot grid is anisotropic: 120 dpi across vs 72 dpi down. Painting 1:1 makes
// an 8×11" page look square. VSTRETCH scales every vertical coordinate to the
// true 8:11 page aspect — physically honest, since 9-pin rows (1/72") really do
// sit wider apart than columns (1/120").
const VSTRETCH   = 120 / 72;     // 5/3
const DOT_H_PX   = 2;            // painted height of one stretched wire dot
const PAGE_H_PX  = Math.round(792 * VSTRETCH); // 1320 — 66 lines, stretched
const VDOT_INTERNAL = 480 / 72;  // internal vertical dot pitch (matches printers' dotH)
const PAPER_BG   = '#ffffff';
const DOT_COLORS = { black: '#1a1a1a', red: '#cc2222', blue: '#1a44cc', yellow: '#ccaa00' };

// Printer models that render dot-matrix to the canvas
const CANVAS_MODELS = new Set(['imagewriter-ii', 'imagewriter-i', 'epson-fx80']);

export class PrinterWindow extends BaseWindow {
  constructor(printerManager) {
    super({
      id: "printer-output",
      title: "Printer",
      minWidth: 420,
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
  }

  _loadFitMode() {
    try { return localStorage.getItem("a2e-printer-fit") !== "false"; }
    catch (e) { return true; }
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
          <select id="pr-model" class="pr-select" title="Printer model">
            ${modelOptions}
          </select>
          <select id="pr-ribbon" class="pr-select" title="Ribbon cartridge">
            ${ribbonOptions}
          </select>
          <div class="pr-sep"></div>
          <button id="pr-download-txt" class="pr-btn" title="Download as plain text">TXT</button>
          <button id="pr-download-png" class="pr-btn" title="Export as PNG image">PNG</button>
          <button id="pr-download-pdf" class="pr-btn" title="Print / save as PDF">PDF</button>
          <div class="pr-sep"></div>
          <button id="pr-clear" class="pr-btn pr-btn-dim" title="Clear output">Clear</button>
          <div class="pr-sep"></div>
          <button id="pr-fit" class="pr-btn" title="Toggle fit-to-width / actual size">Fit</button>
          <div class="pr-sep"></div>
          <button id="pr-lf-up" class="pr-btn" title="Line feed up (reverse one line)">LF&#9650;</button>
          <button id="pr-lf-down" class="pr-btn" title="Line feed down (advance one line)">LF&#9660;</button>
          <button id="pr-set-tof" class="pr-btn" title="Set the current position as top of form">Set TOF</button>
          <button id="pr-form-feed" class="pr-btn" title="Form feed to next page top">FF</button>
          <div class="pr-spacer"></div>
          <span class="pr-label">Online</span>
          <button id="pr-online" class="pr-toggle pr-toggle-on" title="Toggle printer online state">●</button>
        </div>
        <div class="pr-feed-bg" id="pr-feed-bg">
          <div class="pr-sheet">
            <div class="pr-strip"></div>
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
      </div>
      ${this._renderStyles()}
    `;
  }

  _renderStyles() {
    return `<style>
      .pr-root      { display: flex; flex-direction: column; height: 100%; }
      .pr-toolbar   { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--input-bg-dark); border-bottom: 1px solid var(--border-default); flex-shrink: 0; }
      .pr-select    { padding: 2px 4px; font-size: 11px; border: 1px solid var(--border-default); border-radius: 3px; background: var(--badge-dim-bg); color: var(--text-secondary); font-family: 'Monaco', 'Menlo', monospace; cursor: pointer; }
      .pr-btn       { padding: 2px 8px; font-size: 11px; border: 1px solid var(--border-default); border-radius: 3px; background: var(--badge-dim-bg); color: var(--text-secondary); cursor: pointer; font-family: 'Monaco', 'Menlo', monospace; }
      .pr-btn:hover, .pr-select:hover { background: var(--input-bg-hover); color: var(--text-primary); }
      .pr-btn-dim   { color: var(--text-muted); }
      .pr-btn-fit-on { background: var(--accent-green-bg-stronger); color: var(--accent-green); border-color: var(--accent-green); }
      .pr-sep       { width: 1px; height: 16px; background: var(--border-default); margin: 0 2px; }
      .pr-spacer    { flex: 1; }
      .pr-label     { font-size: 11px; color: var(--text-muted); font-family: 'Monaco', 'Menlo', monospace; }
      .pr-toggle    { padding: 2px 8px; font-size: 11px; border: 1px solid var(--border-default); border-radius: 3px; cursor: pointer; font-family: 'Monaco', 'Menlo', monospace; }
      .pr-toggle-on  { background: var(--accent-green-bg-stronger); color: var(--accent-green); border-color: var(--accent-green); }
      .pr-toggle-off { background: var(--badge-dim-bg); color: var(--text-muted); }

      .pr-feed-bg { flex: 1; overflow-y: auto; background: #444; padding: 12px 8px; }
      .pr-sheet   { display: flex; flex-direction: row; min-height: 100%; }

      .pr-strip {
        width: 22px;
        flex-shrink: 0;
        background-color: #b8b8b8;
        background-image: radial-gradient(circle at center, #ffffff 5px, transparent 5px);
        background-size: 22px 22px;
        background-repeat: repeat-y;
        background-position: center 5px;
      }

      .pr-paper { flex: 1; background: ${PAPER_BG}; position: relative; overflow: auto; padding: 0; }

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
      output:      el.querySelector("#pr-output"),
      paper:       el.querySelector("#pr-paper"),
      canvasWrap:  el.querySelector("#pr-canvas-wrap"),
      canvas,
      ctx:         canvas.getContext("2d"),
      head,
      headCtx:     head.getContext("2d"),
      feedBg:      el.querySelector("#pr-feed-bg"),
      model:       el.querySelector("#pr-model"),
      ribbon:      el.querySelector("#pr-ribbon"),
      downloadTxt: el.querySelector("#pr-download-txt"),
      downloadPng: el.querySelector("#pr-download-png"),
      downloadPdf: el.querySelector("#pr-download-pdf"),
      clear:       el.querySelector("#pr-clear"),
      fit:         el.querySelector("#pr-fit"),
      lfUp:        el.querySelector("#pr-lf-up"),
      lfDown:      el.querySelector("#pr-lf-down"),
      setTof:      el.querySelector("#pr-set-tof"),
      formFeed:    el.querySelector("#pr-form-feed"),
      online:      el.querySelector("#pr-online"),
    };
    this._initCanvas();
    this._applyFit();
  }

  _initCanvas() {
    const cv  = this.elements.canvas;
    cv.width  = CANVAS_W;
    cv.height = PAGE_H_PX * 2;
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
    ctx.save();
    ctx.setLineDash([7, 5]);
    for (let y = PAGE_H_PX; y < cv.height; y += PAGE_H_PX) {
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
    if (neededPx <= cv.height) return;
    const newH = neededPx + PAGE_H_PX;
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

    el.model.addEventListener("change", () => {
      const modelDef = PRINTER_MODELS.find((m) => m.id === el.model.value);
      if (modelDef) this.printerManager.setActivePrinter(modelDef.create());
    });

    el.ribbon.addEventListener("change", () => {
      this.printerManager.setRibbon(el.ribbon.value);
    });

    el.downloadTxt.addEventListener("click", () => this._downloadTxt());
    el.downloadPng.addEventListener("click", () => this._downloadPng());
    el.downloadPdf.addEventListener("click", () => this._downloadPdf());
    el.clear.addEventListener("click",       () => this._clear());
    el.fit.addEventListener("click",         () => this._toggleFit());
    el.lfUp.addEventListener("click",        () => this._panelFeed("up"));
    el.lfDown.addEventListener("click",      () => this._panelFeed("down"));
    el.setTof.addEventListener("click",      () => this.printerManager.getActivePrinter().setTopOfForm());
    el.formFeed.addEventListener("click",    () => this._panelFeed("ff"));
    el.online.addEventListener("click",      () => this._toggleOnline());

    this.contentElement.addEventListener("keydown", (e) => e.stopPropagation());
    this.contentElement.addEventListener("keyup",   (e) => e.stopPropagation());

    const printer = this.printerManager.getActivePrinter();
    this._updateViewMode(printer);
    this._attachPrinterListeners(printer);

    this.printerManager.onPrinterChange((p) => {
      this._updateViewMode(p);
      this._attachPrinterListeners(p);
    });
  }

  _updateViewMode(printer) {
    this._canvasMode = CANVAS_MODELS.has(printer.getId());
    if (this.elements) {
      this.elements.output.style.display     = this._canvasMode ? "none"  : "";
      this.elements.canvasWrap.style.display = this._canvasMode ? "block" : "none";
      this._applyFit();
    }
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
      btn.className   = this._fitMode ? "pr-btn pr-btn-fit-on" : "pr-btn";
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
    ctx.fillStyle = DOT_COLORS[color] ?? DOT_COLORS.black;

    const paint = (shift) => {
      for (let c = 0; c < cols.length; c++) {
        const colVal = cols[c];
        if (!colVal) continue;
        const px = cx + (c * xs + shift) * DOT_PX;
        for (let r = 0; r < nRows; r++) {
          if (colVal & (1 << r)) ctx.fillRect(px, rowY(r), DOT_PX * xs, dotHpx);
        }
      }
    };

    paint(0);
    if (bold) paint(1);            // double-strike, offset one canvas-dot right

    if (underline) {
      // Wire 9 (row index 8) is the underline wire — full glyph cell width
      ctx.fillRect(cx, cy + Math.round(8 * VSTRETCH), cols.length * xs * DOT_PX, DOT_H_PX);
    }

    this._markHead(cx, cy, (cols.length || 6) * xs * DOT_PX, glyphH);
    this._scrollToBottom(cy + glyphH);
  }

  _renderDots({ byte: colByte, xDot, yDot, dotW, dotH, color }) {
    if (!this.elements?.ctx) return;
    const ctx = this.elements.ctx;
    const px  = Math.round(xDot / dotW) * DOT_PX;
    const py  = this._yToCanvas(Math.round(yDot / dotH) * DOT_PX);
    const dW  = DOT_PX;
    const glyphH = Math.round(9 * VSTRETCH);

    this._ensureCanvasHeight(py + glyphH + DOT_PX);
    ctx.fillStyle = DOT_COLORS[color] ?? DOT_COLORS.black;

    for (let r = 0; r < 9; r++) {
      if (colByte & (1 << r)) ctx.fillRect(px, py + Math.round(r * VSTRETCH), dW, DOT_H_PX);
    }

    this._markHead(px, py, Math.max(2, dW), glyphH);
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
    const HOLD = 80, FADE_EVERY = 10, FADE_STEP = 0.08;
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

  _scrollToBottom(py) {
    if (!this.elements) return;
    const feedBg = this.elements.feedBg;
    const absY   = this.elements.paper.offsetTop + 16 + py;
    if (absY > feedBg.scrollTop + feedBg.clientHeight - 40)
      feedBg.scrollTop = absY - feedBg.clientHeight + 60;
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
      this._scrollToBottom(cy);
    }
  }

  // ===== Lifecycle =====

  async update() {
    if (!this.elements) return;
    await this.printerManager.init();
  }

  // ===== Toolbar =====

  _toggleOnline() {
    this.online = !this.online;
    if (this.elements.online) {
      this.elements.online.className = this.online
        ? "pr-toggle pr-toggle-on"
        : "pr-toggle pr-toggle-off";
    }
  }

  _clear() {
    this.text = "";
    this.printerManager.getActivePrinter().reset();
    this._heads = [];
    if (this._headRAF) { cancelAnimationFrame(this._headRAF); this._headRAF = null; }
    if (this.elements) {
      this.elements.output.textContent = "";
      this._initCanvas();
    }
  }

  _downloadTxt() {
    const blob = new Blob([this.text], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "printer.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  _downloadPng() {
    if (this._canvasMode) {
      this.elements.canvas.toBlob((blob) => {
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = "printer.png";
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
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
    canvas.toBlob((blob) => {
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "printer.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  _downloadPdf() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html>` +
      `<html><head><title>Printer Output</title>` +
      `<style>` +
      `body { margin: 0.75in; font-family: 'Courier New', monospace; font-size: 12pt; color: #1a1a1a; }` +
      `pre  { white-space: pre-wrap; word-break: break-all; }` +
      `@media print { @page { margin: 0.75in; } }` +
      `</style></head>` +
      `<body><pre>${this._escapeHtml(this.text)}</pre></body></html>`
    );
    win.document.close();
    win.focus();
    win.print();
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
