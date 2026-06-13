/*
 * imagewriter-ii.js - Apple ImageWriter II printer emulation
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { PrinterBase } from "./printer-base.js";
import { DRAFT_ROM, DRAFT_ROM_LOCALES } from "./imagewriter-rom-draft.js";
import { CORR_ROM, CORR_ROM_LOCALES } from "./imagewriter-rom-corr.js";

const S_NORMAL       = 0; // normal character output
const S_ESC          = 1; // consumed ESC, waiting for command byte
const S_PARAM1       = 2; // consuming one parameter byte then back to normal
const S_IMG_COUNT    = 3; // graphics: consuming ASCII-decimal byte/group count
const S_IMG_DATA     = 4; // graphics: consuming image data bytes
const S_CUSTOM_KEY   = 5; // custom char load: waiting for KEY byte or CTRL-D
const S_CUSTOM_WIDTH = 6; // custom char load: waiting for WIDTH CODE byte
const S_CUSTOM_DATA  = 7; // custom char load: consuming column data bytes
const S_NUM          = 8; // collecting an ASCII-decimal numeric parameter
const S_REPEAT_CHAR  = 9; // ESC R: waiting for the char byte to repeat
const S_VREPEAT      = 10; // ESC V: waiting for the column byte to repeat

// Internal canvas resolution: 480 dpi (LCM of 80, 120, 160)
const DPI          = 480;
const DOT_W        = DPI / 120;   // 4 px — draft char dot column width (120 dpi horiz)
const DOT_V        = DPI / 72;    // ~6.667 px — vertical dot pitch (72 dpi vert)

// Characters per inch → char advance width in canvas px
const CPI = { pica: 10, elite: 12, condensed: 15, ultra: 17 };

// ESC G/S/g graphics: horizontal dot density (dots/inch) by the pitch in force
// (Table 8-1). Each graphics data byte is one 8-dot-high column at this density.
const GFX_DENSITY = { pica: 80, elite: 96, condensed: 120, ultra: 136 };

// Printable carriage width: 8 inches. Head auto-wraps (CR+LF) at this margin,
// just like real hardware — the paper never grows wider.
const PLATEN_DOTS = DPI * 8;

// ESC K colour index → ribbon colour (Table A-18). 0-3 are the four ribbon
// bands; 4-6 are the secondary colours the real printer makes by overprinting
// two bands (orange = yellow+red, green = yellow+blue, purple = red+blue).
const COLORS = ['black', 'yellow', 'red', 'blue', 'orange', 'green', 'purple'];

export class ImageWriterII extends PrinterBase {
  constructor() {
    super();
    this._customMaxWidth = 8;
    this._customChars    = new Map();
    this._resetRenderState();
    this._resetParserState();
  }

  _resetParserState() {
    this._state          = S_NORMAL;
    this._imgCount       = 0;
    this._imgDotW        = DPI / 80;
    this._gfxDigitsLeft  = 0;
    this._gfxCountAcc    = 0;
    this._gfxMul         = 1;
    this._customKey      = 0;
    this._customWireTop  = true;
    this._customDataLeft = 0;
    this._customDataBuf  = [];
    this._paramCmd       = 0;
    this._numCmd         = 0;   // ASCII-decimal param collector (ESC H/T/L/F/V/R)
    this._numLeft        = 0;
    this._numAcc         = 0;
  }

  _resetRenderState() {
    this._pitch          = 'pica';
    this._bold           = false;
    this._underline      = false;
    this._halfHeight     = false;     // ESC w/W (Table 4-10)
    this._script         = 'none';    // ESC x/y/z: 'none' | 'super' | 'sub' (Table 4-11)
    this._doubleWidth    = false;     // CTRL-N/CTRL-O (Table 4-7)
    this._proportional   = false;     // ESC p/P — proportional pitch (corr font only)
    this._color          = 'black';
    this._customFont     = 'none';    // ESC '/* — render downloaded glyphs: 'none' | 'low' | 'high'
    this._leftMargin     = 0;         // ESC L — left margin, internal dots
    this._lineHeight     = DPI / 6;   // 6 lpi default
    this._quality        = 'draft';   // power-on font (Table 4-1): draft | corr | nlq
    this._xDot           = 0;
    this._yDot           = this._homeYDot();   // power-on head rest, a hair below sheet top
    this._unidirectional = false;     // power-on default is bidirectional (ESC <)
    this._mouseText      = false;     // ESC &/$ — map MouseText into low ASCII $40-$5F
  }

  reset() {
    // Custom chars survive software reset per spec Ch.6
    super.reset();             // carriage/head kinematics back to home
    this._resetParserState();
    this._resetRenderState();
    this._applyHeadSpeed();     // back to draft speed
  }

  // 480-dpi head: pica (10 cpi) advances 48 dots → carriage velocity 48 × cps.
  _carriagePicaDots() { return DPI / 10; }

  receiveByte(byte) {
    const ch = byte & 0x7F; // strip Apple II high bit

    switch (this._state) {
      case S_NORMAL: {
        // Apple/SSC terminate each line with CR+LF, so a literal printer would
        // feed twice — a blank line between rows. A real ImageWriter treats CR+LF
        // as one line ending: coalesce an LF that arrives immediately after a CR
        // (feed once). A standalone LF still feeds normally.
        const wasCR = this._lastCR;
        this._lastCR = false;
        if (ch === 0x1B) {
          this._state = S_ESC;
        } else if (ch === 0x0E) {
          this._doubleWidth = true;  this._applyHeadSpeed();   // CTRL-N — double-width on
        } else if (ch === 0x0F) {
          this._doubleWidth = false; this._applyHeadSpeed();   // CTRL-O — double-width off
        } else if (ch === 0x08) {
          // CTRL-H backspace: step head back one char cell, no paper feed.
          // Clamped at the left margin. Reprinting here overstrikes the prior
          // glyph (how period software drew strikethrough — no native opcode).
          this._xDot = Math.max(this._leftMargin, this._xDot - this._charAdvance());
          this.emit('backspace');
        } else if (ch === 0x0C) {
          this.formFeed();   // slew to next top-of-form (shared with panel)
        } else if (ch === 0x0D) {
          this._xDot = this._leftMargin;
          this._yDot += this._lineHeight;
          this._lastCR = true;   // arm CR+LF coalescing
          this.emit('newline');
        } else if (ch === 0x0A) {
          if (!wasCR) {          // standalone LF feeds; LF paired with CR is swallowed
            this._yDot += this._lineHeight;
            this.emit('linefeed');
          }
        } else if (ch >= 0x20 && ch < 0x7F) {
          // ESC & maps the 32 MouseText glyphs into low ASCII $40-$5F (Table 4-2):
          // each lives at code+$80 in the ROM ($C0-$DF). Outside that window, or
          // after ESC $, codes print as standard ASCII.
          const code = (this._mouseText && ch >= 0x40 && ch <= 0x5F) ? ch + 0x80 : ch;
          this._emitChar(code);
        }
        break;
      }

      case S_ESC:
        this._state = S_NORMAL;
        switch (ch) {
          // Character pitch. ESC p/P are the proportional pitches; selecting one
          // forces the correspondence font (proportional isn't a draft/NLQ feature).
          case 0x4E: this._pitch = 'pica';  this._proportional = false; break;  // ESC N — pica (10 cpi)
          case 0x45: this._pitch = 'elite'; this._proportional = false; break;  // ESC E — elite (12 cpi)
          case 0x71: this._pitch = 'condensed'; this._proportional = false; break;  // ESC q — condensed (15 cpi)
          case 0x51: this._pitch = 'ultra';     this._proportional = false; break;  // ESC Q — ultracondensed (17 cpi)
          case 0x70: this._pitch = 'pica';  this._proportional = true; this._applyHeadSpeed(); break;  // ESC p — proportional (pica base)
          case 0x50: this._pitch = 'elite'; this._proportional = true; this._applyHeadSpeed(); break;  // ESC P — proportional (elite base)

          // Print quality (Table 4-1). ESC m/ESC M are Apple Scribe aliases.
          case 0x6D: this._quality = 'corr'; this._applyHeadSpeed(); break;  // ESC m — correspondence font
          case 0x4D: this._quality = 'nlq';  this._applyHeadSpeed(); break;  // ESC M — NLQ font

          // Print style. Bold/half-height/super/subscript are draft-incompatible
          // (Tables 4-1/4-10/4-11): toggling them can shift the effective font and
          // therefore the carriage speed, so re-arm head speed on each.
          case 0x21: this._bold      = true;  this._applyHeadSpeed(); break;  // ESC ! — bold on
          case 0x22: this._bold      = false; this._applyHeadSpeed(); break;  // ESC " — bold off
          case 0x58: this._underline = true;  break;  // ESC X — start underline
          case 0x59: this._underline = false; break;  // ESC Y — stop underline (Table 4-8)
          case 0x77: this._halfHeight = true;  this._applyHeadSpeed(); break;  // ESC w — start half-height
          case 0x57: this._halfHeight = false; this._applyHeadSpeed(); break;  // ESC W — stop half-height
          case 0x78: this._script = 'super'; this._applyHeadSpeed(); break;  // ESC x — start superscript
          case 0x79: this._script = 'sub';   this._applyHeadSpeed(); break;  // ESC y — start subscript
          case 0x7A: this._script = 'none';  this._applyHeadSpeed(); break;  // ESC z — stop super/subscript

          // Print-head motion (Table 5-5). Persists until cancelled or reset.
          case 0x3E: this._unidirectional = true;  break;  // ESC > — unidirectional
          case 0x3C: this._unidirectional = false; break;  // ESC < — bidirectional (default)

          // Character-set selection (Table 4-2). ESC & temporarily maps the 32
          // MouseText glyphs into low ASCII $40-$5F; ESC $ restores standard
          // ASCII. (8th-bit ESC Z/D mode is unmodelled — Applesoft sets bit 7 on
          // every byte, so the manual recommends ESC & for BASIC.)
          case 0x26: this._mouseText = true;  break;  // ESC & — map MouseText to $40-$5F
          case 0x24: this._mouseText = false; this._customFont = 'none'; break;  // ESC $ — standard ASCII + normal font (default)

          // Downloaded-character font select (Table A-9). ESC '/* turn on the
          // custom glyph set (low/high ASCII); ESC $ (above) turns it back off.
          case 0x27: this._customFont = 'low';  break;  // ESC ' — custom font, low ASCII
          case 0x2A: this._customFont = 'high'; break;  // ESC * — custom font, high ASCII

          // Line spacing (Table A-15). These are IW-II native: ESC A/B are fixed
          // 6/8 lpi (no parameter), ESC T takes a 2-digit n/144 inch distance.
          case 0x41: this._lineHeight = DPI / 6; break;  // ESC A — 6 lpi
          case 0x42: this._lineHeight = DPI / 8; break;  // ESC B — 8 lpi
          case 0x54: this._beginNum(0x54, 2); break;     // ESC T nn — n/144 inch

          // Page formatting (Table A-13).
          case 0x48: this._beginNum(0x48, 4); break;  // ESC H nnnn — page length n/144 inch
          case 0x4C: this._beginNum(0x4C, 3); break;  // ESC L nnn — left margin at column nnn

          // Head placement / repeat (Tables A-14, A-19, 8-1).
          case 0x46: this._beginNum(0x46, 4); break;  // ESC F nnnn — head to dot column nnnn
          case 0x52: this._beginNum(0x52, 3); break;  // ESC R nnn c — repeat char c nnn times
          case 0x56: this._beginNum(0x56, 4); break;  // ESC V nnnn c — repeat column byte c

          // Commands consuming one parameter byte
          case 0x61: // ESC a — font select
          case 0x4B: // ESC K — color select
            this._paramCmd = ch;
            this._state    = S_PARAM1;
            break;

          // Bit-image graphics (Table 8-1). Density follows the current pitch.
          case 0x47:          // ESC G nnnn — nnnn = 4-digit ASCII byte count
          case 0x53:          // ESC S nnnn — identical to ESC G
            this._gfxDigitsLeft = 4; this._gfxCountAcc = 0; this._gfxMul = 1;
            this._imgDotW = this._gfxDotW();
            this._state   = S_IMG_COUNT;
            break;
          case 0x67:          // ESC g nnn — nnn = 3-digit ASCII count of 8-byte groups
            this._gfxDigitsLeft = 3; this._gfxCountAcc = 0; this._gfxMul = 8;
            this._imgDotW = this._gfxDotW();
            this._state   = S_IMG_COUNT;
            break;

          // Custom character width / clear
          case 0x2D: this._customMaxWidth = 8;  this._customChars.clear(); break;  // ESC -
          case 0x2B: this._customMaxWidth = 16; this._customChars.clear(); break;  // ESC +

          // Custom character load
          case 0x49: this._state = S_CUSTOM_KEY; break;  // ESC I

          // Software reset (render state resets; custom chars survive)
          case 0x63: this._resetRenderState(); this._resetParserState(); this._applyHeadSpeed(); break;  // ESC c
        }
        break;

      case S_PARAM1:
        switch (this._paramCmd) {
          case 0x4B: {       // ESC K n — color select (Table A-18), n = ASCII '0'-'6'
            const k = (ch >= 0x30 && ch <= 0x36) ? ch - 0x30 : (ch & 0x07);
            this._color = COLORS[k] ?? 'black';
            this._applyHeadSpeed();   // colour overprint runs at half speed
            break;
          }
          case 0x61: {       // ESC a n — font select (Table 4-1): 0=corr 1=draft 2=NLQ
            const sel = ch & 0x0F;  // tolerate ASCII '0'/'1'/'2' or raw 0/1/2
            if      (sel === 0) this._quality = 'corr';
            else if (sel === 1) this._quality = 'draft';
            else if (sel === 2) this._quality = 'nlq';
            this._applyHeadSpeed();
            break;
          }
        }
        this._state = S_NORMAL;
        break;

      case S_IMG_COUNT: {
        // Count digits are ASCII numerals; leading zeros may be sent as spaces.
        const d = (ch === 0x20) ? 0 : (ch - 0x30);
        if (d >= 0 && d <= 9) this._gfxCountAcc = this._gfxCountAcc * 10 + d;
        if (--this._gfxDigitsLeft <= 0) {
          this._imgCount = this._gfxCountAcc * this._gfxMul;
          this._state = this._imgCount > 0 ? S_IMG_DATA : S_NORMAL;
        }
        break;
      }

      case S_IMG_DATA:
        // Graphics column data uses all 8 bits (bit 7 = bottom dot), so feed the
        // raw byte — NOT the high-bit-stripped `ch` used for character codes.
        this.emit('printDots', {
          byte:  byte,
          xDot:  this._xDot,
          yDot:  this._yDot,
          dotW:  this._imgDotW,
          dotH:  DOT_V,
          color: this._inkColor(this._color),
        });
        this._xDot += this._imgDotW;
        if (--this._imgCount <= 0) this._state = S_NORMAL;
        break;

      case S_CUSTOM_KEY:
        if (ch === 0x04) {
          this._state = S_NORMAL;
        } else {
          this._customKey = ch;
          this._state     = S_CUSTOM_WIDTH;
        }
        break;

      case S_CUSTOM_WIDTH: {
        let cols, wireTop;
        if (ch >= 0x41 && ch <= 0x50) {
          cols = ch - 0x40; wireTop = true;
        } else if (ch >= 0x61 && ch <= 0x70) {
          cols = ch - 0x60; wireTop = false;
        } else {
          this._state = S_NORMAL;
          break;
        }
        this._customWireTop  = wireTop;
        this._customDataLeft = Math.min(cols, this._customMaxWidth);
        this._customDataBuf  = [];
        this._state          = S_CUSTOM_DATA;
        break;
      }

      case S_CUSTOM_DATA:
        this._customDataBuf.push(byte);  // 8-bit column data (bit 7 = bottom dot)
        if (--this._customDataLeft <= 0) {
          this._customChars.set(this._customKey, {
            wireTop: this._customWireTop,
            data: new Uint8Array(this._customDataBuf),
          });
          this._state = S_CUSTOM_KEY;
        }
        break;

      case S_NUM: {
        // ASCII-decimal parameter (leading zeros may be spaces, $20 → 0).
        const d = (ch === 0x20) ? 0 : (ch - 0x30);
        if (d >= 0 && d <= 9) this._numAcc = this._numAcc * 10 + d;
        if (--this._numLeft <= 0) this._dispatchNum();
        break;
      }

      case S_REPEAT_CHAR:
        // ESC R nnn c — print char c, _numAcc times, at the current pitch.
        for (let i = 0; i < this._numAcc; i++) this._emitChar(ch);
        this._state = S_NORMAL;
        break;

      case S_VREPEAT:
        // ESC V nnnn c — print column byte c (8-bit) as _numAcc graphics columns.
        for (let i = 0; i < this._numAcc; i++) {
          this.emit('printDots', {
            byte:  byte,
            xDot:  this._xDot,
            yDot:  this._yDot,
            dotW:  this._gfxDotW(),
            dotH:  DOT_V,
            color: this._inkColor(this._color),
          });
          this._xDot += this._gfxDotW();
        }
        this._state = S_NORMAL;
        break;
    }
  }

  // Begin collecting an ASCII-decimal parameter of `digits` characters for
  // command `cmd`; _dispatchNum() applies it once the digits are in.
  _beginNum(cmd, digits) {
    this._numCmd  = cmd;
    this._numLeft = digits;
    this._numAcc  = 0;
    this._state   = S_NUM;
  }

  _dispatchNum() {
    const n = this._numAcc;
    switch (this._numCmd) {
      case 0x54: this._lineHeight = (n / 144) * DPI; this._state = S_NORMAL; break;  // ESC T — line distance n/144"
      case 0x48: this.paper.setFormDots(Math.round((n / 144) * DPI)); this._state = S_NORMAL; break;  // ESC H — page length n/144"
      case 0x4C: // ESC L — left margin at column n (current pitch)
        this._leftMargin = Math.round(n * (DPI / CPI[this._pitch]));
        if (this._xDot < this._leftMargin) this._xDot = this._leftMargin;
        this._state = S_NORMAL;
        break;
      case 0x46: // ESC F — head to dot column n from the left margin (160 dpi units)
        this._xDot = this._leftMargin + Math.round(n * (DPI / 160));
        this._state = S_NORMAL;
        break;
      case 0x52: this._state = S_REPEAT_CHAR; break;  // ESC R — char byte follows
      case 0x56: this._state = S_VREPEAT;     break;  // ESC V — column byte follows
      default:   this._state = S_NORMAL;
    }
  }

  // Char-cell advance in internal dots at the current pitch. Double-width
  // (CTRL-N) doubles the cell. Used by glyph emit AND backspace step-back so
  // an overstrike lands exactly back on the previous character.
  _charAdvance() {
    return Math.round(DPI / CPI[this._pitch]) * (this._doubleWidth ? 2 : 1);
  }

  _emitChar(code) {
    const adv = this._charAdvance();

    // Auto-wrap at the right platen margin: real ImageWriter issues an
    // automatic CR+LF rather than printing past the edge.
    if (this._xDot + adv > PLATEN_DOTS) {
      this._xDot = this._leftMargin;
      this._yDot += this._lineHeight;
      this.emit('newline');
    }

    const cols = this.getGlyph(code);
    this.emit('printChar', {
      cols,
      xDot:        this._xDot,
      yDot:        this._yDot,
      dotW:        DOT_W,
      dotH:        DOT_V,
      color:       this._inkColor(this._color),
      bold:        this._bold,
      underline:   this._underline,
      halfHeight:  this._halfHeight,
      script:      this._script,       // 'none' | 'super' | 'sub'
      doubleWidth: this._doubleWidth,
    });
    // Plain-text event for text-mode listeners
    this.emit('text', String.fromCharCode(code));
    this._xDot += adv;
  }

  // ESC G/S/g column width (internal dots) at the current pitch's graphics density.
  _gfxDotW() { return DPI / (GFX_DENSITY[this._pitch] ?? 80); }

  // Returns custom char definition or null
  getCustomChar(code) {
    return this._customChars.get(code) ?? null;
  }

  // Table 4-1: bold/double-width/half-height/proportional do not exist in the
  // draft font. Selecting any forces the correspondence font for as long as it's
  // active; clearing them all reverts to the selected font. (Super/subscript are
  // handled separately in _effectiveQuality because they also override NLQ.)
  _draftIncompatibleActive() {
    return this._bold || this._halfHeight || this._doubleWidth || this._proportional;
  }

  // The font actually used to print, after the draft-incompatibility rule.
  // `_quality` is what the host selected (ESC a/m/M); this is what fires.
  _effectiveQuality() {
    // Super/subscript (Table 4-11) force correspondence from draft OR NLQ.
    if (this._script !== 'none' && (this._quality === 'draft' || this._quality === 'nlq'))
      return 'corr';
    if (this._quality === 'draft' && this._draftIncompatibleActive()) return 'corr';
    return this._quality;
  }

  // Retune carriage velocity to the effective font's cps. Call after anything
  // that can change effective quality (font select or a draft-incompatible attr).
  _applyHeadSpeed() { this.head?.setCps(this.getCharsPerSecond()); }

  // Active-font glyph for the current print quality. A downloaded custom glyph
  // (ESC '/* font active) overrides the ROM. Otherwise correspondence uses the
  // 8-column corr ROM; draft uses the 12-column draft ROM. NLQ glyphs are not
  // yet transcribed, so NLQ falls back to correspondence shapes.
  getGlyph(code, locale = 'US') {
    if (this._customFont !== 'none') {
      const custom = this._customGlyph(code);
      if (custom) return custom;
    }
    return this._effectiveQuality() === 'draft'
      ? this.getDraftChar(code, locale)
      : this.getCorrChar(code, locale);
  }

  // A downloaded glyph as ROM-format columns (bit 0 = wire 1 … bit 8 = wire 9).
  // Custom column bytes share the graphics mapping (bit 0 = top dot), so they
  // land on bits 0-7 directly; lowercase width codes (wireTop=false) reference
  // wires 2-9, a one-wire downward shift.
  _customGlyph(code) {
    const cc = this._customChars.get(code);
    if (!cc) return null;
    const shift = cc.wireTop ? 0 : 1;
    return Array.from(cc.data, (b) => (b & 0xFF) << shift);
  }

  // Returns draft ROM column data (9-bit: bit 0=wire1 … bit 8=wire9), or null
  getDraftChar(code, locale = 'US') {
    if (locale !== 'US') {
      const override = DRAFT_ROM_LOCALES[locale]?.[code];
      if (override) return override;
    }
    return DRAFT_ROM[code] ?? null;
  }

  // Returns correspondence ROM column data (8 columns, 9-bit each), or null
  getCorrChar(code, locale = 'US') {
    if (locale !== 'US') {
      const override = CORR_ROM_LOCALES[locale]?.[code];
      if (override) return override;
    }
    return CORR_ROM[code] ?? null;
  }

  // Canvas resolution constants (px at 480 dpi internal)
  static get DPI()    { return DPI; }
  static get DOT_W()  { return DOT_W; }
  static get DOT_V()  { return DOT_V; }

  // Print rate follows the effective font (Table 4-1): draft 250, correspondence
  // 180, NLQ 45 cps. Boldface and colour overprint each add a hammer pass, so
  // the carriage runs at half speed while either is active (Appendix D). The
  // head reads this via _applyHeadSpeed → VirtualHead.setCps.
  getCharsPerSecond() {
    let cps;
    switch (this._effectiveQuality()) {
      case 'nlq':  cps = 45;  break;
      case 'corr': cps = 180; break;
      default:     cps = 250; break;   // draft (and pre-init undefined)
    }
    if (this._bold || (this._color && this._color !== 'black')) cps = Math.round(cps / 2);
    return cps;
  }

  // True only after ESC > ; default (and after ESC < / reset) is bidirectional.
  isUnidirectional() { return this._unidirectional; }

  // Selectable FORM LENGTHS, not paper sizes. The ImageWriter II is a
  // continuous-feed printer with a fixed 8" printable width — it has no concept
  // of paper size; only form length is real (DIP SW1-4 picks 11"/12", software
  // sets any length via ESC H). These are honest form lengths, all 8" wide.
  static get PAGE_SIZES() {
    return [
      { id: 'form11', name: '11 in (default)', inches: 11 },     // DIP SW1-4 = 11"
      { id: 'form12', name: '12 in',           inches: 12 },     // DIP SW1-4 = 12"
      { id: 'legal',  name: '14 in (Legal)',   inches: 14 },     // via ESC H
      { id: 'a4',     name: 'A4 (11.7 in)',    inches: 11.69 },  // via ESC H
    ];
  }

  // Set the form length from a PAGE_SIZES id. Returns true if recognised.
  setPageSize(id) {
    const def = ImageWriterII.PAGE_SIZES.find((p) => p.id === id);
    if (!def) return false;
    this._pageSize = id;
    this.paper.setFormDots(Math.round(def.inches * DPI));
    return true;
  }

  getPageSize() { return this._pageSize ?? 'form11'; }

  getName() { return "ImageWriter II"; }
  getId()   { return "imagewriter-ii"; }
}
