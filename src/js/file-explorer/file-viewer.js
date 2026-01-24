/**
 * File Viewer - Formats and displays file contents
 * Supports different Apple II file types
 */

import { getBinaryFileInfo } from "./dos33.js";
import { disassemble } from "./disassembler.js";
import { escapeHtml } from "../utils/string-utils.js";
import { APPLESOFT_TOKENS } from "../utils/basic-tokens.js";
import { getBasicKeywordClass } from "../utils/basic-highlighting.js";

// Integer BASIC tokens ($00-$7F)
// Source: https://github.com/paleotronic/diskm8/blob/master/disk/atokens.go
// Note: $01 = end of line, $B0-$B9 = numeric constant prefix (followed by 2-byte integer)
const INTEGER_BASIC_TOKENS = {
  0x00: " HIMEM: ",
  0x02: "_",
  0x03: ":",
  0x04: " LOAD ",
  0x05: " SAVE ",
  0x06: " CON ",
  0x07: " RUN ",
  0x08: " RUN ",
  0x09: " DEL ",
  0x0a: ",",
  0x0b: " NEW ",
  0x0c: " CLR ",
  0x0d: " AUTO ",
  0x0e: ",",
  0x0f: " MAN ",
  0x10: " HIMEM: ",
  0x11: " LOMEM: ",
  0x12: "+",
  0x13: "-",
  0x14: "*",
  0x15: "/",
  0x16: "=",
  0x17: "#",
  0x18: ">=",
  0x19: ">",
  0x1a: "<=",
  0x1b: "<>",
  0x1c: "<",
  0x1d: " AND ",
  0x1e: " OR ",
  0x1f: " MOD ",
  0x20: "^",
  0x21: "+",
  0x22: "(",
  0x23: ",",
  0x24: " THEN ",
  0x25: " THEN ",
  0x26: ",",
  0x27: ",",
  0x28: '"',
  0x29: '"',
  0x2a: "(",
  0x2b: "!",
  0x2c: "!",
  0x2d: "(",
  0x2e: "PEEK",
  0x2f: "RND",
  0x30: "SGN",
  0x31: "ABS",
  0x32: "PDL",
  0x33: "RNDX",
  0x34: "(",
  0x35: "+",
  0x36: "-",
  0x37: " NOT ",
  0x38: "(",
  0x39: "=",
  0x3a: "#",
  0x3b: "LEN(",
  0x3c: "ASC(",
  0x3d: "SCRN(",
  0x3e: ",",
  0x3f: "(",
  0x40: "$",
  0x41: "$",
  0x42: "(",
  0x43: ",",
  0x44: ",",
  0x45: ";",
  0x46: ";",
  0x47: ";",
  0x48: ",",
  0x49: ",",
  0x4a: ",",
  0x4b: " TEXT ",
  0x4c: " GR ",
  0x4d: " CALL ",
  0x4e: " DIM ",
  0x4f: " DIM ",
  0x50: " TAB ",
  0x51: " END ",
  0x52: " INPUT ",
  0x53: " INPUT ",
  0x54: " INPUT ",
  0x55: " FOR ",
  0x56: "=",
  0x57: " TO ",
  0x58: " STEP ",
  0x59: " NEXT ",
  0x5a: ",",
  0x5b: " RETURN ",
  0x5c: " GOSUB ",
  0x5d: " REM ",
  0x5e: " LET ",
  0x5f: " GOTO ",
  0x60: " IF ",
  0x61: " PRINT ",
  0x62: " PRINT ",
  0x63: " PRINT ",
  0x64: " POKE ",
  0x65: ",",
  0x66: " COLOR= ",
  0x67: " PLOT ",
  0x68: ",",
  0x69: " HLIN ",
  0x6a: ",",
  0x6b: " AT ",
  0x6c: " VLIN ",
  0x6d: ",",
  0x6e: " AT ",
  0x6f: " VTAB ",
  0x70: "=",
  0x71: "=",
  0x72: ")",
  0x73: ")",
  0x74: " LIST ",
  0x75: ",",
  0x76: " LIST ",
  0x77: " POP ",
  0x78: " NODSP ",
  0x79: " DSP ",
  0x7a: " NOTRACE ",
  0x7b: " DSP ",
  0x7c: " DSP ",
  0x7d: " TRACE ",
  0x7e: " PR# ",
  0x7f: " IN# ",
};

