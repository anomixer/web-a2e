/*
 * basic-tokenizer.js - Applesoft BASIC tokenizer for direct memory insertion
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { APPLESOFT_TOKENS } from './basic-tokens.js';

// Build a lookup from keyword string to token byte value.
// Sort by length descending for greedy longest-match.
const KEYWORD_LIST = APPLESOFT_TOKENS
  .map((kw, i) => ({ keyword: kw, token: 0x80 + i }))
  .sort((a, b) => b.keyword.length - a.keyword.length);

/**
 * Tokenize a single BASIC line's content (without the line number).
 * @param {string} text - The line content (e.g. "PRINT \"HELLO\":GOTO 10")
 * @returns {Uint8Array} Tokenized bytes
 */
export function tokenizeLine(text) {
  const bytes = [];
  const upper = text.toUpperCase();
  let i = 0;
  let inRem = false;
  let inData = false;
  let inQuote = false;

  while (i < upper.length) {
    const ch = upper[i];

    // Inside a quoted string - emit as-is until closing quote
    if (inQuote) {
      bytes.push(text.charCodeAt(i));
      if (ch === '"') {
        inQuote = false;
      }
      i++;
      continue;
    }

    // After REM token - emit rest of line as raw ASCII
    if (inRem) {
      bytes.push(text.charCodeAt(i));
      i++;
      continue;
    }

    // After DATA token - emit as-is until colon
    if (inData) {
      if (ch === ':') {
        inData = false;
        // Fall through to normal processing for the colon
      } else {
        bytes.push(text.charCodeAt(i));
        i++;
        continue;
      }
    }

    // Opening quote
    if (ch === '"') {
      inQuote = true;
      bytes.push(text.charCodeAt(i));
      i++;
      continue;
    }

    // ? is shorthand for PRINT
    if (ch === '?') {
      bytes.push(0xBA); // PRINT token
      i++;
      continue;
    }

    // Try greedy longest-match against keywords
    let matched = false;
    const remaining = upper.substring(i);

    for (const { keyword, token } of KEYWORD_LIST) {
      if (remaining.startsWith(keyword)) {
        bytes.push(token);
        i += keyword.length;
        matched = true;

        if (token === 0xB2) { // REM
          inRem = true;
        } else if (token === 0x83) { // DATA
          inData = true;
        }
        break;
      }
    }

    if (!matched) {
      // Emit character as ASCII byte
      bytes.push(text.charCodeAt(i));
      i++;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Build a full tokenized Applesoft BASIC program in memory format.
 * @param {Array<{lineNumber: number, content: string}>} lines - Parsed program lines
 * @param {number} [txttab=0x0801] - Starting address of the program
 * @returns {{ bytes: Uint8Array, endAddr: number }}
 */
export function tokenizeProgram(lines, txttab = 0x0801) {
  // First pass: tokenize all lines and compute sizes
  const tokenizedLines = lines.map(line => {
    const tokenBytes = tokenizeLine(line.content);
    // Each line: [next-ptr:2] [line-num:2] [token-bytes...] [0x00]
    const lineSize = 2 + 2 + tokenBytes.length + 1;
    return { lineNumber: line.lineNumber, tokenBytes, lineSize };
  });

  // Calculate total size: all lines + end marker (0x00, 0x00)
  const totalSize = tokenizedLines.reduce((sum, l) => sum + l.lineSize, 0) + 2;
  const bytes = new Uint8Array(totalSize);
  let offset = 0;
  let addr = txttab;

  // Second pass: write bytes with correct next-pointers
  for (const line of tokenizedLines) {
    const nextAddr = addr + line.lineSize;

    // Next-pointer (little-endian)
    bytes[offset] = nextAddr & 0xFF;
    bytes[offset + 1] = (nextAddr >> 8) & 0xFF;

    // Line number (little-endian)
    bytes[offset + 2] = line.lineNumber & 0xFF;
    bytes[offset + 3] = (line.lineNumber >> 8) & 0xFF;

    // Token bytes
    bytes.set(line.tokenBytes, offset + 4);

    // Line terminator
    bytes[offset + 4 + line.tokenBytes.length] = 0x00;

    offset += line.lineSize;
    addr = nextAddr;
  }

  // End-of-program marker
  bytes[offset] = 0x00;
  bytes[offset + 1] = 0x00;

  return { bytes, endAddr: addr + 2 };
}
