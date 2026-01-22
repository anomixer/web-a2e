/**
 * File Viewer - Formats and displays file contents
 * Supports different Apple II file types
 */

import { getBinaryFileInfo } from './dos33.js';
import { disassemble } from './disassembler.js';

// Integer BASIC tokens ($00-$7F)
// Source: https://github.com/paleotronic/diskm8/blob/master/disk/atokens.go
// Note: $01 = end of line, $B0-$B9 = numeric constant prefix (followed by 2-byte integer)
const INTEGER_BASIC_TOKENS = {
  0x00: ' HIMEM: ', 0x02: '_', 0x03: ':',
  0x04: ' LOAD ', 0x05: ' SAVE ', 0x06: ' CON ', 0x07: ' RUN ', 0x08: ' RUN ',
  0x09: ' DEL ', 0x0A: ',', 0x0B: ' NEW ', 0x0C: ' CLR ', 0x0D: ' AUTO ',
  0x0E: ',', 0x0F: ' MAN ', 0x10: ' HIMEM: ', 0x11: ' LOMEM: ',
  0x12: '+', 0x13: '-', 0x14: '*', 0x15: '/', 0x16: '=', 0x17: '#',
  0x18: '>=', 0x19: '>', 0x1A: '<=', 0x1B: '<>', 0x1C: '<',
  0x1D: ' AND ', 0x1E: ' OR ', 0x1F: ' MOD ', 0x20: '^',
  0x21: '+', 0x22: '(', 0x23: ',', 0x24: ' THEN ', 0x25: ' THEN ',
  0x26: ',', 0x27: ',', 0x28: '"', 0x29: '"',
  0x2A: '(', 0x2B: '!', 0x2C: '!', 0x2D: '(',
  0x2E: 'PEEK', 0x2F: 'RND', 0x30: 'SGN', 0x31: 'ABS', 0x32: 'PDL', 0x33: 'RNDX',
  0x34: '(', 0x35: '+', 0x36: '-', 0x37: ' NOT ', 0x38: '(',
  0x39: '=', 0x3A: '#', 0x3B: 'LEN(', 0x3C: 'ASC(', 0x3D: 'SCRN(',
  0x3E: ',', 0x3F: '(', 0x40: '$', 0x41: '$', 0x42: '(',
  0x43: ',', 0x44: ',', 0x45: ';', 0x46: ';', 0x47: ';',
  0x48: ',', 0x49: ',', 0x4A: ',',
  0x4B: ' TEXT ', 0x4C: ' GR ', 0x4D: ' CALL ',
  0x4E: ' DIM ', 0x4F: ' DIM ', 0x50: ' TAB ', 0x51: ' END ',
  0x52: ' INPUT ', 0x53: ' INPUT ', 0x54: ' INPUT ',
  0x55: ' FOR ', 0x56: '=', 0x57: ' TO ', 0x58: ' STEP ',
  0x59: ' NEXT ', 0x5A: ',', 0x5B: ' RETURN ', 0x5C: ' GOSUB ',
  0x5D: ' REM ', 0x5E: ' LET ', 0x5F: ' GOTO ', 0x60: ' IF ',
  0x61: ' PRINT ', 0x62: ' PRINT ', 0x63: ' PRINT ',
  0x64: ' POKE ', 0x65: ',', 0x66: ' COLOR= ', 0x67: ' PLOT ', 0x68: ',',
  0x69: ' HLIN ', 0x6A: ',', 0x6B: ' AT ', 0x6C: ' VLIN ', 0x6D: ',', 0x6E: ' AT ',
  0x6F: ' VTAB ', 0x70: '=', 0x71: '=', 0x72: ')', 0x73: ')',
  0x74: ' LIST ', 0x75: ',', 0x76: ' LIST ',
  0x77: ' POP ', 0x78: ' NODSP ', 0x79: ' DSP ', 0x7A: ' NOTRACE ',
  0x7B: ' DSP ', 0x7C: ' DSP ', 0x7D: ' TRACE ', 0x7E: ' PR# ', 0x7F: ' IN# ',
};

