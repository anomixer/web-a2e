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
// Spaces added around keywords that need them for readability
const APPLESOFT_TOKENS = [
  ' END ', ' FOR ', ' NEXT ', ' DATA ', ' INPUT ', ' DEL ', ' DIM ', ' READ ',
  ' GR ', ' TEXT ', ' PR# ', ' IN# ', ' CALL ', ' PLOT ', ' HLIN ', ' VLIN ',
  ' HGR2 ', ' HGR ', ' HCOLOR= ', ' HPLOT ', ' DRAW ', ' XDRAW ', ' HTAB ', ' HOME ',
  ' ROT= ', ' SCALE= ', ' SHLOAD ', ' TRACE ', ' NOTRACE ', ' NORMAL ', ' INVERSE ', ' FLASH ',
  ' COLOR= ', ' POP ', ' VTAB ', ' HIMEM: ', ' LOMEM: ', ' ONERR ', ' RESUME ', ' RECALL ',
  ' STORE ', ' SPEED= ', ' LET ', ' GOTO ', ' RUN ', ' IF ', ' RESTORE ', '&',
  ' GOSUB ', ' RETURN ', ' REM ', ' STOP ', ' ON ', ' WAIT ', ' LOAD ', ' SAVE ',
  ' DEF ', ' POKE ', ' PRINT ', ' CONT ', ' LIST ', ' CLEAR ', ' GET ', ' NEW ',
  ' TAB(', ' TO ', ' FN ', ' SPC(', ' THEN ', ' AT ', ' NOT ', ' STEP ',
  '+', '-', '*', '/', '^', ' AND ', ' OR ', '>',
  '=', '<', 'SGN', 'INT', 'ABS', 'USR', 'FRE', ' SCRN(',
  'PDL', 'POS', 'SQR', 'RND', 'LOG', 'EXP', 'COS', 'SIN',
  'TAN', 'ATN', 'PEEK', 'LEN', 'STR$', 'VAL', 'ASC', 'CHR$',
  'LEFT$', 'RIGHT$', 'MID$', '', '', '', '', '',
  '', '', '', '', '', '', '', '',
];

/**
 * Detokenize Integer BASIC program
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
 * @returns {string} Detokenized BASIC listing
 */
export function detokenizeIntegerBasic(data) {
  const lines = [];

  // Skip 2-byte program length header
  let offset = 2;

  while (offset < data.length) {
    const lineLength = data[offset];
    if (lineLength === 0 || lineLength < 4 || offset + lineLength > data.length) break;

    const lineNum = data[offset + 1] | (data[offset + 2] << 8);
    if (lineNum > 32767) break;

    let pos = offset + 3;
    const lineEnd = offset + lineLength;
    let line = `${lineNum} `;
    let inRem = false;
    let inQuote = false;

    while (pos < lineEnd) {
      const byte = data[pos++];

      if (byte === 0x01) {
        break; // End of line
      } else if (inRem) {
        // Inside REM - rest of line is literal text with high bit set
        line += String.fromCharCode(byte >= 0x80 ? byte & 0x7F : byte);
      } else if (inQuote) {
        // Inside quoted string
        if (byte === 0x29) { // End quote token
          line += '"';
          inQuote = false;
        } else if (byte >= 0x80) {
          line += String.fromCharCode(byte & 0x7F);
        } else {
          line += String.fromCharCode(byte);
        }
      } else if (byte >= 0xB0 && byte <= 0xB9) {
        // Numeric constant: $B0-$B9 followed by 2-byte little-endian integer
        if (pos + 1 < lineEnd) {
          const num = data[pos] | (data[pos + 1] << 8);
          // Handle as signed 16-bit if needed
          line += (num > 32767 ? num - 65536 : num).toString();
          pos += 2;
        }
      } else if (byte === 0x28) {
        // Start quote token
        line += '"';
        inQuote = true;
      } else if (byte === 0x5D) {
        // REM token - rest of line is comment
        line += ' REM ';
        inRem = true;
      } else if (INTEGER_BASIC_TOKENS[byte] !== undefined) {
        line += INTEGER_BASIC_TOKENS[byte];
      } else if (byte >= 0x80) {
        // High-bit ASCII character (variable name, string content)
        line += String.fromCharCode(byte & 0x7F);
      } else if (byte >= 0x20 && byte < 0x80) {
        // Should not normally occur, but handle gracefully
        line += String.fromCharCode(byte);
      }
    }

    // Clean up multiple spaces
    line = line.replace(/  +/g, ' ');
    lines.push(line);
    offset += lineLength;
  }

  return lines.join('\n');
}

/**
 * Detokenize Applesoft BASIC program
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
 * @returns {string} Detokenized BASIC listing
 */
export function detokenizeApplesoft(data) {
  const lines = [];

  // Skip the 2-byte file length header
  let offset = 2;

  while (offset < data.length - 4) {
    // Read next line pointer (2 bytes)
    const nextLine = data[offset] | (data[offset + 1] << 8);
    if (nextLine === 0) break; // End of program

    // Read line number (2 bytes)
    const lineNum = data[offset + 2] | (data[offset + 3] << 8);

    // Sanity check: line numbers should be 0-63999
    if (lineNum > 63999) {
      break; // Invalid line number, stop parsing
    }

    offset += 4;

    // Read tokens until end of line (0x00)
    let line = '';
    let inString = false;
    let inRem = false;
    let inData = false;

    while (offset < data.length && data[offset] !== 0x00) {
      const byte = data[offset++];

      if (inString || inRem || inData) {
        // Inside string, REM, or DATA - just output character
        line += String.fromCharCode(byte & 0x7F);
        if (inString && byte === 0x22) inString = false; // End quote
      } else if (byte >= 0x80) {
        // Token
        const token = APPLESOFT_TOKENS[byte - 0x80];
        line += token;
        if (token.includes('REM')) inRem = true;
        if (token.includes('DATA')) inData = true;
      } else if (byte === 0x22) {
        // Start of string
        line += '"';
        inString = true;
      } else if (byte === 0x3A) {
        // Colon - statement separator, reset DATA mode
        line += ':';
        inData = false;
      } else {
        // Regular character
        line += String.fromCharCode(byte);
      }
    }

    offset++; // Skip end-of-line marker

    // Clean up: collapse multiple spaces and trim
    line = line.replace(/  +/g, ' ').trim();
    lines.push(`${lineNum} ${line}`);
  }

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
          format: 'text',
          description: 'Applesoft BASIC',
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
          format: 'text',
          description: 'Integer BASIC',
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
