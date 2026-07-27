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

import { indexBasicListing } from "../utils/basic-listing.js";

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
    this._programAddr = mainRAMPtr + txttab;
    this._programSize = vartab - txttab;
  }

  /**
   * Detokenize the whole program with the C++ core and index it by line number.
   *
   * The program is already in the WASM heap, so its address goes straight to
   * the detokenizer — nothing is copied out and back, and one call replaces a
   * per-line JS decode. Keyed by line number rather than position so a
   * disagreement about where the program ends cannot silently shift every
   * line's text by one.
   *
   * @returns {Promise<Map<number, string>>}
   */
  async _detokenizeProgram() {
    const listingPtr = await this.wasmModule._detokenizeApplesoft(
      this._programAddr,
      this._programSize,
      false, // no DOS 3.3 length header: this is live memory, not a file
    );
    const listing = await this.wasmModule.UTF8ToString(listingPtr);

    return indexBasicListing(listing);
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

    // Line text comes from the core; the walk below still supplies the byte
    // addresses that breakpoints and statement lookup need.
    const textByLine = await this._detokenizeProgram();

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

      const text = textByLine.get(lineNumber) ?? "";

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
   *
   * Returns {statementIndex, statementCount}, or null when TXTPTR is not
   * within this line. The former statementStart/statementEnd character offsets
   * are gone — they were computed on every call and read by nothing.
   *
   * @param {number} lineNumber
   * @param {number} txtptr
   * @returns {Promise<{statementIndex: number, statementCount: number}|null>}
   */
  async getCurrentStatementInfo(lineNumber, txtptr) {
    const line = await this.findLine(lineNumber);
    if (!line) return null;

    // Cached program bytes are needed for the containment check below.
    if (!this._programBytes) {
      const { txttab, vartab } = await this._readPointers();
      if (txttab === 0 || vartab === 0 || txttab >= vartab) return null;
      await this._loadProgramBytes(txttab, vartab);
    }

    const nextPtr = this._readWordCached(line.address);
    const tokenStart = line.tokenAddress;
    const tokenEnd = nextPtr - 1; // -1 for the null terminator

    // TXTPTR outside this line means execution is not on it.
    if (txtptr < tokenStart || txtptr > tokenEnd) return null;

    // The colon scan lives in the core, where it also decides which statement a
    // breakpoint fires on. Doing it here as well meant the highlight and the
    // breakpoint could disagree — and the two JS scans disagreed with each
    // other, since only this one treated colons inside DATA specially.
    const [statementIndex, statementCount] = await this.wasmModule.batch([
      ["_getBasicStatementIndexForLine", lineNumber, txtptr],
      ["_getBasicStatementCountForLine", lineNumber],
    ]);

    return { statementIndex, statementCount };
  }

  /**
   * Get the number of statements in a given line (colons + 1, respecting
   * quotes and REM)
   * @param {number} lineNumber
   * @returns {Promise<number>} statement count (1 if no colons)
   */
  async getStatementCount(lineNumber) {
    return this.wasmModule._getBasicStatementCountForLine(lineNumber);
  }

}
