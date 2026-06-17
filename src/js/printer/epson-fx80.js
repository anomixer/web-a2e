/*
 * epson-fx80.js - Epson FX-80 printer emulation (Epson ESC/P protocol)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 *
 * Reference: Epson FX Series Printer User's Manual Vol 1 (Tutorial) and
 *            Vol 2 (Reference) — Appendixes B and C for control code tables.
 */

import { PrinterBase } from "./printer-base.js";
import { IW2_STANDARD_FIXED } from "./imagewriter-ii-rom-standard-fixed.js";
import {
  EPSON_FX_ROM, EPSON_FX_ROM_LOCALES,
  EPSON_FX_ITALIC_ROM, EPSON_FX_ITALIC_ROM_LOCALES,
  EPSON_FX_PROP_ROM,
} from "./epson-fx80-rom.js";

// Parser states
const S_NORMAL    = 0;
const S_ESC       = 1;
const S_PARAM1    = 2;  // consuming first param byte; _paramCmd holds ESC command
const S_PARAM2    = 3;  // consuming second param byte (ESC %, ESC ?, ESC :)
const S_PARAM3    = 4;  // consuming third param byte (ESC : only)
const S_IMG_MODE  = 5;  // ESC * : density mode byte
const S_IMG_LO    = 6;  // graphics: low byte of column count
const S_IMG_HI    = 7;  // graphics: high byte of column count
const S_IMG_DATA  = 8;  // graphics: consuming 8-bit column bytes
const S_IMG9_D    = 9;  // ESC ^ : density byte
const S_IMG9_LO   = 10; // ESC ^ : lo byte of column count
const S_IMG9_HI   = 11; // ESC ^ : hi byte of column count
const S_IMG9_B1   = 12; // ESC ^ : first byte per column (pins 1-8)
const S_IMG9_B2   = 13; // ESC ^ : second byte per column (pin 9 = bit 0)
const S_VT_LIST   = 14; // ESC B : vertical tab stop list until CHR$(0)
const S_HT_LIST   = 15; // ESC D : horizontal tab stop list until CHR$(0)
const S_ESC_C2    = 16; // ESC C 0 n : form length in inches (second byte)
const S_AMP1      = 17; // ESC & : should-be-zero byte
const S_AMP2      = 18; // ESC & : start character code
const S_AMP3      = 19; // ESC & : end character code; starts char loop
const S_AMP_ATTR  = 20; // ESC & char: attribute byte
const S_AMP_DATA  = 21; // ESC & char: 11 column data bytes

// Internal dot scale is owned by PrinterBase (this.dpi, default 480 = LCM of
// 60/120/240). Every DPI-derived pitch lives on the instance, recomputed from
// this.dpi in _recomputeUnits():
//   this._dotV   — 72-dpi vertical row height (9-pin head)
//   this._dotW   — 120-dpi horizontal text dot pitch
//   this._imgWK/L/Z — ESC K/L-Y/Z graphics column widths (60/120/240 dpi)
//   this._starWidths[] — ESC * mode byte → column width (modes 0-6)
//   this._defaultLineHeight (1/6") and this._unit216 (n/216" unit)

// Character pitch → characters per inch
const CPI = { pica: 10, elite: 12, compressed: 137 / 8 };

// ESC R n — international charset index → editor locale key (FX Vol 2 App C).
// Sets the editor has no glyphs for yet (8=Japan, 9=Norway, 10=Denmark II, …)
// fall through to USA until they are transcribed in rom-editor.html.
const EPSON_INTL = ['US', 'FR', 'DE', 'UK', 'DK', 'SE', 'IT', 'ES'];


export class EpsonFX80 extends PrinterBase {
  constructor() {
    super();
    this._customChars = new Map();
    this._resetParserState();
    this._resetRenderState();
  }

