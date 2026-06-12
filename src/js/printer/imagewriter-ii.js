/*
 * imagewriter-ii.js - Apple ImageWriter II printer emulation
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { PrinterBase } from "./printer-base.js";
import { DRAFT_ROM, DRAFT_ROM_LOCALES } from "./imagewriter-rom-draft.js";

const S_NORMAL       = 0; // normal character output
const S_ESC          = 1; // consumed ESC, waiting for command byte
const S_PARAM1       = 2; // consuming one parameter byte then back to normal
const S_IMG_LO       = 3; // bit-image: low byte of column count
const S_IMG_HI       = 4; // bit-image: high byte of column count
const S_IMG_DATA     = 5; // bit-image: consuming image data bytes
const S_CUSTOM_KEY   = 6; // custom char load: waiting for KEY byte or CTRL-D
const S_CUSTOM_WIDTH = 7; // custom char load: waiting for WIDTH CODE byte
const S_CUSTOM_DATA  = 8; // custom char load: consuming column data bytes

// Internal canvas resolution: 480 dpi (LCM of 80, 120, 160)
const DPI          = 480;
const DOT_W        = DPI / 120;   // 4 px — draft char dot column width (120 dpi horiz)
const DOT_V        = DPI / 72;    // ~6.667 px — vertical dot pitch (72 dpi vert)
const IMG_W_SINGLE = DPI / 80;    // 6 px — ESC L single-density column
const IMG_W_DOUBLE = DPI / 160;   // 3 px — ESC Y/Z double-density column

// Characters per inch → char advance width in canvas px
const CPI = { pica: 10, elite: 12, condensed: 15, ultra: 17 };

// ESC K colour index → CSS colour
const COLORS = ['black', 'yellow', 'red', 'blue'];

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
    this._imgDotW        = IMG_W_SINGLE;
    this._customKey      = 0;
    this._customWireTop  = true;
    this._customDataLeft = 0;
    this._customDataBuf  = [];
    this._paramCmd       = 0;
  }

  _resetRenderState() {
    this._pitch      = 'pica';
    this._bold       = false;
    this._underline  = false;
    this._color      = 'black';
    this._lineHeight = DPI / 6;   // 6 lpi default
    this._xDot       = 0;
    this._yDot       = 0;
  }

  reset() {
    // Custom chars survive software reset per spec Ch.6
    this._resetParserState();
    this._resetRenderState();
  }

  receiveByte(byte) {
    const ch = byte & 0x7F; // strip Apple II high bit

    switch (this._state) {
      case S_NORMAL:
        if (ch === 0x1B) {
          this._state = S_ESC;
        } else if (ch === 0x0C) {
          this._xDot = 0; this._yDot = 0;
          this.emit('formfeed');
        } else if (ch === 0x0D) {
          this._xDot = 0;
          this._yDot += this._lineHeight;
          this.emit('newline');
        } else if (ch === 0x0A) {
          this._yDot += this._lineHeight;
          this.emit('linefeed');
        } else if (ch >= 0x20 && ch < 0x7F) {
          this._emitChar(ch);
        }
        break;

      case S_ESC:
        this._state = S_NORMAL;
        switch (ch) {
          // Character pitch
          case 0x4E: this._pitch = 'pica';      break;  // ESC N — pica (10 cpi)
          case 0x45: this._pitch = 'elite';     break;  // ESC E — elite (12 cpi)
          case 0x71: this._pitch = 'condensed'; break;  // ESC q — condensed (15 cpi)
          case 0x51: this._pitch = 'ultra';     break;  // ESC Q — ultracondensed (17 cpi)

          // Print style
          case 0x21: this._bold      = true;  break;  // ESC ! — bold on
          case 0x22: this._bold      = false; break;  // ESC " — bold off
          case 0x58: this._underline = true;  break;  // ESC X — underline on
          // Note: IW-II underline-off code unconfirmed (IW-I used ESC Y but IW-II repurposes it for bit-image)

          // Commands consuming one parameter byte
          case 0x41: // ESC A — line spacing n/144 inch
          case 0x43: // ESC C — form length (ignored)
          case 0x61: // ESC a — (consume param, no effect)
          case 0x4B: // ESC K — color select
            this._paramCmd = ch;
            this._state    = S_PARAM1;
            break;

          // Bit-image graphics
          case 0x4C:          // ESC L — single density 80 dpi
            this._imgDotW  = IMG_W_SINGLE;
            this._imgCount = 0;
            this._state    = S_IMG_LO;
            break;
          case 0x59:          // ESC Y — double density 160 dpi, bidirectional
          case 0x5A:          // ESC Z — double density 160 dpi, unidirectional
            this._imgDotW  = IMG_W_DOUBLE;
            this._imgCount = 0;
            this._state    = S_IMG_LO;
            break;

          // Custom character width / clear
          case 0x2D: this._customMaxWidth = 8;  this._customChars.clear(); break;  // ESC -
          case 0x2B: this._customMaxWidth = 16; this._customChars.clear(); break;  // ESC +

          // Custom character load
          case 0x49: this._state = S_CUSTOM_KEY; break;  // ESC I

          // Software reset (render state resets; custom chars survive)
          case 0x63: this._resetRenderState(); this._resetParserState(); break;  // ESC c
        }
        break;

      case S_PARAM1:
        switch (this._paramCmd) {
          case 0x41: this._lineHeight = (ch / 144) * DPI; break;  // ESC A n — n/144 inch spacing
          case 0x4B: this._color = COLORS[ch & 3] ?? 'black'; break;  // ESC K n — color
          case 0x43: break;  // ESC C n — form length (ignored)
          case 0x61: break;  // ESC a n — (reserved, ignored)
        }
        this._state = S_NORMAL;
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
          byte:  ch,
          xDot:  this._xDot,
          yDot:  this._yDot,
          dotW:  this._imgDotW,
          dotH:  DOT_V,
          color: this._color,
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
        this._customDataBuf.push(ch);
        if (--this._customDataLeft <= 0) {
          this._customChars.set(this._customKey, {
            wireTop: this._customWireTop,
            data: new Uint8Array(this._customDataBuf),
          });
          this._state = S_CUSTOM_KEY;
        }
        break;
    }
  }

  _emitChar(code) {
    const cols = this.getDraftChar(code);
    this.emit('printChar', {
      cols,
      xDot:      this._xDot,
      yDot:      this._yDot,
      dotW:      DOT_W,
      dotH:      DOT_V,
      color:     this._color,
      bold:      this._bold,
      underline: this._underline,
    });
    // Plain-text event for text-mode listeners
    this.emit('text', String.fromCharCode(code));
    this._xDot += Math.round(DPI / CPI[this._pitch]);
  }

  // Returns custom char definition or null
  getCustomChar(code) {
    return this._customChars.get(code) ?? null;
  }

  // Returns draft ROM column data (9-bit: bit 0=wire1 … bit 8=wire9), or null
  getDraftChar(code, locale = 'US') {
    if (locale !== 'US') {
      const override = DRAFT_ROM_LOCALES[locale]?.[code];
      if (override) return override;
    }
    return DRAFT_ROM[code] ?? null;
  }

  // Canvas resolution constants (px at 480 dpi internal)
  static get DPI()    { return DPI; }
  static get DOT_W()  { return DOT_W; }
  static get DOT_V()  { return DOT_V; }

  getName() { return "ImageWriter II"; }
  getId()   { return "imagewriter-ii"; }
}