// Applesoft BASIC tokens are imported from ../utils/basic-tokens.js

// Tokens that need space before them
const NEEDS_SPACE_BEFORE = [
  "FOR",
  "NEXT",
  "DATA",
  "INPUT",
  "DIM",
  "READ",
  "GR",
  "TEXT",
  "CALL",
  "PLOT",
  "HLIN",
  "VLIN",
  "HGR2",
  "HGR",
  "HPLOT",
  "DRAW",
  "XDRAW",
  "HTAB",
  "HOME",
  "SHLOAD",
  "TRACE",
  "NOTRACE",
  "NORMAL",
  "INVERSE",
  "FLASH",
  "POP",
  "VTAB",
  "ONERR",
  "RESUME",
  "RECALL",
  "STORE",
  "LET",
  "GOTO",
  "RUN",
  "IF",
  "RESTORE",
  "GOSUB",
  "RETURN",
  "REM",
  "STOP",
  "ON",
  "WAIT",
  "LOAD",
  "SAVE",
  "DEF",
  "POKE",
  "PRINT",
  "CONT",
  "LIST",
  "CLEAR",
  "GET",
  "NEW",
  "TO",
  "FN",
  "THEN",
  "AT",
  "NOT",
  "STEP",
  "AND",
  "OR",
  "END",
];
// Tokens that need space after them (keywords followed by expressions)
const NEEDS_SPACE_AFTER = [
  "GOTO",
  "GOSUB",
  "THEN",
  "TO",
  "STEP",
  "AND",
  "OR",
  "NOT",
  "IF",
  "ON",
  "LET",
  "FOR",
  "NEXT",
  "PRINT",
  "INPUT",
  "READ",
  "DATA",
  "DIM",
  "DEF",
  "POKE",
  "CALL",
  "PLOT",
  "HLIN",
  "VLIN",
  "HPLOT",
  "DRAW",
  "XDRAW",
  "HTAB",
  "VTAB",
  "ONERR",
  "WAIT",
  "GET",
  "AT",
  "FN",
];

// Keyword classification is imported from ../utils/basic-highlighting.js

/**
 * Detokenize Integer BASIC program with HTML syntax highlighting
 *
 * Integer BASIC file format:
 * - 2 bytes: program length (little-endian)
 * - Lines follow, each with:
 *   - 1 byte: line length (includes length byte and line number)
 *   - 2 bytes: line number (little-endian)
 *   - Tokenized content
 *   - 0x01: end of line marker
 *
 * Token encoding:
 * - $00-$7F: Tokens (keywords, operators, punctuation)
 * - $80-$FF: ASCII characters with high bit set (variable names, strings)
 * - $B0-$B9: Numeric constant (digit char), followed by 2-byte integer
 *
 * Source: https://github.com/paleotronic/diskm8 and Apple II documentation
 *
 * @param {Uint8Array} data - Raw file data
 * @returns {string} Detokenized BASIC listing as HTML
 */