  // Derive every DPI-dependent pitch from the current internal scale. Called by
  // PrinterBase at construction and on setDpi(); changing this.dpi rescales all
  // text/graphics placement, feeds, and form length through these fields.
  _recomputeUnits() {
    this._dotV       = this.dpi / 72;   // 72-dpi vertical row pitch (9-pin head)
    this._dotW       = this.dpi / 120;  // 120-dpi horizontal text dot pitch
    this._imgWK      = this.dpi / 60;   // ESC K single-density (60 dpi)
    this._imgWL      = this.dpi / 120;  // ESC L/Y double-density (120 dpi)
    this._imgWZ      = this.dpi / 240;  // ESC Z quad-density (240 dpi)
    this._starWidths = [
      this.dpi / 60,   // mode 0 — 60 dpi
      this.dpi / 120,  // mode 1 — 120 dpi
      this.dpi / 120,  // mode 2 — 120 dpi (high-speed, no adjacent dots)
      this.dpi / 240,  // mode 3 — 240 dpi
      this.dpi / 80,   // mode 4 —  80 dpi
      this.dpi / 72,   // mode 5 —  72 dpi
      this.dpi / 90,   // mode 6 —  90 dpi
    ];
    this._defaultLineHeight = this.dpi / 6;   // 1/6" = 12-dot rows
    this._unit216           = this.dpi / 216; // n/216" unit (ESC 3, ESC J, ESC j)
  }

  _resetParserState() {
    this._state       = S_NORMAL;
    this._paramCmd    = 0;
    this._param1Val   = 0;
    this._imgCount    = 0;
    this._imgDotW     = this._imgWK;
    this._img9DotW    = this._imgWK;
    this._img9Byte1   = 0;
    this._ampC1       = 0;
    this._ampC2       = 0;
    this._ampCur      = 0;
    this._ampColsLeft = 0;
    this._ampBuf      = [];
    this._htabPend    = []; // ESC D bytes accumulating until the 0 terminator
    this._vtabPend    = []; // ESC B bytes accumulating until the 0 terminator
  }

  _resetRenderState() {
    this._pitch      = 'pica';
    this._expanded   = false;
    this._emphasized = false;
    this._dblStrike  = false;
    this._underline  = false;
    this._italic     = false;
    this._proportional = false;            // ESC p / Master Select bit 1
    this._intlSet    = 'US';               // ESC R international charset (editor key)
    this._script     = 0;      // 0=none, 1=superscript, 2=subscript
    this._lineHeight = this._defaultLineHeight;
    this._autoLF     = true;               // DIP SW2-1 default ON; manager overrides
    this._leftMargin = 0;                  // ESC l — internal dots
    this._rightMargin = this._printWidthDots(); // ESC Q — defaults to full 8" carriage
    this._htabCols   = [];                 // ESC D stops (columns); empty = every 8
    this._vtabLines  = [];                 // ESC B stops (lines); empty = single LF
    this._skipPerf   = 0;                  // ESC N — lines skipped at each page bottom
    this._xDot       = 0;
    this._yDot       = this._homeYDot();   // power-on head rest, a hair below sheet top
    if (this.paper) this.paper.setFormDots(this.dpi * 11); // ESC C resets to 11" default
  }

  reset() {
    super.reset();             // carriage/head kinematics back to home
    this._resetParserState();
    this._resetRenderState();
  }

