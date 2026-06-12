/*
 * printer-window.js - Printer output window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { BaseWindow } from "../windows/base-window.js";
import { PRINTER_MODELS } from "./printer-manager.js";

// 1 display pixel per dot (canvas scrolls horizontally if wider than paper area)
const DOT_PX     = 1;
const CANVAS_W   = 960;   // 80 chars × 12 dots each
const PAGE_H_PX  = 792;   // ~66 lines × 12 dot-rows (1 page)
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
  }

  renderContent() {
    const modelOptions = PRINTER_MODELS.map((m) =>
      `<option value="${m.id}">${m.name}</option>`
    ).join("");

    return `
      <div class="pr-root">
        <div class="pr-toolbar">
          <select id="pr-model" class="pr-select" title="Printer model">
            ${modelOptions}
          </select>
          <div class="pr-sep"></div>
          <button id="pr-download-txt" class="pr-btn" title="Download as plain text">TXT</button>
          <button id="pr-download-png" class="pr-btn" title="Export as PNG image">PNG</button>
          <button id="pr-download-pdf" class="pr-btn" title="Print / save as PDF">PDF</button>
          <div class="pr-sep"></div>
          <button id="pr-clear" class="pr-btn pr-btn-dim" title="Clear output">Clear</button>
          <div class="pr-spacer"></div>
          <span class="pr-label">Online</span>
          <button id="pr-online" class="pr-toggle pr-toggle-on" title="Toggle printer online state">●</button>
        </div>
        <div class="pr-feed-bg" id="pr-feed-bg">
          <div class="pr-sheet">
            <div class="pr-strip"></div>
            <div class="pr-paper" id="pr-paper">
              <pre id="pr-output" class="pr-output"></pre>
              <canvas id="pr-canvas" class="pr-canvas"></canvas>
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

      .pr-paper { flex: 1; background: ${PAPER_BG}; position: relative; overflow: auto; padding: 16px 20px; }

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

      .pr-canvas {
        display: none;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }
    </style>`;
  }

  _cacheElements() {
    const el     = this.contentElement;
    const canvas = el.querySelector("#pr-canvas");
    this.elements = {
      output:      el.querySelector("#pr-output"),
      paper:       el.querySelector("#pr-paper"),
      canvas,
      ctx:         canvas.getContext("2d"),
      feedBg:      el.querySelector("#pr-feed-bg"),
      model:       el.querySelector("#pr-model"),
      downloadTxt: el.querySelector("#pr-download-txt"),
      downloadPng: el.querySelector("#pr-download-png"),
      downloadPdf: el.querySelector("#pr-download-pdf"),
      clear:       el.querySelector("#pr-clear"),
      online:      el.querySelector("#pr-online"),
    };
    this._initCanvas();
  }

  _initCanvas() {
    const cv  = this.elements.canvas;
    cv.width  = CANVAS_W;
    cv.height = PAGE_H_PX * 2;
    const ctx = this.elements.ctx;
    ctx.fillStyle = PAPER_BG;
    ctx.fillRect(0, 0, cv.width, cv.height);
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
  }

  setupContentEventListeners() {
    this._cacheElements();
    const el = this.elements;

    el.model.addEventListener("change", () => {
      const modelDef = PRINTER_MODELS.find((m) => m.id === el.model.value);
      if (modelDef) this.printerManager.setActivePrinter(modelDef.create());
    });

    el.downloadTxt.addEventListener("click", () => this._downloadTxt());
    el.downloadPng.addEventListener("click", () => this._downloadPng());
    el.downloadPdf.addEventListener("click", () => this._downloadPdf());
    el.clear.addEventListener("click",       () => this._clear());
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
      this.elements.output.style.display = this._canvasMode ? "none"  : "";
      this.elements.canvas.style.display = this._canvasMode ? "block" : "none";
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

  _renderChar({ cols, xDot, yDot, dotW, dotH, color, bold, underline }) {
    if (!cols || !this.elements?.ctx) return;
    const ctx   = this.elements.ctx;
    const cx    = Math.round(xDot / dotW) * DOT_PX;
    const cy    = Math.round(yDot / dotH) * DOT_PX;
    const nRows = 9;

    this._ensureCanvasHeight(cy + nRows * DOT_PX + DOT_PX);
    ctx.fillStyle = DOT_COLORS[color] ?? DOT_COLORS.black;

    for (let c = 0; c < cols.length; c++) {
      const colVal = cols[c];
      if (!colVal) continue;
      const px = cx + c * DOT_PX;
      for (let r = 0; r < nRows; r++) {
        if (colVal & (1 << r)) ctx.fillRect(px, cy + r * DOT_PX, DOT_PX, DOT_PX);
      }
    }

    if (bold) {
      for (let c = 0; c < cols.length; c++) {
        const colVal = cols[c];
        if (!colVal) continue;
        const px = cx + (c + 1) * DOT_PX;
        for (let r = 0; r < nRows; r++) {
          if (colVal & (1 << r)) ctx.fillRect(px, cy + r * DOT_PX, DOT_PX, DOT_PX);
        }
      }
    }

    if (underline) {
      // Wire 9 (row index 8) is the underline wire
      ctx.fillRect(cx, cy + 8 * DOT_PX, cols.length * DOT_PX, DOT_PX);
    }

    this._scrollToBottom(cy + nRows * DOT_PX);
  }

  _renderDots({ byte: colByte, xDot, yDot, dotW, dotH, color }) {
    if (!this.elements?.ctx) return;
    const ctx = this.elements.ctx;
    const px  = Math.round(xDot / dotW) * DOT_PX;
    const py  = Math.round(yDot / dotH) * DOT_PX;
    const dW  = DOT_PX;
    const dH  = DOT_PX;

    this._ensureCanvasHeight(py + 9 * dH + dH);
    ctx.fillStyle = DOT_COLORS[color] ?? DOT_COLORS.black;

    for (let r = 0; r < 9; r++) {
      if (colByte & (1 << r)) ctx.fillRect(px, py + r * dH, dW, dH);
    }
  }

  _scrollToBottom(py) {
    if (!this.elements) return;
    const feedBg = this.elements.feedBg;
    const absY   = this.elements.paper.offsetTop + 16 + py;
    if (absY > feedBg.scrollTop + feedBg.clientHeight - 40)
      feedBg.scrollTop = absY - feedBg.clientHeight + 60;
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
