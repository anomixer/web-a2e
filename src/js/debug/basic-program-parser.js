/*
 * basic-program-parser.js - Parse BASIC program from memory for debugger display
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * Applesoft BASIC Program Memory Layout:
 * - TXTTAB ($67-$68): Start of BASIC program text
 * - Program lines: [next-ptr:2][line-num:2][tokenized-text...][00]
 * - End marker: [00][00] (null next pointer)
 *
 * Execution State:
 * - CURLIN ($75-$76): Current line number being executed (CURLIN+1=$FF = direct mode)
 * - TXTPTR ($7A-$7B): Pointer to current position in program text
 */

import { APPLESOFT_TOKENS } from "../utils/basic-tokens.js";

export class BasicProgramParser {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.lineCache = null;
    this.lastTxttab = 0;
    this.lastVartab = 0;
    this._programBytes = null;
    this._programBase = 0;
  }

  /**
   * Read zero-page pointers for TXTTAB and VARTAB via batch
   */
  async _readPointers() {
    const zp = await this.wasmModule.batch([
      ['_readMainRAM', 0x67],
      ['_readMainRAM', 0x68],
      ['_readMainRAM', 0x69],
      ['_readMainRAM', 0x6A],
    ]);
    return {
      txttab: (zp[1] << 8) | zp[0],
      vartab: (zp[3] << 8) | zp[2],
    };
  }

  /**
   * Bulk-read the entire BASIC program from main RAM into a local buffer.
   * Stores the buffer for use by getCurrentStatementInfo/getStatementCount.
   */
  async _loadProgramBytes(txttab, vartab) {
    const mainRAMPtr = await this.wasmModule._getMainRAM();
    this._programBytes = await this.wasmModule.heapRead(mainRAMPtr + txttab, vartab - txttab);
    this._programBase = txttab;
  }

  /**
   * Read a byte from the cached program buffer by absolute address.
   * Falls back to 0 if address is out of range.
   */
  _peekCached(addr) {
    const offset = addr - this._programBase;
    if (offset < 0 || offset >= this._programBytes.length) return 0;
    return this._programBytes[offset];
  }

  /**
   * Read a 16-bit word from the cached program buffer by absolute address.
   */
  _readWordCached(addr) {
    const offset = addr - this._programBase;
    if (offset < 0 || offset + 1 >= this._programBytes.length) return 0;
    return (this._programBytes[offset + 1] << 8) | this._programBytes[offset];
  }

  /**
   * Get all program lines
   * Uses bulk heapRead to avoid per-byte round-trips through the Worker.
   * @returns {Promise<Array<{lineNumber: number, address: number, text: string, tokenAddress: number}>>}
   */
  async getLines() {
    const { txttab, vartab } = await this._readPointers();

    // Check cache validity
    if (
      this.lineCache &&
      txttab === this.lastTxttab &&
      vartab === this.lastVartab
    ) {
      return this.lineCache;
    }

    const lines = [];

    if (txttab === 0 || vartab === 0 || txttab >= vartab) {
      this.lineCache = lines;
      this.lastTxttab = txttab;
      this.lastVartab = vartab;
      this._programBytes = null;
      return lines;
    }

    // Read entire program in one round-trip
    await this._loadProgramBytes(txttab, vartab);

    let offset = 0;
    let safetyCount = 0;
    const maxLines = 10000;
    const programBytes = this._programBytes;

    while (offset + 4 <= programBytes.length && safetyCount < maxLines) {
      const nextPtr = (programBytes[offset + 1] << 8) | programBytes[offset];
      if (nextPtr === 0) break;

      const nextOffset = nextPtr - txttab;
      if (nextOffset <= offset || nextOffset > programBytes.length) break;

      const lineNumber = (programBytes[offset + 3] << 8) | programBytes[offset + 2];
      const textStart = offset + 4;

      // Find null terminator of tokenized text
      let textEnd = textStart;
      while (textEnd < nextOffset && programBytes[textEnd] !== 0) {
        textEnd++;
      }

      const tokenBytes = programBytes.slice(textStart, textEnd);
      const text = this._detokenize(tokenBytes);

      lines.push({
        lineNumber,
        address: txttab + offset,
        text,
        tokenAddress: txttab + textStart,
      });

      offset = nextOffset;
      safetyCount++;
    }

    this.lineCache = lines;
    this.lastTxttab = txttab;
    this.lastVartab = vartab;

    return lines;
  }

  /**
   * Invalidate the line cache (call when program may have changed)
   */
  invalidateCache() {
    this.lineCache = null;
    this._programBytes = null;
  }

  /**
   * Get a map of line numbers to addresses for breakpoint setting
   * @returns {Promise<Map<number, number>>}
   */
  async getLineAddressMap() {
    const lines = await this.getLines();
    const map = new Map();
    for (const line of lines) {
      map.set(line.lineNumber, line.address);
    }
    return map;
  }

  /**
   * Get execution state
   * @returns {Promise<{running: boolean, currentLine: number, txtptr: number}>}
   */
  async getExecutionState() {
    const zp = await this.wasmModule.batch([
      ['_readMainRAM', 0x75],
      ['_readMainRAM', 0x76],
      ['_readMainRAM', 0x7A],  // TXTPTR is at $7A-$7B but we only read $B8-$B9 below
      ['_readMainRAM', 0xB8],
      ['_readMainRAM', 0xB9],
    ]);
    const curlin = (zp[1] << 8) | zp[0];
    const curlinHi = zp[1];
    const txtptr = (zp[4] << 8) | zp[3];

    const running = this.wasmModule._isBasicProgramRunning
      ? await this.wasmModule._isBasicProgramRunning()
      : false;
    const directMode = curlinHi === 0xff;
    return {
      running,
      currentLine: !directMode ? curlin : null,
      txtptr,
    };
  }

  /**
   * Check if BASIC is running (CURLIN+1 != $FF, matching ROM check)
   */
  async isRunning() {
    const curlinHi = await this.wasmModule._readMainRAM(0x76);
    return curlinHi !== 0xff;
  }

  /**
   * Get current line number being executed
   * Returns null if in direct mode or not running
   */
  async getCurrentLine() {
    const zp = await this.wasmModule.batch([
      ['_readMainRAM', 0x75],
      ['_readMainRAM', 0x76],
    ]);
    if (zp[1] === 0xff) return null;
    return (zp[1] << 8) | zp[0];
  }

  /**
   * Get current text pointer position
   */
  async getTxtptr() {
    const zp = await this.wasmModule.batch([
      ['_readMainRAM', 0xB8],
      ['_readMainRAM', 0xB9],
    ]);
    return (zp[1] << 8) | zp[0];
  }

  /**
   * Find line info by line number
   */
  async findLine(lineNumber) {
    const lines = await this.getLines();
    return lines.find((l) => l.lineNumber === lineNumber) || null;
  }

  /**
   * Find the line containing the given address
   */
  async findLineByAddress(addr) {
    const lines = await this.getLines();
    const { vartab } = await this._readPointers();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];
      const endAddr = nextLine ? nextLine.address : vartab;

      if (addr >= line.address && addr < endAddr) {
        return line;
      }
    }
    return null;
  }

  /**
   * Get current statement info for the given line and TXTPTR.
   * Uses the cached program buffer from the last getLines() call for fast local access.
   * Returns {statementIndex, statementCount, statementStart, statementEnd}
   * where statementStart/End are character offsets in the detokenized text
   */
  async getCurrentStatementInfo(lineNumber, txtptr) {
    const line = await this.findLine(lineNumber);
    if (!line) return null;

    // Use cached program bytes if available, otherwise load them
    if (!this._programBytes) {
      const { txttab, vartab } = await this._readPointers();
      if (txttab === 0 || vartab === 0 || txttab >= vartab) return null;
      await this._loadProgramBytes(txttab, vartab);
    }

    // Find end of this line's tokens from cached buffer
    const nextPtr = this._readWordCached(line.address);
    const tokenStart = line.tokenAddress;
    const tokenEnd = nextPtr - 1; // -1 for null terminator

    // If TXTPTR is outside this line, return null
    if (txtptr < tokenStart || txtptr > tokenEnd) {
      return null;
    }

    // Parse tokenized bytes to find statement boundaries (colons not in quotes/REM/DATA)
    const statementBoundaries = [0]; // Start positions in detokenized text
    let inQuote = false;
    let inRem = false;
    let inData = false;
    let detokenizedPos = 0;
    let currentStatementIndex = 0;

    for (let addr = tokenStart; addr < tokenEnd; addr++) {
      const byte = this._peekCached(addr);

      // Track if we've passed TXTPTR
      if (addr === txtptr) {
        currentStatementIndex = statementBoundaries.length - 1;
      }

      // Handle quotes
      if (byte === 0x22) { // Quote
        inQuote = !inQuote;
        detokenizedPos++;
        continue;
      }

      // Inside quote or REM - just count characters
      if (inQuote || inRem) {
        detokenizedPos++;
        continue;
      }

      // Token range: $80-$EA
      if (byte >= 0x80 && byte <= 0xea) {
        const token = this._getTokenString(byte);
        if (token) {
          detokenizedPos += token.length;
          if (byte === 0xb2) inRem = true; // REM
          if (byte === 0x83) inData = true; // DATA
          continue;
        }
      }

      // Colon outside quotes/REM marks statement boundary
      if (byte === 0x3a && !inData) { // Colon
        detokenizedPos++;
        statementBoundaries.push(detokenizedPos);
        continue;
      }

      // Inside DATA - colons end DATA mode
      if (inData && byte === 0x3a) {
        inData = false;
      }

      detokenizedPos++;
    }

    // Add end position
    statementBoundaries.push(line.text.length);

    // Handle case where TXTPTR is at or past the last checked position
    if (txtptr >= tokenEnd) {
      currentStatementIndex = statementBoundaries.length - 2;
    }

    return {
      statementIndex: currentStatementIndex,
      statementCount: statementBoundaries.length - 1,
      statementStart: statementBoundaries[currentStatementIndex] || 0,
      statementEnd: statementBoundaries[currentStatementIndex + 1] || line.text.length,
    };
  }

  /**
   * Get the number of statements in a given line (colons + 1, respecting quotes/REM/DATA)
   * @param {number} lineNumber
   * @returns {Promise<number>} statement count (1 if no colons)
   */
  async getStatementCount(lineNumber) {
    const line = await this.findLine(lineNumber);
    if (!line) return 1;

    // Use cached program bytes if available, otherwise load them
    if (!this._programBytes) {
      const { txttab, vartab } = await this._readPointers();
      if (txttab === 0 || vartab === 0 || txttab >= vartab) return 1;
      await this._loadProgramBytes(txttab, vartab);
    }

    const nextPtr = this._readWordCached(line.address);
    const tokenStart = line.tokenAddress;
    const tokenEnd = nextPtr - 1;

    let colonCount = 0;
    let inQuote = false;
    let inRem = false;

    for (let addr = tokenStart; addr < tokenEnd; addr++) {
      const byte = this._peekCached(addr);
      if (byte === 0) break;
      if (inRem) continue;
      if (byte === 0x22) { inQuote = !inQuote; continue; }
      if (inQuote) continue;
      if (byte === 0xB2) { inRem = true; continue; }
      if (byte === 0x3A) colonCount++;
    }

    return colonCount + 1;
  }

  /**
   * Get token string for a token byte
   */
  _getTokenString(byte) {
    if (byte >= 0x80 && byte <= 0xea) {
      return APPLESOFT_TOKENS[byte - 0x80] || null;
    }
    return null;
  }

  /**
   * Detokenize Applesoft BASIC tokens with proper spacing
   */
  _detokenize(bytes) {
    let result = "";
    let inQuote = false;
    let inRem = false;
    let inData = false;

    // Helper to check if character is alphanumeric
    const isAlphaNum = (c) => /[A-Za-z0-9]/.test(c);

    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];

      // Inside quote or REM/DATA - output as character (no spacing changes)
      if (inQuote || inRem) {
        if (byte === 0x22) inQuote = false; // End quote
        result += String.fromCharCode(byte & 0x7f);
        continue;
      }

      // Check for quote start
      if (byte === 0x22) {
        inQuote = true;
        result += '"';
        continue;
      }

      // Token range: $80-$EA
      if (byte >= 0x80 && byte <= 0xea) {
        const token = APPLESOFT_TOKENS[byte - 0x80];
        if (token) {
          // Add space before token if last char is alphanumeric
          const lastChar = result.length > 0 ? result[result.length - 1] : "";
          if (isAlphaNum(lastChar)) {
            result += " ";
          }

          result += token;

          // Check for REM or DATA
          if (byte === 0xb2) inRem = true; // REM
          if (byte === 0x83) inData = true; // DATA

          // Add space after token if next byte isn't a space and token ends with a letter
          const nextByte = i + 1 < bytes.length ? bytes[i + 1] : 0;
          if (nextByte !== 0x20 && nextByte !== 0 && isAlphaNum(token[token.length - 1])) {
            result += " ";
          }
          continue;
        }
      }

      // Inside DATA - colons end DATA mode
      if (inData && byte === 0x3a) {
        inData = false;
      }

      // Regular character
      const char = String.fromCharCode(byte & 0x7f);

      // Consume contiguous number (digits + optional decimal point)
      if (byte >= 0x30 && byte <= 0x39) {
        const lastChar = result.length > 0 ? result[result.length - 1] : "";
        if (isAlphaNum(lastChar)) {
          result += " ";
        }
        result += char;
        while (i + 1 < bytes.length) {
          const next = bytes[i + 1];
          if ((next >= 0x30 && next <= 0x39) || next === 0x2e) {
            result += String.fromCharCode(next);
            i++;
          } else {
            break;
          }
        }
        continue;
      }

      // Consume contiguous variable name (letters + digits + $ + %)
      const isLetter = (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);
      if (isLetter) {
        const lastChar = result.length > 0 ? result[result.length - 1] : "";
        if (isAlphaNum(lastChar)) {
          result += " ";
        }
        result += char;
        while (i + 1 < bytes.length) {
          const next = bytes[i + 1];
          const nextIsLetter =
            (next >= 0x41 && next <= 0x5a) || (next >= 0x61 && next <= 0x7a);
          const nextIsDigit = next >= 0x30 && next <= 0x39;
          if (nextIsLetter || nextIsDigit || next === 0x24 || next === 0x25) {
            result += String.fromCharCode(next);
            i++;
          } else {
            break;
          }
        }
        continue;
      }

      result += char;
    }

    return result;
  }

}