  receiveByte(byte) {
    const ch = byte & 0x7F; // strip Apple II high bit

    switch (this._state) {
      case S_NORMAL:    this._normal(ch);    break;
      case S_ESC:       this._esc(ch);       break;
      case S_PARAM1:    this._param1(ch);    break;
      case S_PARAM2:    this._param2(ch);    break;
      case S_PARAM3:    this._state = S_NORMAL; break; // absorb ESC : third param

      case S_IMG_MODE:
        this._imgDotW  = this._starWidths[ch & 7] ?? this._imgWL;
        this._imgCount = 0;
        this._state    = S_IMG_LO;
        break;

      case S_IMG_LO:
        this._imgCount = ch;
        this._state    = S_IMG_HI;
        break;

      case S_IMG_HI:
        this._imgCount |= (ch << 8);
        this._state = this._imgCount > 0 ? S_IMG_DATA : S_NORMAL;
        break;

      case S_IMG_DATA:
        this.emit('printDots', {
          byte: ch, xDot: this._xDot, yDot: this._yDot,
          dotW: this._imgDotW, dotH: this._dotV, color: 'black',
        });
        this._xDot += this._imgDotW;
        if (--this._imgCount <= 0) this._state = S_NORMAL;
        break;

      case S_IMG9_D:
        this._img9DotW = ch === 0 ? this._imgWK : this._imgWL;
        this._state    = S_IMG9_LO;
        break;

      case S_IMG9_LO:
        this._imgCount = ch;
        this._state    = S_IMG9_HI;
        break;

      case S_IMG9_HI:
        // Nine-pin: n = n1 + 255*n2  (per Vol 2 Appendix B)
        this._imgCount += ch * 255;
        this._state = this._imgCount > 0 ? S_IMG9_B1 : S_NORMAL;
        break;

      case S_IMG9_B1:
        this._img9Byte1 = ch;
        this._state     = S_IMG9_B2;
        break;

      case S_IMG9_B2: {
        // Combine: pins 1-8 from byte1, pin 9 from bit 0 of byte2
        const bits9 = this._img9Byte1 | ((ch & 1) << 8);
        this.emit('printDots', {
          byte: bits9, xDot: this._xDot, yDot: this._yDot,
          dotW: this._img9DotW, dotH: this._dotV, color: 'black',
        });
        this._xDot += this._img9DotW;
        if (--this._imgCount <= 0) this._state = S_NORMAL;
        else this._state = S_IMG9_B1;
        break;
      }

      case S_VT_LIST:
        if (ch === 0) {
          this._vtabLines = this._vtabPend.slice().sort((a, b) => a - b);
          this._state = S_NORMAL;
        } else {
          this._vtabPend.push(ch);
        }
        break;

      case S_HT_LIST:
        if (ch === 0) {
          this._htabCols = this._htabPend.slice().sort((a, b) => a - b);
          this._state = S_NORMAL;
        } else {
          this._htabPend.push(ch);
        }
        break;

      case S_ESC_C2:
        if (ch > 0) this.paper.setFormDots(ch * this.dpi); // ESC C 0 n — form length in inches
        this._state = S_NORMAL;
        break;

      case S_AMP1:
        this._state = S_AMP2; // absorb must-be-zero byte
        break;

      case S_AMP2:
        this._ampC1 = ch;
        this._state = S_AMP3;
        break;

      case S_AMP3:
        this._ampC2  = ch;
        this._ampCur = this._ampC1;
        if (this._ampCur > this._ampC2) { this._state = S_NORMAL; break; }
        this._ampBuf      = [];
        this._ampColsLeft = 11;
        this._state       = S_AMP_ATTR;
        break;

      case S_AMP_ATTR:
        // attribute byte consumed; we don't track proportional widths
        this._ampBuf      = [];
        this._ampColsLeft = 11;
        this._state       = S_AMP_DATA;
        break;

      case S_AMP_DATA:
        this._ampBuf.push(ch);
        if (--this._ampColsLeft <= 0) {
          this._customChars.set(this._ampCur, new Uint8Array(this._ampBuf));
          this._ampCur++;
          if (this._ampCur > this._ampC2) this._state = S_NORMAL;
          else this._state = S_AMP_ATTR;
        }
        break;
    }
  }

