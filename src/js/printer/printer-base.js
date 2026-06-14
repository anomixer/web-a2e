/*
 * printer-base.js - Abstract base class for printer models
 *
 * Composes the printer out of three virtual mechanisms instead of scattered
 * bookkeeping:
 *   - VirtualHead       — the carriage: position, direction, travel timing;
 *   - VirtualRibbon     — the ink cartridge: B/W or colour;
 *   - VirtualPaperFeed  — the vertical stepper: paper position, feed timing.
 *
 * A subclass parses the byte stream and reports strikes at absolute columns.
 * The base buffers a line, then lets the head replay those strikes in true
 * travel order (so bidirectional printing is genuine), charges each motion its
 * real wall-clock cost, and hands the timed events to a sink (the manager) that
 * releases them at hardware speed.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { VirtualHead }      from "./printer-head.js";
import { VirtualRibbon }    from "./printer-ribbon.js";
import { VirtualPaperFeed } from "./printer-paper-feed.js";

function popcount(n) {
  let c = 0;
  n &= 0x1FF;
  while (n) { c += n & 1; n >>= 1; }
  return c;
}

// Power-on print-head rest, in internal dots below the paper's top edge. At
// power-on the paper sits at top-of-form and the head homes a hair down from
// the sheet edge (~3 rendered px) instead of striking row zero. This is the
// head's physical home position — NOT a margin: the page keeps its exact size,
// and after the first form feed the head realigns to the bare form top with no
// offset. The renderer reads this y straight; it adds nothing of its own.
const POWER_ON_HEAD_DOTS = 12;

export class PrinterBase {
  constructor() {
    this._listeners = {};
    this._onImpact  = null;
    this._eventSink = null;

    // The three virtual mechanisms.
    this.head   = new VirtualHead(this._carriagePicaDots(), this.getCharsPerSecond());
    this.ribbon = new VirtualRibbon('bw');
    this.paper  = new VirtualPaperFeed();

    this._lineBuf = []; // strikes accumulated for the current line
  }

  on(event, fn) { this._listeners[event] = fn; }
  off(event)    { delete this._listeners[event]; }

  // Impact hook: fired (dotCount, kind, xDot) at strike release time (not parse
  // time) so sound is correctly paced. kind: 'char' | 'dots' | 'line' |
  // 'return'. Zero dotCount = head moved, no strike (a space) → stay silent.
  onImpact(fn) { this._onImpact = fn; }

  // The manager installs a sink to pace timed events against the wall clock.
  // Each event is {name, data, dt}; dt = ms of head/paper motion before it.
  // Without a sink (tests/headless), events fire in order immediately.
  setEventSink(fn) { this._eventSink = fn; }

  // ---- Ribbon cartridge ----
  setRibbon(kind)  { this.ribbon.setType(kind); }
  getRibbon()      { return this.ribbon.type; }
  _inkColor(color) { return this.ribbon.ink(color); }

  // ---- Carriage spec (overridable per model) ----
  _carriagePicaDots() { return 48; }                 // pica advance, internal dots
  _carriageVelocity() { return this.head.velocity; } // dots/sec
  isUnidirectional()  { return false; }              // default: bidirectional

  // ===== Input side: subclasses call emit() during parsing =====
  emit(event, data) {
    switch (event) {
      case 'printChar':
      case 'printDots':
        // Buffer the strike at its absolute column; the head decides the order.
        this._lineBuf.push({ event, data, xDot: data?.xDot | 0 });
        return;
      case 'newline':
      case 'linefeed':
      case 'carriagereturn':
        this._fire(event, data);     // text-view listeners (no-op in canvas mode)
        this._commitLine(event, data);
        return;
      case 'formfeed':
        this._fire(event, data);
        this._commitLine('formfeed', data);
        return;
      default:
        this._fire(event, data);     // 'text' and any other passthrough
    }
  }

  // ===== Commit a buffered line: the head sweeps its strikes in travel order =====
  _commitLine(kind, data) {
    const buf = this._lineBuf;
    this._lineBuf = [];

    for (const s of this.head.order(buf)) {
      const dt = this.head.moveTo(s.xDot); // travel to the strike, timed
      this._timed(s.event, s.data, dt);
    }

    if (kind === 'flush') return; // partial line (idle flush): no paper feed yet
    this._commitFeed(kind, data);
  }

  _commitFeed(kind, data) {
    if (kind === 'carriagereturn') {
      // CR with Auto-LF off: the head slews back to the left margin, but the
      // paper does NOT advance — the next pass overprints this same band. Charge
      // only the return travel; no paper-feed time, no line ratchet.
      const returnMs = this.head.returnMs();
      this._timed('feed', { sound: 'return', dist: this.head.x }, returnMs);
      this.head.home();
      return;
    }

    if (kind === 'formfeed') {
      // The model has already slewed the cursor; `dist` is how far it moved.
      const ejectMs  = this.paper.feedMs(data?.dist | 0);
      const returnMs = this.head.returnMs();
      this._timed('feed', { sound: 'return', dist: this.head.x }, ejectMs + returnMs);
      this.head.home();
      return;
    }

    const feedMs = this.paper.feedMs(this._lineFeedDots());

    if (kind === 'linefeed') {
      // LF: paper down only. Head neither returns nor reverses.
      this._timed('feed', { sound: 'line', dist: this.head.x }, feedMs);
      return;
    }

    // CR (newline): feed paper, then either slew home (unidirectional) or just
    // flip travel direction (bidirectional — the head stays put and prints the
    // next line back the other way).
    if (this.isUnidirectional()) {
      const returnMs = this.head.returnMs();
      this._timed('feed', { sound: 'return', dist: this.head.x }, feedMs + returnMs);
      this.head.home();
    } else {
      this._timed('feed', { sound: 'line', dist: this.head.x }, feedMs);
      this.head.flip();
    }
  }

  // Vertical dots advanced per line feed. Subclasses with a line height track it.
  _lineFeedDots() { return (typeof this._lineHeight === 'number') ? this._lineHeight : 80; }

  // Print-head home: where the head rests vertically at power-on (internal dots).
  _homeYDot() { return POWER_ON_HEAD_DOTS; }

  // ---- Operator panel: manual paper positioning ----
  // These drive the one vertical cursor (`_yDot`) the model renders from, so the
  // platen buttons move the paper exactly like a line feed from the host would.

  // Advance the paper `lines` line-heights (paper moves down past the head).
  lineFeedDown(lines = 1) {
    const dots = lines * this._lineFeedDots();
    this._yDot = (this._yDot | 0) + dots;
    this._timed('feed', { sound: 'line', dist: this.head.x }, this.paper.feedMs(dots));
  }

  // Reverse-feed the paper `lines` line-heights (platen knob backward).
  lineFeedUp(lines = 1) {
    const dots = lines * this._lineFeedDots();
    this._yDot = Math.max(0, (this._yDot | 0) - dots);
    this._timed('feed', { sound: 'line', dist: this.head.x }, this.paper.feedMs(dots));
  }

  // Latch the current paper position as top-of-form (SET/TOF button).
  setTopOfForm() { this.paper.setTopOfForm(this._yDot | 0); }

  // Slew to the next page's top-of-form. Shared by the host FF byte and the
  // panel Form Feed button, so both honour the latched top-of-form.
  formFeed() {
    const fromY = this._yDot | 0;
    this._xDot = 0;
    this._yDot = this.paper.nextFormTop(fromY);
    this.emit('formfeed', { dist: this._yDot - fromY });
  }

  // Commit any partial (un-terminated) line so trailing output still prints.
  flushLine() { if (this._lineBuf.length) this._commitLine('flush'); }

  // ===== Output side: a timed event, deferred to the sink or fired now =====
  _timed(name, data, dt) {
    if (this._eventSink) this._eventSink({ name, data, dt });
    else                 this._fire(name, data);
  }

  // Notify listeners + the impact hook. Called by the manager's scheduler at
  // the event's release time.
  _fire(event, data) {
    if (this._onImpact) {
      if (event === 'printChar') {
        this._onImpact(this._countCharDots(data), 'char', data?.xDot | 0);
      } else if (event === 'printDots') {
        this._onImpact(popcount(data?.byte | 0), 'dots', data?.xDot | 0);
      } else if (event === 'feed') {
        this._onImpact(0, data?.sound === 'return' ? 'return' : 'line', data?.dist | 0);
      }
    }
    if (this._listeners[event]) this._listeners[event](data);
  }

  // Total pins that fire for one glyph (sum of set dots across columns),
  // weighted up for bold (double-strike) and underline (extra wire).
  _countCharDots(data) {
    if (!data || !data.cols) return 0;
    let dots = 0;
    for (const c of data.cols) dots += popcount(c);
    if (data.bold)      dots = Math.round(dots * 1.6);
    if (data.underline) dots += data.cols.length;
    return dots;
  }

  // Called for every byte received from the card
  receiveByte(byte) {}

  reset() {
    this.head.reset();
    this.paper.reset();
    this._lineBuf = [];
  }

  // Hardware print rate in characters per second (pica draft).
  getCharsPerSecond() { return 120; }

  getName() { return "Printer"; }
  getId()   { return "base"; }
}
