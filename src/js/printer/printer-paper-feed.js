/*
 * printer-paper-feed.js - Virtual paper feed mechanism (platen / tractor)
 *
 * The vertical stepper that advances the paper past the head. It turns feed
 * distances into wall-clock time and owns the page geometry (form length and
 * the latched top-of-form), but NOT the live paper position — that single
 * vertical cursor lives in the printer model (`_yDot`) so render and mechanism
 * never drift. This unit is a pure calculator: callers pass the current cursor
 * in and get back times / boundaries.
 *
 * Unlike the carriage (whose speed is spec-derived from cps), the feed motor
 * speed is a mechanical estimate — the single timing constant that isn't head
 * motion.
 *
 * Top-of-form: a real dot-matrix printer has no idea where the paper's physical
 * page boundary is. The operator rolls the paper to where they want page top
 * (platen knob / micro line-feed buttons) and that position is latched as
 * top-of-form. A form feed then advances exactly to the next page boundary
 * (top-of-form + form length), not to some absolute origin. Power-on assumes
 * the paper already sits at top-of-form.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

// Vertical feed speed, internal dots/sec (line-feed stepper). Tunable estimate.
const FEED_DOTS_PER_SEC = 3200;

// Form length: physical page height in internal dots. 11" fanfold at 480 dpi.
const DPI               = 480;
const DEFAULT_FORM_DOTS = DPI * 11; // 5280 dots = 66 lines at 6 lpi

export class VirtualPaperFeed {
  constructor(formDots = DEFAULT_FORM_DOTS) {
    this.topOfForm = 0;        // cursor position latched as the current page top
    this.formDots  = formDots; // page height (top-of-form to top-of-form)
  }

  // Wall-clock time for a feed of `dots` (sign-agnostic).
  feedMs(dots) { return Math.abs(dots) / FEED_DOTS_PER_SEC * 1000; }

  // Latch a cursor position as top-of-form (operator pressed SET/TOF, or
  // power-on with paper loaded at the tear-off).
  setTopOfForm(y) { this.topOfForm = y; }

  // Set the form length (page height, top-of-form to top-of-form) in internal
  // dots. Driven by ESC H or a host-side page-size selection.
  setFormDots(dots) { if (dots > 0) this.formDots = dots; }

  // The next page boundary at or below cursor `y`.
  nextFormTop(y) {
    const past  = y - this.topOfForm;                 // distance into this page
    const pages = Math.floor(past / this.formDots) + 1;
    return this.topOfForm + pages * this.formDots;
  }

  reset() { this.topOfForm = 0; }
}