export function detokenizeIntegerBasic(data, hasLengthHeader = true) {
  const parsedLines = [];
  let indentLevel = 0;

  // DOS 3.3 files have a 2-byte program length header, ProDOS files do not
  let offset = hasLengthHeader ? 2 : 0;

  while (offset < data.length) {
    const lineLength = data[offset];
    if (lineLength === 0 || lineLength < 4 || offset + lineLength > data.length)
      break;

    const lineNum = data[offset + 1] | (data[offset + 2] << 8);
    if (lineNum > 32767) break;

    let pos = offset + 3;
    const lineEnd = offset + lineLength;
    let lineHtml = "";
    let inRem = false;
    let inQuote = false;
    let stringContent = "";
    let remContent = "";

    // Track keywords for indentation
    let forCount = 0;
    let nextCount = 0;
    let expectingLineNum = false; // True after GOTO, GOSUB

    while (pos < lineEnd) {
      const byte = data[pos++];

      if (byte === 0x01) {
        break; // End of line
      } else if (inRem) {
        // Inside REM - rest of line is literal text with high bit set
        const charCode = byte >= 0x80 ? byte & 0x7f : byte;
        // Only include printable ASCII, skip control chars to prevent line breaks
        if (charCode >= 0x20 && charCode < 0x7f) {
          remContent += String.fromCharCode(charCode);
        }
      } else if (inQuote) {
        // Inside quoted string
        if (byte === 0x29) {
          // End quote token
          lineHtml += `<span class="bas-string">"${escapeHtml(stringContent)}"</span>`;
          stringContent = "";
          inQuote = false;
        } else {
          const charCode = byte >= 0x80 ? byte & 0x7f : byte;
          // Only include printable ASCII, skip control chars to prevent line breaks
          if (charCode >= 0x20 && charCode < 0x7f) {
            stringContent += String.fromCharCode(charCode);
          }
        }
      } else if (byte >= 0xb0 && byte <= 0xb9) {
        // Numeric constant: $B0-$B9 followed by 2-byte little-endian integer
        if (pos + 1 < lineEnd) {
          const num = data[pos] | (data[pos + 1] << 8);
          // Handle as signed 16-bit if needed
          const value = (num > 32767 ? num - 65536 : num).toString();
          if (expectingLineNum && num >= 0 && num <= 32767) {
            lineHtml += `<span class="bas-number bas-lineref" data-target-line="${num}">${value}</span>`;
            expectingLineNum = false;
          } else {
            lineHtml += `<span class="bas-number">${value}</span>`;
          }
          pos += 2;
        }
      } else if (byte === 0x28) {
        // Start quote token
        inQuote = true;
      } else if (byte === 0x5d) {
        // REM token - rest of line is comment
        lineHtml += `<span class="bas-misc"> REM </span>`;
        inRem = true;
      } else if (INTEGER_BASIC_TOKENS[byte] !== undefined) {
        const token = INTEGER_BASIC_TOKENS[byte];
        const trimmed = token.trim();

        // Track FOR/NEXT for indentation
        if (trimmed === "FOR") forCount++;
        if (trimmed === "NEXT") nextCount++;

        if (trimmed.length > 1 && /^[A-Z]/.test(trimmed)) {
          // It's a keyword
          const kwClass = getBasicKeywordClass(trimmed);
          lineHtml += `<span class="${kwClass}">${token}</span>`;
          // Track when we expect a line number (GOTO, GOSUB)
          if (trimmed === "GOTO" || trimmed === "GOSUB") {
            expectingLineNum = true;
          }
        } else if (
          "+-*/^=<>".includes(trimmed) ||
          trimmed === "<>" ||
          trimmed === ">=" ||
          trimmed === "<="
        ) {
          lineHtml += `<span class="bas-operator"> ${escapeHtml(trimmed)} </span>`;
        } else if (trimmed === ":") {
          lineHtml += `<span class="bas-punct">: </span>`;
        } else if ("(),;".includes(trimmed)) {
          lineHtml += `<span class="bas-punct">${escapeHtml(token)}</span>`;
        } else {
          lineHtml += escapeHtml(token);
        }
      } else if (byte >= 0x80) {
        // High-bit ASCII character (variable name)
        let varName = String.fromCharCode(byte & 0x7f);
        // Collect subsequent variable name characters
        while (pos < lineEnd) {
          const next = data[pos];
          if (next >= 0x80) {
            const ch = next & 0x7f;
            if (
              (ch >= 0x41 && ch <= 0x5a) ||
              (ch >= 0x61 && ch <= 0x7a) ||
              (ch >= 0x30 && ch <= 0x39)
            ) {
              varName += String.fromCharCode(ch);
              pos++;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        lineHtml += `<span class="bas-variable">${escapeHtml(varName)}</span>`;
      } else if (byte >= 0x20 && byte < 0x80) {
        // Should not normally occur, but handle gracefully
        lineHtml += escapeHtml(String.fromCharCode(byte));
      }
    }

    // Flush any remaining content
    if (inQuote && stringContent) {
      lineHtml += `<span class="bas-string">"${escapeHtml(stringContent)}</span>`;
    }
    if (inRem) {
      lineHtml += `<span class="bas-comment">${escapeHtml(remContent)}</span>`;
    }

    // Strip any leading whitespace to ensure consistent alignment
    lineHtml = lineHtml.trimStart();

    // Calculate indentation: NEXT decreases before, FOR increases after
    if (nextCount > 0) {
      indentLevel = Math.max(0, indentLevel - nextCount);
    }

    // Store the line with current indent
    parsedLines.push({
      lineNum,
      content: lineHtml,
      indent: indentLevel,
    });

    // FOR increases indent for subsequent lines (supports nested loops)
    if (forCount > 0) {
      indentLevel += forCount;
    }

    offset += lineLength;
  }

  // Format lines with indentation
  const INDENT_WIDTH = 2;
  const lineNumToIndex = new Map();
  const lines = parsedLines.map((line, index) => {
    lineNumToIndex.set(line.lineNum, index);
    const padding = " ".repeat(line.indent * INDENT_WIDTH);
    const lineNumStr = String(line.lineNum).padStart(5);
    return `<span class="bas-linenum">${lineNumStr}</span> ${padding}${line.content}`;
  });

  return {
    html: lines.join("\n"),
    lineNumToIndex,
    lineCount: lines.length,
  };
}

/**
 * Detokenize Applesoft BASIC program with HTML syntax highlighting
 *
 * DOS 3.3 Applesoft file format:
 * - 2 bytes: file length (we skip this)
 * - Then program lines follow:
 *   - 2 bytes: next line pointer (memory address)
 *   - 2 bytes: line number
 *   - tokenized content
 *   - 0x00: end of line
 * - Program ends when next line pointer is 0x0000
 *
 * @param {Uint8Array} data - Raw file data
 * @returns {string} Detokenized BASIC listing as HTML
 */
export function detokenizeApplesoft(data, hasLengthHeader = true) {
  const parsedLines = [];
  let indentLevel = 0;

  // DOS 3.3 files have a 2-byte file length header, ProDOS files do not
  let offset = hasLengthHeader ? 2 : 0;
  let prevLineNum = -1;

  while (offset < data.length - 4) {
    // Read next line pointer (2 bytes)
    const nextLine = data[offset] | (data[offset + 1] << 8);
    if (nextLine === 0) break; // End of program

    // Read line number (2 bytes)
    const lineNum = data[offset + 2] | (data[offset + 3] << 8);

    // Sanity checks
    if (lineNum > 63999) break;
    if (lineNum <= prevLineNum && prevLineNum >= 0) break; // Line numbers must increase
    prevLineNum = lineNum;

    offset += 4;

    // Track keywords for indentation
    let forCount = 0;
    let nextCount = 0;

    // Build plain text first, then convert to HTML
    let parts = []; // Array of {type, text} objects
    let inString = false;
    let inRem = false;
    let inData = false;
    let stringContent = "";
    let remContent = "";
    let dataContent = "";
    let lastType = "start"; // Track what we last output for spacing
    let expectingLineNum = false; // True after GOTO, GOSUB, THEN, ON...GOTO

    while (offset < data.length && data[offset] !== 0x00) {
      const byte = data[offset++];

      if (inRem) {
        const charCode = byte & 0x7f;
        // Only include printable ASCII, skip control chars to prevent line breaks
        if (charCode >= 0x20 && charCode < 0x7f) {
          remContent += String.fromCharCode(charCode);
        }
      } else if (inString) {
        const charCode = byte & 0x7f;
        if (byte === 0x22) {
          parts.push({ type: "string", text: '"' + stringContent + '"' });
          stringContent = "";
          inString = false;
          lastType = "string";
        } else if (charCode >= 0x20 && charCode < 0x7f) {
          // Only include printable ASCII characters, skip control chars (including CR/LF)
          stringContent += String.fromCharCode(charCode);
        }
        // Control characters (0x00-0x1F) are silently skipped to prevent line breaks
      } else if (inData) {
        const charCode = byte & 0x7f;
        if (byte === 0x3a) {
          parts.push({ type: "data", text: dataContent });
          parts.push({ type: "punct", text: ":" });
          dataContent = "";
          inData = false;
          lastType = "punct";
        } else if (charCode >= 0x20 && charCode < 0x7f) {
          // Only include printable ASCII, skip control chars to prevent line breaks
          dataContent += String.fromCharCode(charCode);
        }
      } else if (byte >= 0x80) {
        const token = APPLESOFT_TOKENS[byte - 0x80];
        if (!token) continue;

        // Track FOR/NEXT for indentation
        if (token === "FOR") forCount++;
        if (token === "NEXT") nextCount++;

        // Add space before keyword if needed
        if (
          NEEDS_SPACE_BEFORE.includes(token) &&
          lastType !== "start" &&
          lastType !== "punct"
        ) {
          parts.push({ type: "space", text: " " });
        }

        if (token === "REM") {
          parts.push({
            type: "keyword",
            text: token,
            kwClass: getBasicKeywordClass(token),
          });
          inRem = true;
          lastType = "keyword";
        } else if (token === "DATA") {
          parts.push({
            type: "keyword",
            text: token,
            kwClass: getBasicKeywordClass(token),
          });
          inData = true;
          lastType = "keyword";
        } else if ("+-*/^=<>".includes(token)) {
          // Tokenized operators - add spaces around them
          parts.push({ type: "operator", text: " " + token + " " });
          lastType = "operator";
        } else {
          parts.push({
            type: "keyword",
            text: token,
            kwClass: getBasicKeywordClass(token),
          });
          lastType = "keyword";

          // Track when we expect a line number (GOTO, GOSUB, THEN, ON...GOTO patterns)
          if (token === "GOTO" || token === "GOSUB" || token === "THEN") {
            expectingLineNum = true;
          }

          // Add space after keyword if needed
          if (NEEDS_SPACE_AFTER.includes(token)) {
            parts.push({ type: "space", text: " " });
            lastType = "space";
          }
        }
      } else if (byte === 0x22) {
        inString = true;
      } else if (byte === 0x3a) {
        // Colon - statement separator, ends line number sequence
        parts.push({ type: "punct", text: " : " });
        lastType = "punct";
        expectingLineNum = false;
      } else if (byte >= 0x30 && byte <= 0x39) {
        let num = String.fromCharCode(byte);
        while (
          offset < data.length &&
          data[offset] !== 0x00 &&
          data[offset] >= 0x30 &&
          data[offset] <= 0x39
        ) {
          num += String.fromCharCode(data[offset++]);
        }
        if (offset < data.length && data[offset] === 0x2e) {
          num += ".";
          offset++;
          while (
            offset < data.length &&
            data[offset] !== 0x00 &&
            data[offset] >= 0x30 &&
            data[offset] <= 0x39
          ) {
            num += String.fromCharCode(data[offset++]);
          }
        }
        // Check if this is a line number reference (after GOTO, GOSUB, THEN)
        // Don't reset expectingLineNum - there may be more line numbers separated by commas
        if (expectingLineNum && !num.includes(".")) {
          parts.push({
            type: "lineref",
            text: num,
            targetLine: parseInt(num, 10),
          });
        } else {
          parts.push({ type: "number", text: num });
        }
        lastType = "number";
      } else if (
        (byte >= 0x41 && byte <= 0x5a) ||
        (byte >= 0x61 && byte <= 0x7a)
      ) {
        // Variable name ends line number sequence
        expectingLineNum = false;
        let varName = String.fromCharCode(byte);
        while (offset < data.length && data[offset] !== 0x00) {
          const next = data[offset];
          if (
            (next >= 0x41 && next <= 0x5a) ||
            (next >= 0x61 && next <= 0x7a) ||
            (next >= 0x30 && next <= 0x39) ||
            next === 0x24 ||
            next === 0x25
          ) {
            varName += String.fromCharCode(next);
            offset++;
          } else {
            break;
          }
        }
        parts.push({ type: "variable", text: varName });
        lastType = "variable";
      } else if (byte === 0x20) {
        // Space - only add if not redundant
        if (
          lastType !== "space" &&
          lastType !== "punct" &&
          lastType !== "start"
        ) {
          parts.push({ type: "space", text: " " });
          lastType = "space";
        }
      } else {
        const char = String.fromCharCode(byte);
        if ("+-*/^=<>".includes(char)) {
          parts.push({ type: "operator", text: " " + char + " " });
          lastType = "operator";
        } else if ("(),;".includes(char)) {
          parts.push({ type: "punct", text: char });
          lastType = "punct";
        } else if (byte >= 0x20 && byte < 0x7f) {
          parts.push({ type: "text", text: char });
          lastType = "text";
        }
      }
    }

    // Flush remaining content
    if (inString && stringContent) {
      parts.push({ type: "string", text: '"' + stringContent });
    }
    if (inRem) {
      parts.push({ type: "comment", text: remContent });
    }
    if (inData && dataContent) {
      parts.push({ type: "data", text: dataContent });
    }

    offset++; // Skip end-of-line marker

    // Strip any leading whitespace from parts to ensure consistent alignment
    while (parts.length > 0 && parts[0].type === "space") {
      parts.shift();
    }

    // Convert parts to HTML
    let lineHtml = parts
      .map((p) => {
        const escaped = escapeHtml(p.text);
        switch (p.type) {
          case "keyword":
            return `<span class="${p.kwClass}">${escaped}</span>`;
          case "string":
            return `<span class="bas-string">${escaped}</span>`;
          case "number":
            return `<span class="bas-number">${escaped}</span>`;
          case "lineref":
            return `<span class="bas-number bas-lineref" data-target-line="${p.targetLine}">${escaped}</span>`;
          case "variable":
            return `<span class="bas-variable">${escaped}</span>`;
          case "operator":
            return `<span class="bas-operator">${escaped}</span>`;
          case "punct":
            return `<span class="bas-punct">${escaped}</span>`;
          case "comment":
            return `<span class="bas-comment">${escaped}</span>`;
          case "data":
            return `<span class="bas-data">${escaped}</span>`;
          default:
            return escaped;
        }
      })
      .join("");

    // Calculate indentation
    if (nextCount > 0) {
      indentLevel = Math.max(0, indentLevel - nextCount);
    }

    parsedLines.push({
      lineNum,
      content: lineHtml,
      indent: indentLevel,
    });

    // FOR increases indent for subsequent lines (supports nested loops)
    if (forCount > 0) {
      indentLevel += forCount;
    }
  }

  // Format lines with indentation
  const INDENT_WIDTH = 3;
  const lineNumToIndex = new Map();
  const lines = parsedLines.map((line, index) => {
    lineNumToIndex.set(line.lineNum, index);
    const padding = " ".repeat(line.indent * INDENT_WIDTH);
    const lineNumStr = String(line.lineNum).padStart(5);
    return `<span class="bas-linenum">${lineNumStr}</span> ${padding}${line.content}`;
  });

  return {
    html: lines.join("\n"),
    lineNumToIndex,
    lineCount: lines.length,
  };
}

/**
 * Format binary data as hex dump with ASCII (returns HTML)
 * @param {Uint8Array} data - Binary data
 * @param {number} baseAddress - Starting address for display
 * @param {number} maxBytes - Maximum bytes to show (0 = all)
 * @returns {string} Formatted hex dump as HTML
 */
export function formatHexDump(data, baseAddress = 0, maxBytes = 0) {
  const lines = [];
  const bytesToShow =
    maxBytes > 0 ? Math.min(data.length, maxBytes) : data.length;

  for (let i = 0; i < bytesToShow; i += 16) {
    const addr = (baseAddress + i).toString(16).toUpperCase().padStart(4, "0");

    // Hex bytes - first half and second half
    let hexFirst = "";
    let hexSecond = "";
    let ascii = "";

    for (let j = 0; j < 16; j++) {
      if (i + j < bytesToShow) {
        const byte = data[i + j];
        const hexStr = byte.toString(16).toUpperCase().padStart(2, "0");

        // Style based on byte value
        let byteClass = "hex-byte";
        if (byte === 0x00) {
          byteClass += " hex-zero";
        } else if (byte >= 0x20 && byte < 0x7f) {
          byteClass += " hex-printable";
        } else if (byte >= 0x80) {
          byteClass += " hex-highbit";
        }

        const styledByte = `<span class="${byteClass}">${hexStr}</span>`;
        if (j < 8) {
          hexFirst += styledByte + " ";
        } else {
          hexSecond += styledByte + " ";
        }

        // ASCII representation (printable chars only)
        const ch = byte & 0x7f;
        if (ch >= 0x20 && ch < 0x7f) {
          const escaped = ch === 0x26 ? "&amp;" : ch === 0x3c ? "&lt;" : ch === 0x3e ? "&gt;" : String.fromCharCode(ch);
          ascii += `<span class="hex-ascii-printable">${escaped}</span>`;
        } else {
          ascii += `<span class="hex-ascii-dot">.</span>`;
        }
      } else {
        if (j < 8) {
          hexFirst += "   ";
        } else {
          hexSecond += "   ";
        }
        ascii += " ";
      }
    }

    lines.push(
      `<span class="hex-line">` +
      `<span class="hex-addr">${addr}</span>` +
      `<span class="hex-separator">:</span> ` +
      `<span class="hex-bytes-first">${hexFirst}</span>` +
      `<span class="hex-bytes-second">${hexSecond}</span>` +
      `<span class="hex-ascii-separator">│</span>` +
      `<span class="hex-ascii">${ascii}</span>` +
      `<span class="hex-ascii-separator">│</span>` +
      `</span>`
    );
  }

  if (maxBytes > 0 && data.length > maxBytes) {
    lines.push(`<span class="hex-truncated">... (${data.length - maxBytes} more bytes)</span>`);
  }

  return lines.join("\n");
}

/**
 * Format text file (strip high bits, convert to readable text)
 * @param {Uint8Array} data - Raw file data
 * @returns {string} Formatted text
 */
export function formatTextFile(data) {
  let text = "";

  for (let i = 0; i < data.length; i++) {
    const byte = data[i] & 0x7f; // Strip high bit

    if (byte === 0x0d) {
      // Carriage return -> newline
      text += "\n";
    } else if (byte === 0x00) {
      // Null - end of text or padding
      continue;
    } else if (byte >= 0x20 && byte < 0x7f) {
      // Printable ASCII
      text += String.fromCharCode(byte);
    } else if (byte === 0x09) {
      // Tab
      text += "\t";
    }
  }

  return text;
}

/**
 * Format file contents based on type
 * @param {Uint8Array} data - Raw file data
 * @param {number} fileType - DOS 3.3 file type code
 * @param {Object} options - Optional settings
 * @param {boolean} options.hasLengthHeader - Whether BASIC files have 2-byte length header (DOS 3.3 = true, ProDOS = false)
 * @returns {Object} {content, format} where format is 'text' or 'hex'
 */
export function formatFileContents(data, fileType, options = {}) {
  const { hasLengthHeader = true } = options;

  switch (fileType) {
    case 0x00: // Text
      return {
        content: formatTextFile(data),
        format: "text",
        description: "Text File",
      };

    case 0x02: {
      // Applesoft BASIC
      try {
        const result = detokenizeApplesoft(data, hasLengthHeader);
        return {
          content: result.html,
          format: "basic",
          description: "Applesoft BASIC",
          isHtml: true,
          lineNumToIndex: result.lineNumToIndex,
          lineCount: result.lineCount,
        };
      } catch (e) {
        // Fall back to hex if detokenization fails
        return {
          content: formatHexDump(data),
          format: "hex",
          description: "Applesoft BASIC (raw)",
          isHtml: true,
        };
      }
    }

    case 0x01: {
      // Integer BASIC
      try {
        const result = detokenizeIntegerBasic(data, hasLengthHeader);
        return {
          content: result.html,
          format: "basic",
          description: "Integer BASIC",
          isHtml: true,
          lineNumToIndex: result.lineNumToIndex,
          lineCount: result.lineCount,
        };
      } catch (e) {
        // Fall back to hex if detokenization fails
        return {
          content: formatHexDump(data),
          format: "hex",
          description: "Integer BASIC (raw)",
          isHtml: true,
        };
      }
    }

    case 0x04: {
      // Binary
      const info = getBinaryFileInfo(data);
      let description = "Binary File";

      if (info) {
        description = `Binary File - Load: $${info.address.toString(16).toUpperCase()}, Length: ${info.length} bytes`;
      }

      // Return a promise for async disassembly
      return {
        content: null, // Will be filled by async disassembly
        format: "text",
        description,
        // Async loader for disassembly
        loadAsync: async () => {
          try {
            return await disassemble(data);
          } catch (e) {
            // Fall back to hex dump if disassembly fails
            const displayData = info ? data.slice(4) : data;
            return formatHexDump(displayData, info?.address || 0);
          }
        },
      };
    }

    default:
      return {
        content: formatHexDump(data),
        format: "hex",
        description: "Unknown File Type",
        isHtml: true,
      };
  }
}

/**
 * Format file size for display
 * @param {number} sectors - Number of sectors
 * @returns {string} Formatted size string
 */
export function formatFileSize(sectors) {
  const bytes = sectors * 256;
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}
