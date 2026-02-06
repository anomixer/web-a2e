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
 * - CURLIN ($75-$76): Current line number being executed (0xFFFF = direct mode)
 * - TXTPTR ($7A-$7B): Pointer to current position in program text
 */
export class BasicProgramParser {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.lineCache = null;
    this.lastTxttab = 0;
    this.lastVartab = 0;
  }

  /**
   * Get all program lines
   * @returns {Array<{lineNumber: number, address: number, text: string}>}
   */
  getLines() {
    const txttab = this._readWord(0x67);
    const vartab = this._readWord(0x69);

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
      return lines;
    }

    let addr = txttab;
    const endAddr = vartab;
    let safetyCount = 0;
    const maxLines = 10000;

    while (addr < endAddr && safetyCount < maxLines) {
      const nextPtr = this._readWord(addr);

      // End of program
      if (nextPtr === 0) break;

      const lineNumber = this._readWord(addr + 2);
      const textStart = addr + 4;

      // Find end of line (null terminator)
      let textEnd = textStart;
      while (this._peek(textEnd) !== 0 && textEnd < nextPtr) {
        textEnd++;
      }

      // Read tokenized bytes
      const tokenBytes = new Uint8Array(textEnd - textStart);
      for (let i = 0; i < tokenBytes.length; i++) {
        tokenBytes[i] = this._peek(textStart + i);
      }

      // Detokenize
      const text = this._detokenize(tokenBytes);

      lines.push({
        lineNumber,
        address: addr,
        text,
        tokenAddress: textStart,
      });

      addr = nextPtr;
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
  }

  /**
   * Get a map of line numbers to addresses for breakpoint setting
   * @returns {Map<number, number>}
   */
  getLineAddressMap() {
    const lines = this.getLines();
    const map = new Map();
    for (const line of lines) {
      map.set(line.lineNumber, line.address);
    }
    return map;
  }

  /**
   * Get execution state
   * @returns {{running: boolean, currentLine: number, txtptr: number}}
   */
  getExecutionState() {
    const curlin = this._readWord(0x75);
    const txtptr = this._readWord(0x7a);

    // CURLIN = $FFFF means direct/immediate mode (not running a program)
    return {
      running: curlin !== 0xffff,
      currentLine: curlin === 0xffff ? null : curlin,
      txtptr,
    };
  }

  /**
   * Check if BASIC is running (CURLIN != $FFFF)
   */
  isRunning() {
    return this._readWord(0x75) !== 0xffff;
  }

  /**
   * Get current line number being executed
   * Returns null if in direct mode or not running
   */
  getCurrentLine() {
    const curlin = this._readWord(0x75);
    return curlin === 0xffff ? null : curlin;
  }

  /**
   * Get current text pointer position
   */
  getTxtptr() {
    return this._readWord(0x7a);
  }

  /**
   * Find line info by line number
   */
  findLine(lineNumber) {
    const lines = this.getLines();
    return lines.find((l) => l.lineNumber === lineNumber) || null;
  }

  /**
   * Find the line containing the given address
   */
  findLineByAddress(addr) {
    const lines = this.getLines();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];
      const endAddr = nextLine ? nextLine.address : this._readWord(0x69);

      if (addr >= line.address && addr < endAddr) {
        return line;
      }
    }
    return null;
  }

  /**
   * Get current statement info for the given line and TXTPTR
   * Returns {statementIndex, statementCount, statementStart, statementEnd}
   * where statementStart/End are character offsets in the detokenized text
   */
  getCurrentStatementInfo(lineNumber, txtptr) {
    const line = this.findLine(lineNumber);
    if (!line) return null;

    // Find end of this line's tokens
    const nextPtr = this._readWord(line.address);
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
      const byte = this._peek(addr);

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
          // Add space before token if both last char and first token char are alphanumeric
          const lastChar = result.length > 0 ? result[result.length - 1] : "";
          if (isAlphaNum(lastChar) && isAlphaNum(token[0])) {
            result += " ";
          }

          result += token;

          // Check for REM or DATA
          if (byte === 0xb2) inRem = true; // REM
          if (byte === 0x83) inData = true; // DATA
          continue;
        }
      }

      // Inside DATA - colons end DATA mode
      if (inData && byte === 0x3a) {
        inData = false;
      }

      // Regular character
      const char = String.fromCharCode(byte & 0x7f);

      // Add space before alphanumeric char if last char was also alphanumeric
      // (handles spacing after tokens like FOR, TO, NEXT, etc.)
      const lastChar = result.length > 0 ? result[result.length - 1] : "";
      if (isAlphaNum(char) && isAlphaNum(lastChar)) {
        result += " ";
      }

      result += char;
    }

    return result;
  }

  /**
   * Read a 16-bit word from memory (low byte first)
   * Uses main RAM for zero page to bypass ALTZP switch
   */
  _readWord(addr) {
    // Zero page reads need to bypass ALTZP since BASIC always uses main RAM
    if (addr < 0x200) {
      const low = this._peekMain(addr);
      const high = this._peekMain(addr + 1);
      return (high << 8) | low;
    }
    const low = this._peek(addr);
    const high = this._peek(addr + 1);
    return (high << 8) | low;
  }

  /**
   * Read a byte from memory (non-side-effecting)
   */
  _peek(addr) {
    try {
      return this.wasmModule._peekMemory(addr);
    } catch (e) {
      return 0;
    }
  }

  /**
   * Read a byte directly from main RAM (bypasses ALTZP)
   * Use for BASIC zero page variables which are always in main RAM
   */
  _peekMain(addr) {
    try {
      return this.wasmModule._readMainRAM(addr);
    } catch (e) {
      return 0;
    }
  }
}