  _normal(ch) {
    // Apple/SSC end each line with CR+LF; coalesce an LF that arrives right after
    // a CR so the paper feeds once (no blank line between rows). Standalone LF
    // still feeds normally.
    const wasCR = this._lastCR;
    this._lastCR = false;
    switch (ch) {
      case 0x07: break;                           // BEL — ignore
      case 0x08:                                  // BS — backspace
        this._xDot = Math.max(this._leftMargin, this._xDot - this._charAdvance());
        break;
      case 0x09:                                  // HT — horizontal tab
        this._horizontalTab();
        break;
      case 0x0A:                                  // LF — line feed
        if (!(this._autoLF && wasCR)) {           // LF paired with an auto-LF CR is swallowed
          this._yDot += this._lineHeight;
          this.emit('linefeed');
          this._checkSkipPerf();
        }
        break;
      case 0x0B:                                  // VT — vertical tab
        this._verticalTab();
        break;
      case 0x0C:                                  // FF — form feed
        this.formFeed();   // slew to next top-of-form (shared with panel)
        break;
      case 0x0D:                                  // CR — carriage return
        // Whether CR also feeds is the Auto-LF DIP (SW2-1). ON: feed one line and
        // arm CR+LF coalescing (plain text / Applesoft sends CR only). OFF: return
        // the head only, so overprint passes register on the same band.
        this._xDot = this._leftMargin;
        if (this._autoLF) {
          this._yDot += this._lineHeight;
          this._lastCR = true;                    // arm CR+LF coalescing
          this.emit('newline');
          this._checkSkipPerf();
        } else {
          this.emit('carriagereturn');            // head home, no paper feed
        }
        break;
      case 0x0E:                                  // SO — one-line expanded on
        this._expanded = true;
        break;
      case 0x0F:                                  // SI — compressed on (17.16 cpi)
        this._pitch = 'compressed';
        break;
      case 0x11: break;                           // DC1 — printer on (ignore)
      case 0x12:                                  // DC2 — compressed off
        if (this._pitch === 'compressed') this._pitch = 'pica';
        break;
      case 0x13: break;                           // DC3 — printer off (ignore)
      case 0x14:                                  // DC4 — one-line expanded off
        this._expanded = false;
        break;
      case 0x18: break;                           // CAN — cancel buffer (ignore)
      case 0x1B:                                  // ESC
        this._state = S_ESC;
        break;
      case 0x7F: break;                           // DEL — ignore
      default:
        if (ch >= 0x20) this._emitChar(ch);
        break;
    }
  }