// Applesoft BASIC tokens (0x80-0xFF)
// No embedded spaces - we handle spacing during output
const APPLESOFT_TOKENS = [
  'END', 'FOR', 'NEXT', 'DATA', 'INPUT', 'DEL', 'DIM', 'READ',
  'GR', 'TEXT', 'PR#', 'IN#', 'CALL', 'PLOT', 'HLIN', 'VLIN',
  'HGR2', 'HGR', 'HCOLOR=', 'HPLOT', 'DRAW', 'XDRAW', 'HTAB', 'HOME',
  'ROT=', 'SCALE=', 'SHLOAD', 'TRACE', 'NOTRACE', 'NORMAL', 'INVERSE', 'FLASH',
  'COLOR=', 'POP', 'VTAB', 'HIMEM:', 'LOMEM:', 'ONERR', 'RESUME', 'RECALL',
  'STORE', 'SPEED=', 'LET', 'GOTO', 'RUN', 'IF', 'RESTORE', '&',
  'GOSUB', 'RETURN', 'REM', 'STOP', 'ON', 'WAIT', 'LOAD', 'SAVE',
  'DEF', 'POKE', 'PRINT', 'CONT', 'LIST', 'CLEAR', 'GET', 'NEW',
  'TAB(', 'TO', 'FN', 'SPC(', 'THEN', 'AT', 'NOT', 'STEP',
  '+', '-', '*', '/', '^', 'AND', 'OR', '>',
  '=', '<', 'SGN', 'INT', 'ABS', 'USR', 'FRE', 'SCRN(',
  'PDL', 'POS', 'SQR', 'RND', 'LOG', 'EXP', 'COS', 'SIN',
  'TAN', 'ATN', 'PEEK', 'LEN', 'STR$', 'VAL', 'ASC', 'CHR$',
  'LEFT$', 'RIGHT$', 'MID$', '', '', '', '', '',
  '', '', '', '', '', '', '', '',
];

// Tokens that need space before them
const NEEDS_SPACE_BEFORE = ['FOR', 'NEXT', 'DATA', 'INPUT', 'DIM', 'READ', 'GR', 'TEXT', 'CALL', 'PLOT', 'HLIN', 'VLIN', 'HGR2', 'HGR', 'HPLOT', 'DRAW', 'XDRAW', 'HTAB', 'HOME', 'SHLOAD', 'TRACE', 'NOTRACE', 'NORMAL', 'INVERSE', 'FLASH', 'POP', 'VTAB', 'ONERR', 'RESUME', 'RECALL', 'STORE', 'LET', 'GOTO', 'RUN', 'IF', 'RESTORE', 'GOSUB', 'RETURN', 'REM', 'STOP', 'ON', 'WAIT', 'LOAD', 'SAVE', 'DEF', 'POKE', 'PRINT', 'CONT', 'LIST', 'CLEAR', 'GET', 'NEW', 'TO', 'FN', 'THEN', 'AT', 'NOT', 'STEP', 'AND', 'OR', 'END'];
// Tokens that need space after them (keywords followed by expressions)
const NEEDS_SPACE_AFTER = ['GOTO', 'GOSUB', 'THEN', 'TO', 'STEP', 'AND', 'OR', 'NOT', 'IF', 'ON', 'LET', 'FOR', 'NEXT', 'PRINT', 'INPUT', 'READ', 'DATA', 'DIM', 'DEF', 'POKE', 'CALL', 'PLOT', 'HLIN', 'VLIN', 'HPLOT', 'DRAW', 'XDRAW', 'HTAB', 'VTAB', 'ONERR', 'WAIT', 'GET', 'AT', 'FN'];

