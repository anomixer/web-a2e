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
import { AppleDMP }      from "./apple-dmp.js";
import { PrinterSound }  from "./printer-sound.js";

export const PRINTER_MODELS = [
  { id: "imagewriter-ii", name: "ImageWriter II", create: () => new ImageWriterII() },
  { id: "imagewriter-i",  name: "ImageWriter I",  create: () => new ImageWriterI() },
  { id: "epson-fx80",     name: "Epson FX-80",    create: () => new EpsonFX80() },
  { id: "apple-dmp",      name: "Apple DMP",      create: () => new AppleDMP() },
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
    this._powered           = true;   // mains switch; off = head dead, bytes ignored

    // Installed ribbon cartridge (applies to whichever model is active).
    this._ribbon = this._loadRibbon();

    // Automatic Line Feed DIP (SW2-1), persisted. Default ON: CR feeds, as plain
    // text expects. Off makes colour graphics overprint register (DazzleDraw).
    this._autoLF = this._loadAutoLF();

    // Playback speed multiplier (1/2/4/8×). Scales the head model's reported
    // motion time when scheduling, so the paper feeds out faster on screen. The
    // printed pixels are identical — only the wall-clock pacing changes.
    this._speed = this._loadSpeed();
    // Strike-thinning counter: at N× we voice one strike in N so the buzz keeps
    // its real pitch/tempo instead of speeding up with the paper.
    this._strikeMod = 0;

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
    // A black-only model (IW-I, Epson) can't hold a colour cart — drop any
    // persisted colour ribbon to B/W when such a printer becomes active.
    if (this._ribbon === "color" && printer.supportsColorRibbon?.() === false) {
      this._ribbon = "bw";
      try { localStorage.setItem("a2e-printer-ribbon", "bw"); } catch (e) { /* non-fatal */ }
    }
    printer.setRibbon(this._ribbon);
    printer.setAutoLineFeed?.(this._autoLF);
    printer.onImpact((dots, kind, xDot) => this._onImpact(dots, kind, xDot));
    printer.setEventSink((evt) => this._enqueue(evt));
  }

  // Sound only — all timing now lives in the head model's reported dt.
  //
  // Only an actual pin strike (char/dots) is voiced. The paper-feed ratchet and
  // the carriage-return slew emitted a tonal descending sweep that read as a
  // laser "pew" rather than a printer, so they stay silent — the head strikes
  // alone carry the buzz.
  _onImpact(dots, kind, xDot) {
    if (kind !== "char" && kind !== "dots") return;  // feed/return: no sound
    if (dots <= 0) return;                            // head moved, no strike (space)

    // At N× playback the head fires N× more strikes per second. Voice only one
    // in N so the buzz holds its real pitch and tempo instead of compressing
    // into a chipmunk whine — fewer heads, same cadence. Every strike still
    // inks the paper; just not every one clicks.
    if (this._speed > 1) {
      this._strikeMod = (this._strikeMod + 1) % this._speed;
      if (this._strikeMod !== 0) return;
    }

    const denom     = kind === "dots" ? 7 : 22;
    const intensity = Math.max(0.18, Math.min(1, dots / denom));
    this.sound.tick("char", intensity);
  }

  // ===== Wall-clock scheduler =====

  _enqueue(evt) {
    const t = now();
    if (!this._sched.length && !this._pumping) this._cursor = t;
    if (this._cursor < t) this._cursor = t;          // never schedule in the past
    this._cursor += evt.dt / this._speed;             // advance the printer timeline (Nx faster)
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

  // Force every queued event out NOW, ignoring wall-clock pacing. The normal
  // scheduler releases events on requestAnimationFrame, which a backgrounded tab
  // throttles to a near-halt — so an agent capturing the paper headless would
  // see a blank/stale canvas. drainNow() flushes the parser's partial line and
  // fires the whole backlog synchronously so the canvas reflects every byte
  // received. Use before a capture; playback sound/timing is irrelevant here.
  drainNow() {
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    this.activePrinter.flushLine?.();        // commit partial line → enqueues events
    let guard = 1_000_000;
    while (this._sched.length && guard-- > 0) {
      const evt = this._sched.shift();
      this.activePrinter._fire(evt.name, evt.data);
    }
    this._pumping = false;
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
    if (!this._powered) return;                       // unplugged: byte hits nothing
    this.activePrinter.receiveByte(byte);
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this.activePrinter.flushLine?.(), 120);
  }

  // Feed a whole block of bytes (e.g. a host-built screen dump) straight to the
  // parser, arming a single trailing flush instead of one per byte. The head
  // model still buffers each line and the scheduler paces playback, so the dump
  // prints out at hardware speed exactly like a host-sent graphics stream.
  feedBytes(bytes) {
    if (!this._powered) return;                       // unplugged: nothing prints
    for (let i = 0; i < bytes.length; i++) this.activePrinter.receiveByte(bytes[i]);
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
    const wantColor = kind === "color" && this.activePrinter.supportsColorRibbon?.() !== false;
    this._ribbon = wantColor ? "color" : "bw";
    try { localStorage.setItem("a2e-printer-ribbon", this._ribbon); }
    catch (e) { /* non-fatal */ }
    this.activePrinter.setRibbon(this._ribbon);
  }

  getRibbon() { return this._ribbon; }

  // ===== Automatic Line Feed DIP (SW2-1) =====

  _loadAutoLF() {
    try {
      const v = localStorage.getItem("a2e-printer-autolf");
      return v === null ? true : v !== "false";   // default ON
    } catch (e) { return true; }
  }

  setAutoLineFeed(on) {
    this._autoLF = !!on;
    try { localStorage.setItem("a2e-printer-autolf", String(this._autoLF)); }
    catch (e) { /* non-fatal */ }
    this.activePrinter.setAutoLineFeed?.(this._autoLF);
    return this._autoLF;
  }

  getAutoLineFeed() { return this._autoLF; }

  // ===== Print speed (playback pacing) =====

  _loadSpeed() {
    // The print-speed knob is currently hidden in the window (see the `hidden`
    // pr-speed button), so there is no UI to change playback. A value persisted
    // from when the knob was live would otherwise stick forever — and >1× speeds
    // the playback, thins the strike sound to 1-in-N (quiet), and washes out the
    // bidirectional sweep so it can't be seen. Pin real 1× while the knob is
    // hidden and clear the stale key. Restore persistence here when it returns.
    try { localStorage.removeItem("a2e-printer-speed"); } catch (e) { /* non-fatal */ }
    return 1;
  }

  setPrintSpeed(mult) {
    const next = [1, 2, 4, 8].includes(mult) ? mult : 1;
    this._rescaleSchedule(this._speed, next);   // re-pace queued backlog live
    this._speed = next;
    try { localStorage.setItem("a2e-printer-speed", String(this._speed)); }
    catch (e) { /* non-fatal */ }
    return this._speed;
  }

  getPrintSpeed() { return this._speed; }

  // Speed can change mid-print. A burst the CPU already handed us is sitting in
  // the scheduler with release times baked at the old speed; rescale the
  // remaining timeline (relative to now) so the new speed bites at once instead
  // of only on bytes that arrive afterwards.
  _rescaleSchedule(oldSpeed, newSpeed) {
    if (oldSpeed === newSpeed || !this._sched.length) return;
    const t = now();
    const k = oldSpeed / newSpeed;              // <1 speeds up, >1 slows the tail
    for (const e of this._sched) e.at = t + Math.max(0, e.at - t) * k;
    this._cursor = this._sched[this._sched.length - 1].at;
  }

  // ===== Power =====

  // Mains switch. Powering off drops any queued motion (the head stops mid-page)
  // but leaves printed paper untouched — same as flipping the switch on real
  // hardware. Powering back on resumes from a quiet, idle head.
  setPower(on) {
    const next = !!on;
    if (next === this._powered) return this._powered;
    this._powered = next;
    if (!next) {
      this._sched.length = 0;
      this._pumping      = false;
      if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    } else {
      this._cursor = now();
    }
    return this._powered;
  }

  getPower() { return this._powered; }

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