  _esc(ch) {
    this._state = S_NORMAL; // default: single-byte ESC command

    switch (ch) {
      // ——— No-parameter commands ———
      case 0x23: break;                           // ESC # — accept 8th bit as-is (ignore)
      case 0x30: this._lineHeight = this.dpi / 8;            break; // ESC 0 — 1/8" (9-dot)
      case 0x31: this._lineHeight = this.dpi * 7 / 72;       break; // ESC 1 — 7/72" (7-dot)
      case 0x32: this._lineHeight = this._defaultLineHeight; break; // ESC 2 — 1/6" (default)
      case 0x34: this._italic     = true;               break; // ESC 4 — italic on
      case 0x35: this._italic     = false;              break; // ESC 5 — italic off
      case 0x36: break;                           // ESC 6 — enable chars 128-159 (ignore)
      case 0x37: break;                           // ESC 7 — disable chars 128-159 (ignore)
      case 0x38: break;                           // ESC 8 — paper sensor off
      case 0x39: break;                           // ESC 9 — paper sensor on
      case 0x3C: break;                           // ESC < — one-line unidirectional (ignore)
      case 0x3D: break;                           // ESC = — high bit off (ignore)
      case 0x3E: break;                           // ESC > — high bit on (ignore)
      case 0x40:                                  // ESC @ — full reset
        this._resetRenderState();
        this._resetParserState();
        this._state = S_NORMAL;
        break;
      case 0x45: this._emphasized = true;  break; // ESC E — emphasized on
      case 0x46: this._emphasized = false; break; // ESC F — emphasized off
      case 0x47: this._dblStrike  = true;  break; // ESC G — double-strike on
      case 0x48: this._dblStrike  = false; break; // ESC H — double-strike off
      case 0x4D: this._pitch = 'elite';    break; // ESC M — elite on (12 cpi)
      case 0x4F: this._skipPerf = 0;       break; // ESC O — cancel skip-over-perforation
      case 0x50: this._pitch = 'pica';     break; // ESC P — elite off → pica
      case 0x54: this._script = 0;         break; // ESC T — cancel super/subscript

      // ——— Tab stop lists ———
      case 0x42: this._vtabPend = []; this._state = S_VT_LIST; break;  // ESC B n... 0 (vertical tab stops)
      case 0x44: this._htabPend = []; this._state = S_HT_LIST; break;  // ESC D n... 0 (horizontal tab stops)

      // ——— ESC * generic graphics (mode byte + count lo + count hi + data) ———
      case 0x2A:
        this._imgCount = 0;
        this._state    = S_IMG_MODE;
        break;

      // ——— Standard graphics commands (count lo + count hi + data) ———
      case 0x4B:
        this._imgDotW = this._imgWK; this._imgCount = 0; this._state = S_IMG_LO; break;
      case 0x4C:
        this._imgDotW = this._imgWL; this._imgCount = 0; this._state = S_IMG_LO; break;
      case 0x59:                                  // high-speed: same density as L
        this._imgDotW = this._imgWL; this._imgCount = 0; this._state = S_IMG_LO; break;
      case 0x5A:
        this._imgDotW = this._imgWZ; this._imgCount = 0; this._state = S_IMG_LO; break;

      // ——— Nine-pin graphics (density + count lo + count hi + pairs of data) ———
      case 0x5E:
        this._imgCount = 0; this._state = S_IMG9_D; break;

      // ——— User-defined character loading ———
      case 0x26: this._state = S_AMP1; break;     // ESC &

      // ——— Single-parameter commands ———
      case 0x21: // ESC ! n — Master Select
      case 0x2D: // ESC - n — underline toggle (0=off, 1=on)
      case 0x2F: // ESC / n — vertical tab channel (ignore)
      case 0x33: // ESC 3 n — n/216" line spacing
      case 0x41: // ESC A n — n/72" line spacing
      case 0x43: // ESC C n — form length in lines (0 → next byte = inches)
      case 0x49: // ESC I n — print control chars toggle (ignore)
      case 0x4A: // ESC J n — immediate n/216" line feed
      case 0x4E: // ESC N n — skip-over-perforation lines
      case 0x51: // ESC Q n — right margin
      case 0x52: // ESC R n — international charset
      case 0x53: // ESC S n — super/subscript (0=super, 1=sub)
      case 0x55: // ESC U n — unidirectional mode (ignore)
      case 0x57: // ESC W n — continuous expanded (0=off, 1=on)
      case 0x62: // ESC b n — vertical tab channel select (ignore)
      case 0x69: // ESC i n — immediate mode FX-80 (ignore)
      case 0x6A: // ESC j n — reverse feed n/216" (FX-80 only)
      case 0x6C: // ESC l n — left margin
      case 0x70: // ESC p n — proportional mode
      case 0x73: // ESC s n — half-speed mode (ignore)
        this._paramCmd = ch;
        this._state    = S_PARAM1;
        break;

      // ——— Two-parameter commands ———
      case 0x25: // ESC % n1 n2 — select char set (ignore)
      case 0x3F: // ESC ? s n — reassign graphics code s to density n (ignore)
        this._paramCmd = ch;
        this._state    = S_PARAM1;
        break;

      // ——— Three-parameter commands ———
      case 0x3A: // ESC : 0 0 0 — copy ROM to RAM (ignore)
        this._paramCmd = ch;
        this._state    = S_PARAM1;
        break;
    }
  }