// Applesoft BASIC tokens ($80-$EA)
const APPLESOFT_TOKENS = [
  "END", // $80
  "FOR", // $81
  "NEXT", // $82
  "DATA", // $83
  "INPUT", // $84
  "DEL", // $85
  "DIM", // $86
  "READ", // $87
  "GR", // $88
  "TEXT", // $89
  "PR#", // $8A
  "IN#", // $8B
  "CALL", // $8C
  "PLOT", // $8D
  "HLIN", // $8E
  "VLIN", // $8F
  "HGR2", // $90
  "HGR", // $91
  "HCOLOR=", // $92
  "HPLOT", // $93
  "DRAW", // $94
  "XDRAW", // $95
  "HTAB", // $96
  "HOME", // $97
  "ROT=", // $98
  "SCALE=", // $99
  "SHLOAD", // $9A
  "TRACE", // $9B
  "NOTRACE", // $9C
  "NORMAL", // $9D
  "INVERSE", // $9E
  "FLASH", // $9F
  "COLOR=", // $A0
  "POP", // $A1
  "VTAB", // $A2
  "HIMEM:", // $A3
  "LOMEM:", // $A4
  "ONERR", // $A5
  "RESUME", // $A6
  "RECALL", // $A7
  "STORE", // $A8
  "SPEED=", // $A9
  "LET", // $AA
  "GOTO", // $AB
  "RUN", // $AC
  "IF", // $AD
  "RESTORE", // $AE
  "&", // $AF
  "GOSUB", // $B0
  "RETURN", // $B1
  "REM", // $B2
  "STOP", // $B3
  "ON", // $B4
  "WAIT", // $B5
  "LOAD", // $B6
  "SAVE", // $B7
  "DEF", // $B8
  "POKE", // $B9
  "PRINT", // $BA
  "CONT", // $BB
  "LIST", // $BC
  "CLEAR", // $BD
  "GET", // $BE
  "NEW", // $BF
  "TAB(", // $C0
  "TO", // $C1
  "FN", // $C2
  "SPC(", // $C3
  "THEN", // $C4
  "AT", // $C5
  "NOT", // $C6
  "STEP", // $C7
  "+", // $C8
  "-", // $C9
  "*", // $CA
  "/", // $CB
  "^", // $CC (actually up arrow in Applesoft)
  "AND", // $CD
  "OR", // $CE
  ">", // $CF
  "=", // $D0
  "<", // $D1
  "SGN", // $D2
  "INT", // $D3
  "ABS", // $D4
  "USR", // $D5
  "FRE", // $D6
  "SCRN(", // $D7
  "PDL", // $D8
  "POS", // $D9
  "SQR", // $DA
  "RND", // $DB
  "LOG", // $DC
  "EXP", // $DD
  "COS", // $DE
  "SIN", // $DF
  "TAN", // $E0
  "ATN", // $E1
  "PEEK", // $E2
  "LEN", // $E3
  "STR$", // $E4
  "VAL", // $E5
  "ASC", // $E6
  "CHR$", // $E7
  "LEFT$", // $E8
  "RIGHT$", // $E9
  "MID$", // $EA
];