// BASIC keyword categories for syntax highlighting
const BASIC_FLOW = ['GOTO', 'GOSUB', 'RETURN', 'IF', 'THEN', 'ON', 'ONERR', 'RESUME', 'END', 'STOP', 'RUN'];
const BASIC_LOOP = ['FOR', 'TO', 'STEP', 'NEXT'];
const BASIC_IO = ['PRINT', 'INPUT', 'GET', 'DATA', 'READ', 'RESTORE'];
const BASIC_GRAPHICS = ['GR', 'HGR', 'HGR2', 'TEXT', 'PLOT', 'HPLOT', 'HLIN', 'VLIN', 'COLOR=', 'HCOLOR=', 'DRAW', 'XDRAW', 'ROT=', 'SCALE=', 'SCRN(', 'HOME', 'HTAB', 'VTAB', 'NORMAL', 'INVERSE', 'FLASH'];
const BASIC_MEMORY = ['PEEK', 'POKE', 'CALL', 'HIMEM:', 'LOMEM:', 'USR', 'DEF', 'FN'];
const BASIC_FUNCTIONS = ['SGN', 'INT', 'ABS', 'SQR', 'RND', 'LOG', 'EXP', 'COS', 'SIN', 'TAN', 'ATN', 'LEN', 'ASC', 'VAL', 'STR$', 'CHR$', 'LEFT$', 'RIGHT$', 'MID$', 'FRE', 'PDL', 'POS', 'TAB(', 'SPC('];
const BASIC_VAR = ['DIM', 'LET', 'DEL', 'NEW', 'CLR', 'CLEAR'];
const BASIC_MISC = ['REM', 'LOAD', 'SAVE', 'SHLOAD', 'STORE', 'RECALL', 'PR#', 'IN#', 'WAIT', 'CONT', 'LIST', 'TRACE', 'NOTRACE', 'SPEED=', 'POP', 'NOT', 'AND', 'OR', 'MOD'];

