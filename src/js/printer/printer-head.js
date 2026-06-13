/*
 * printer-head.js - Virtual print head (carriage)
 *
 * The one physical thing that puts ink on paper. It has a column position and a
 * travel direction, and it moves at a constant carriage velocity. Every motion
 * costs real wall-clock time = distance / velocity — that single rule is where
 * all horizontal timing comes from (character pitch, graphics density, spacing,
 * carriage return), so nothing else needs fudge factors.
 *
 * Bidirectional printing is real here: a line is buffered, then the head is
 * asked to order its strikes in whichever direction it is currently facing and
 * sweep through them. Glyph columns are absolute, so text reads correctly while
 * the head genuinely travels left->right then right->left on alternate lines.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export class VirtualHead {
  // pitchDots: internal dots for one pica (10 cpi) character — the unit of
  // carriage travel per char-time. cps: the printer's draft characters/sec.
  // velocity = pitchDots * cps dots/sec (constant; pitch changes spacing, not
  // carriage speed).
  constructor(pitchDots = 48, cps = 120) {
    this.x   = 0; // current column, internal dots
    this.dir = 1; // +1 = travelling left->right, -1 = right->left
    this._pitchDots = pitchDots;
    this._cps       = cps;
  }

  get velocity() { return this._pitchDots * this._cps; } // dots/sec

  // Retune carriage speed when print quality changes (draft 250 / corr 180 /
  // NLQ 45 cps). Velocity follows immediately; in-flight motion is unaffected.
  setCps(cps) { this._cps = cps; }

  // Time (ms) for the head to travel from its current column to x.
  travelMs(x) { return Math.abs(x - this.x) / this.velocity * 1000; }

  // Move the head to a column, returning how long that motion took.
  moveTo(x) { const dt = this.travelMs(x); this.x = x; return dt; }

  // Order a line's strikes in the head's current travel direction.
  order(strikes) {
    const out = strikes.slice();
    return this.dir > 0
      ? out.sort((a, b) => a.xDot - b.xDot)
      : out.sort((a, b) => b.xDot - a.xDot);
  }

  // Time (ms) to slew back to the left margin from the current column.
  returnMs() { return this.x / this.velocity * 1000; }

  flip() { this.dir = -this.dir; }            // bidirectional: face the other way
  home() { this.x = 0; this.dir = 1; }        // unidirectional: parked at margin

  reset() { this.x = 0; this.dir = 1; }
}