  _param1(ch) {
    switch (this._paramCmd) {
      case 0x21: { // ESC ! n — Master Select
        // Bit layout per Vol 1 Ch.5 (p.76 Quick Reference Chart):
        // bit 0=elite, bit 1=proportional, bit 2=condensed, bit 3=bold(emph),
        // bit 4=double-strike, bit 5=expanded, bit 6=italic, bit 7=underline
        this._pitch       = (ch & 0x04) ? 'compressed' : (ch & 0x01) ? 'elite' : 'pica';
        this._proportional = !!(ch & 0x02);
        this._emphasized = !!(ch & 0x08);
        this._dblStrike  = !!(ch & 0x10);
        this._expanded   = !!(ch & 0x20);
        this._italic     = !!(ch & 0x40);
        this._underline  = !!(ch & 0x80);
        this._state = S_NORMAL;
        break;
      }
      case 0x2D: // ESC - n
        this._underline = (ch !== 0);
        this._state = S_NORMAL;
        break;
      case 0x2F: // ESC / n — ignore
        this._state = S_NORMAL;
        break;
      case 0x33: // ESC 3 n — n/216"
        this._lineHeight = ch * this._unit216;
        this._state = S_NORMAL;
        break;
      case 0x3A: // ESC : first param → need second
        this._state = S_PARAM2;
        break;
      case 0x3F: // ESC ? s → need n
        this._param1Val = ch;
        this._state = S_PARAM2;
        break;
      case 0x41: // ESC A n — n/72" (n=0-85; >85 treated as 85)
        this._lineHeight = Math.min(ch, 85) * (this.dpi / 72);
        this._state = S_NORMAL;
        break;
      case 0x43: // ESC C n — form length in lines (n=0 → next byte = inches)
        if (ch === 0) {
          this._state = S_ESC_C2;
        } else {
          this.paper.setFormDots(Math.round(ch * this._lineHeight));
          this._state = S_NORMAL;
        }
        break;
      case 0x25: // ESC % n1 → need n2
        this._state = S_PARAM2;
        break;
      case 0x49: // ESC I n — ignore
        this._state = S_NORMAL;
        break;
      case 0x4A: // ESC J n — immediate LF
        this._yDot += ch * this._unit216;
        this._state = S_NORMAL;
        break;
      case 0x4E: // ESC N n — skip-over-perforation: skip n lines at each page bottom
        this._skipPerf = ch;
        this._state = S_NORMAL;
        break;
      case 0x51: { // ESC Q n — right margin at column n (current pitch)
        const r = Math.round(ch * this._colDots());
        if (r > this._leftMargin) this._rightMargin = Math.min(r, this._printWidthDots());
        this._state = S_NORMAL;
        break;
      }
      case 0x52: // ESC R n — international charset (USA for sets not yet authored)
        this._intlSet = EPSON_INTL[ch] ?? 'US';
        this._state = S_NORMAL;
        break;
      case 0x53: // ESC S n
        this._script = (ch === 0) ? 1 : 2;
        this._state  = S_NORMAL;
        break;
      case 0x55: // ESC U n — ignore
        this._state = S_NORMAL;
        break;
      case 0x57: // ESC W n
        this._expanded = (ch !== 0);
        this._state    = S_NORMAL;
        break;
      case 0x62: // ESC b n — ignore
        this._state = S_NORMAL;
        break;
      case 0x69: // ESC i n — ignore
        this._state = S_NORMAL;
        break;
      case 0x6A: // ESC j n — reverse feed
        this._yDot  = Math.max(0, this._yDot - ch * this._unit216);
        this._state = S_NORMAL;
        break;
      case 0x6C: // ESC l n — left margin at column n (current pitch)
        this._leftMargin = Math.round(ch * this._colDots());
        if (this._xDot < this._leftMargin) this._xDot = this._leftMargin;
        this._state = S_NORMAL;
        break;
      case 0x70: // ESC p n — proportional spacing (0=off, 1=on)
        this._proportional = (ch !== 0);
        this._state = S_NORMAL;
        break;
      case 0x73: // ESC s n — ignore
        this._state = S_NORMAL;
        break;
      default:
        this._state = S_NORMAL;
        break;
    }
  }

  _param2(ch) {
    // ESC : needs a third byte; everything else is done after second
    this._state = (this._paramCmd === 0x3A) ? S_PARAM3 : S_NORMAL;
  }

  // DIP SW2-1 Automatic Line Feed, driven by the printer manager (shared toggle).
  setAutoLineFeed(on) { this._autoLF = !!on; }
  getAutoLineFeed()   { return this._autoLF; }

  // Printable carriage width (8") and one character column at the current pitch.
  _printWidthDots() { return this.dpi * 8; }
  _colDots()        { return this.dpi / CPI[this._pitch]; }

  // HT — advance to the next horizontal tab stop. Explicit stops (ESC D) are
  // columns from the left margin; with none set the default is every 8 columns.
  // A stop at or past the right margin is ignored (the head stays put).
  _horizontalTab() {
    const col = this._colDots();
    let next = null;
    if (this._htabCols.length) {
      for (const c of this._htabCols) {
        const x = this._leftMargin + Math.round(c * col);
        if (x > this._xDot + 0.5) { next = x; break; }
      }
    } else {
      const curCol = Math.round((this._xDot - this._leftMargin) / col);
      next = this._leftMargin + Math.round((Math.floor(curCol / 8) + 1) * 8 * col);
    }
    if (next != null && next <= this._rightMargin) this._xDot = next;
  }

