/*
 * printer-manager.js - Manages active printer model and WASM byte routing
 *
 * The active printer models the head mechanically and emits timed events
 * (each carrying how long the head/paper motion before it took). This manager
 * is the wall clock: it receives those events and releases them at real printer
 * speed, firing sound at the moment of each strike. It no longer guesses timing
 * from byte counts — all motion timing comes from the head model.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { ImageWriterII } from "./imagewriter-ii.js";
import { ImageWriterI }  from "./imagewriter-i.js";
import { EpsonFX80 }     from "./epson-fx80.js";
import { PrinterSound }  from "./printer-sound.js";

export const PRINTER_MODELS = [
  { id: "imagewriter-ii", name: "ImageWriter II", create: () => new ImageWriterII() },
  { id: "imagewriter-i",  name: "ImageWriter I",  create: () => new ImageWriterI() },
  { id: "epson-fx80",     name: "Epson FX-80",    create: () => new EpsonFX80() },
];

export const RIBBONS = [
  { id: "bw",    name: "B/W Ribbon" },
  { id: "color", name: "Color Ribbon" },
];

const now = () => (typeof performance !== "undefined" ? performance.now() : 0);

export class PrinterManager {
  constructor(wasmProxy, getSharedAudioContext = null) {
    this.wasmProxy          = wasmProxy;
    this.sound              = new PrinterSound(getSharedAudioContext);
    this._callbackInstalled = false;
    this._onPrinterChange   = null;

    // Installed ribbon cartridge (applies to whichever model is active).
    this._ribbon = this._loadRibbon();

    // Wall-clock scheduler. The head model emits timed events in bursts (a whole
    // line at once); we spread them onto the printer's own timeline (_cursor)
    // and release each as real time catches up, so paper feeds out at hardware
    // speed even though the CPU handed us every byte instantly.
    this._sched   = [];   // queued {name, data, at} events, ascending `at`
    this._cursor  = 0;    // printer timeline head (perf-clock ms)
    this._pumping = false;
    this._flushTimer = null;

    this.activePrinter = new ImageWriterII();
    this._install(this.activePrinter);
  }

  // Wire the head model to this manager: impacts → sound, timed events → clock.
  _install(printer) {
    printer.setRibbon(this._ribbon);
    printer.onImpact((dots, kind, xDot) => this._onImpact(dots, kind, xDot));
    printer.setEventSink((evt) => this._enqueue(evt));
  }

  // Sound only — all timing now lives in the head model's reported dt.
  _onImpact(dots, kind, xDot) {
    if (kind === "return") {
      const v   = this.activePrinter._carriageVelocity?.() || 12000;
      const dur = xDot / v;                          // seconds the slew takes
      this.sound.tickReturn(dur, Math.min(1, xDot / (v * 0.05)));
      return;
    }
    if (kind === "line") {
      this.sound.tick("line", 0.35);                 // soft paper-feed ratchet
      return;
    }
    if (dots <= 0) return;                            // head moved, no strike (space)
    const denom     = kind === "dots" ? 7 : 22;
    const intensity = Math.max(0.18, Math.min(1, dots / denom));
    this.sound.tick("char", intensity);
  }

  // ===== Wall-clock scheduler =====

  _enqueue(evt) {
    const t = now();
    if (!this._sched.length && !this._pumping) this._cursor = t;
    if (this._cursor < t) this._cursor = t;          // never schedule in the past
    this._cursor += evt.dt;                           // advance the printer timeline
    this._sched.push({ name: evt.name, data: evt.data, at: this._cursor });
    this._pump();
  }

  _pump() {
    if (this._pumping) return;
    this._pumping = true;
    const loop = () => {
      if (!this._sched.length) { this._pumping = false; return; }
      const t = now();
      let guard = 20000;
      while (this._sched.length && t >= this._sched[0].at && guard-- > 0) {
        const evt = this._sched.shift();
        this.activePrinter._fire(evt.name, evt.data); // → listeners (render) + sound
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  async init() {
    if (this._callbackInstalled) return;
    if (!this.wasmProxy || !this.wasmProxy._setParallelTxCallback) return;
    this.wasmProxy.onPrinterByte = (byte) => this.receiveByte(byte);
    // The printer is one device reachable over either bus: the parallel
    // (Centronics) port, or a serial (SSC) port — the historical ImageWriter
    // wiring. Arm both; whichever card the user installs delivers the bytes to
    // the same `emulator.printer` shim, so print works regardless of bus.
    await this.wasmProxy._setParallelTxCallback();
    await this.wasmProxy._setSerialTxCallback();
    this._callbackInstalled = true;
  }

  // Bytes arrive as fast as the CPU emits them; the head model buffers a line
  // and the scheduler paces the output. Arm an idle flush so a trailing line
  // with no terminating CR still prints.
  receiveByte(byte) {
    this.activePrinter.receiveByte(byte);
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this.activePrinter.flushLine?.(), 120);
  }

  // ===== Ribbon cartridge =====

  _loadRibbon() {
    try {
      const r = localStorage.getItem("a2e-printer-ribbon");
      return r === "color" ? "color" : "bw";
    } catch (e) { return "bw"; }
  }

  setRibbon(kind) {
    this._ribbon = kind === "color" ? "color" : "bw";
    try { localStorage.setItem("a2e-printer-ribbon", this._ribbon); }
    catch (e) { /* non-fatal */ }
    this.activePrinter.setRibbon(this._ribbon);
  }

  getRibbon() { return this._ribbon; }

  // ===== Model switching =====

  setActivePrinter(printer) {
    this.activePrinter.reset();
    this.activePrinter = printer;
    this._sched.length = 0;
    this._pumping      = false;
    this._cursor       = 0;
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    this._install(printer);
    if (this._onPrinterChange) this._onPrinterChange(printer);
  }

  getActivePrinter() { return this.activePrinter; }

  onPrinterChange(fn) { this._onPrinterChange = fn; }
}