function getBasicKeywordClass(keyword) {
  const kw = keyword.trim().toUpperCase();
  if (BASIC_FLOW.includes(kw)) return 'bas-flow';
  if (BASIC_LOOP.includes(kw)) return 'bas-loop';
  if (BASIC_IO.includes(kw)) return 'bas-io';
  if (BASIC_GRAPHICS.includes(kw)) return 'bas-graphics';
  if (BASIC_MEMORY.includes(kw)) return 'bas-memory';
  if (BASIC_FUNCTIONS.includes(kw)) return 'bas-func';
  if (BASIC_VAR.includes(kw)) return 'bas-var';
  if (BASIC_MISC.includes(kw)) return 'bas-misc';
  return 'bas-keyword';
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
export function detokenizeIntegerBasic(data) {
  const parsedLines = [];
  let indentLevel = 0;

  // Skip 2-byte program length header
  let offset = 2;

  while (offset < data.length) {
    const lineLength = data[offset];
    if (lineLength === 0 || lineLength < 4 || offset + lineLength > data.length) break;

    const lineNum = data[offset + 1] | (data[offset + 2] << 8);
    if (lineNum > 32767) break;

    let pos = offset + 3;
    const lineEnd = offset + lineLength;
    let lineHtml = '';
    let inRem = false;
    let inQuote = false;
    let stringContent = '';
    let remContent = '';

    // Track keywords for indentation
    let hasFor = false;
    let nextCount = 0;

    while (pos < lineEnd) {
      const byte = data[pos++];

      if (byte === 0x01) {
        break; // End of line
      } else if (inRem) {
        // Inside REM - rest of line is literal text with high bit set
        remContent += String.fromCharCode(byte >= 0x80 ? byte & 0x7F : byte);
      } else if (inQuote) {
        // Inside quoted string
        if (byte === 0x29) { // End quote token
          lineHtml += `<span class="bas-string">"${escapeHtml(stringContent)}"</span>`;
          stringContent = '';
          inQuote = false;
        } else if (byte >= 0x80) {
          stringContent += String.fromCharCode(byte & 0x7F);
        } else {
          stringContent += String.fromCharCode(byte);
        }
      } else if (byte >= 0xB0 && byte <= 0xB9) {
        // Numeric constant: $B0-$B9 followed by 2-byte little-endian integer
        if (pos + 1 < lineEnd) {
          const num = data[pos] | (data[pos + 1] << 8);
          // Handle as signed 16-bit if needed
          const value = (num > 32767 ? num - 65536 : num).toString();
          lineHtml += `<span class="bas-number">${value}</span>`;
          pos += 2;
        }
      } else if (byte === 0x28) {
        // Start quote token
        inQuote = true;
      } else if (byte === 0x5D) {
        // REM token - rest of line is comment
        lineHtml += `<span class="bas-misc"> REM </span>`;
        inRem = true;
      } else if (INTEGER_BASIC_TOKENS[byte] !== undefined) {
        const token = INTEGER_BASIC_TOKENS[byte];
        const trimmed = token.trim();

        // Track FOR/NEXT for indentation
        if (trimmed === 'FOR') hasFor = true;
        if (trimmed === 'NEXT') nextCount++;

        if (trimmed.length > 1 && /^[A-Z]/.test(trimmed)) {
          // It's a keyword
          const kwClass = getBasicKeywordClass(trimmed);
          lineHtml += `<span class="${kwClass}">${token}</span>`;
        } else if ('+-*/^=<>'.includes(trimmed) || trimmed === '<>' || trimmed === '>=' || trimmed === '<=') {
          lineHtml += `<span class="bas-operator">${escapeHtml(token)}</span>`;
        } else if ('(),;:'.includes(trimmed)) {
          lineHtml += `<span class="bas-punct">${escapeHtml(token)}</span>`;
        } else {
          lineHtml += escapeHtml(token);
        }
      } else if (byte >= 0x80) {
        // High-bit ASCII character (variable name)
        let varName = String.fromCharCode(byte & 0x7F);
        // Collect subsequent variable name characters
        while (pos < lineEnd) {
          const next = data[pos];
          if (next >= 0x80) {
            const ch = next & 0x7F;
            if ((ch >= 0x41 && ch <= 0x5A) || (ch >= 0x61 && ch <= 0x7A) || (ch >= 0x30 && ch <= 0x39)) {
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

    // FOR increases indent for subsequent lines
    if (hasFor) {
      indentLevel++;
    }

    offset += lineLength;
  }

  // Format lines with indentation
  const INDENT_WIDTH = 2;
  const lines = parsedLines.map(line => {
    const padding = ' '.repeat(line.indent * INDENT_WIDTH);
    const lineNumStr = String(line.lineNum).padStart(5);
    return `<span class="bas-linenum">${lineNumStr}</span> ${padding}${line.content}`;
  });

  return lines.join('\n');
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
export function detokenizeApplesoft(data) {
  const parsedLines = [];
  let indentLevel = 0;

  // Skip the 2-byte file length header
  let offset = 2;
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
    let hasFor = false;
    let nextCount = 0;

    // Build plain text first, then convert to HTML
    let parts = []; // Array of {type, text} objects
    let inString = false;
    let inRem = false;
    let inData = false;
    let stringContent = '';
    let remContent = '';
    let dataContent = '';
    let lastType = 'start'; // Track what we last output for spacing

    while (offset < data.length && data[offset] !== 0x00) {
      const byte = data[offset++];

      if (inRem) {
        remContent += String.fromCharCode(byte & 0x7F);
      } else if (inString) {
        const char = String.fromCharCode(byte & 0x7F);
        if (byte === 0x22) {
          parts.push({ type: 'string', text: '"' + stringContent + '"' });
          stringContent = '';
          inString = false;
          lastType = 'string';
        } else {
          stringContent += char;
        }
      } else if (inData) {
        const char = String.fromCharCode(byte & 0x7F);
        if (byte === 0x3A) {
          parts.push({ type: 'data', text: dataContent });
          parts.push({ type: 'punct', text: ':' });
          dataContent = '';
          inData = false;
          lastType = 'punct';
        } else {
          dataContent += char;
        }
      } else if (byte >= 0x80) {
        const token = APPLESOFT_TOKENS[byte - 0x80];
        if (!token) continue;

        // Track FOR/NEXT for indentation
        if (token === 'FOR') hasFor = true;
        if (token === 'NEXT') nextCount++;

        // Add space before keyword if needed
        if (NEEDS_SPACE_BEFORE.includes(token) && lastType !== 'start' && lastType !== 'punct') {
          parts.push({ type: 'space', text: ' ' });
        }

        if (token === 'REM') {
          parts.push({ type: 'keyword', text: token, kwClass: getBasicKeywordClass(token) });
          inRem = true;
          lastType = 'keyword';
        } else if (token === 'DATA') {
          parts.push({ type: 'keyword', text: token, kwClass: getBasicKeywordClass(token) });
          inData = true;
          lastType = 'keyword';
        } else {
          parts.push({ type: 'keyword', text: token, kwClass: getBasicKeywordClass(token) });
          lastType = 'keyword';
          // Add space after keyword if needed
          if (NEEDS_SPACE_AFTER.includes(token)) {
            parts.push({ type: 'space', text: ' ' });
            lastType = 'space';
          }
        }
      } else if (byte === 0x22) {
        inString = true;
      } else if (byte === 0x3A) {
        parts.push({ type: 'punct', text: ':' });
        lastType = 'punct';
      } else if (byte >= 0x30 && byte <= 0x39) {
        let num = String.fromCharCode(byte);
        while (offset < data.length && data[offset] !== 0x00 && data[offset] >= 0x30 && data[offset] <= 0x39) {
          num += String.fromCharCode(data[offset++]);
        }
        if (offset < data.length && data[offset] === 0x2E) {
          num += '.';
          offset++;
          while (offset < data.length && data[offset] !== 0x00 && data[offset] >= 0x30 && data[offset] <= 0x39) {
            num += String.fromCharCode(data[offset++]);
          }
        }
        parts.push({ type: 'number', text: num });
        lastType = 'number';
      } else if ((byte >= 0x41 && byte <= 0x5A) || (byte >= 0x61 && byte <= 0x7A)) {
        let varName = String.fromCharCode(byte);
        while (offset < data.length && data[offset] !== 0x00) {
          const next = data[offset];
          if ((next >= 0x41 && next <= 0x5A) || (next >= 0x61 && next <= 0x7A) ||
              (next >= 0x30 && next <= 0x39) || next === 0x24 || next === 0x25) {
            varName += String.fromCharCode(next);
            offset++;
          } else {
            break;
          }
        }
        parts.push({ type: 'variable', text: varName });
        lastType = 'variable';
      } else if (byte === 0x20) {
        // Space - only add if not redundant
        if (lastType !== 'space' && lastType !== 'punct' && lastType !== 'start') {
          parts.push({ type: 'space', text: ' ' });
          lastType = 'space';
        }
      } else {
        const char = String.fromCharCode(byte);
        if ('+-*/^=<>'.includes(char)) {
          parts.push({ type: 'operator', text: char });
          lastType = 'operator';
        } else if ('(),;'.includes(char)) {
          parts.push({ type: 'punct', text: char });
          lastType = 'punct';
        } else if (byte >= 0x20 && byte < 0x7F) {
          parts.push({ type: 'text', text: char });
          lastType = 'text';
        }
      }
    }

    // Flush remaining content
    if (inString && stringContent) {
      parts.push({ type: 'string', text: '"' + stringContent });
    }
    if (inRem) {
      parts.push({ type: 'comment', text: remContent });
    }
    if (inData && dataContent) {
      parts.push({ type: 'data', text: dataContent });
    }

    offset++; // Skip end-of-line marker

    // Convert parts to HTML
    let lineHtml = parts.map(p => {
      const escaped = escapeHtml(p.text);
      switch (p.type) {
        case 'keyword': return `<span class="${p.kwClass}">${escaped}</span>`;
        case 'string': return `<span class="bas-string">${escaped}</span>`;
        case 'number': return `<span class="bas-number">${escaped}</span>`;
        case 'variable': return `<span class="bas-variable">${escaped}</span>`;
        case 'operator': return `<span class="bas-operator">${escaped}</span>`;
        case 'punct': return `<span class="bas-punct">${escaped}</span>`;
        case 'comment': return `<span class="bas-comment">${escaped}</span>`;
        case 'data': return `<span class="bas-data">${escaped}</span>`;
        default: return escaped;
      }
    }).join('');

    // Calculate indentation
    if (nextCount > 0) {
      indentLevel = Math.max(0, indentLevel - nextCount);
    }

    parsedLines.push({
      lineNum,
      content: lineHtml,
      indent: indentLevel,
    });

    if (hasFor) {
      indentLevel++;
    }
  }

  // Format lines with indentation
  const INDENT_WIDTH = 3;
  const lines = parsedLines.map(line => {
    const padding = ' '.repeat(line.indent * INDENT_WIDTH);
    const lineNumStr = String(line.lineNum).padStart(5);
    return `<span class="bas-linenum">${lineNumStr}</span> ${padding}${line.content}`;
  });

  return lines.join('\n');
}

/**
 * Format binary data as hex dump with ASCII
 * @param {Uint8Array} data - Binary data
 * @param {number} baseAddress - Starting address for display
 * @param {number} maxBytes - Maximum bytes to show (0 = all)
 * @returns {string} Formatted hex dump
 */
export function formatHexDump(data, baseAddress = 0, maxBytes = 0) {
  const lines = [];
  const bytesToShow = maxBytes > 0 ? Math.min(data.length, maxBytes) : data.length;

  for (let i = 0; i < bytesToShow; i += 16) {
    const addr = (baseAddress + i).toString(16).toUpperCase().padStart(4, '0');

    // Hex bytes
    let hex = '';
    let ascii = '';

    for (let j = 0; j < 16; j++) {
      if (i + j < bytesToShow) {
        const byte = data[i + j];
        hex += byte.toString(16).toUpperCase().padStart(2, '0') + ' ';
        // ASCII representation (printable chars only)
        const ch = byte & 0x7F;
        ascii += (ch >= 0x20 && ch < 0x7F) ? String.fromCharCode(ch) : '.';
      } else {
        hex += '   ';
        ascii += ' ';
      }

      // Add extra space in middle
      if (j === 7) hex += ' ';
    }

    lines.push(`${addr}: ${hex} ${ascii}`);
  }

  if (maxBytes > 0 && data.length > maxBytes) {
    lines.push(`... (${data.length - maxBytes} more bytes)`);
  }

  return lines.join('\n');
}

/**
 * Format text file (strip high bits, convert to readable text)
 * @param {Uint8Array} data - Raw file data
 * @returns {string} Formatted text
 */
export function formatTextFile(data) {
  let text = '';

  for (let i = 0; i < data.length; i++) {
    const byte = data[i] & 0x7F; // Strip high bit

    if (byte === 0x0D) {
      // Carriage return -> newline
      text += '\n';
    } else if (byte === 0x00) {
      // Null - end of text or padding
      continue;
    } else if (byte >= 0x20 && byte < 0x7F) {
      // Printable ASCII
      text += String.fromCharCode(byte);
    } else if (byte === 0x09) {
      // Tab
      text += '\t';
    }
  }

  return text;
}

/**
 * Format file contents based on type
 * @param {Uint8Array} data - Raw file data
 * @param {number} fileType - DOS 3.3 file type code
 * @returns {Object} {content, format} where format is 'text' or 'hex'
 */
export function formatFileContents(data, fileType) {
  switch (fileType) {
    case 0x00: // Text
      return {
        content: formatTextFile(data),
        format: 'text',
        description: 'Text File',
      };

    case 0x02: // Applesoft BASIC
      try {
        return {
          content: detokenizeApplesoft(data),
          format: 'basic',
          description: 'Applesoft BASIC',
          isHtml: true,
        };
      } catch (e) {
        // Fall back to hex if detokenization fails
        return {
          content: formatHexDump(data),
          format: 'hex',
          description: 'Applesoft BASIC (raw)',
        };
      }

    case 0x01: // Integer BASIC
      try {
        return {
          content: detokenizeIntegerBasic(data),
          format: 'basic',
          description: 'Integer BASIC',
          isHtml: true,
        };
      } catch (e) {
        // Fall back to hex if detokenization fails
        return {
          content: formatHexDump(data),
          format: 'hex',
          description: 'Integer BASIC (raw)',
        };
      }

    case 0x04: { // Binary
      const info = getBinaryFileInfo(data);
      let description = 'Binary File';

      if (info) {
        description = `Binary File - Load: $${info.address.toString(16).toUpperCase()}, Length: ${info.length} bytes`;
      }

      // Return a promise for async disassembly
      return {
        content: null, // Will be filled by async disassembly
        format: 'text',
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
        format: 'hex',
        description: 'Unknown File Type',
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