  // VT — advance to the next vertical tab stop (ESC B, lines from top-of-form).
  // With no stop below the cursor it acts as a single line feed.
  _verticalTab() {
    if (this._vtabLines.length) {
      for (const ln of this._vtabLines) {
        const y = this.paper.topOfForm + Math.round(ln * this._lineHeight);
        if (y > this._yDot + 0.5) {
          this._yDot = y; this.emit('linefeed'); this._checkSkipPerf(); return;
        }
      }
    }
    this._yDot += this._lineHeight; this.emit('linefeed'); this._checkSkipPerf();
  }

  // Skip-over-perforation (ESC N): once the cursor reaches the last n lines of a
  // page, slew straight to the next page top so nothing prints across the fold.
  _checkSkipPerf() {
    if (this._skipPerf <= 0) return;
    const bottom = this.paper.nextFormTop(this._yDot);
    if (this._yDot > bottom - this._skipPerf * this._lineHeight) this.formFeed();
  }

  _charAdvance() {
    const base = this.dpi / CPI[this._pitch];
    return Math.round(this._expanded ? base * 2 : base);
  }

  _emitChar(code) {
    // Proportional spacing (ESC p / Master Select bit 1) draws each glyph from
    // the variable-width bank and advances by its own width plus one blank
    // intercharacter column. A code not yet authored in that bank — or fixed
    // mode — falls back to the fixed-pitch Roman/Italic glyph and pitch advance.
    let cols, advance;
    const custom = this._customChars.get(code);
    const prop   = this._proportional ? EPSON_FX_PROP_ROM[code] : null;
    if (custom) {
      cols = custom;          advance = this._charAdvance();
    } else if (prop) {
      cols = prop;
      const w = (prop.length + 1) * this._dotW;
      advance = Math.round(this._expanded ? w * 2 : w);
    } else {
      cols = this._romChar(code); advance = this._charAdvance();
    }
    if (!cols) return;

    // Auto-wrap: a glyph that would cross the right margin starts a fresh line
    // first (a hardware CR+LF, independent of the Auto-LF DIP). The leftMargin
    // guard guarantees forward progress so a too-narrow margin can't loop.
    if (this._xDot > this._leftMargin &&
        this._xDot + advance > this._rightMargin) {
      this._xDot   = this._leftMargin;
      this._yDot  += this._lineHeight;
      this._lastCR = false;
      this.emit('newline');
      this._checkSkipPerf();
    }

    this.emit('printChar', {
      cols,
      xDot:      this._xDot,
      yDot:      this._yDot,
      dotW:      this._dotW,
      dotH:      this._dotV,
      color:     'black',
      bold:      this._emphasized || this._dblStrike,
      underline: this._underline,
    });
    this.emit('text', String.fromCharCode(code));
    this._xDot += advance;
  }

  // Render from the FX-80's own font ROM: the Italic bank when italic is active
  // (ESC 4 / Master Select bit 6), otherwise Roman. A non-USA international set
  // (ESC R) overrides the dozen national code points first. Anything not yet
  // transcribed falls back to the ImageWriter II standard-fixed ROM, so the
  // printer stays usable while the Epson font is authored in rom-editor.html.
  // (Temporary borrow — drop once the Epson banks are fully populated.)
  _romChar(code) {
    const italic = this._italic;
    if (this._intlSet !== 'US') {
      const loc = italic ? EPSON_FX_ITALIC_ROM_LOCALES : EPSON_FX_ROM_LOCALES;
      const override = loc[this._intlSet]?.[code];
      if (override) return override;
    }
    const rom = italic ? EPSON_FX_ITALIC_ROM : EPSON_FX_ROM;
    return rom[code] ?? IW2_STANDARD_FIXED[code] ?? null;
  }

  getCharsPerSecond() { return 160; } // FX-80 draft
  getName() { return "Epson FX-80"; }
  getId()   { return "epson-fx80"; }
}
